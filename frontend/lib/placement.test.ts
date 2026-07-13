import { describe, expect, it } from "vitest";
import { checkPlacement, qubitSpan, shiftQubits, withinRegister } from "./placement";
import type { CircuitData, CircuitOperation } from "./types";

const op = (partial: Partial<CircuitOperation>): CircuitOperation => ({
  gate: "h", qubits: [0], clbits: [], params: {}, moment: 0, ...partial,
});

const circuitWith = (operations: CircuitOperation[], overrides: Partial<CircuitData> = {}): CircuitData => ({
  num_qubits: 4, num_clbits: 2, shots: 1024, operations, ...overrides,
});

describe("checkPlacement", () => {
  it("accepts an empty, in-bounds cell", () => {
    const circuit = circuitWith([]);
    expect(checkPlacement(circuit, { qubits: [1], clbits: [], moment: 2 })).toEqual({ ok: true });
  });

  it("rejects a qubit outside the register", () => {
    const circuit = circuitWith([]);
    const result = checkPlacement(circuit, { qubits: [9], clbits: [], moment: 0 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/outside the register/);
  });

  it("rejects a classical bit outside the register", () => {
    const circuit = circuitWith([]);
    const result = checkPlacement(circuit, { qubits: [0], clbits: [9], moment: 0 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/classical bit/);
  });

  it("rejects a negative or non-finite moment", () => {
    const circuit = circuitWith([]);
    expect(checkPlacement(circuit, { qubits: [0], clbits: [], moment: -1 }).ok).toBe(false);
    expect(checkPlacement(circuit, { qubits: [0], clbits: [], moment: 1.5 }).ok).toBe(false);
  });

  it("rejects a moment beyond the declared column count", () => {
    const circuit = circuitWith([]);
    const result = checkPlacement(circuit, { qubits: [0], clbits: [], moment: 8 }, { columns: 8 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/timeline/);
  });

  it("rejects duplicate qubits within the same operand list", () => {
    const circuit = circuitWith([]);
    const result = checkPlacement(circuit, { qubits: [1, 1], clbits: [], moment: 0 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/same qubit twice/);
  });

  it("rejects a cell already occupied by another operation", () => {
    const existing = op({ qubits: [1], moment: 3 });
    const circuit = circuitWith([existing]);
    const result = checkPlacement(circuit, { qubits: [1], clbits: [], moment: 3 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/already occupied by H/);
  });

  it("allows placing back onto the same cell when the occupant is excluded (moving a gate onto itself)", () => {
    const existing = op({ qubits: [1], moment: 3 });
    const circuit = circuitWith([existing]);
    const result = checkPlacement(circuit, { qubits: [1], clbits: [], moment: 3 }, { excludeOperation: existing });
    expect(result.ok).toBe(true);
  });

  it("does not flag a conflict against an excluded operation elsewhere on the same moment", () => {
    const moving = op({ qubits: [0], moment: 5 });
    const other = op({ qubits: [2], moment: 5 });
    const circuit = circuitWith([moving, other]);
    // Moving `moving` to q1@t5 should be fine: q1 isn't occupied by `other` (q2).
    const result = checkPlacement(circuit, { qubits: [1], clbits: [], moment: 5 }, { excludeOperation: moving });
    expect(result.ok).toBe(true);
  });

  it("rejects moving onto a qubit truly held by a different operation at the same moment", () => {
    const moving = op({ qubits: [0], moment: 5 });
    const blocker = op({ qubits: [2], moment: 5, gate: "x" });
    const circuit = circuitWith([moving, blocker]);
    const result = checkPlacement(circuit, { qubits: [2], clbits: [], moment: 5 }, { excludeOperation: moving });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/already occupied by X/);
  });

  it("detects a multi-qubit conflict when only one endpoint overlaps", () => {
    const blocker = op({ qubits: [3], moment: 1, gate: "t" });
    const circuit = circuitWith([blocker]);
    const result = checkPlacement(circuit, { qubits: [2, 3], clbits: [], moment: 1 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/already occupied by T/);
  });

  it("requires at least one qubit", () => {
    const circuit = circuitWith([]);
    const result = checkPlacement(circuit, { qubits: [], clbits: [], moment: 0 });
    expect(result.ok).toBe(false);
  });
});

describe("shiftQubits", () => {
  it("preserves the gap between control and target when the anchor moves", () => {
    expect(shiftQubits([0, 2], 5)).toEqual([5, 7]);
  });

  it("shifts a single-qubit operand set by the same offset", () => {
    expect(shiftQubits([4], 1)).toEqual([1]);
  });

  it("is a no-op when the anchor doesn't move", () => {
    expect(shiftQubits([1, 3], 1)).toEqual([1, 3]);
  });

  it("can shift downward, including negative intermediate offsets", () => {
    expect(shiftQubits([5, 2], 1)).toEqual([1, -2]);
  });
});

describe("qubitSpan", () => {
  it("returns min/max regardless of operand order", () => {
    expect(qubitSpan([5, 1])).toEqual({ min: 1, max: 5 });
    expect(qubitSpan([1, 5])).toEqual({ min: 1, max: 5 });
  });

  it("handles a single-qubit operation", () => {
    expect(qubitSpan([3])).toEqual({ min: 3, max: 3 });
  });
});

describe("withinRegister", () => {
  it("accepts qubits inside [0, numQubits)", () => {
    expect(withinRegister([0, 3], 4)).toBe(true);
  });

  it("rejects a qubit at or beyond numQubits", () => {
    expect(withinRegister([0, 4], 4)).toBe(false);
  });

  it("rejects a negative qubit", () => {
    expect(withinRegister([-1], 4)).toBe(false);
  });
});
