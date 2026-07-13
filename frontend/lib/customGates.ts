// Declarative custom gate / composite operation model. Everything here is
// plain JSON — no function bodies, no eval, no code strings that get
// executed anywhere in this app. A definition is one of:
//
//  - "matrix": a literal unitary matrix (1-3 qubits — the matrix is 2^n x 2^n,
//    so this is capped low deliberately). Resolved for the backend as a
//    single Qiskit UnitaryGate; simulatable directly.
//  - "decomposition": a fixed sequence of *other* gates (built-in or other
//    custom definitions, recursively, cycle-checked). Resolved by flattening
//    into plain built-in operations — the backend never needs to know
//    decomposition-defined gates exist at all.
//  - "composite": the same idea as "decomposition", but captured from a
//    selection of already-placed circuit operations rather than authored
//    from scratch (a "macro" — Bell pair, GHZ, teleportation block, etc).
//
// A placed instance on the canvas is a normal CircuitOperation with
// gate: "custom" and customId pointing at one of these by id (see
// lib/types.ts). Expand/collapse on the canvas is a *view* toggle only —
// it never rewrites the stored operation, so the macro's logical identity
// survives every view change (see lib/customGateResolve.ts for how an
// instance is expanded before ever reaching the backend).

export type ComplexPair = [re: number, im: number];

export const CUSTOM_GATE_ICONS = ["circle", "square", "diamond", "hexagon", "triangle", "star"] as const;
export type CustomGateIcon = (typeof CUSTOM_GATE_ICONS)[number];

export const MAX_MATRIX_QUBITS = 3;
export const MAX_DECOMPOSITION_QUBITS = 12;
export const MAX_DECOMPOSITION_STEPS = 64;
export const MAX_DECOMPOSITION_DEPTH = 8;
/** Ceiling on the fully-flattened operation count after recursively expanding nested custom gates. */
export const MAX_EXPANDED_OPERATIONS = 4_000;
export const MAX_PARAMETERS = 8;
export const MAX_CUSTOM_DEFINITIONS = 200;
export const MAX_NAME_LENGTH = 60;
export const MAX_LABEL_LENGTH = 8;
export const MAX_DESCRIPTION_LENGTH = 400;
/** Looser than strict mathematical equality — floating-point matrix entries never compare exactly. */
export const DEFAULT_UNITARITY_TOLERANCE = 1e-6;

export interface CustomParameterSpec {
  name: string;
  label: string;
  default: number;
  min?: number;
  max?: number;
}

export interface DecompositionStep {
  /** A built-in GateName, or `custom:<id>` referencing another definition (recursion is validated, see customGateValidation.ts). */
  gate: string;
  /** Qubit indices *local* to this definition, 0..numQubits-1. */
  qubits: number[];
  clbits: number[];
  /** Either a literal number or `param:<name>` referencing one of this definition's own parameters. */
  params: Record<string, number | `param:${string}`>;
  moment: number;
}

interface DefinitionBase {
  id: string;
  name: string;
  /** Short glyph shown on the canvas cell, e.g. "U1", "BELL". */
  label: string;
  description: string;
  category: string;
  icon: CustomGateIcon;
  tags: string[];
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MatrixGateDefinition extends DefinitionBase {
  kind: "matrix";
  numQubits: 1 | 2 | 3;
  /** Row-major, size 2^numQubits square, each entry a [re, im] pair. */
  matrix: ComplexPair[][];
  /** Max |U*U_dagger - I| observed at save time, kept for display ("validated to 3.2e-9"). */
  unitarityError: number;
}

export interface DecompositionGateDefinition extends DefinitionBase {
  kind: "decomposition";
  numQubits: number;
  numClbits: number;
  parameters: CustomParameterSpec[];
  steps: DecompositionStep[];
}

export interface CompositeOperationDefinition extends DefinitionBase {
  kind: "composite";
  numQubits: number;
  numClbits: number;
  steps: DecompositionStep[];
}

export type CustomDefinition = MatrixGateDefinition | DecompositionGateDefinition | CompositeOperationDefinition;

export function definitionNumQubits(def: CustomDefinition): number {
  return def.numQubits;
}

export function definitionNumClbits(def: CustomDefinition): number {
  return def.kind === "matrix" ? 0 : def.numClbits;
}

export function isMatrixDefinition(def: CustomDefinition): def is MatrixGateDefinition {
  return def.kind === "matrix";
}

export function isExpandable(def: CustomDefinition): def is DecompositionGateDefinition | CompositeOperationDefinition {
  return def.kind === "decomposition" || def.kind === "composite";
}

/** `custom:<id>` <-> id helpers, used wherever a DecompositionStep.gate references another definition. */
export const CUSTOM_GATE_PREFIX = "custom:";
export function customGateRef(id: string): string {
  return `${CUSTOM_GATE_PREFIX}${id}`;
}
export function parseCustomGateRef(gate: string): string | null {
  return gate.startsWith(CUSTOM_GATE_PREFIX) ? gate.slice(CUSTOM_GATE_PREFIX.length) : null;
}
