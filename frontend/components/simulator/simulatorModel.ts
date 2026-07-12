import type { CircuitAnalysis, EngineId, EnginesResponse, ResourceRisk } from "@/lib/labTypes";

export type OptionalNumber = number | "";

export type SimulatorNotice = {
  kind: "info" | "error" | "success";
  text: string;
};

export interface SimulatorPreferences {
  engine: EngineId;
  shots: number;
  seed: OptionalNumber;
  noiseEnabled: boolean;
  allowApproximation: boolean;
  maxMemoryMb: number;
  mpsBondDimension: OptionalNumber;
  mpsTruncationThreshold: OptionalNumber;
}

export const SIMULATOR_PREFERENCES_KEY = "quantum-composer.simulator.preferences.v1";

export const ENGINE_ORDER: EngineId[] = [
  "auto",
  "aer_statevector",
  "aer_mps",
  "aer_stabilizer",
  "aer_density_matrix",
  "stim_stabilizer",
];

const ENGINE_IDS = new Set<string>(ENGINE_ORDER);

export function isEngineId(value: unknown): value is EngineId {
  return typeof value === "string" && ENGINE_IDS.has(value);
}

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

export function resourceRiskForBudget(log2Bytes: number, budgetMb: number): ResourceRisk {
  const budgetLog2Bytes = Math.log2(Math.max(1, budgetMb)) + 20;
  const difference = log2Bytes - budgetLog2Bytes;
  if (difference <= -2) return "safe";
  if (difference <= 0) return "heavy";
  if (difference <= 3) return "dangerous";
  return "infeasible";
}

/** Prefer Stim for Clifford work when it is installed, otherwise use Aer. */
export function preferredStabilizerEngine(engines: EnginesResponse | null): EngineId {
  return engines?.engines.find((entry) => entry.id === "stim_stabilizer")?.available
    ? "stim_stabilizer"
    : "aer_stabilizer";
}

/** Auto can still run a Clifford circuit through Stim when Aer is absent. */
export function engineIsAvailable(
  engine: EngineId,
  engines: EnginesResponse | null,
  analysis: CircuitAnalysis | null,
): boolean | null {
  if (!engines) return null;
  const catalogEntry = engines.engines.find((entry) => entry.id === engine);
  if (catalogEntry?.available !== false) return catalogEntry?.available ?? false;
  if (engine === "auto" && analysis?.is_clifford && engines.stim_available) return true;
  return false;
}

function optionalNumber(value: unknown, minimum: number, maximum: number): OptionalNumber | null {
  if (value === "") return "";
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(maximum, Math.max(minimum, value));
}

/** Parse persisted preferences defensively; malformed storage never reaches controls. */
export function parseSimulatorPreferences(value: unknown): Partial<SimulatorPreferences> {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const parsed: Partial<SimulatorPreferences> = {};
  if (isEngineId(source.engine)) parsed.engine = source.engine;
  if (typeof source.shots === "number") parsed.shots = clampInteger(source.shots, 1, 1_000_000, 1024);
  const seed = optionalNumber(source.seed, 0, Number.MAX_SAFE_INTEGER);
  if (seed !== null) parsed.seed = seed === "" ? "" : Math.round(seed);
  if (typeof source.noiseEnabled === "boolean") parsed.noiseEnabled = source.noiseEnabled;
  if (typeof source.allowApproximation === "boolean") parsed.allowApproximation = source.allowApproximation;
  if (typeof source.maxMemoryMb === "number") parsed.maxMemoryMb = clampInteger(source.maxMemoryMb, 16, 65_536, 1024);
  const bond = optionalNumber(source.mpsBondDimension, 1, 100_000);
  if (bond !== null) parsed.mpsBondDimension = bond === "" ? "" : Math.round(bond);
  const threshold = optionalNumber(source.mpsTruncationThreshold, Number.EPSILON, 1);
  if (threshold !== null) parsed.mpsTruncationThreshold = threshold;
  return parsed;
}
