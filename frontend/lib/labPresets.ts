// Teaching presets for the Simulator Lab. These are *data descriptors* (plain
// JSON circuits generated in memory) -- they are never rendered on the visual
// grid, so even a 1000-qubit preset cannot freeze the browser. Their purpose is
// to show, honestly, what scales (Clifford/stabilizer, low-entanglement/MPS) and
// what does not (arbitrary large non-Clifford statevector).
import type { CircuitData, CircuitOperation, GateName } from "./types";
import type { LabPreset, LargeCircuitFamily } from "./labTypes";

const op = (
  gate: GateName,
  qubits: number[],
  moment: number,
  params: Record<string, number> = {},
): CircuitOperation => ({ gate, qubits, clbits: [], params, moment });

// Deterministic PRNG (mulberry32) so presets are reproducible.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ghzChain(n: number): CircuitOperation[] {
  const ops: CircuitOperation[] = [op("h", [0], 0)];
  for (let i = 0; i < n - 1; i++) ops.push(op("cx", [i, i + 1], i + 1));
  return ops;
}

// Random Clifford: layers of single-qubit Clifford gates + nearest-neighbour CX.
function randomClifford(n: number, depth: number, seed: number): CircuitOperation[] {
  const rand = mulberry32(seed);
  const single: GateName[] = ["h", "s", "x", "z"];
  const ops: CircuitOperation[] = [];
  let moment = 0;
  for (let layer = 0; layer < depth; layer++) {
    for (let q = 0; q < n; q++) ops.push(op(single[Math.floor(rand() * single.length)], [q], moment));
    moment++;
    const offset = layer % 2;
    for (let q = offset; q + 1 < n; q += 2) {
      if (rand() < 0.7) ops.push(op(rand() < 0.5 ? "cx" : "cz", [q, q + 1], moment));
    }
    moment++;
  }
  return ops;
}

// Low-entanglement chain: small non-Clifford rotations + shallow nearest-neighbour
// coupling. Great for MPS (bond dimension stays small) but infeasible for exact
// statevector at this width.
function lowEntanglementChain(n: number): CircuitOperation[] {
  const ops: CircuitOperation[] = [];
  for (let q = 0; q < n; q++) ops.push(op("ry", [q], 0, { theta: 0.1 }));
  for (let q = 0; q + 1 < n; q += 2) ops.push(op("cx", [q, q + 1], 1));
  for (let q = 1; q + 1 < n; q += 2) ops.push(op("cx", [q, q + 1], 2));
  return ops;
}

// High-entanglement, non-Clifford, wide: deliberately infeasible for exact
// simulation *and* bad for MPS -- the "why this fails" demo.
function highEntanglementNonClifford(n: number, seed: number): CircuitOperation[] {
  const rand = mulberry32(seed);
  const ops: CircuitOperation[] = [];
  let moment = 0;
  for (let q = 0; q < n; q++) ops.push(op("h", [q], moment));
  moment++;
  for (let layer = 0; layer < 6; layer++) {
    for (let q = 0; q < n; q++) ops.push(op("t", [q], moment, {}));
    moment++;
    const offset = layer % 2;
    for (let q = offset; q + 1 < n; q += 2) ops.push(op("cx", [q, q + 1], moment));
    // long-range coupling to force entanglement growth
    for (let q = 0; q + n / 2 < n; q++) if (rand() < 0.3) ops.push(op("cz", [q, q + Math.floor(n / 2)], moment));
    moment++;
  }
  return ops;
}

// Arbitrary wide non-Clifford: sprinkle T gates across many qubits so the circuit
// is neither Clifford nor obviously low-entanglement -> rejected with explanation.
function arbitraryNonClifford(n: number, seed: number): CircuitOperation[] {
  const rand = mulberry32(seed);
  const ops: CircuitOperation[] = [];
  for (let q = 0; q < n; q++) ops.push(op("h", [q], 0));
  for (let q = 0; q < n; q++) ops.push(op("t", [q], 1));
  for (let q = 0; q + 1 < n; q++) if (rand() < 0.5) ops.push(op("cx", [q, q + 1], 2 + (q % 3)));
  for (let q = 0; q < n; q++) if (rand() < 0.4) ops.push(op("rz", [q], 8, { theta: 0.37 }));
  return ops;
}

function smallExact(seed: number): CircuitOperation[] {
  const rand = mulberry32(seed);
  const ops: CircuitOperation[] = [];
  for (let q = 0; q < 5; q++) ops.push(op("h", [q], 0));
  ops.push(op("t", [2], 1));
  ops.push(op("cx", [0, 1], 2));
  ops.push(op("rx", [3], 3, { theta: 0.9 }));
  ops.push(op("cz", [2, 4], 4));
  if (rand() < 1) ops.push(op("ry", [1], 5, { theta: 0.5 }));
  return ops;
}

const circuit = (num_qubits: number, operations: CircuitOperation[], shots = 256): CircuitData => ({
  num_qubits,
  num_clbits: 0,
  shots,
  operations,
});

// Lazily generate and cache each preset circuit: nothing is materialized at
// module load, and re-selecting a preset reuses the first build.
function cached(build: () => CircuitData): () => CircuitData {
  let value: CircuitData | null = null;
  return () => {
    if (!value) value = build();
    return value;
  };
}

interface PresetSpec {
  id: string;
  name: string;
  description: string;
  teaches: string;
  family: LargeCircuitFamily;
  numQubits: number;
  depth?: number;
  operationsEstimate: number;
  suggestedEngine: LabPreset["suggestedEngine"];
  allowApproximation?: boolean;
  expectRejection?: boolean;
  generate: () => CircuitData;
}

function makePreset(spec: PresetSpec): LabPreset {
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    teaches: spec.teaches,
    descriptor: {
      id: spec.id,
      name: spec.name,
      family: spec.family,
      numQubits: spec.numQubits,
      depth: spec.depth,
      operationsEstimate: spec.operationsEstimate,
      recommendedEngine: spec.suggestedEngine,
      explanation: spec.teaches,
    },
    build: cached(spec.generate),
    suggestedEngine: spec.suggestedEngine,
    allowApproximation: spec.allowApproximation,
    expectRejection: spec.expectRejection,
  };
}

export const LAB_PRESETS: LabPreset[] = [
  makePreset({
    id: "sv-small",
    name: "Small exact circuit (5q)",
    description: "A tiny arbitrary circuit with H, T, RX, CX, CZ.",
    teaches: "Exact statevector simulation is fine for a handful of qubits.",
    family: "small_universal",
    numQubits: 5,
    depth: 6,
    operationsEstimate: 10,
    suggestedEngine: "auto",
    generate: () => circuit(5, smallExact(7)),
  }),
  makePreset({
    id: "ghz-100-mps",
    name: "100-qubit GHZ (MPS)",
    description: "A 100-qubit GHZ chain: maximally correlated but low bond dimension.",
    teaches: "GHZ has bond dimension 2, so MPS simulates 100 qubits easily; exact statevector would need ~2e16 PiB.",
    family: "ghz",
    numQubits: 100,
    depth: 100,
    operationsEstimate: 100,
    suggestedEngine: "aer_mps",
    allowApproximation: true,
    generate: () => circuit(100, ghzChain(100)),
  }),
  makePreset({
    id: "clifford-1000",
    name: "1000-qubit Clifford (stabilizer)",
    description: "A random 1000-qubit Clifford circuit (H, S, CX, CZ).",
    teaches: "Clifford circuits obey Gottesman-Knill: stabilizer simulation scales polynomially to 1000+ qubits.",
    family: "clifford_random",
    numQubits: 1000,
    depth: 8,
    operationsEstimate: 5400,
    suggestedEngine: "auto",
    generate: () => circuit(1000, randomClifford(1000, 4, 11)),
  }),
  makePreset({
    id: "random-clifford-200",
    name: "Random Clifford (200q)",
    description: "A deeper random Clifford circuit on 200 qubits.",
    teaches: "Even deep Clifford circuits stay tractable via the stabilizer formalism.",
    family: "clifford_random",
    numQubits: 200,
    depth: 20,
    operationsEstimate: 2700,
    suggestedEngine: "auto",
    generate: () => circuit(200, randomClifford(200, 10, 23)),
  }),
  makePreset({
    id: "low-ent-chain",
    name: "Low-entanglement chain (48q)",
    description: "Small rotations + shallow nearest-neighbour coupling on 48 qubits.",
    teaches: "Low-entanglement non-Clifford circuits are infeasible for exact statevector but cheap for MPS.",
    family: "low_entanglement_chain",
    numQubits: 48,
    depth: 3,
    operationsEstimate: 95,
    suggestedEngine: "aer_mps",
    allowApproximation: true,
    generate: () => circuit(48, lowEntanglementChain(48)),
  }),
  makePreset({
    id: "high-ent-fail",
    name: "High-entanglement random (32q) — why this fails",
    description: "Wide, deep, non-Clifford, highly entangled circuit.",
    teaches: "No exploitable structure: exact needs ~64 GiB+, MPS bond dimension explodes. Honestly rejected.",
    family: "high_entanglement_rejection_demo",
    numQubits: 32,
    depth: 13,
    operationsEstimate: 560,
    suggestedEngine: "auto",
    expectRejection: true,
    generate: () => circuit(32, highEntanglementNonClifford(32, 31)),
  }),
  makePreset({
    id: "arbitrary-100-reject",
    name: "Arbitrary 100-qubit non-Clifford — rejection demo",
    description: "100 qubits with T gates and rotations sprinkled throughout.",
    teaches: "Arbitrary 100-qubit statevector simulation needs ~2e16 PiB. This is the myth this project refuses to fake.",
    family: "non_clifford_rejection_demo",
    numQubits: 100,
    depth: 9,
    operationsEstimate: 290,
    suggestedEngine: "auto",
    expectRejection: true,
    generate: () => circuit(100, arbitraryNonClifford(100, 41)),
  }),
];
