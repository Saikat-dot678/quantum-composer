// API client for the Simulator Lab and Cryptography Lab endpoints.
import type { CircuitData } from "./types";
import type {
  BB84Result,
  B92Result,
  CircuitAnalysis,
  E91Result,
  EnginesResponse,
  QRNGResult,
  SimulationOptions,
  SimulationV2Response,
} from "./labTypes";
import { apiPost, apiRequest, type HealthResponse } from "./apiClient";
import { canonicalizeCircuit } from "./circuitOrdering";

export const labApi = {
  health: () => apiRequest<HealthResponse>("/health", {}, 3500),
  engines: () => apiRequest<EnginesResponse>("/engines", {}, 8000),
  analyze: (circuit: CircuitData) => apiPost<CircuitAnalysis>("/circuit/analyze", canonicalizeCircuit(circuit)),
  simulateV2: (circuit: CircuitData, options: SimulationOptions) =>
    apiPost<SimulationV2Response>("/circuit/simulate-v2", { circuit: canonicalizeCircuit(circuit), options }),
  bb84: (body: {
    num_bits: number;
    eve_enabled: boolean;
    channel_error_rate: number;
    seed: number | null;
  }) => apiPost<BB84Result>("/crypto/bb84/simulate", body),
  e91: (body: {
    num_pairs: number;
    eve_enabled: boolean;
    channel_error_rate: number;
    seed: number | null;
  }) => apiPost<E91Result>("/crypto/e91/simulate", body),
  b92: (body: { num_bits: number; channel_error_rate: number; seed: number | null }) =>
    apiPost<B92Result>("/crypto/b92/simulate", body),
  qrng: (body: { num_bits: number; seed: number | null }) =>
    apiPost<QRNGResult>("/crypto/qrng/simulate", body),
};
