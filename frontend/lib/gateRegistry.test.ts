import { describe, expect, it } from "vitest";
import { BUILTIN_GATE_NAMES, GATE_DEFINITIONS, defaultGateParams, gateIsClifford, gateMatrix } from "./gateRegistry";

const multiply = (a: readonly [number, number], b: readonly [number, number]): [number, number] => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const conjugate = (a: readonly [number, number]): [number, number] => [a[0], -a[1]];

describe("central gate registry", () => {
  it("provides a correctly sized unitary for every unitary built-in", () => {
    for (const gate of BUILTIN_GATE_NAMES) {
      const definition = GATE_DEFINITIONS[gate];
      if (definition.operationKind !== "unitary") continue;
      const count = definition.defaultQubits;
      const matrix = gateMatrix(gate, defaultGateParams(gate), count);
      expect(matrix, gate).not.toBeNull();
      const size = 2 ** count;
      expect(matrix, gate).toHaveLength(size);
      for (let row = 0; row < size; row += 1) for (let col = 0; col < size; col += 1) {
        let re = 0, im = 0;
        for (let k = 0; k < size; k += 1) {
          const term = multiply(conjugate(matrix![k][row]), matrix![k][col]);
          re += term[0]; im += term[1];
        }
        expect(re, `${gate}[${row},${col}] real`).toBeCloseTo(row === col ? 1 : 0, 10);
        expect(im, `${gate}[${row},${col}] imaginary`).toBeCloseTo(0, 10);
      }
    }
  });

  it("uses the correct controlled operand convention", () => {
    const cx = gateMatrix("cx", {}, 2)!;
    expect(cx[3][1]).toEqual([1, 0]); // local q0 control, q1 target: |01> -> |11>
    expect(cx[1][3]).toEqual([1, 0]);
  });

  it("classifies angle-dependent Clifford gates at exact supported multiples", () => {
    expect(gateIsClifford("rz", { theta: Math.PI / 2 })).toBe(true);
    expect(gateIsClifford("rz", { theta: Math.PI / 4 })).toBe(false);
    expect(gateIsClifford("crz", { theta: Math.PI })).toBe(true);
    expect(gateIsClifford("crz", { theta: Math.PI / 2 })).toBe(false);
  });
});
