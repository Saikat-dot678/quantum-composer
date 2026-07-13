import { describe, expect, it } from "vitest";
import type { CompositeOperationDefinition, MatrixGateDefinition } from "./customGates";
import {
  decodeCompressedCircuitParamDetailed,
  encodeCircuitLinkCompressed,
  validateCircuitBundle,
  validateCircuitData,
} from "./circuitShare";
import type { CircuitData } from "./types";

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

const PLAIN_CIRCUIT: CircuitData = {
  num_qubits: 3,
  num_clbits: 0,
  shots: 512,
  operations: [{ gate: "h", qubits: [0], clbits: [], params: {}, moment: 0 }],
};

function circuitWithCustom(id: string, qubits: number[], numQubits = 2): CircuitData {
  return {
    num_qubits: numQubits,
    num_clbits: 0,
    shots: 1024,
    operations: [{ gate: "custom", customId: id, qubits, clbits: [], params: {}, moment: 0 }],
  };
}

describe("validateCircuitData: custom operations", () => {
  it("accepts a well-formed custom operation with a customId", () => {
    const circuit = validateCircuitData(circuitWithCustom("bell", [0, 1]));
    expect(circuit).not.toBeNull();
    expect(circuit?.operations[0]).toMatchObject({ gate: "custom", customId: "bell", qubits: [0, 1] });
  });

  it("rejects a custom operation missing customId", () => {
    const raw = { num_qubits: 2, num_clbits: 0, shots: 100, operations: [{ gate: "custom", qubits: [0], clbits: [], params: {}, moment: 0 }] };
    expect(validateCircuitData(raw)).toBeNull();
  });

  it("rejects a custom operation with disallowed extra keys", () => {
    const raw = { num_qubits: 2, num_clbits: 0, shots: 100, operations: [{ gate: "custom", customId: "x", qubits: [0], clbits: [], params: {}, moment: 0, extra: 1 }] };
    expect(validateCircuitData(raw)).toBeNull();
  });

  it("rejects a custom operation with a non-finite param", () => {
    const raw = { num_qubits: 2, num_clbits: 0, shots: 100, operations: [{ gate: "custom", customId: "x", qubits: [0], clbits: [], params: { theta: "nan" }, moment: 0 }] };
    expect(validateCircuitData(raw)).toBeNull();
  });

  it("still rejects unknown non-custom gate names", () => {
    const raw = { num_qubits: 2, num_clbits: 0, shots: 100, operations: [{ gate: "not-a-gate", qubits: [0], clbits: [], params: {}, moment: 0 }] };
    expect(validateCircuitData(raw)).toBeNull();
  });
});

describe("validateCircuitBundle", () => {
  it("accepts an empty bundle for a circuit with no custom operations", () => {
    const result = validateCircuitBundle(PLAIN_CIRCUIT, undefined);
    expect(result.ok).toBe(true);
    expect(result.definitions).toEqual([]);
  });

  it("accepts a circuit whose custom operation matches a bundled definition", () => {
    const circuit = circuitWithCustom("bell", [0, 1]);
    const result = validateCircuitBundle(circuit, [bellComposite()]);
    expect(result.ok).toBe(true);
    expect(result.definitions).toHaveLength(1);
  });

  it("rejects when the referenced definition is missing from the bundle", () => {
    const circuit = circuitWithCustom("bell", [0, 1]);
    const result = validateCircuitBundle(circuit, []);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not included in the bundle/);
  });

  it("rejects when the instance's qubit count does not match the definition", () => {
    const circuit = circuitWithCustom("bell", [0]);
    const result = validateCircuitBundle(circuit, [bellComposite()]);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/expects 2 qubit/);
  });

  it("rejects a bundle containing an internally-invalid definition", () => {
    const badMatrix = matrixDef({ id: "bad", matrix: [[[1, 0], [0, 0]], [[0, 0], [1, 1]]] as MatrixGateDefinition["matrix"] });
    const circuit = circuitWithCustom("bad", [0]);
    const result = validateCircuitBundle(circuit, [badMatrix]);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/failed validation/);
  });

  it("rejects a bundle with duplicate ids", () => {
    const result = validateCircuitBundle(PLAIN_CIRCUIT, [matrixDef({ id: "dup" }), matrixDef({ id: "dup" })]);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/duplicate ids/);
  });

  it("rejects a malformed (non-array) bundle", () => {
    const result = validateCircuitBundle(PLAIN_CIRCUIT, { not: "an array" });
    expect(result.ok).toBe(false);
  });
});

describe("encodeCircuitLinkCompressed / decodeCompressedCircuitParamDetailed: backward compatibility", () => {
  it("round-trips a plain circuit with no definitions bundle", async () => {
    const encoded = await encodeCircuitLinkCompressed(PLAIN_CIRCUIT, "https://example.test");
    expect(encoded.ok).toBe(true);
    const payload = new URL(encoded.url!).searchParams.get("c2")!;
    const decoded = await decodeCompressedCircuitParamDetailed(payload);
    expect(decoded.ok).toBe(true);
    expect(decoded.circuit).toEqual(PLAIN_CIRCUIT);
    expect(decoded.definitions ?? []).toEqual([]);
  });
});

describe("encodeCircuitLinkCompressed / decodeCompressedCircuitParamDetailed: custom gate bundling", () => {
  it("round-trips a circuit that places a custom gate, embedding its definition", async () => {
    const circuit = circuitWithCustom("bell", [0, 1]);
    const encoded = await encodeCircuitLinkCompressed(circuit, "https://example.test", [bellComposite()]);
    expect(encoded.ok).toBe(true);
    const payload = new URL(encoded.url!).searchParams.get("c2")!;
    const decoded = await decodeCompressedCircuitParamDetailed(payload);
    expect(decoded.ok).toBe(true);
    expect(decoded.circuit?.operations[0]).toMatchObject({ gate: "custom", customId: "bell" });
    expect(decoded.definitions).toHaveLength(1);
    expect(decoded.definitions?.[0].id).toBe("bell");
    expect(decoded.definitions?.[0].kind).toBe("composite");
  });

  it("refuses to encode a circuit whose custom gate definition was not supplied", async () => {
    const circuit = circuitWithCustom("bell", [0, 1]);
    const encoded = await encodeCircuitLinkCompressed(circuit, "https://example.test", []);
    expect(encoded.ok).toBe(false);
    expect(encoded.reason).toMatch(/not included in the bundle/);
  });

  it("rejects a decoded payload whose custom operation has no matching definition (tampered/incomplete link)", async () => {
    // Build a v3 payload directly (bypassing the encoder's own pre-check) to
    // simulate a corrupted or hand-crafted link, then confirm decode fails closed.
    const { deflateRawSync } = await import("node:zlib");
    const tampered = {
      v: 3,
      nq: 2,
      nc: 0,
      s: 1024,
      o: [{ g: "custom", m: 0, qb: [0, 1], cb: [], p: {}, cid: "ghost" }],
      d: [],
    };
    const compressed = deflateRawSync(Buffer.from(JSON.stringify(tampered), "utf-8"));
    const payload = compressed.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const decoded = await decodeCompressedCircuitParamDetailed(payload);
    expect(decoded.ok).toBe(false);
    expect(decoded.reason).toMatch(/not included in the bundle/);
  });
});
