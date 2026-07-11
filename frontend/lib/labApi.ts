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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = (payload as { detail?: unknown }).detail;
    const message = Array.isArray(detail)
      ? detail.map((item: { msg?: string }) => item.msg ?? "Invalid request").join("; ")
      : (detail as string) ?? `Backend request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export const labApi = {
  engines: () => request<EnginesResponse>("/engines"),
  analyze: (circuit: CircuitData) => post<CircuitAnalysis>("/circuit/analyze", circuit),
  simulateV2: (circuit: CircuitData, options: SimulationOptions) =>
    post<SimulationV2Response>("/circuit/simulate-v2", { circuit, options }),
  bb84: (body: {
    num_bits: number;
    eve_enabled: boolean;
    channel_error_rate: number;
    seed: number | null;
  }) => post<BB84Result>("/crypto/bb84/simulate", body),
  e91: (body: {
    num_pairs: number;
    eve_enabled: boolean;
    channel_error_rate: number;
    seed: number | null;
  }) => post<E91Result>("/crypto/e91/simulate", body),
  b92: (body: { num_bits: number; channel_error_rate: number; seed: number | null }) =>
    post<B92Result>("/crypto/b92/simulate", body),
  qrng: (body: { num_bits: number; seed: number | null }) =>
    post<QRNGResult>("/crypto/qrng/simulate", body),
};
