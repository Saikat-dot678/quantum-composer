import { describe, expect, it } from "vitest";
import type { CircuitData, CircuitOperation } from "./types";
import type { CompositeOperationDefinition, DecompositionGateDefinition, MatrixGateDefinition } from "./customGates";
import { customGateRef } from "./customGates";
import { collectReferencedDefinitions, hasCustomOperations, resolveCustomOperations } from "./customGateResolve";

function baseFields(overrides: Partial<{ id: string; name: string; label: string }> = {}) {
  return {
    id: overrides.id ?? "def-1",
    name: overrides.name ?? "Test definition",
    label: overrides.label ?? "TD",
    description: "",
    category: "Custom",
    icon: "circle" as const,
    tags: [],
    favorite: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

const PAULI_X = [[[0, 0], [1, 0]], [[1, 0], [0, 0]]] as MatrixGateDefinition["matrix"];

function matrixDef(overrides: Partial<MatrixGateDefinition> = {}): MatrixGateDefinition {
  return { ...baseFields(overrides), kind: "matrix", numQubits: 1, matrix: PAULI_X, unitarityError: 0, ...overrides };
}

function bellComposite(overrides: Partial<CompositeOperationDefinition> = {}): CompositeOperationDefinition {
  return {
    ...baseFields({ id: "bell", name: "Bell pair", label: "BELL", ...overrides }),
    kind: "composite",
    numQubits: 2,
    numClbits: 0,
    steps: [
      { gate: "h", qubits: [0], clbits: [], params: {}, moment: 0 },
      { gate: "cx", qubits: [0, 1], clbits: [], params: {}, moment: 1 },
    ],
    ...overrides,
  };
}

function rotationDecomposition(overrides: Partial<DecompositionGateDefinition> = {}): DecompositionGateDefinition {
  return {
    ...baseFields({ id: "myrot", name: "My rotation", label: "MYR", ...overrides }),
    kind: "decomposition",
    numQubits: 1,
    numClbits: 0,
    parameters: [{ name: "theta", label: "theta", default: Math.PI / 2 }],
    steps: [{ gate: "rz", qubits: [0], clbits: [], params: { theta: "param:theta" }, moment: 0 }],
    ...overrides,
  };
}

function circuitWith(operations: CircuitOperation[], numQubits = 3, numClbits = 1): CircuitData {
  return { num_qubits: numQubits, num_clbits: numClbits, shots: 1024, operations };
}

function customOp(id: string, qubits: number[], moment: number, clbits: number[] = [], params: Record<string, number> = {}): CircuitOperation {
  return { gate: "custom", customId: id, qubits, clbits, params, moment };
}

describe("hasCustomOperations", () => {
  it("is false for a plain circuit", () => {
    expect(hasCustomOperations(circuitWith([{ gate: "h", qubits: [0], clbits: [], params: {}, moment: 0 }]))).toBe(false);
  });
  it("is true once a custom instance is placed", () => {
    expect(hasCustomOperations(circuitWith([customOp("bell", [0, 1], 0)]))).toBe(true);
  });
});

describe("resolveCustomOperations: pass-through", () => {
  it("leaves a circuit with no custom operations unchanged in content (only re-scheduled)", () => {
    const circuit = circuitWith([
      { gate: "h", qubits: [0], clbits: [], params: {}, moment: 0 },
      { gate: "cx", qubits: [0, 1], clbits: [], params: {}, moment: 1 },
    ]);
    const result = resolveCustomOperations(circuit, new Map());
    expect(result.ok).toBe(true);
    expect(result.circuit?.operations).toHaveLength(2);
    expect(result.circuit?.operations[0]).toMatchObject({ gate: "h", qubits: [0] });
    expect(result.circuit?.operations[1]).toMatchObject({ gate: "cx", qubits: [0, 1] });
  });

  it("does not move terminal measurements ahead of later-moment CX gates", () => {
    const circuit = circuitWith([
      { gate: "measure", qubits: [1], clbits: [1], params: {}, moment: 5 },
      { gate: "cx", qubits: [0, 3], clbits: [], params: {}, moment: 3 },
      { gate: "h", qubits: [0], clbits: [], params: {}, moment: 0 },
      { gate: "measure", qubits: [0], clbits: [0], params: {}, moment: 4 },
      { gate: "cx", qubits: [0, 1], clbits: [], params: {}, moment: 1 },
      { gate: "measure", qubits: [3], clbits: [3], params: {}, moment: 7 },
      { gate: "cx", qubits: [0, 2], clbits: [], params: {}, moment: 2 },
      { gate: "measure", qubits: [2], clbits: [2], params: {}, moment: 6 },
    ], 4, 4);
    const result = resolveCustomOperations(circuit, new Map());
    expect(result.circuit?.operations.map((operation) => operation.gate)).toEqual([
      "h", "cx", "cx", "cx", "measure", "measure", "measure", "measure",
    ]);
    expect(result.circuit?.operations.map((operation) => operation.moment)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("is idempotent for an already-resolved unitary operation", () => {
    const circuit = circuitWith([{
      gate: "unitary",
      qubits: [0],
      clbits: [],
      params: {},
      moment: 3,
      matrix: PAULI_X,
      label: "PX",
    }]);
    const result = resolveCustomOperations(circuit, new Map());
    expect(result.ok).toBe(true);
    expect(result.circuit?.operations[0]).toEqual({
      gate: "unitary",
      qubits: [0],
      clbits: [],
      params: {},
      moment: 3,
      matrix: PAULI_X,
      label: "PX",
    });
  });
});

describe("resolveCustomOperations: matrix gates", () => {
  it("expands a matrix instance into a single unitary operation with the instance's qubits", () => {
    const library = new Map([["px", matrixDef({ id: "px", label: "PX" })]]);
    const circuit = circuitWith([customOp("px", [2], 0)]);
    const result = resolveCustomOperations(circuit, library);
    expect(result.ok).toBe(true);
    expect(result.circuit?.operations).toHaveLength(1);
    const op = result.circuit?.operations[0];
    expect(op?.gate).toBe("unitary");
    if (op?.gate === "unitary") {
      expect(op.qubits).toEqual([2]);
      expect(op.matrix).toEqual(PAULI_X);
      expect(op.label).toBe("PX");
    }
  });
});

describe("resolveCustomOperations: decomposition / composite gates", () => {
  it("expands a Bell composite into H then CX on the instance's actual qubits", () => {
    const library = new Map([["bell", bellComposite()]]);
    const circuit = circuitWith([customOp("bell", [1, 2], 0)]);
    const result = resolveCustomOperations(circuit, library);
    expect(result.ok).toBe(true);
    const ops = result.circuit!.operations;
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ gate: "h", qubits: [1] });
    expect(ops[1]).toMatchObject({ gate: "cx", qubits: [1, 2] });
    // H must be scheduled strictly before CX since CX depends on qubit 1.
    expect(ops[0].moment).toBeLessThan(ops[1].moment);
  });

  it("binds a decomposition's exposed parameter from the instance's params, falling back to the default", () => {
    const library = new Map([["myrot", rotationDecomposition()]]);
    const withOverride = resolveCustomOperations(circuitWith([customOp("myrot", [0], 0, [], { theta: 1.25 })]), library);
    expect(withOverride.circuit?.operations[0]).toMatchObject({ gate: "rz", params: { theta: 1.25 } });

    const withDefault = resolveCustomOperations(circuitWith([customOp("myrot", [0], 0)]), library);
    expect(withDefault.circuit?.operations[0]).toMatchObject({ gate: "rz", params: { theta: Math.PI / 2 } });
  });

  it("recursively expands a custom:<id> step inside another definition", () => {
    const outer: CompositeOperationDefinition = {
      ...baseFields({ id: "outer", name: "Two Bell pairs", label: "2BELL" }),
      kind: "composite",
      numQubits: 4,
      numClbits: 0,
      steps: [
        { gate: customGateRef("bell"), qubits: [0, 1], clbits: [], params: {}, moment: 0 },
        { gate: customGateRef("bell"), qubits: [2, 3], clbits: [], params: {}, moment: 0 },
      ],
    };
    const library = new Map<string, CompositeOperationDefinition>([["bell", bellComposite()], ["outer", outer]]);
    const result = resolveCustomOperations(circuitWith([customOp("outer", [0, 1, 2, 3], 0)], 4), library);
    expect(result.ok).toBe(true);
    expect(result.circuit?.operations).toHaveLength(4);
    expect(result.circuit?.operations.filter((op) => op.gate === "h")).toHaveLength(2);
    expect(result.circuit?.operations.filter((op) => op.gate === "cx")).toHaveLength(2);
  });

  it("keeps top-level operation order relative to a preceding gate on a shared qubit", () => {
    const library = new Map([["bell", bellComposite()]]);
    const circuit = circuitWith([
      { gate: "x", qubits: [1], clbits: [], params: {}, moment: 0 },
      customOp("bell", [1, 2], 1),
    ]);
    const result = resolveCustomOperations(circuit, library);
    expect(result.ok).toBe(true);
    const ops = result.circuit!.operations;
    const xMoment = ops.find((op) => op.gate === "x")!.moment;
    const hMoment = ops.find((op) => op.gate === "h")!.moment;
    expect(xMoment).toBeLessThan(hMoment);
  });
});

describe("resolveCustomOperations: error paths", () => {
  it("fails closed when the referenced definition no longer exists", () => {
    const result = resolveCustomOperations(circuitWith([customOp("missing", [0], 0)]), new Map());
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no longer exists/);
  });

  it("fails closed on a qubit-count mismatch between the instance and its definition", () => {
    const library = new Map([["bell", bellComposite()]]);
    const result = resolveCustomOperations(circuitWith([customOp("bell", [0], 0)]), library);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/expects 2 qubit/);
  });

  it("fails closed when a nested custom:<id> reference is dangling", () => {
    const outer: CompositeOperationDefinition = {
      ...baseFields({ id: "outer", name: "Broken", label: "BRK" }),
      kind: "composite",
      numQubits: 2,
      numClbits: 0,
      steps: [{ gate: customGateRef("ghost"), qubits: [0, 1], clbits: [], params: {}, moment: 0 }],
    };
    const library = new Map<string, CompositeOperationDefinition>([["outer", outer]]);
    const result = resolveCustomOperations(circuitWith([customOp("outer", [0, 1], 0)]), library);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no longer exists/);
  });
});

describe("resolveCustomOperations: scheduling never collides", () => {
  it("never places two operations touching the same qubit at the same moment", () => {
    const library = new Map([["bell", bellComposite()]]);
    const circuit = circuitWith([customOp("bell", [0, 1], 0), customOp("bell", [1, 2], 1)], 3);
    const result = resolveCustomOperations(circuit, library);
    expect(result.ok).toBe(true);
    const seen = new Map<string, number>();
    for (const op of result.circuit!.operations) {
      for (const qubit of op.qubits) {
        const key = `${qubit}:${op.moment}`;
        expect(seen.has(key)).toBe(false);
        seen.set(key, op.moment);
      }
    }
  });
});

describe("collectReferencedDefinitions", () => {
  it("returns only the directly-referenced definition for a simple circuit", () => {
    const bell = bellComposite();
    const library = new Map([["bell", bell]]);
    const found = collectReferencedDefinitions(circuitWith([customOp("bell", [0, 1], 0)]), library);
    expect(found.map((d) => d.id)).toEqual(["bell"]);
  });

  it("transitively includes definitions referenced through nested steps", () => {
    const bell = bellComposite();
    const outer: CompositeOperationDefinition = {
      ...baseFields({ id: "outer", name: "Two Bell pairs", label: "2BELL" }),
      kind: "composite",
      numQubits: 4,
      numClbits: 0,
      steps: [{ gate: customGateRef("bell"), qubits: [0, 1], clbits: [], params: {}, moment: 0 }],
    };
    const library = new Map<string, CompositeOperationDefinition>([["bell", bell], ["outer", outer]]);
    const found = collectReferencedDefinitions(circuitWith([customOp("outer", [0, 1, 2, 3], 0)], 4), library);
    expect(new Set(found.map((d) => d.id))).toEqual(new Set(["outer", "bell"]));
  });

  it("silently skips a dangling id rather than throwing", () => {
    const found = collectReferencedDefinitions(circuitWith([customOp("missing", [0], 0)]), new Map());
    expect(found).toEqual([]);
  });
});
