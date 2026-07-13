// Pure geometry for the Composer's spatial SVG canvas. Qubits/moments map to a
// fixed grid in "canvas space"; pan/zoom is a separate CSS/SVG transform layer
// on top, so every function here stays independent of the current viewport.
// This is what makes a 128-qubit x 256-moment circuit navigable at all: the
// whole grid always exists in canvas space, and zoom decides how much of it is
// legible at once (see CanvasMinimap for the bird's-eye view).

export const CELL = { width: 64, height: 56 } as const;
export const GUTTER = { left: 96, top: 40 } as const;
/** Extra vertical gap between the last quantum wire and the first classical wire. */
export const REGISTER_GAP = 20;

export interface CanvasMetrics {
  numQubits: number;
  numClbits: number;
  columns: number;
}

export function qubitCenterY(qubit: number): number {
  return GUTTER.top + qubit * CELL.height + CELL.height / 2;
}

export function clbitCenterY(clbit: number, numQubits: number): number {
  return GUTTER.top + numQubits * CELL.height + REGISTER_GAP + clbit * CELL.height + CELL.height / 2;
}

export function momentCenterX(moment: number): number {
  return GUTTER.left + moment * CELL.width + CELL.width / 2;
}

export function canvasContentWidth(columns: number): number {
  return GUTTER.left + Math.max(columns, 1) * CELL.width + CELL.width;
}

export function canvasContentHeight(numQubits: number, numClbits: number): number {
  const base = GUTTER.top + Math.max(numQubits, 1) * CELL.height;
  return (numClbits > 0 ? base + REGISTER_GAP + numClbits * CELL.height : base) + CELL.height / 2;
}

/** Nearest (qubit, moment) cell for a canvas-space point, clamped to the grid. */
export function pointToCell(x: number, y: number, metrics: CanvasMetrics): { qubit: number; moment: number } {
  const moment = Math.round((x - GUTTER.left - CELL.width / 2) / CELL.width);
  const qubit = Math.round((y - GUTTER.top - CELL.height / 2) / CELL.height);
  return {
    qubit: Math.min(Math.max(qubit, 0), Math.max(metrics.numQubits - 1, 0)),
    moment: Math.min(Math.max(moment, 0), Math.max(metrics.columns - 1, 0)),
  };
}

export interface Viewport {
  /** Canvas-space x/y currently at the top-left of the visible viewport. */
  x: number;
  y: number;
  zoom: number;
}

export const ZOOM_MIN = 0.15;
export const ZOOM_MAX = 2.5;

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** Screen-space (client) coordinates -> canvas-space coordinates, given a viewport and the canvas element's bounding rect. */
export function screenToCanvas(clientX: number, clientY: number, rect: DOMRect, viewport: Viewport): { x: number; y: number } {
  return {
    x: viewport.x + (clientX - rect.left) / viewport.zoom,
    y: viewport.y + (clientY - rect.top) / viewport.zoom,
  };
}

/** A zoom level that fits the whole grid within the given viewport pixel size, with padding. */
export function fitZoom(contentWidth: number, contentHeight: number, viewportWidth: number, viewportHeight: number, padding = 48): number {
  const zoomX = (viewportWidth - padding * 2) / contentWidth;
  const zoomY = (viewportHeight - padding * 2) / contentHeight;
  return clampZoom(Math.min(zoomX, zoomY));
}
