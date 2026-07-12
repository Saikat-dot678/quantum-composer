import type { CircuitData, SimulationResult } from "./types";
import { apiPost } from "./apiClient";

export const circuitApi = {
  validate: (circuit: CircuitData) =>
    apiPost<{ valid: boolean; message: string; operation_count: number }>("/circuit/validate", circuit),
  code: (circuit: CircuitData) => apiPost<{ code: string }>("/circuit/qiskit-code", circuit),
  qasm: (circuit: CircuitData) => apiPost<{ qasm: string }>("/circuit/qasm", circuit),
  simulate: (circuit: CircuitData) => apiPost<SimulationResult>("/circuit/simulate", circuit),
};
