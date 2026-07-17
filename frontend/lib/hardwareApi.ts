import { apiRequest } from "./apiClient";
import { canonicalizeCircuit } from "./circuitOrdering";
import type {
  BackendDetail,
  BackendListResponse,
  CompareResponse,
  ConnectionStatus,
  HardwareCircuitSource,
  HardwareTargetSource,
  ImportCircuitResponse,
  TranspileOptions,
  TranspileResponse,
} from "./hardwareTypes";

const post = <T>(path: string, body: unknown, timeoutMs = 30_000) =>
  apiRequest<T>(path, { method: "POST", body: JSON.stringify(body) }, timeoutMs);

const canonicalSource = (source: HardwareCircuitSource): HardwareCircuitSource =>
  source.kind === "json" ? { ...source, circuit: canonicalizeCircuit(source.circuit) } : source;

export const hardwareApi = {
  status: () => apiRequest<ConnectionStatus>("/hardware/status", {}, 8_000),
  backends: (query = "source=all") => apiRequest<BackendListResponse>(`/hardware/backends?${query}`, {}, 30_000),
  describe: (target: HardwareTargetSource) => post<BackendDetail>("/hardware/target/describe", { target }),
  importCircuit: (source: HardwareCircuitSource) => post<ImportCircuitResponse>("/hardware/circuit/import", { source: canonicalSource(source) }),
  transpile: (circuit: HardwareCircuitSource, target: HardwareTargetSource, options: TranspileOptions) =>
    post<TranspileResponse>("/hardware/transpile", { circuit: canonicalSource(circuit), target, options }, 60_000),
  compare: (circuit: HardwareCircuitSource, targets: HardwareTargetSource[], options: TranspileOptions) =>
    post<CompareResponse>("/hardware/compare", { circuit: canonicalSource(circuit), targets, options }, 90_000),
  connect: (token: string, instance: string | null, channel: "ibm_quantum_platform" | "ibm_cloud") =>
    post<ConnectionStatus>("/hardware/connect", { token, instance, channel }, 30_000),
  disconnect: () => post<ConnectionStatus>("/hardware/disconnect", {}),
};
