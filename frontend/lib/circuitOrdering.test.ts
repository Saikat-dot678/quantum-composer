import { describe, expect, it } from "vitest";
import { canonicalOperationOrder, canonicalizeCircuit } from "./circuitOrdering";
import type { CircuitData, CircuitOperation } from "./types";

const op = (gate: CircuitOperation["gate"], moment: number, qubits: number[]): CircuitOperation => ({
  gate, moment, qubits, clbits: [], params: {},
});

describe("canonical circuit operation ordering", () => {
  it("sorts numerically without mutating input and preserves same-moment order", () => {
    const operations = [op("x", 10, [0]), op("h", 2, [1]), op("z", 2, [2])];
    const ordered = canonicalOperationOrder(operations);
    expect(ordered.map((operation) => operation.gate)).toEqual(["h", "z", "x"]);
    expect(operations.map((operation) => operation.gate)).toEqual(["x", "h", "z"]);
    expect(ordered).not.toBe(operations);
  });

  it("makes stale array position irrelevant after a move changes moment", () => {
    const circuit: CircuitData = {
      num_qubits: 2, num_clbits: 0, shots: 100,
      operations: [op("x", 4, [0]), op("h", 0, [1]), op("cx", 2, [0, 1])],
    };
    expect(canonicalizeCircuit(circuit).operations.map((operation) => operation.gate)).toEqual(["h", "cx", "x"]);
  });
});
