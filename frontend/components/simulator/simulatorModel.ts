import type { EngineId } from "@/lib/labTypes";

export type OptionalNumber = number | "";

export type SimulatorNotice = {
  kind: "info" | "error" | "success";
  text: string;
};

export const ENGINE_ORDER: EngineId[] = [
  "auto",
  "aer_statevector",
  "aer_mps",
  "aer_stabilizer",
  "aer_density_matrix",
  "stim_stabilizer",
];

export function clampInteger(value: number, minimum: number, maximum: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

export function clampFloat(value: number, minimum: number, maximum: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function engineSupportsNoise(engine: EngineId): boolean {
  return engine === "auto" || engine === "aer_density_matrix";
}

export function engineUsesMpsControls(engine: EngineId, allowApproximation: boolean): boolean {
  return engine === "aer_mps" || (engine === "auto" && allowApproximation);
}
