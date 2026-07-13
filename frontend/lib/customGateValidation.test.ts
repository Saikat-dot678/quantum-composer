import { describe, expect, it } from "vitest";
import type { ComplexPair, CustomDefinition, DecompositionGateDefinition, DecompositionStep, MatrixGateDefinition } from "./customGates";
import { customGateRef } from "./customGates";
import {
  validateDefinition,
  validateDescription,
  validateLabel,
  validateMatrix,
  validateName,
  validateParameters,
  validateSteps,
} from "./customGateValidation";

const IDENTITY_1Q: ComplexPair[][] = [[[1, 0], [0, 0]], [[0, 0], [1, 0]]];
const PAULI_X: ComplexPair[][] = [[[0, 0], [1, 0]], [[1, 0], [0, 0]]];
const HADAMARD: ComplexPair[][] = (() => {
  const s = Math.SQRT1_2;
  return [[[s, 0], [s, 0]], [[s, 0], [-s, 0]]];
})();

function emptyLibrary(): Map<string, CustomDefinition> {
  return new Map();
}

function baseFields(overrides: Partial<{ id: string; name: string; label: string }> = {}) {
  return {
    id: overrides.id ?? "def-1",
    name: overrides.name ?? "Test gate",
    label: overrides.label ?? "TG",
    description: "",
    category: "Custom",
    icon: "circle" as const,
    tags: [],
    favorite: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("validateName / validateLabel / validateDescription", () => {
  it("rejects an empty name", () => {
    expect(validateName("").ok).toBe(false);
    expect(validateName("   ").ok).toBe(false);
  });

  it("accepts a normal name", () => {
    expect(validateName("My Gate").ok).toBe(true);
  });

  it("rejects a name over the length limit", () => {
    expect(validateName("x".repeat(61)).ok).toBe(false);
  });

  it("rejects an empty label", () => {
    expect(validateLabel("").ok).toBe(false);
  });

  it("rejects a label too long for a canvas cell", () => {
    expect(validateLabel("WAYTOOLONG").ok).toBe(false);
  });

  it("accepts a short label", () => {
    expect(validateLabel("U1").ok).toBe(true);
  });

  it("rejects an overlong description", () => {
    expect(validateDescription("x".repeat(401)).ok).toBe(false);
  });
});

describe("validateMatrix", () => {
  it("accepts the identity matrix", () => {
    const result = validateMatrix(IDENTITY_1Q, 1);
    expect(result.ok).toBe(true);
    expect(result.maxUnitarityError).toBeLessThan(1e-9);
  });

  it("accepts Pauli X", () => {
    expect(validateMatrix(PAULI_X, 1).ok).toBe(true);
  });

  it("accepts Hadamard within floating-point tolerance", () => {
    const result = validateMatrix(HADAMARD, 1);
    expect(result.ok).toBe(true);
  });

  it("rejects a non-square / wrong-dimension matrix", () => {
    const result = validateMatrix([[[1, 0], [0, 0]]], 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/2x2/);
  });

  it("rejects a row with the wrong number of entries", () => {
    const bad = [[[1, 0], [0, 0], [0, 0]], [[0, 0], [1, 0]]];
    expect(validateMatrix(bad, 1).ok).toBe(false);
  });

  it("rejects non-finite entries", () => {
    const bad = [[[1, 0], [0, 0]], [[0, 0], [Infinity, 0]]];
    expect(validateMatrix(bad, 1).ok).toBe(false);
  });

  it("rejects entries that aren't [re, im] pairs", () => {
    const bad = [[[1, 0], [0]], [[0, 0], [1, 0]]];
    expect(validateMatrix(bad, 1).ok).toBe(false);
  });

  it("rejects a genuinely non-unitary matrix and reports the error magnitude", () => {
    const notUnitary: ComplexPair[][] = [[[2, 0], [0, 0]], [[0, 0], [1, 0]]];
    const result = validateMatrix(notUnitary, 1);
    expect(result.ok).toBe(false);
    expect(result.maxUnitarityError).toBeGreaterThan(1);
    expect(result.reason).toMatch(/not unitary/);
  });

  it("rejects a qubit count outside 1-3", () => {
    expect(validateMatrix(IDENTITY_1Q, 0).ok).toBe(false);
    expect(validateMatrix(IDENTITY_1Q, 4).ok).toBe(false);
  });

  it("accepts a valid 2-qubit unitary (CNOT)", () => {
    const cnot: ComplexPair[][] = [
      [[1, 0], [0, 0], [0, 0], [0, 0]],
      [[0, 0], [1, 0], [0, 0], [0, 0]],
      [[0, 0], [0, 0], [0, 0], [1, 0]],
      [[0, 0], [0, 0], [1, 0], [0, 0]],
    ];
    expect(validateMatrix(cnot, 2).ok).toBe(true);
  });

  it("respects a custom tolerance", () => {
    const almostUnitary: ComplexPair[][] = [[[1.001, 0], [0, 0]], [[0, 0], [1, 0]]];
    expect(validateMatrix(almostUnitary, 1, 1e-9).ok).toBe(false);
    expect(validateMatrix(almostUnitary, 1, 1e-1).ok).toBe(true);
  });
});

describe("validateParameters", () => {
  it("accepts a well-formed parameter list", () => {
    expect(validateParameters([{ name: "theta", label: "Theta", default: 0 }]).ok).toBe(true);
  });

  it("rejects a duplicate parameter name", () => {
    const result = validateParameters([
      { name: "theta", label: "A", default: 0 },
      { name: "theta", label: "B", default: 1 },
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid identifier", () => {
    expect(validateParameters([{ name: "1bad", label: "x", default: 0 }]).ok).toBe(false);
    expect(validateParameters([{ name: "has space", label: "x", default: 0 }]).ok).toBe(false);
  });

  it("rejects a non-finite default", () => {
    expect(validateParameters([{ name: "theta", label: "x", default: NaN }]).ok).toBe(false);
  });

  it("rejects min greater than max", () => {
    expect(validateParameters([{ name: "theta", label: "x", default: 0, min: 5, max: 1 }]).ok).toBe(false);
  });

  it("rejects too many parameters", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ name: `p${i}`, label: `P${i}`, default: 0 }));
    expect(validateParameters(many).ok).toBe(false);
  });
});

describe("validateSteps", () => {
  const step = (partial: Partial<DecompositionStep>): DecompositionStep => ({
    gate: "h", qubits: [0], clbits: [], params: {}, moment: 0, ...partial,
  });

  it("rejects an empty step list", () => {
    expect(validateSteps([], { numQubits: 1, numClbits: 0 }, emptyLibrary()).ok).toBe(false);
  });

  it("accepts a simple valid Bell-pair decomposition", () => {
    const steps = [step({ gate: "h", qubits: [0], moment: 0 }), step({ gate: "cx", qubits: [0, 1], moment: 1 })];
    const result = validateSteps(steps, { numQubits: 2, numClbits: 0 }, emptyLibrary());
    expect(result.ok).toBe(true);
    expect(result.expandedCount).toBe(2);
  });

  it("rejects a qubit index out of range", () => {
    const steps = [step({ qubits: [5] })];
    expect(validateSteps(steps, { numQubits: 2, numClbits: 0 }, emptyLibrary()).ok).toBe(false);
  });

  it("rejects a duplicate qubit within one step", () => {
    const steps = [step({ gate: "cx", qubits: [0, 0] })];
    expect(validateSteps(steps, { numQubits: 2, numClbits: 0 }, emptyLibrary()).ok).toBe(false);
  });

  it("rejects a classical bit out of range", () => {
    const steps = [step({ gate: "measure", qubits: [0], clbits: [3] })];
    expect(validateSteps(steps, { numQubits: 1, numClbits: 1 }, emptyLibrary()).ok).toBe(false);
  });

  it("rejects an unrecognized gate name", () => {
    const steps = [step({ gate: "not-a-real-gate" })];
    expect(validateSteps(steps, { numQubits: 1, numClbits: 0 }, emptyLibrary()).ok).toBe(false);
  });

  it("rejects wrong operand shape for a known gate", () => {
    const steps = [step({ gate: "cx", qubits: [0] })]; // cx needs 2 qubits
    expect(validateSteps(steps, { numQubits: 2, numClbits: 0 }, emptyLibrary()).ok).toBe(false);
  });

  it("rejects a self-reference (a definition cannot use itself)", () => {
    const steps = [step({ gate: customGateRef("def-1") })];
    const result = validateSteps(steps, { numQubits: 1, numClbits: 0, ownId: "def-1" }, emptyLibrary());
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/recurse/);
  });

  it("rejects a reference to a gate that doesn't exist in the library", () => {
    const steps = [step({ gate: customGateRef("missing") })];
    expect(validateSteps(steps, { numQubits: 1, numClbits: 0 }, emptyLibrary()).ok).toBe(false);
  });

  it("accepts a valid reference to another definition and counts its expansion", () => {
    const inner: MatrixGateDefinition = { ...baseFields({ id: "inner" }), kind: "matrix", numQubits: 1, matrix: PAULI_X, unitarityError: 0 };
    const library = new Map<string, CustomDefinition>([["inner", inner]]);
    const steps = [step({ gate: customGateRef("inner"), qubits: [0] })];
    const result = validateSteps(steps, { numQubits: 1, numClbits: 0 }, library);
    expect(result.ok).toBe(true);
    expect(result.expandedCount).toBe(1);
  });

  it("detects a two-level circular reference (A -> B -> A)", () => {
    const a: DecompositionGateDefinition = {
      ...baseFields({ id: "a" }), kind: "decomposition", numQubits: 1, numClbits: 0, parameters: [],
      steps: [step({ gate: customGateRef("b") })],
    };
    const b: DecompositionGateDefinition = {
      ...baseFields({ id: "b" }), kind: "decomposition", numQubits: 1, numClbits: 0, parameters: [],
      steps: [step({ gate: customGateRef("a") })],
    };
    const library = new Map<string, CustomDefinition>([["a", a], ["b", b]]);
    // Validating b's own steps (referencing a, which references b) should
    // detect the cycle when b is being defined/edited (ownId: "b").
    const result = validateSteps(b.steps, { numQubits: 1, numClbits: 0, ownId: "b" }, library);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/[Cc]ircular/);
  });

  it("rejects nesting deeper than the depth limit", () => {
    const library = new Map<string, CustomDefinition>();
    let previousId: string | null = null;
    for (let level = 0; level < 12; level += 1) {
      const id = `level-${level}`;
      const steps: DecompositionStep[] = previousId
        ? [step({ gate: customGateRef(previousId), qubits: [0] })]
        : [step({ gate: "h", qubits: [0] })];
      const def: DecompositionGateDefinition = { ...baseFields({ id }), kind: "decomposition", numQubits: 1, numClbits: 0, parameters: [], steps };
      library.set(id, def);
      previousId = id;
    }
    const topSteps = [step({ gate: customGateRef(previousId as string), qubits: [0] })];
    const result = validateSteps(topSteps, { numQubits: 1, numClbits: 0, ownId: "top" }, library);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/[Nn]esting/);
  });

  it("accepts a parameter reference that matches a declared parameter", () => {
    const steps = [step({ gate: "rx", qubits: [0], params: { theta: "param:angle" } })];
    const result = validateSteps(steps, { numQubits: 1, numClbits: 0, parameters: [{ name: "angle", label: "Angle", default: 0 }] }, emptyLibrary());
    expect(result.ok).toBe(true);
  });

  it("rejects a parameter reference to an undeclared parameter", () => {
    const steps = [step({ gate: "rx", qubits: [0], params: { theta: "param:missing" } })];
    expect(validateSteps(steps, { numQubits: 1, numClbits: 0, parameters: [] }, emptyLibrary()).ok).toBe(false);
  });

  it("rejects a non-finite literal parameter value", () => {
    const steps = [step({ gate: "rx", qubits: [0], params: { theta: NaN } })];
    expect(validateSteps(steps, { numQubits: 1, numClbits: 0 }, emptyLibrary()).ok).toBe(false);
  });

  it("accepts a barrier spanning multiple qubits", () => {
    const steps = [step({ gate: "barrier", qubits: [0, 1, 2] })];
    expect(validateSteps(steps, { numQubits: 3, numClbits: 0 }, emptyLibrary()).ok).toBe(true);
  });
});

describe("validateDefinition", () => {
  it("validates a complete matrix definition end to end", () => {
    const def: MatrixGateDefinition = { ...baseFields(), kind: "matrix", numQubits: 1, matrix: HADAMARD, unitarityError: 0 };
    expect(validateDefinition(def, emptyLibrary()).ok).toBe(true);
  });

  it("rejects a matrix definition with a bad name even if the matrix is fine", () => {
    const def: MatrixGateDefinition = { ...baseFields({ name: "" }), kind: "matrix", numQubits: 1, matrix: HADAMARD, unitarityError: 0 };
    expect(validateDefinition(def, emptyLibrary()).ok).toBe(false);
  });

  it("validates a complete decomposition definition end to end", () => {
    const def: DecompositionGateDefinition = {
      ...baseFields(), kind: "decomposition", numQubits: 2, numClbits: 0, parameters: [],
      steps: [
        { gate: "h", qubits: [0], clbits: [], params: {}, moment: 0 },
        { gate: "cx", qubits: [0, 1], clbits: [], params: {}, moment: 1 },
      ],
    };
    expect(validateDefinition(def, emptyLibrary()).ok).toBe(true);
  });
});
