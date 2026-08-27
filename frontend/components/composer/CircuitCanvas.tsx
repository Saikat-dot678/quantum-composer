"use client";

// A real spatial circuit editor: quantum/classical wires and gates are drawn
// on an SVG canvas that can be panned and zoomed, instead of a DOM grid of
// buttons. This is what makes a 128-qubit x 256-moment circuit navigable —
// the whole grid always exists in canvas space (lib/canvasGeometry.ts); zoom
// decides how much is legible, and the minimap gives a bird's-eye jump.
//
// Interaction model: click an empty cell to place the gate chosen in the
// dock; click an occupied cell to select it rather than deleting on click.
// Delete/Backspace removes the selection, Ctrl/Cmd+D duplicates it. Arrow
// keys move a keyboard cursor; an aria-live region announces the cursor cell.
//
// Moving a placed gate: drag it directly or select it and press M to enter
// keyboard move mode. Both paths share lib/placement.ts validation and the
// same move preview, so pointer and keyboard movement cannot disagree.
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import {
  CELL,
  GUTTER,
  ZOOM_MAX,
  ZOOM_MIN,
  canvasContentHeight,
  canvasContentWidth,
  clampZoom,
  clbitCenterY,
  fitZoom,
  momentCenterX,
  pointToCell,
  qubitCenterY,
  screenToCanvas,
  type Viewport,
} from "@/lib/canvasGeometry";
import { isMatrixDefinition, type CustomDefinition } from "@/lib/customGates";
import { checkPlacement, shiftQubits } from "@/lib/placement";
import type { CircuitOperation, GateName } from "@/lib/types";
import { BUILTIN_GATE_SET, GATE_DEFINITIONS, gateControlCount, type BuiltinGateName } from "@/lib/gateRegistry";
import { CanvasMinimap } from "./CanvasMinimap";
import { CustomGateIconShape } from "./CustomGateGlyph";

export interface CanvasCell {
  qubit: number;
  moment: number;
}

const cellKey = (qubit: number, moment: number) => `${qubit}:${moment}`;
const isBuiltinMulti = (operation: CircuitOperation) => BUILTIN_GATE_SET.has(operation.gate) && operation.gate !== "barrier" && operation.qubits.length >= 2;
const isWholeRegisterBarrier = (operation: CircuitOperation, numQubits: number) => operation.gate === "barrier"
  && operation.qubits.length === numQubits
  && operation.qubits.every((qubit, index) => qubit === index);
const MOVE_THRESHOLD_PX = 3;
const EDGE_SCROLL_MARGIN = 36;
const EDGE_SCROLL_SPEED = 14;

/** Glyph for single-qubit, measurement, and movement previews. */
function gateGlyph(operation: CircuitOperation, customLibrary?: ReadonlyMap<string, CustomDefinition>): string {
  if (operation.gate === "custom") {
    const definition = operation.customId ? customLibrary?.get(operation.customId) : undefined;
    return definition?.label ?? "?";
  }
  if (operation.gate === "measure") return "M";
  if (operation.gate === "barrier") return "‖";
  return operation.gate.toUpperCase();
}

function describeCell(operation: CircuitOperation | undefined, qubit: number, moment: number, customLibrary?: ReadonlyMap<string, CustomDefinition>): string {
  if (!operation) return `q${qubit}, time ${moment}, empty`;
  if (operation.gate === "custom") {
    const definition = operation.customId ? customLibrary?.get(operation.customId) : undefined;
    return `q${qubit}, time ${moment}: ${definition ? `${definition.name} (custom)` : "custom gate (definition missing)"}`;
  }
  if (operation.gate === "barrier") return `q${qubit}, time ${moment}: barrier across q${operation.qubits.join(", q")}`;
  const angle = typeof operation.params.theta === "number" ? ` at ${operation.params.theta.toFixed(3)} radians` : "";
  return `q${qubit}, time ${moment}: ${operation.gate.toUpperCase()} gate${angle}`;
}

interface ActiveMove {
  operation: CircuitOperation;
  targetQubits: number[];
  targetMoment: number;
  valid: boolean;
  reason?: string;
  hasMoved: boolean;
  source: "pointer" | "keyboard";
}

export interface CircuitCanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  focusCanvas: () => void;
  enterMoveMode: () => void;
}

export function CircuitCanvas({
  numQubits,
  numClbits,
  columns,
  operations,
  selectedGate,
  pending,
  selectedCell,
  onPlaceOrSelect,
  onDeselect,
  onDeleteSelected,
  onDuplicateSelected,
  onMoveOperation,
  onCopySelected,
  onPasteClipboard,
  onDropGate,
  handleRef,
  customLibrary,
  selectedCustomId,
}: {
  numQubits: number;
  numClbits: number;
  columns: number;
  operations: CircuitOperation[];
  selectedGate: GateName;
  pending: CanvasCell | null;
  selectedCell: CanvasCell | null;
  onPlaceOrSelect: (cell: CanvasCell, hasOperation: boolean) => void;
  onDeselect: () => void;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  onMoveOperation: (operation: CircuitOperation, targetQubits: number[], targetMoment: number) => void;
  onCopySelected?: () => void;
  onPasteClipboard?: () => void;
  onDropGate?: (gate: GateName, cell: CanvasCell, customId?: string) => void;
  handleRef?: (handle: CircuitCanvasHandle) => void;
  customLibrary?: ReadonlyMap<string, CustomDefinition>;
  selectedCustomId?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [cursor, setCursor] = useState<CanvasCell>({ qubit: 0, moment: 0 });
  const [announcement, setAnnouncement] = useState("");
  const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number; moved: boolean } | null>(null);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const contentWidth = canvasContentWidth(columns);
  const contentHeight = canvasContentHeight(numQubits, numClbits);

  const visibleRange = useMemo(() => {
    if (viewportSize.width === 0) {
      return { momentStart: 0, momentEnd: Math.min(columns, 40), qubitStart: 0, qubitEnd: numQubits };
    }
    const padCells = 2;
    const momentStart = Math.max(0, Math.floor((viewport.x - GUTTER.left) / CELL.width) - padCells);
    const momentEnd = Math.min(columns, Math.ceil((viewport.x + viewportSize.width / viewport.zoom - GUTTER.left) / CELL.width) + padCells);
    const qubitStart = Math.max(0, Math.floor((viewport.y - GUTTER.top) / CELL.height) - padCells);
    const qubitEnd = Math.min(numQubits, Math.ceil((viewport.y + viewportSize.height / viewport.zoom - GUTTER.top) / CELL.height) + padCells);
    return { momentStart, momentEnd, qubitStart, qubitEnd };
  }, [viewport, viewportSize, columns, numQubits]);

  const { operationIndex, measurementIndex } = useMemo(() => {
    const operationMap = new Map<string, CircuitOperation>();
    const measurements = new Set<string>();
    for (const operation of operations) {
      for (const qubit of operation.qubits) operationMap.set(cellKey(qubit, operation.moment), operation);
      if (operation.gate === "measure" && operation.clbits[0] != null) measurements.add(cellKey(operation.clbits[0], operation.moment));
    }
    return { operationIndex: operationMap, measurementIndex: measurements };
  }, [operations]);

  useEffect(() => {
    setCursor((current) => ({
      qubit: Math.min(current.qubit, Math.max(0, numQubits - 1)),
      moment: Math.min(current.moment, Math.max(0, columns - 1)),
    }));
  }, [numQubits, columns]);

  const zoomAt = useCallback((factor: number, anchorClientX?: number, anchorClientY?: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    setViewport((current) => {
      const nextZoom = clampZoom(current.zoom * factor);
      if (!rect) return { ...current, zoom: nextZoom };
      const ax = anchorClientX ?? rect.left + rect.width / 2;
      const ay = anchorClientY ?? rect.top + rect.height / 2;
      const canvasPoint = screenToCanvas(ax, ay, rect, current);
      const nextX = canvasPoint.x - (ax - rect.left) / nextZoom;
      const nextY = canvasPoint.y - (ay - rect.top) / nextZoom;
      return { x: nextX, y: nextY, zoom: nextZoom };
    });
  }, []);

  const zoomToFit = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const zoom = fitZoom(contentWidth, contentHeight, rect.width, rect.height);
    setViewport({ x: -((rect.width / zoom - contentWidth) / 2), y: -((rect.height / zoom - contentHeight) / 2), zoom });
  }, [contentWidth, contentHeight]);

  useEffect(() => {
    zoomToFit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePanTo = useCallback((canvasX: number, canvasY: number) => {
    setViewport((current) => ({
      ...current,
      x: canvasX - viewportSize.width / current.zoom / 2,
      y: canvasY - viewportSize.height / current.zoom / 2,
    }));
  }, [viewportSize]);

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || Math.abs(event.deltaY) > 0) {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0016);
      zoomAt(factor, event.clientX, event.clientY);
    }
  };

  const [activeMove, setActiveMove] = useState<ActiveMove | null>(null);
  const activeMoveRef = useRef<ActiveMove | null>(null);
  activeMoveRef.current = activeMove;
  const dragCandidateRef = useRef<{ operation: CircuitOperation; pointerId: number } | null>(null);
  const edgeScrollFrame = useRef<number | null>(null);
  const lastPointerClient = useRef<{ x: number; y: number } | null>(null);

  const circuitForCheck = useMemo(() => ({ num_qubits: numQubits, num_clbits: numClbits, shots: 1, operations }), [numQubits, numClbits, operations]);

  const shiftedMoveQubits = useCallback((operation: CircuitOperation, anchorQubit: number): number[] => {
    // A full-register barrier is a synchronization boundary over that exact
    // register. Dragging it from q1/q2 should move it in time, not attempt to
    // translate [0..n] beyond the register and become spuriously invalid.
    if (isWholeRegisterBarrier(operation, numQubits)) return operation.qubits;
    return shiftQubits(operation.qubits, anchorQubit);
  }, [numQubits]);

  const computeMoveTarget = useCallback((operation: CircuitOperation, canvasPoint: { x: number; y: number }, source: ActiveMove["source"], pointerOutside = false): ActiveMove => {
    const cell = pointToCell(canvasPoint.x, canvasPoint.y, { numQubits, numClbits, columns });
    const targetQubits = shiftedMoveQubits(operation, cell.qubit);
    const check = pointerOutside
      ? { ok: false, reason: "Dropped outside the canvas — the move was canceled, nothing was placed or deleted." }
      : checkPlacement(circuitForCheck, { qubits: targetQubits, clbits: operation.clbits, moment: cell.moment }, { excludeOperation: operation, columns });
    return { operation, targetQubits, targetMoment: cell.moment, valid: check.ok, reason: check.reason, hasMoved: true, source };
  }, [numQubits, numClbits, columns, shiftedMoveQubits, circuitForCheck]);

  const isPointWithinCanvas = useCallback((clientX: number, clientY: number): boolean => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }, []);

  const commitOrCancelMove = useCallback((move: ActiveMove | null) => {
    if (!move || !move.hasMoved) return;
    const unchanged = move.targetMoment === move.operation.moment
      && move.targetQubits.length === move.operation.qubits.length
      && move.targetQubits.every((q, index) => q === move.operation.qubits[index]);
    if (move.valid && !unchanged) onMoveOperation(move.operation, move.targetQubits, move.targetMoment);
  }, [onMoveOperation]);

  const stopEdgeScroll = useCallback(() => {
    if (edgeScrollFrame.current !== null) {
      cancelAnimationFrame(edgeScrollFrame.current);
      edgeScrollFrame.current = null;
    }
  }, []);

  const runEdgeScroll = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    const point = lastPointerClient.current;
    if (!rect || !point || !dragCandidateRef.current) { edgeScrollFrame.current = null; return; }
    let dx = 0;
    let dy = 0;
    if (point.x - rect.left < EDGE_SCROLL_MARGIN) dx = -EDGE_SCROLL_SPEED;
    else if (rect.right - point.x < EDGE_SCROLL_MARGIN) dx = EDGE_SCROLL_SPEED;
    if (point.y - rect.top < EDGE_SCROLL_MARGIN) dy = -EDGE_SCROLL_SPEED;
    else if (rect.bottom - point.y < EDGE_SCROLL_MARGIN) dy = EDGE_SCROLL_SPEED;
    if (dx !== 0 || dy !== 0) {
      setViewport((current) => ({ ...current, x: current.x + dx / current.zoom, y: current.y + dy / current.zoom }));
      const candidateOp = dragCandidateRef.current.operation;
      const canvasPoint = screenToCanvas(point.x, point.y, rect, viewportRef.current);
      setActiveMove(computeMoveTarget(candidateOp, canvasPoint, "pointer", !isPointWithinCanvas(point.x, point.y)));
      edgeScrollFrame.current = requestAnimationFrame(runEdgeScroll);
    } else {
      edgeScrollFrame.current = null;
    }
  }, [computeMoveTarget, isPointWithinCanvas]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    dragRef.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY, moved: false };
  };

  const handleGatePointerDown = (event: ReactPointerEvent<SVGGElement>, operation: CircuitOperation) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    dragCandidateRef.current = { operation, pointerId: event.pointerId };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    lastPointerClient.current = { x: event.clientX, y: event.clientY };

    if (!drag.moved && (Math.abs(dx) > MOVE_THRESHOLD_PX || Math.abs(dy) > MOVE_THRESHOLD_PX)) {
      drag.moved = true;
      (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
    }

    if (drag.moved && dragCandidateRef.current) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const canvasPoint = screenToCanvas(event.clientX, event.clientY, rect, viewportRef.current);
        setActiveMove(computeMoveTarget(dragCandidateRef.current.operation, canvasPoint, "pointer", !isPointWithinCanvas(event.clientX, event.clientY)));
        if (edgeScrollFrame.current === null) edgeScrollFrame.current = requestAnimationFrame(runEdgeScroll);
      }
    } else if (drag.moved) {
      setViewport((current) => ({ ...current, x: current.x - dx / current.zoom, y: current.y - dy / current.zoom }));
    }
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
  };

  const handlePointerUp = () => {
    stopEdgeScroll();
    if (dragCandidateRef.current) {
      commitOrCancelMove(activeMoveRef.current);
      dragCandidateRef.current = null;
      setActiveMove(null);
    }
    dragRef.current = null;
  };

  const [dropCell, setDropCell] = useState<CanvasCell | null>(null);

  const cellFromClientPoint = useCallback((clientX: number, clientY: number): CanvasCell | null => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const point = screenToCanvas(clientX, clientY, rect, viewport);
    return pointToCell(point.x, point.y, { numQubits, numClbits, columns });
  }, [viewport, numQubits, numClbits, columns]);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!onDropGate) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropCell(cellFromClientPoint(event.clientX, event.clientY));
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!onDropGate) return;
    event.preventDefault();
    const gate = event.dataTransfer.getData("application/x-quantum-gate") as GateName;
    const customId = event.dataTransfer.getData("application/x-quantum-custom-id") || undefined;
    const cell = cellFromClientPoint(event.clientX, event.clientY);
    setDropCell(null);
    if (gate && cell) onDropGate(gate, cell, customId);
  };

  useEffect(() => {
    if (activeMove) return;
    setAnnouncement(describeCell(operationIndex.get(cellKey(cursor.qubit, cursor.moment)), cursor.qubit, cursor.moment, customLibrary));
  }, [operationIndex, cursor, activeMove, customLibrary]);

  const activateCell = useCallback((cell: CanvasCell) => {
    setCursor(cell);
    const hasOperation = operationIndex.has(cellKey(cell.qubit, cell.moment));
    onPlaceOrSelect(cell, hasOperation);
  }, [operationIndex, onPlaceOrSelect]);

  const handleGateClick = (event: React.MouseEvent, qubit: number, moment: number) => {
    event.stopPropagation();
    activateCell({ qubit, moment });
  };

  const moveCursor = (dq: number, dm: number) => {
    const next = {
      qubit: Math.min(Math.max(cursor.qubit + dq, 0), Math.max(numQubits - 1, 0)),
      moment: Math.min(Math.max(cursor.moment + dm, 0), Math.max(columns - 1, 0)),
    };
    setCursor(next);
  };

  const startKeyboardMove = useCallback((operation: CircuitOperation) => {
    setActiveMove({
      operation,
      targetQubits: operation.qubits,
      targetMoment: operation.moment,
      valid: true,
      hasMoved: true,
      source: "keyboard",
    });
    setAnnouncement(`Move mode: ${operation.gate.toUpperCase()} at q${operation.qubits.join(",")}, time ${operation.moment}. Use arrow keys, Enter to confirm, Escape to cancel.`);
  }, []);

  const stepKeyboardMove = useCallback((dq: number, dm: number) => {
    setActiveMove((current) => {
      if (!current || current.source !== "keyboard") return current;
      const anchor = Math.min(Math.max(current.targetQubits[0] + dq, 0), Math.max(numQubits - 1, 0));
      const moment = Math.min(Math.max(current.targetMoment + dm, 0), Math.max(columns - 1, 0));
      const targetQubits = shiftedMoveQubits(current.operation, anchor);
      const check = checkPlacement(
        circuitForCheck,
        { qubits: targetQubits, clbits: current.operation.clbits, moment },
        { excludeOperation: current.operation, columns },
      );
      const next: ActiveMove = { ...current, targetQubits, targetMoment: moment, valid: check.ok, reason: check.reason, hasMoved: true };
      setAnnouncement(check.ok
        ? `Preview: q${targetQubits.join(",")}, time ${moment}. Enter to confirm, Escape to cancel.`
        : `Invalid: ${check.reason}`);
      return next;
    });
  }, [numQubits, columns, shiftedMoveQubits, circuitForCheck]);

  const confirmKeyboardMove = useCallback(() => {
    setActiveMove((current) => {
      if (!current || current.source !== "keyboard") return current;
      commitOrCancelMove(current);
      return null;
    });
  }, [commitOrCancelMove]);

  const cancelActiveMove = useCallback(() => {
    setActiveMove(null);
    dragCandidateRef.current = null;
  }, []);

  useEffect(() => {
    handleRef?.({
      zoomIn: () => zoomAt(1.25),
      zoomOut: () => zoomAt(0.8),
      zoomToFit,
      focusCanvas: () => containerRef.current?.focus(),
      enterMoveMode: () => {
        if (!selectedCell) return;
        const operation = operationIndex.get(cellKey(selectedCell.qubit, selectedCell.moment));
        if (operation) { containerRef.current?.focus(); startKeyboardMove(operation); }
      },
    });
  }, [handleRef, zoomAt, zoomToFit, selectedCell, operationIndex, startKeyboardMove]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (activeMove && event.key === "Escape") {
      event.preventDefault();
      cancelActiveMove();
      setAnnouncement("Move canceled.");
      return;
    }
    if (activeMove?.source === "keyboard") {
      switch (event.key) {
        case "ArrowRight": event.preventDefault(); stepKeyboardMove(0, 1); return;
        case "ArrowLeft": event.preventDefault(); stepKeyboardMove(0, -1); return;
        case "ArrowDown": event.preventDefault(); stepKeyboardMove(1, 0); return;
        case "ArrowUp": event.preventDefault(); stepKeyboardMove(-1, 0); return;
        case "Enter": case " ": event.preventDefault(); confirmKeyboardMove(); return;
        default: return;
      }
    }
    switch (event.key) {
      case "ArrowRight": event.preventDefault(); moveCursor(0, 1); break;
      case "ArrowLeft": event.preventDefault(); moveCursor(0, -1); break;
      case "ArrowDown": event.preventDefault(); moveCursor(1, 0); break;
      case "ArrowUp": event.preventDefault(); moveCursor(-1, 0); break;
      case "Home": event.preventDefault(); moveCursor(0, -columns); break;
      case "End": event.preventDefault(); moveCursor(0, columns); break;
      case "Enter":
      case " ": event.preventDefault(); activateCell(cursor); break;
      case "Escape": event.preventDefault(); onDeselect(); break;
      case "Delete":
      case "Backspace": event.preventDefault(); onDeleteSelected(); break;
      case "m":
      case "M": {
        if (!selectedCell) break;
        const operation = operationIndex.get(cellKey(selectedCell.qubit, selectedCell.moment));
        if (operation) { event.preventDefault(); startKeyboardMove(operation); }
        break;
      }
      case "d":
      case "D":
        if (event.ctrlKey || event.metaKey) { event.preventDefault(); onDuplicateSelected(); }
        break;
      case "c":
      case "C":
        if ((event.ctrlKey || event.metaKey) && onCopySelected) { event.preventDefault(); onCopySelected(); }
        break;
      case "v":
      case "V":
        if ((event.ctrlKey || event.metaKey) && onPasteClipboard) { event.preventDefault(); onPasteClipboard(); }
        break;
      default: break;
    }
  };

  const qubitList = Array.from({ length: numQubits }, (_, index) => index);
  const clbitList = Array.from({ length: numClbits }, (_, index) => index);
  const headerCols = Array.from({ length: columns }, (_, index) => index).slice(visibleRange.momentStart, visibleRange.momentEnd);
  const visibleCols = Array.from({ length: visibleRange.momentEnd - visibleRange.momentStart }, (_, index) => index + visibleRange.momentStart);
  const visibleQubits = Array.from({ length: visibleRange.qubitEnd - visibleRange.qubitStart }, (_, index) => index + visibleRange.qubitStart);
  const visibleOperations = useMemo(
    () => operations.filter((op) => op.moment >= visibleRange.momentStart && op.moment < visibleRange.momentEnd),
    [operations, visibleRange.momentStart, visibleRange.momentEnd],
  );
  const selectedCustomDefinition = selectedGate === "custom" && selectedCustomId ? customLibrary?.get(selectedCustomId) : undefined;
  const selectedBuiltin = BUILTIN_GATE_SET.has(selectedGate) ? GATE_DEFINITIONS[selectedGate as BuiltinGateName] : null;
  const isMultiEndpointGate = (selectedBuiltin?.defaultQubits ?? 1) > 1 || (selectedGate === "custom" && (selectedCustomDefinition?.numQubits ?? 1) > 1);
  const ghostLabel = selectedGate === "custom" ? (selectedCustomDefinition?.label ?? "?") : selectedGate === "measure" ? "M" : selectedGate === "barrier" ? "‖" : selectedGate.toUpperCase();

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden rounded-xl2 border border-line bg-canvas-dim canvas-dots">
      <div
        ref={containerRef}
        role="application"
        tabIndex={0}
        aria-label={`Circuit canvas, ${numQubits} qubits, ${columns} time steps. Use arrow keys to move, Enter to place or select, Delete to remove, Control D to duplicate, Control C and Control V to copy and paste, M to move the selected gate.`}
        aria-describedby="circuit-canvas-cursor"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={() => setDropCell(null)}
        onDrop={handleDrop}
        className="h-full w-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-inset active:cursor-grabbing"
      >
        <svg width="100%" height="100%" role="presentation">
          <g transform={`scale(${viewport.zoom}) translate(${-viewport.x}, ${-viewport.y})`}>
            {qubitList.map((qubit) => (
              <g key={`wire-${qubit}`}>
                <line x1={GUTTER.left - 24} y1={qubitCenterY(qubit)} x2={GUTTER.left + columns * CELL.width} y2={qubitCenterY(qubit)} stroke="#c2c2c9" strokeWidth={1.5} />
                <text x={GUTTER.left - 32} y={qubitCenterY(qubit)} textAnchor="end" dominantBaseline="middle" fontFamily="var(--font-mono)" fontSize={12} fontWeight={600} fill="#3f3f46">q{qubit}</text>
                <text x={GUTTER.left - 32} y={qubitCenterY(qubit) - 14} textAnchor="end" dominantBaseline="middle" fontFamily="var(--font-mono)" fontSize={9} fill="#4338ca">|0⟩</text>
              </g>
            ))}
            {clbitList.map((clbit) => (
              <g key={`cwire-${clbit}`}>
                <line x1={GUTTER.left - 24} y1={clbitCenterY(clbit, numQubits) - 1.5} x2={GUTTER.left + columns * CELL.width} y2={clbitCenterY(clbit, numQubits) - 1.5} stroke="#d4d4d8" strokeWidth={1} />
                <line x1={GUTTER.left - 24} y1={clbitCenterY(clbit, numQubits) + 1.5} x2={GUTTER.left + columns * CELL.width} y2={clbitCenterY(clbit, numQubits) + 1.5} stroke="#d4d4d8" strokeWidth={1} />
                <text x={GUTTER.left - 32} y={clbitCenterY(clbit, numQubits)} textAnchor="end" dominantBaseline="middle" fontFamily="var(--font-mono)" fontSize={11} fontWeight={600} fill="#63636c">c{clbit}</text>
              </g>
            ))}

            {dropCell && (
              <rect
                x={momentCenterX(dropCell.moment) - CELL.width / 2 + 3}
                y={qubitCenterY(dropCell.qubit) - CELL.height / 2 + 3}
                width={CELL.width - 6}
                height={CELL.height - 6}
                rx={10}
                fill="#eef2ff"
                stroke="#6366f1"
                strokeWidth={2}
                strokeDasharray="5 3"
              />
            )}

            {headerCols.map((moment) => (
              <text
                key={`t-${moment}`}
                x={momentCenterX(moment)}
                y={GUTTER.top - 16}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize={9}
                fontWeight={activeMove?.hasMoved && activeMove.targetMoment === moment ? 700 : 400}
                fill={activeMove?.hasMoved && activeMove.targetMoment === moment ? (activeMove.valid ? "#047857" : "#b91c1c") : "#63636c"}
              >
                t{moment}
              </text>
            ))}

            {activeMove?.hasMoved && (
              <g pointerEvents="none">
                <line
                  x1={momentCenterX(activeMove.targetMoment)} y1={GUTTER.top - 8}
                  x2={momentCenterX(activeMove.targetMoment)} y2={GUTTER.top + numQubits * CELL.height}
                  stroke={activeMove.valid ? "#a7f3d0" : "#fecaca"} strokeWidth={1.5} strokeDasharray="2 3"
                />
                {activeMove.targetQubits.map((q) => (
                  <rect
                    key={`target-${q}`}
                    x={momentCenterX(activeMove.targetMoment) - CELL.width / 2 + 3}
                    y={qubitCenterY(q) - CELL.height / 2 + 3}
                    width={CELL.width - 6}
                    height={CELL.height - 6}
                    rx={10}
                    fill={activeMove.valid ? "#ecfdf5" : "#fef2f2"}
                    stroke={activeMove.valid ? "#059669" : "#dc2626"}
                    strokeWidth={2}
                    strokeDasharray={activeMove.valid ? undefined : "4 3"}
                  />
                ))}
                {activeMove.targetQubits.length >= 2 && (
                  <line
                    x1={momentCenterX(activeMove.targetMoment)} y1={qubitCenterY(Math.min(...activeMove.targetQubits))}
                    x2={momentCenterX(activeMove.targetMoment)} y2={qubitCenterY(Math.max(...activeMove.targetQubits))}
                    stroke={activeMove.valid ? "#059669" : "#dc2626"} strokeWidth={1.5} opacity={0.6}
                  />
                )}
                {activeMove.targetQubits.map((q, index) => (
                  <text
                    key={`ghost-${q}`}
                    x={momentCenterX(activeMove.targetMoment)}
                    y={qubitCenterY(q)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontFamily="var(--font-mono)"
                    fontSize={11}
                    fontWeight={700}
                    fill={activeMove.valid ? "#047857" : "#b91c1c"}
                    opacity={0.85}
                  >
                    {activeMove.targetQubits.length === 2 && activeMove.operation.gate !== "custom" && activeMove.operation.gate !== "barrier"
                      ? (index === 0 ? "●" : gateGlyph(activeMove.operation, customLibrary))
                      : gateGlyph(activeMove.operation, customLibrary)}
                  </text>
                ))}
              </g>
            )}

            {/* Barrier is a circuit operation, not a controlled gate. Render one
                intentional synchronization boundary over exactly its qubit span. */}
            {visibleOperations.filter((operation) => operation.gate === "barrier" && operation.qubits.length > 0).map((operation, index) => {
              const low = Math.min(...operation.qubits);
              const high = Math.max(...operation.qubits);
              const selected = selectedCell?.moment === operation.moment && operation.qubits.includes(selectedCell.qubit);
              const moving = activeMove?.hasMoved && operation === activeMove.operation;
              return (
                <g
                  key={`barrier-${index}`}
                  pointerEvents="none"
                  opacity={moving ? 0.28 : 1}
                  data-circuit-barrier="true"
                  data-moment={operation.moment}
                  data-qubits={operation.qubits.join(",")}
                >
                  <line
                    x1={momentCenterX(operation.moment)}
                    y1={qubitCenterY(low) - CELL.height / 2 + 6}
                    x2={momentCenterX(operation.moment)}
                    y2={qubitCenterY(high) + CELL.height / 2 - 6}
                    stroke={selected ? "#4f46e5" : "#a1a1aa"}
                    strokeWidth={selected ? 3 : 2}
                    strokeDasharray="5 4"
                  />
                </g>
              );
            })}

            {visibleOperations.filter(isBuiltinMulti).map((op, index) => {
              const low = Math.min(...op.qubits);
              const high = Math.max(...op.qubits);
              const isMoving = activeMove?.hasMoved && op === activeMove.operation;
              return <line key={`conn-${index}`} x1={momentCenterX(op.moment)} y1={qubitCenterY(low)} x2={momentCenterX(op.moment)} y2={qubitCenterY(high)} stroke="#6366f1" strokeWidth={1.5} opacity={isMoving ? 0.3 : 1} />;
            })}

            {visibleOperations.filter((op) => op.gate === "custom" && op.qubits.length >= 2).map((op, index) => {
              const low = Math.min(...op.qubits);
              const high = Math.max(...op.qubits);
              const isMoving = activeMove?.hasMoved && op === activeMove.operation;
              const definition = op.customId ? customLibrary?.get(op.customId) : undefined;
              return (
                <line
                  key={`ccon-${index}`}
                  x1={momentCenterX(op.moment)} y1={qubitCenterY(low)}
                  x2={momentCenterX(op.moment)} y2={qubitCenterY(high)}
                  stroke={definition ? "#7c3aed" : "#dc2626"}
                  strokeWidth={1.5}
                  strokeDasharray={definition ? undefined : "3 2"}
                  opacity={isMoving ? 0.3 : 1}
                />
              );
            })}

            {visibleOperations.filter((op) => op.gate === "measure" && op.clbits[0] != null).map((op, index) => (
              <line key={`meas-${index}`} x1={momentCenterX(op.moment)} y1={qubitCenterY(op.qubits[0]) + 14} x2={momentCenterX(op.moment)} y2={clbitCenterY(op.clbits[0], numQubits) - 6} stroke="#059669" strokeWidth={1.25} strokeDasharray="2 2" opacity={activeMove?.hasMoved && op === activeMove.operation ? 0.3 : 1} />
            ))}
            {clbitList.map((clbit) =>
              visibleCols.map((moment) => {
                if (!measurementIndex.has(cellKey(clbit, moment))) return null;
                return <circle key={`mt-${clbit}-${moment}`} cx={momentCenterX(moment)} cy={clbitCenterY(clbit, numQubits)} r={5} fill="#ffffff" stroke="#059669" strokeWidth={2} />;
              }),
            )}

            {visibleQubits.map((qubit) =>
              visibleCols.map((moment) => {
                const key = cellKey(qubit, moment);
                const operation = operationIndex.get(key);
                const isSelected = selectedCell?.qubit === qubit && selectedCell.moment === moment && operation;
                const isPending = pending?.qubit === qubit && pending.moment === moment;
                const isCursor = cursor.qubit === qubit && cursor.moment === moment;
                const isMovingSource = Boolean(activeMove?.hasMoved && operation && operation === activeMove.operation);
                const cx = momentCenterX(moment);
                const cy = qubitCenterY(qubit);

                if (!operation) {
                  const showGhost = isCursor && !isPending && !isMultiEndpointGate && !activeMove;
                  return (
                    <g key={key} onClick={(event) => handleGateClick(event, qubit, moment)} className="cursor-pointer">
                      <rect x={cx - CELL.width / 2} y={cy - CELL.height / 2} width={CELL.width} height={CELL.height} fill="transparent" />
                      {isPending && <circle cx={cx} cy={cy} r={10} fill="#eef2ff" stroke="#6366f1" strokeWidth={2} />}
                      {showGhost && (
                        <g opacity={0.4}>
                          <rect x={cx - 15} y={cy - 15} width={30} height={30} rx={7} fill="#eef2ff" stroke="#818cf8" strokeWidth={1.5} strokeDasharray="3 2" />
                          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-mono)" fontSize={11} fontWeight={700} fill="#4338ca">{ghostLabel}</text>
                        </g>
                      )}
                      {isCursor && !activeMove && <rect x={cx - 17} y={cy - 17} width={34} height={34} rx={8} fill="none" stroke="#a5a6f6" strokeWidth={1.5} strokeDasharray="3 2" />}
                      {!isPending && !showGhost && <circle cx={cx} cy={cy} r={2} fill="#c2c2c9" />}
                    </g>
                  );
                }

                if (operation.gate === "barrier") {
                  return (
                    <g key={key} onClick={(event) => handleGateClick(event, qubit, moment)} onPointerDown={(event) => handleGatePointerDown(event, operation)} className="cursor-grab active:cursor-grabbing" opacity={isMovingSource ? 0.35 : 1}>
                      <title>{`Barrier across q${operation.qubits.join(", q")} — synchronization/compiler boundary`}</title>
                      <rect x={cx - CELL.width / 2} y={cy - CELL.height / 2} width={CELL.width} height={CELL.height} fill="transparent" />
                      {isSelected && <rect x={cx - 7} y={cy - 7} width={14} height={14} rx={4} fill="#eef2ff" stroke="#4f46e5" strokeWidth={1.5} />}
                      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-mono)" fontSize={10} fontWeight={700} fill={isSelected ? "#4f46e5" : "#63636c"}>‖</text>
                      {isCursor && <rect x={cx - 17} y={cy - 17} width={34} height={34} rx={8} fill="none" stroke="#a5a6f6" strokeWidth={1.5} strokeDasharray="3 2" />}
                    </g>
                  );
                }

                if (isBuiltinMulti(operation)) {
                  const builtin = operation.gate as BuiltinGateName;
                  const definition = GATE_DEFINITIONS[builtin];
                  const operandIndex = operation.qubits.indexOf(qubit);
                  const controls = gateControlCount(builtin, operation.qubits.length);
                  const isControl = operandIndex >= 0 && operandIndex < controls;
                  const isSwapNode = definition.visual === "swap" || (builtin === "cswap" && !isControl);
                  const isXTarget = builtin === "cx" || builtin === "ccx" || builtin === "mcx";
                  return (
                    <g
                      key={key}
                      onClick={(event) => handleGateClick(event, qubit, moment)}
                      onPointerDown={(event) => handleGatePointerDown(event, operation)}
                      className="cursor-grab active:cursor-grabbing"
                      opacity={isMovingSource ? 0.35 : 1}
                    >
                      <rect x={cx - CELL.width / 2} y={cy - CELL.height / 2} width={CELL.width} height={CELL.height} fill="transparent" />
                      {isSelected && <rect x={cx - 17} y={cy - 17} width={34} height={34} rx={8} fill="#eef2ff" />}
                      {isSwapNode ? (
                        <g stroke="#4338ca" strokeWidth={2.5}>
                          <line x1={cx - 6} y1={cy - 6} x2={cx + 6} y2={cy + 6} />
                          <line x1={cx - 6} y1={cy + 6} x2={cx + 6} y2={cy - 6} />
                        </g>
                      ) : isControl ? (
                        <circle cx={cx} cy={cy} r={6} fill="#4338ca" />
                      ) : isXTarget ? (
                        <g>
                          <circle cx={cx} cy={cy} r={11} fill="#ffffff" stroke="#4338ca" strokeWidth={2} />
                          <line x1={cx - 7} y1={cy} x2={cx + 7} y2={cy} stroke="#4338ca" strokeWidth={2} />
                          <line x1={cx} y1={cy - 7} x2={cx} y2={cy + 7} stroke="#4338ca" strokeWidth={2} />
                        </g>
                      ) : (
                        <g>
                          <rect x={cx - 12} y={cy - 12} width={24} height={24} rx={5} fill="#ffffff" stroke="#4338ca" strokeWidth={2} />
                          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-mono)" fontSize={Math.min(11, 32 / definition.label.length)} fontWeight={700} fill="#4338ca">{definition.label.replace(/^C/, "")}</text>
                        </g>
                      )}
                      {isCursor && <rect x={cx - 17} y={cy - 17} width={34} height={34} rx={8} fill="none" stroke="#6366f1" strokeWidth={2} />}
                    </g>
                  );
                }

                if (operation.gate === "custom") {
                  const definition = operation.customId ? customLibrary?.get(operation.customId) : undefined;
                  const tone = !definition ? "#dc2626" : isMatrixDefinition(definition) ? "#7c3aed" : "#b45309";
                  const label = definition?.label ?? "?";
                  return (
                    <g
                      key={key}
                      onClick={(event) => handleGateClick(event, qubit, moment)}
                      onPointerDown={(event) => handleGatePointerDown(event, operation)}
                      className="cursor-grab active:cursor-grabbing"
                      opacity={isMovingSource ? 0.35 : 1}
                    >
                      <rect x={cx - CELL.width / 2} y={cy - CELL.height / 2} width={CELL.width} height={CELL.height} fill="transparent" />
                      {isSelected && <rect x={cx - 17} y={cy - 17} width={34} height={34} rx={8} fill="#eef2ff" />}
                      <rect x={cx - 15} y={cy - 15} width={30} height={30} rx={7} fill={definition ? "#faf5ff" : "#fef2f2"} stroke={tone} strokeWidth={isSelected ? 2.5 : 1.75} strokeDasharray={definition ? undefined : "3 2"} />
                      {definition && <CustomGateIconShape icon={definition.icon} cx={cx} cy={cy - 8} size={4} fill={tone} />}
                      <text x={cx} y={cy + (definition ? 6 : 0)} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-mono)" fontSize={8.5} fontWeight={700} fill={tone}>
                        {label}
                      </text>
                      {isCursor && <rect x={cx - 19} y={cy - 19} width={38} height={38} rx={9} fill="none" stroke="#6366f1" strokeWidth={2} />}
                    </g>
                  );
                }

                const isMeasure = operation.gate === "measure";
                return (
                  <g
                    key={key}
                    onClick={(event) => handleGateClick(event, qubit, moment)}
                    onPointerDown={(event) => handleGatePointerDown(event, operation)}
                    className="cursor-grab active:cursor-grabbing"
                    opacity={isMovingSource ? 0.35 : 1}
                  >
                    <rect x={cx - CELL.width / 2} y={cy - CELL.height / 2} width={CELL.width} height={CELL.height} fill="transparent" />
                    <rect
                      x={cx - 15} y={cy - 15} width={30} height={30} rx={7}
                      fill={isSelected ? "#eef2ff" : "#ffffff"}
                      stroke={isMeasure ? "#059669" : isSelected ? "#4f46e5" : "#4338ca"}
                      strokeWidth={isSelected ? 2.5 : 1.75}
                    />
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-mono)" fontSize={12} fontWeight={700} fill={isMeasure ? "#047857" : "#4338ca"}>
                      {gateGlyph(operation)}
                    </text>
                    {isCursor && <rect x={cx - 19} y={cy - 19} width={38} height={38} rx={9} fill="none" stroke="#6366f1" strokeWidth={2} />}
                  </g>
                );
              }),
            )}
          </g>
        </svg>
      </div>

      <p id="circuit-canvas-cursor" role="status" aria-live="polite" className="sr-only">{announcement}</p>

      {activeMove?.hasMoved && (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex justify-center">
          <div role={activeMove.valid ? "status" : "alert"} className={`pointer-events-auto flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-semibold shadow-floating ${activeMove.valid ? "border-safe-border bg-safe-bg text-safe-text" : "border-danger-border bg-danger-bg text-danger-text"}`}>
            Moving {activeMove.operation.gate.toUpperCase()}
            {activeMove.source === "keyboard" ? " — arrows to move, Enter to confirm, Escape to cancel" : " — release to drop, Escape to cancel"}
            {!activeMove.valid && activeMove.reason ? ` · ${activeMove.reason}` : ""}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-2 left-2 rounded-md border border-line-hairline bg-surface/90 px-2 py-1 font-mono text-[10px] text-ink-500 backdrop-blur">
        {Math.round(viewport.zoom * 100)}%
      </div>

      <CanvasMinimap
        operations={operations}
        numQubits={numQubits}
        columns={columns}
        contentWidth={contentWidth}
        contentHeight={contentHeight}
        viewport={viewport}
        viewportSize={viewportSize}
        onPanTo={handlePanTo}
      />
    </div>
  );
}

export { ZOOM_MIN, ZOOM_MAX };
