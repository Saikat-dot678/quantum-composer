"use client";

// Bird's-eye overview (reference study #7 React Flow MiniMap): every gate is
// a tiny mark, and a draggable rectangle shows the current viewport. Click or
// drag anywhere on the minimap to jump the main canvas there — the primary
// large-circuit navigation aid, since a 128-qubit x 256-moment grid cannot be
// seen in full at a legible zoom level.
import { memo, useCallback, useRef } from "react";
import { CELL, GUTTER, qubitCenterY } from "@/lib/canvasGeometry";
import type { CircuitOperation } from "@/lib/types";

const MAP_WIDTH = 168;
const MAP_HEIGHT = 108;

// Memoized: on a large circuit this redraws one rect per operation, and its
// parent (CircuitCanvas) re-renders on every pointer-driven viewport tick.
// Skipping this component's own re-render when none of its props actually
// changed matters once `operations` reaches into the thousands. Requires
// `onPanTo` to be a stable callback — see CircuitCanvas's own useCallback.
function CanvasMinimapImpl({
  operations,
  numQubits,
  columns,
  contentWidth,
  contentHeight,
  viewport,
  viewportSize,
  onPanTo,
}: {
  operations: CircuitOperation[];
  numQubits: number;
  columns: number;
  contentWidth: number;
  contentHeight: number;
  viewport: { x: number; y: number; zoom: number };
  viewportSize: { width: number; height: number };
  onPanTo: (canvasX: number, canvasY: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const scale = Math.min(MAP_WIDTH / contentWidth, MAP_HEIGHT / contentHeight);

  const handlePoint = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    onPanTo((clientX - rect.left) / scale, (clientY - rect.top) / scale);
  }, [onPanTo, scale]);

  if (columns <= 1 && numQubits <= 1) return null;

  const viewRectW = Math.min(MAP_WIDTH, (viewportSize.width / viewport.zoom) * scale);
  const viewRectH = Math.min(MAP_HEIGHT, (viewportSize.height / viewport.zoom) * scale);

  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-20 hidden overflow-hidden rounded-lg border border-line bg-surface/95 shadow-floating sm:block">
      <svg
        ref={svgRef}
        width={MAP_WIDTH}
        height={MAP_HEIGHT}
        role="img"
        aria-label="Circuit overview map. Click or drag to jump to that part of the circuit."
        className="pointer-events-auto cursor-pointer touch-none"
        onPointerDown={(event) => {
          (event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId);
          handlePoint(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) handlePoint(event.clientX, event.clientY);
        }}
      >
        <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="#fafafb" />
        {Array.from({ length: numQubits }, (_, qubit) => (
          <line key={qubit} x1={0} y1={qubitCenterY(qubit) * scale} x2={MAP_WIDTH} y2={qubitCenterY(qubit) * scale} stroke="#e4e4e7" strokeWidth={1} />
        ))}
        {operations.map((op, index) => (
          <rect
            key={index}
            x={(GUTTER.left + op.moment * CELL.width) * scale}
            y={Math.min(...op.qubits) * CELL.height * scale + GUTTER.top * scale - 1}
            width={Math.max(2, CELL.width * scale * 0.7)}
            height={Math.max(2, (Math.max(...op.qubits) - Math.min(...op.qubits) + 1) * CELL.height * scale)}
            rx={1}
            fill="#818cf8"
          />
        ))}
        <rect
          x={Math.max(0, viewport.x * scale)}
          y={Math.max(0, viewport.y * scale)}
          width={viewRectW}
          height={viewRectH}
          fill="rgba(99,102,241,0.08)"
          stroke="#4f46e5"
          strokeWidth={1.5}
          rx={2}
        />
      </svg>
    </div>
  );
}

export const CanvasMinimap = memo(CanvasMinimapImpl);
