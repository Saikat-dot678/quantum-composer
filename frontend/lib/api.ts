import type { CircuitData, SimulationResult } from "./types";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
async function post<T>(path: string, circuit: CircuitData): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(circuit) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { const detail = payload.detail; const message = Array.isArray(detail) ? detail.map((item: { msg?: string }) => item.msg ?? "Invalid circuit").join("; ") : detail ?? `Backend request failed (${response.status})`; throw new Error(message); }
  return payload as T;
}
export const circuitApi = {
  validate: (circuit: CircuitData) => post<{ valid: boolean; message: string }>("/circuit/validate", circuit),
  code: (circuit: CircuitData) => post<{ code: string }>("/circuit/qiskit-code", circuit),
  qasm: (circuit: CircuitData) => post<{ qasm: string }>("/circuit/qasm", circuit),
  simulate: (circuit: CircuitData) => post<SimulationResult>("/circuit/simulate", circuit),
};
