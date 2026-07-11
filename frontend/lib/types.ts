export type GateName = "x" | "y" | "z" | "h" | "s" | "t" | "rx" | "ry" | "rz" | "cx" | "cz" | "swap" | "measure" | "barrier";
export interface CircuitOperation { gate: GateName; qubits: number[]; clbits: number[]; params: Record<string, number>; moment: number }
export interface CircuitData { num_qubits: number; num_clbits: number; shots: number; operations: CircuitOperation[] }
export interface SimulationResult { counts: Record<string, number>; depth: number; gate_counts: Record<string, number>; diagram: string; warnings: string[] }
export interface Preset { id: string; name: string; description: string; circuit: CircuitData }
export const TWO_QUBIT_GATES: GateName[] = ["cx", "cz", "swap"];
export const ROTATION_GATES: GateName[] = ["rx", "ry", "rz"];
