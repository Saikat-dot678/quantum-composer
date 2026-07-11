// Teaching presets for the Simulator Lab. These are *data descriptors* (plain
// JSON circuits generated in memory) -- they are never rendered on the visual
// grid, so even a 1000-qubit preset cannot freeze the browser. Their purpose is
// to show, honestly, what scales (Clifford/stabilizer, low-entanglement/MPS) and
// what does not (arbitrary large non-Clifford statevector).
import type { CircuitData, CircuitOperation, GateName } from "./types";
import type { LabPreset } from "./labTypes";

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

export const LAB_PRESETS: LabPreset[] = [
  {
    id: "sv-small",
    name: "Small exact circuit (5q)",
    description: "A tiny arbitrary circuit with H, T, RX, CX, CZ.",
    teaches: "Exact statevector simulation is fine for a handful of qubits.",
    circuit: circuit(5, smallExact(7)),
    suggestedEngine: "auto",
  },
  {
    id: "ghz-100-mps",
    name: "100-qubit GHZ (MPS)",
    description: "A 100-qubit GHZ chain: maximally correlated but low bond dimension.",
    teaches: "GHZ has bond dimension 2, so MPS simulates 100 qubits easily; exact statevector would need ~2e16 PB.",
    circuit: circuit(100, ghzChain(100)),
    suggestedEngine: "aer_mps",
    allowApproximation: true,
  },
  {
    id: "clifford-1000",
    name: "1000-qubit Clifford (stabilizer)",
    description: "A random 1000-qubit Clifford circuit (H, S, CX, CZ).",
    teaches: "Clifford circuits obey Gottesman-Knill: stabilizer simulation scales polynomially to 1000+ qubits.",
    circuit: circuit(1000, randomClifford(1000, 4, 11)),
    suggestedEngine: "auto",
  },
  {
    id: "random-clifford-200",
    name: "Random Clifford (200q)",
    description: "A deeper random Clifford circuit on 200 qubits.",
    teaches: "Even deep Clifford circuits stay tractable via the stabilizer formalism.",
    circuit: circuit(200, randomClifford(200, 10, 23)),
    suggestedEngine: "auto",
  },
  {
    id: "low-ent-chain",
    name: "Low-entanglement chain (48q)",
    description: "Small rotations + shallow nearest-neighbour coupling on 48 qubits.",
    teaches: "Low-entanglement non-Clifford circuits are infeasible for exact statevector but cheap for MPS.",
    circuit: circuit(48, lowEntanglementChain(48)),
    suggestedEngine: "aer_mps",
    allowApproximation: true,
  },
  {
    id: "high-ent-fail",
    name: "High-entanglement random (32q) — why this fails",
    description: "Wide, deep, non-Clifford, highly entangled circuit.",
    teaches: "No exploitable structure: exact needs ~64 GB+, MPS bond dimension explodes. Honestly rejected.",
    circuit: circuit(32, highEntanglementNonClifford(32, 31)),
    suggestedEngine: "auto",
    expectRejection: true,
  },
  {
    id: "arbitrary-100-reject",
    name: "Arbitrary 100-qubit non-Clifford — rejection demo",
    description: "100 qubits with T gates and rotations sprinkled throughout.",
    teaches: "Arbitrary 100-qubit statevector simulation needs ~2e16 PB. This is the myth this project refuses to fake.",
    circuit: circuit(100, arbitraryNonClifford(100, 41)),
    suggestedEngine: "auto",
    expectRejection: true,
  },
];
