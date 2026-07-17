import { describe, expect, it } from "vitest";
import {
  DEFAULT_MANUAL_HARDWARE,
  exportManualHardware,
  formatAge,
  formatPercent,
  logicalMappingRows,
  parseManualHardware,
  topologyPoints,
} from "./hardwareFormat";
import type { BackendDetail } from "./hardwareTypes";

function detail(numQubits: number, coordinates: number[][] | null = null): BackendDetail {
  return {
    summary: {
      source: "manual",
      name: "A deliberately very long backend name that must remain layout-safe",
      num_qubits: numQubits,
      basis_gates: ["rz", "sx", "cx"],
      simulator: true,
      operational: null,
      pending_jobs: null,
      processor_family: null,
      processor_version: null,
      region: null,
      dynamic_circuits: false,
      calibration_timestamp: null,
      description: null,
    },
    coupling_edges: [],
    coordinates,
    coordinates_schematic: coordinates === null,
    qubit_calibrations: [],
    edge_calibrations: [],
    supported_instructions: ["rz", "sx", "cx"],
    dt_ns: null,
    notes: null,
    warnings: [],
  };
}

describe("topologyPoints", () => {
  it("normalizes supplied coordinates inside the drawable bounds", () => {
    const points = topologyPoints(detail(3, [[-10, 50], [0, 75], [10, 100]]), 500, 300);
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ qubit: 0, x: 42, y: 42 });
    expect(points[2]).toEqual({ qubit: 2, x: 458, y: 258 });
  });

  it("produces finite schematic positions for large targets", () => {
    const points = topologyPoints(detail(156), 760, 430);
    expect(points).toHaveLength(156);
    expect(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
    expect(new Set(points.map((point) => `${point.x}:${point.y}`)).size).toBe(156);
  });
});

describe("logicalMappingRows", () => {
  it("preserves initial and final logical-to-physical mappings", () => {
    expect(logicalMappingRows({ initial: [0, 4, 1], final: [2, 4, 0], active_physical_qubits: [0, 2, 4], idle_physical_qubits_count: 2 })).toEqual([
      { logical: 0, initial: 0, final: 2 },
      { logical: 1, initial: 4, final: 4 },
      { logical: 2, initial: 1, final: 0 },
    ]);
  });
});

describe("manual hardware import/export", () => {
  it("round-trips the documented schema", () => {
    const parsed = parseManualHardware(exportManualHardware(DEFAULT_MANUAL_HARDWARE));
    expect(parsed.name).toBe(DEFAULT_MANUAL_HARDWARE.name);
    expect(parsed.edges).toHaveLength(4);
    expect(parsed.format).toBe("quantum-composer-hardware");
    expect(parsed.version).toBe(1);
  });

  it("rejects unsupported versions and malformed shapes before the request", () => {
    expect(() => parseManualHardware('{"format":"quantum-composer-hardware","version":2}')).toThrow(/version/i);
    expect(() => parseManualHardware('{"name":"x","num_qubits":2,"edges":[]}')).toThrow(/basis_gates/i);
  });
});

describe("hardware formatting", () => {
  it("keeps absent calibration values explicit", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatAge(null)).toBe("not supplied");
    expect(formatAge("not-a-date")).toBe("invalid timestamp");
  });
});
