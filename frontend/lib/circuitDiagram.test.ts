import { describe, expect, it } from "vitest";
import {
  circuitDiagramDataUrl,
  clampDiagramZoom,
  fitDiagramZoom,
  type CircuitDiagramPayload,
} from "./circuitDiagram";

const diagram: CircuitDiagramPayload = {
  format: "svg",
  encoding: "base64",
  content: "PHN2ZyB2aWV3Qm94PSIwIDAgMTAgMTAiPjwvc3ZnPg==",
  width: 1200,
  height: 420,
  fold: -1,
  wrapped: false,
};

describe("circuitDiagramDataUrl", () => {
  it("accepts the typed base64 SVG transport", () => {
    expect(circuitDiagramDataUrl(diagram)).toBe(`data:image/svg+xml;base64,${diagram.content}`);
  });

  it("rejects malformed or dimensionless payloads", () => {
    expect(circuitDiagramDataUrl({ ...diagram, content: "<svg>unsafe raw markup</svg>" })).toBeNull();
    expect(circuitDiagramDataUrl({ ...diagram, width: 0 })).toBeNull();
    expect(circuitDiagramDataUrl(null)).toBeNull();
  });
});

describe("diagram zoom", () => {
  it("clamps zoom to readable safe limits", () => {
    expect(clampDiagramZoom(0.1)).toBe(0.5);
    expect(clampDiagramZoom(1.25)).toBe(1.25);
    expect(clampDiagramZoom(9)).toBe(3);
  });

  it("fits normal diagrams but keeps wide diagrams scrollable", () => {
    expect(fitDiagramZoom(1224, 1200)).toBe(1);
    expect(fitDiagramZoom(360, 2400)).toBe(0.5);
    expect(fitDiagramZoom(0, 1200)).toBe(1);
  });
});

