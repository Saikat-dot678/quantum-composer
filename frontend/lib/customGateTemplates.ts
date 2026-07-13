// Starter templates for the custom gate creation wizard — each is a partial
// definition (no id/timestamps yet; the wizard fills those in on save) meant
// to give a new user a working example to edit rather than a blank form.
import type { ComplexPair, CustomDefinition } from "./customGates";

// A plain Omit<Union, K> collapses to the union's *shared* keys only (keyof
// a union is an intersection of each member's keys) — distributing over each
// member first is what keeps each kind's own fields (matrix / steps /
// parameters) intact after stripping the bookkeeping fields every kind shares.
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type DefinitionTemplate = DistributiveOmit<CustomDefinition, "id" | "createdAt" | "updatedAt" | "favorite">;

const INV_SQRT2 = Math.SQRT1_2;
const ZERO: ComplexPair = [0, 0];
const ONE: ComplexPair = [1, 0];

export const CUSTOM_GATE_TEMPLATES: DefinitionTemplate[] = [
  {
    kind: "matrix",
    name: "Hadamard (matrix example)",
    label: "H'",
    description: "The Hadamard gate, defined directly as a matrix instead of a built-in — a starting point for editing a genuinely new 1-qubit unitary.",
    category: "Examples",
    icon: "circle",
    tags: ["example", "matrix"],
    numQubits: 1,
    matrix: [
      [[INV_SQRT2, 0], [INV_SQRT2, 0]],
      [[INV_SQRT2, 0], [-INV_SQRT2, 0]],
    ],
    unitarityError: 0,
  },
  {
    kind: "matrix",
    name: "Custom phase (matrix example)",
    label: "P8",
    description: "An eighth-turn phase gate (equivalent to T), showing how a diagonal phase matrix is entered.",
    category: "Examples",
    icon: "diamond",
    tags: ["example", "matrix", "phase"],
    numQubits: 1,
    matrix: [
      [ONE, ZERO],
      [ZERO, [INV_SQRT2, INV_SQRT2]],
    ],
    unitarityError: 0,
  },
  {
    kind: "composite",
    name: "Bell pair",
    label: "BELL",
    description: "H on the first qubit, then CX from the first to the second — the standard maximally-entangled 2-qubit state. Stays Clifford-compatible after expansion.",
    category: "Examples",
    icon: "hexagon",
    tags: ["example", "entanglement"],
    numQubits: 2,
    numClbits: 0,
    steps: [
      { gate: "h", qubits: [0], clbits: [], params: {}, moment: 0 },
      { gate: "cx", qubits: [0, 1], clbits: [], params: {}, moment: 1 },
    ],
  },
  {
    kind: "composite",
    name: "GHZ-3",
    label: "GHZ3",
    description: "H on the first qubit, then CX cascading to the other two — a 3-qubit Greenberger-Horne-Zeilinger state. Stays Clifford-compatible after expansion.",
    category: "Examples",
    icon: "triangle",
    tags: ["example", "entanglement"],
    numQubits: 3,
    numClbits: 0,
    steps: [
      { gate: "h", qubits: [0], clbits: [], params: {}, moment: 0 },
      { gate: "cx", qubits: [0, 1], clbits: [], params: {}, moment: 1 },
      { gate: "cx", qubits: [0, 2], clbits: [], params: {}, moment: 2 },
    ],
  },
  {
    kind: "decomposition",
    name: "Parameterized Z rotation block",
    label: "PRZ",
    description: "A single RZ(theta) exposed as a reusable, named parameter — a starting point for building larger parameterized decompositions.",
    category: "Examples",
    icon: "square",
    tags: ["example", "parameterized"],
    numQubits: 1,
    numClbits: 0,
    parameters: [{ name: "theta", label: "theta", default: Math.PI / 2 }],
    steps: [{ gate: "rz", qubits: [0], clbits: [], params: { theta: "param:theta" }, moment: 0 }],
  },
];
