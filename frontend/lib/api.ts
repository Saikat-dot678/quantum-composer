import type { CircuitData, SimulationResult } from "./types";
import { apiPost } from "./apiClient";
import { canonicalizeCircuit } from "./circuitOrdering";

export const circuitApi = {
  validate: (circuit: CircuitData) =>
    apiPost<{ valid: boolean; message: string; operation_count: number }>("/circuit/validate", canonicalizeCircuit(circuit)),
  code: (circuit: CircuitData) => apiPost<{ code: string }>("/circuit/qiskit-code", canonicalizeCircuit(circuit)),
  qasm: (circuit: CircuitData) => apiPost<{ qasm: string }>("/circuit/qasm", canonicalizeCircuit(circuit)),
  simulate: (circuit: CircuitData) => apiPost<SimulationResult>("/circuit/simulate", canonicalizeCircuit(circuit)),
};
