export interface CircuitDiagramPayload {
  format: "svg";
  encoding: "base64";
  content: string;
  width: number;
  height: number;
  fold: number;
  wrapped: boolean;
}

export const MIN_DIAGRAM_ZOOM = 0.5;
export const MAX_DIAGRAM_ZOOM = 3;

export function clampDiagramZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_DIAGRAM_ZOOM, Math.max(MIN_DIAGRAM_ZOOM, value));
}

export function fitDiagramZoom(viewportWidth: number, diagramWidth: number): number {
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(diagramWidth) || viewportWidth <= 0 || diagramWidth <= 0) return 1;
  // Leave a small optical margin. The 50% floor intentionally preserves
  // readable labels and lets very wide circuits scroll instead of shrinking
  // into an illegible thumbnail.
  return clampDiagramZoom((viewportWidth - 24) / diagramWidth);
}

export function circuitDiagramDataUrl(diagram: CircuitDiagramPayload | null | undefined): string | null {
  if (!diagram || diagram.format !== "svg" || diagram.encoding !== "base64") return null;
  if (!Number.isFinite(diagram.width) || !Number.isFinite(diagram.height) || diagram.width <= 0 || diagram.height <= 0) return null;
  if (diagram.content.length < 16 || diagram.content.length > 8_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(diagram.content)) return null;
  return `data:image/svg+xml;base64,${diagram.content}`;
}

