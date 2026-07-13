"use client";

// A real spatial circuit editor: quantum/classical wires and gates are drawn
// on an SVG canvas that can be panned and zoomed, instead of a DOM grid of
// buttons. This is what makes a 128-qubit x 256-moment circuit navigable —
// the whole grid always exists in canvas space (lib/canvasGeometry.ts); zoom
// decides how much is legible, and the minimap gives a bird's-eye jump.
//
// Interaction model: click an empty cell to place the gate chosen in the
// dock; click an occupied cell to select it (Figma/Framer's "properties
// panel is empty until something is selected" pattern, adapted to a canvas
// grid) rather than deleting on click. Delete/Backspace removes the
// selection, Ctrl/Cmd+D duplicates it. Arrow keys move a keyboard cursor
// (one tab stop for the whole canvas, per WCAG 2.1.1 without a DOM explosion
// at 128x256 cells); an aria-live region announces the cursor's cell content
// for screen-reader users, since a zoomable spatial canvas cannot expose one
// focusable DOM node per cell at this scale.
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
import type { CircuitOperation, GateName } from "@/lib/types";
import { CanvasMinimap } from "./CanvasMinimap";

export interface CanvasCell {
  qubit: number;
  moment: number;
}

const cellKey = (qubit: number, moment: number) => `${qubit}:${moment}`;
const TWO_QUBIT_GATES: GateName[] = ["cx", "cz", "swap"];

/** Glyph for single-qubit and measurement gates only — two-qubit gates render bespoke SVG shapes inline. */
function gateGlyph(operation: CircuitOperation): string {
  return operation.gate === "measure" ? "M" : operation.gate.toUpperCase();
}

function describeCell(operation: CircuitOperation | undefined, qubit: number, moment: number): string {
  if (!operation) return `q${qubit}, time ${moment}, empty`;
  const angle = typeof operation.params.theta === "number" ? ` at ${operation.params.theta.toFixed(3)} radians` : "";
  return `q${qubit}, time ${moment}: ${operation.gate.toUpperCase()} gate${angle}`;
}

export interface CircuitCanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  focusCanvas: () => void;
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
  onDropGate,
  handleRef,
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
  /** Progressive enhancement: a gate chip was dropped from the dock onto this cell. */
  onDropGate?: (gate: GateName, cell: CanvasCell) => void;
  handleRef?: (handle: CircuitCanvasHandle) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [cursor, setCursor] = useState<CanvasCell>({ qubit: 0, moment: 0 });
  const [announcement, setAnnouncement] = useState("");
  const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number; moved: boolean } | null>(null);

  // Track the container's pixel size so we can compute which cells are
  // actually visible and skip rendering the rest (see `visibleRange` below).
  // This is the real fix for large circuits: a 128x256 grid is ~33,000 cells,
  // enough SVG nodes to feel sluggish if drawn unconditionally, but the
  // *viewport* only ever shows a few hundred at once.
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

  // Visible cell range in canvas space, padded by a couple of cells so
  // panning doesn't visibly pop content in at the edges.
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

  // Fit the initial view once on mount / when the container first has size.
  useEffect(() => {
    zoomToFit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    handleRef?.({
      zoomIn: () => zoomAt(1.25),
      zoomOut: () => zoomAt(0.8),
      zoomToFit,
      focusCanvas: () => containerRef.current?.focus(),
    });
  }, [handleRef, zoomAt, zoomToFit]);

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || Math.abs(event.deltaY) > 0) {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0016);
      zoomAt(factor, event.clientX, event.clientY);
    }
  };

  // Pointer capture is acquired lazily, only once real dragging is detected
  // (not on every pointerdown). Capturing unconditionally would redirect the
  // browser's synthesized `click` target to the container itself, silently
  // breaking every child <g onClick> gate handler — clicks would appear to do
  // nothing. Plain clicks (placement/selection) must reach their target
  // element normally; only an actual pan gesture needs capture.
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    dragRef.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY, moved: false };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    if (!drag.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
      drag.moved = true;
      (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
    }
    if (drag.moved) {
      setViewport((current) => ({ ...current, x: current.x - dx / current.zoom, y: current.y - dy / current.zoom }));
    }
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
  };

  const handlePointerUp = () => {
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
    const cell = cellFromClientPoint(event.clientX, event.clientY);
    setDropCell(null);
    if (gate && cell) onDropGate(gate, cell);
  };

  // Announces the cursor's cell whenever it moves OR whenever the operation
  // sitting under it changes (placement, deletion, undo/redo all flow back in
  // as a new `operations` prop). A synchronous read right after calling
  // onPlaceOrSelect would still see the pre-update state, since that setState
  // lives in the parent — reacting to the actual data instead of guessing at
  // its outcome keeps the announcement honest for every code path, not just
  // clicks.
  useEffect(() => {
    setAnnouncement(describeCell(operationIndex.get(cellKey(cursor.qubit, cursor.moment)), cursor.qubit, cursor.moment));
  }, [operationIndex, cursor]);

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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
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
      case "d":
      case "D":
        if (event.ctrlKey || event.metaKey) { event.preventDefault(); onDuplicateSelected(); }
        break;
      default: break;
    }
  };

  // Full-length lists: wires and headers are cheap (one element per row/column
  // regardless of grid size, at most a few hundred).
  const qubitList = Array.from({ length: numQubits }, (_, index) => index);
  const clbitList = Array.from({ length: numClbits }, (_, index) => index);
  const headerCols = Array.from({ length: columns }, (_, index) => index).slice(visibleRange.momentStart, visibleRange.momentEnd);
  // Virtualized lists: the per-cell gate loop is the expensive part (up to
  // numQubits x columns), so it only iterates the visible window.
  const visibleCols = Array.from({ length: visibleRange.momentEnd - visibleRange.momentStart }, (_, index) => index + visibleRange.momentStart);
  const visibleQubits = Array.from({ length: visibleRange.qubitEnd - visibleRange.qubitStart }, (_, index) => index + visibleRange.qubitStart);
  const visibleOperations = useMemo(
    () => operations.filter((op) => op.moment >= visibleRange.momentStart && op.moment <= visibleRange.momentEnd),
    [operations, visibleRange.momentStart, visibleRange.momentEnd],
  );
  // Ghost preview at the keyboard cursor: shown for single-endpoint gates only
  // (two-qubit gates already get a distinct "first endpoint" ring via `pending`).
  const isMultiEndpointGate = TWO_QUBIT_GATES.includes(selectedGate);
  const ghostLabel = selectedGate === "measure" ? "M" : selectedGate === "barrier" ? "‖" : selectedGate.toUpperCase();

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden rounded-xl2 border border-line bg-canvas-dim canvas-dots">
      <div
        ref={containerRef}
        role="application"
        tabIndex={0}
        aria-label={`Circuit canvas, ${numQubits} qubits, ${columns} time steps. Use arrow keys to move, Enter to place or select, Delete to remove, Control D to duplicate.`}
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
            {/* Wires */}
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

            {/* Moment headers */}
            {headerCols.map((moment) => (
              <text key={`t-${moment}`} x={momentCenterX(moment)} y={GUTTER.top - 16} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={9} fill="#63636c">t{moment}</text>
            ))}

            {/* Two-qubit connectors */}
            {visibleOperations.filter((op) => op.qubits.length === 2 && TWO_QUBIT_GATES.includes(op.gate)).map((op, index) => {
              const low = Math.min(...op.qubits);
              const high = Math.max(...op.qubits);
              return <line key={`conn-${index}`} x1={momentCenterX(op.moment)} y1={qubitCenterY(low)} x2={momentCenterX(op.moment)} y2={qubitCenterY(high)} stroke="#6366f1" strokeWidth={1.5} />;
            })}

            {/* Measurement drop lines to classical wires */}
            {visibleOperations.filter((op) => op.gate === "measure" && op.clbits[0] != null).map((op, index) => (
              <line key={`meas-${index}`} x1={momentCenterX(op.moment)} y1={qubitCenterY(op.qubits[0]) + 14} x2={momentCenterX(op.moment)} y2={clbitCenterY(op.clbits[0], numQubits) - 6} stroke="#059669" strokeWidth={1.25} strokeDasharray="2 2" />
            ))}
            {clbitList.map((clbit) =>
              visibleCols.map((moment) => {
                if (!measurementIndex.has(cellKey(clbit, moment))) return null;
                return <circle key={`mt-${clbit}-${moment}`} cx={momentCenterX(moment)} cy={clbitCenterY(clbit, numQubits)} r={5} fill="#ffffff" stroke="#059669" strokeWidth={2} />;
              }),
            )}

            {/* Gates (virtualized: only the visible window is iterated) */}
            {visibleQubits.map((qubit) =>
              visibleCols.map((moment) => {
                const key = cellKey(qubit, moment);
                const operation = operationIndex.get(key);
                const isSelected = selectedCell?.qubit === qubit && selectedCell.moment === moment && operation;
                const isPending = pending?.qubit === qubit && pending.moment === moment;
                const isCursor = cursor.qubit === qubit && cursor.moment === moment;
                const cx = momentCenterX(moment);
                const cy = qubitCenterY(qubit);

                if (!operation) {
                  const showGhost = isCursor && !isPending && !isMultiEndpointGate;
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
                      {isCursor && <rect x={cx - 17} y={cy - 17} width={34} height={34} rx={8} fill="none" stroke="#a5a6f6" strokeWidth={1.5} strokeDasharray="3 2" />}
                      {!isPending && !showGhost && <circle cx={cx} cy={cy} r={2} fill="#c2c2c9" />}
                    </g>
                  );
                }

                if (operation.gate === "barrier") {
                  return (
                    <g key={key} onClick={(event) => handleGateClick(event, qubit, moment)} className="cursor-pointer">
                      <rect x={cx - CELL.width / 2} y={cy - CELL.height / 2} width={CELL.width} height={CELL.height} fill="transparent" />
                      <line x1={cx} y1={cy - 22} x2={cx} y2={cy + 22} stroke="#a1a1aa" strokeWidth={2} strokeDasharray="4 3" />
                      {isCursor && <rect x={cx - 17} y={cy - 17} width={34} height={34} rx={8} fill="none" stroke="#a5a6f6" strokeWidth={1.5} strokeDasharray="3 2" />}
                    </g>
                  );
                }

                if (TWO_QUBIT_GATES.includes(operation.gate)) {
                  const isControl = operation.gate !== "swap" && operation.qubits[0] === qubit;
                  const isSwapNode = operation.gate === "swap";
                  return (
                    <g key={key} onClick={(event) => handleGateClick(event, qubit, moment)} className="cursor-pointer">
                      <rect x={cx - CELL.width / 2} y={cy - CELL.height / 2} width={CELL.width} height={CELL.height} fill="transparent" />
                      {isSelected && <rect x={cx - 17} y={cy - 17} width={34} height={34} rx={8} fill="#eef2ff" />}
                      {isSwapNode ? (
                        <g stroke="#4338ca" strokeWidth={2.5}>
                          <line x1={cx - 6} y1={cy - 6} x2={cx + 6} y2={cy + 6} />
                          <line x1={cx - 6} y1={cy + 6} x2={cx + 6} y2={cy - 6} />
                        </g>
                      ) : isControl ? (
                        <circle cx={cx} cy={cy} r={6} fill="#4338ca" />
                      ) : operation.gate === "cx" ? (
                        <g>
                          <circle cx={cx} cy={cy} r={11} fill="#ffffff" stroke="#4338ca" strokeWidth={2} />
                          <line x1={cx - 7} y1={cy} x2={cx + 7} y2={cy} stroke="#4338ca" strokeWidth={2} />
                          <line x1={cx} y1={cy - 7} x2={cx} y2={cy + 7} stroke="#4338ca" strokeWidth={2} />
                        </g>
                      ) : (
                        <g>
                          <rect x={cx - 12} y={cy - 12} width={24} height={24} rx={5} fill="#ffffff" stroke="#4338ca" strokeWidth={2} />
                          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-mono)" fontSize={11} fontWeight={700} fill="#4338ca">Z</text>
                        </g>
                      )}
                      {isCursor && <rect x={cx - 17} y={cy - 17} width={34} height={34} rx={8} fill="none" stroke="#6366f1" strokeWidth={2} />}
                    </g>
                  );
                }

                const isMeasure = operation.gate === "measure";
                return (
                  <g key={key} onClick={(event) => handleGateClick(event, qubit, moment)} className="cursor-pointer">
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
        onPanTo={(canvasX, canvasY) => {
          setViewport((current) => ({
            ...current,
            x: canvasX - viewportSize.width / current.zoom / 2,
            y: canvasY - viewportSize.height / current.zoom / 2,
          }));
        }}
      />
    </div>
  );
}

export { ZOOM_MIN, ZOOM_MAX };
