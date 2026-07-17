// Pure, presentation-only helpers for backend-derived quantum state analysis
// (lib/labTypes.ts's StateAnalysisResponse). No math lives here beyond
// formatting -- the actual quantum-mechanical calculations (Bloch vectors,
// purity, entropy, concurrence, Schmidt decomposition) are computed once,
// server-side, in backend/analysis/state_postprocessing.py, and arrive
// already-computed. Keeping it this way means the frontend and backend can
// never silently disagree about a physics result -- only about how it's
// displayed.
import type { AmplitudeEntry, BlochVectorXYZ, ComplexNumber, StateAnalysisResponse, StateSemanticPoint } from "./labTypes";

export function formatComplex(value: ComplexNumber, digits = 4): string {
  const re = Number(value.re.toFixed(digits));
  const im = Number(value.im.toFixed(digits));
  if (im === 0) return `${re}`;
  if (re === 0) return `${im}i`;
  return `${re}${im >= 0 ? "+" : "-"}${Math.abs(im)}i`;
}

export function formatProbabilityPercent(probability: number, digits = 2): string {
  return `${(probability * 100).toFixed(digits)}%`;
}

export function formatPhaseDegrees(degrees: number, digits = 1): string {
  return `${degrees.toFixed(digits)}°`;
}

export function formatPhaseRadians(radians: number, digits = 3): string {
  return `${radians.toFixed(digits)} rad`;
}

/** Hue for a phase wheel: 0 rad -> red, wrapping through the color circle -- an intentionally *redundant* channel, never the only way phase is communicated (paired tabular values everywhere this is used). */
export function phaseToHslColor(radians: number, saturation = 75, lightness = 55): string {
  const normalized = ((radians % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const hue = (normalized / (2 * Math.PI)) * 360;
  return `hsl(${hue.toFixed(1)}, ${saturation}%, ${lightness}%)`;
}

const SEMANTIC_POINT_LABEL: Record<StateSemanticPoint, string> = {
  final_state: "Final state",
  pre_measurement_state: "Pre-measurement state",
  mixed_final_state: "Final state (mixed)",
};

export function semanticPointLabel(point: StateSemanticPoint | null): string {
  return point ? SEMANTIC_POINT_LABEL[point] : "Unknown";
}

const REPRESENTATION_LABEL: Record<string, string> = {
  statevector: "Statevector (exact, pure)",
  density_matrix: "Density matrix (exact, mixed-capable)",
  stabilizer_summary: "Stabilizer generator summary",
};

export function representationLabel(representation: string | null): string {
  return representation ? (REPRESENTATION_LABEL[representation] ?? representation) : "Unavailable";
}

const QUBIT_ORDER_LABEL: Record<string, string> = {
  qiskit_little_endian_q0_lsb: "Qiskit little-endian (qubit 0 is the least significant bit / rightmost character)",
};

export function qubitOrderLabel(qubitOrder: string): string {
  return QUBIT_ORDER_LABEL[qubitOrder] ?? qubitOrder;
}

/** A short Dirac-notation string for the largest-probability terms, e.g. "0.7071|00⟩ + 0.7071|11⟩" -- for small, sparse states only; callers decide how many terms to pass in. */
export function diracNotation(entries: AmplitudeEntry[], maxTerms = 6): string {
  const shown = entries.filter((entry) => entry.amplitude !== null).slice(0, maxTerms);
  if (shown.length === 0) return "";
  const terms = shown.map((entry) => {
    const amp = entry.amplitude!;
    const magnitude = Math.sqrt(entry.probability);
    const nearReal = Math.abs(amp.im) < 1e-6;
    const isNegativeReal = nearReal && amp.re < 0;
    const coefficient = nearReal
      ? magnitude.toFixed(4)
      : `${magnitude.toFixed(4)}·e^{i${(entry.phase_radians ?? 0).toFixed(2)}}`;
    return `${isNegativeReal ? "-" : ""}${coefficient}|${entry.basis}⟩`;
  });
  const suffix = entries.length > shown.length ? ` + …(${entries.length - shown.length} more)` : "";
  return terms.join(" + ") + suffix;
}

export function isApproximate(state: StateAnalysisResponse): boolean {
  if (typeof state.global_metrics?.exact === "boolean") return !state.global_metrics.exact;
  return state.warnings.some((warning) => /approximat/i.test(warning));
}

export function complexMagnitude(value: ComplexNumber): number {
  return Math.hypot(value.re, value.im);
}

/** Density-matrix magnitude heatmap cell color: 0 -> near-white, 1 -> darkest teal. Values outside [0,1] are clamped -- a magnitude can float slightly past 1 only from floating-point noise, never a real value. */
export function magnitudeToHeatmapColor(magnitude: number): string {
  const clamped = Math.max(0, Math.min(1, magnitude));
  return `hsl(190, 70%, ${92 - clamped * 55}%)`;
}

/** Signed heatmap cell color for real/imaginary parts: negative -> amber, positive -> teal, 0 -> near-white. `value` is expected in [-1, 1] (density-matrix entries are); clamped defensively. */
export function signedToHeatmapColor(value: number): string {
  const clamped = Math.max(-1, Math.min(1, value));
  const intensity = Math.abs(clamped);
  return clamped >= 0
    ? `hsl(190, 70%, ${92 - intensity * 55}%)`
    : `hsl(35, 80%, ${92 - intensity * 47}%)`;
}

/**
 * Nearest canonical single-qubit state within tolerance, from a reduced
 * state's Bloch vector -- a display label only, never used in any
 * calculation. Returns null when no canonical state is close enough (so the
 * UI shows nothing rather than a wrong name). "Maximally mixed" needs the
 * vector near the origin.
 */
export function recognizedStateLabel(bloch: BlochVectorXYZ, tolerance = 0.02): string | null {
  const named: Array<{ label: string; x: number; y: number; z: number }> = [
    { label: "|0⟩", x: 0, y: 0, z: 1 },
    { label: "|1⟩", x: 0, y: 0, z: -1 },
    { label: "|+⟩", x: 1, y: 0, z: 0 },
    { label: "|−⟩", x: -1, y: 0, z: 0 },
    { label: "|+i⟩", x: 0, y: 1, z: 0 },
    { label: "|−i⟩", x: 0, y: -1, z: 0 },
    { label: "maximally mixed", x: 0, y: 0, z: 0 },
  ];
  for (const state of named) {
    const distance = Math.hypot(bloch.x - state.x, bloch.y - state.y, bloch.z - state.z);
    if (distance <= tolerance) return state.label;
  }
  return null;
}

export function complexPhaseRadians(value: ComplexNumber): number {
  return Math.atan2(value.im, value.re);
}

/**
 * The single per-basis-state list a view should display, in priority order:
 * the richest list the request actually returned. `amplitudes` (detail
 * "top_amplitudes"/"full") is the most complete; `top_states` (always
 * present when any per-basis data exists) is a probability-ranked summary;
 * `basis_probabilities` is the probability-only fallback for representations
 * with no well-defined per-basis amplitude (e.g. a stabilizer's deterministic
 * outcomes). Centralized here so every view agrees on which list "the" table
 * is, rather than three components independently guessing a fallback order.
 */
export function displayEntries(state: StateAnalysisResponse): AmplitudeEntry[] | null {
  return state.amplitudes ?? state.top_states ?? state.basis_probabilities ?? null;
}

// --- Export -----------------------------------------------------------------

export interface StateExportMeta {
  schemaVersion: 1;
  exportedAt: string;
}

export function stateAnalysisToJson(state: StateAnalysisResponse): string {
  const payload: StateExportMeta & { state: StateAnalysisResponse } = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    state,
  };
  return JSON.stringify(payload, null, 2);
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV of the amplitude/probability table (whichever of amplitudes/top_states/basis_probabilities is populated). Returns null when there is no per-basis-state table to export (e.g. a stabilizer summary). */
export function stateAnalysisToCsv(state: StateAnalysisResponse): string | null {
  const rows = state.amplitudes ?? state.top_states ?? state.basis_probabilities;
  if (!rows || rows.length === 0) return null;
  const header = ["index", "basis", "probability", "amplitude_re", "amplitude_im", "phase_radians", "phase_degrees"];
  const lines = [header.join(",")];
  for (const entry of rows) {
    lines.push(
      [
        entry.index ?? "",
        csvEscape(entry.basis),
        entry.probability,
        entry.amplitude?.re ?? "",
        entry.amplitude?.im ?? "",
        entry.phase_radians ?? "",
        entry.phase_degrees ?? "",
      ].join(","),
    );
  }
  return lines.join("\n");
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
