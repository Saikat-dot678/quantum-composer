import type { ComplexPair } from "./customGates";
import type { CircuitDiagramPayload } from "./circuitDiagram";

// "custom" is a placed instance of a user-defined gate/operation (see
// lib/customGates.ts) — `customId` then points at the library definition.
// It is the *only* new gate kind a user ever places or a saved/shared
// CircuitData ever stores; lib/circuitShare.ts's structural validator
// deliberately rejects "unitary" for that reason.
//
// "unitary" is a *resolver-output-only* gate: lib/customGateResolve.ts
// flattens every "custom" instance into plain built-in operations, plus
// "unitary" for matrix-defined gates, right before a backend call or the
// local state preview. It is never placed directly and never round-trips
// through save/share — CircuitOperation carries the fields for it only so a
// ResolvedCircuit (lib/customGateResolve.ts) can be passed anywhere a
// CircuitData is expected without a conversion step.
export type BuiltinGateName = "x" | "y" | "z" | "h" | "s" | "t" | "rx" | "ry" | "rz" | "cx" | "cz" | "swap" | "measure" | "barrier";
export type GateName = BuiltinGateName | "custom" | "unitary";
export interface CircuitOperation {
  gate: GateName;
  qubits: number[];
  clbits: number[];
  params: Record<string, number>;
  moment: number;
  /** Only meaningful when gate === "custom": which lib/customGates.ts definition this instance references. */
  customId?: string;
  /** Only meaningful when gate === "unitary": row-major 2^k x 2^k matrix. Produced only by lib/customGateResolve.ts. */
  matrix?: ComplexPair[][];
  /** Optional display label for a "unitary" operation, used only for generated-code readability. */
  label?: string;
}
export interface CircuitData { num_qubits: number; num_clbits: number; shots: number; operations: CircuitOperation[] }
export interface SimulationResult { counts: Record<string, number>; depth: number; gate_counts: Record<string, number>; diagram: string; circuit_diagram: CircuitDiagramPayload | null; warnings: string[] }
export interface Preset { id: string; name: string; description: string; circuit: CircuitData }
export const TWO_QUBIT_GATES: GateName[] = ["cx", "cz", "swap"];
export const ROTATION_GATES: GateName[] = ["rx", "ry", "rz"];
