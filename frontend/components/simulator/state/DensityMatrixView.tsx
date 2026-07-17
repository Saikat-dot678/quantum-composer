"use client";

// Full density-matrix view: only shown when representation === "density_matrix"
// (see QuantumStatePanel's tab gating). The matrix itself is only ever
// rendered as a grid up to MAX_INLINE_HEATMAP_DIM -- above that, materializing
// one DOM cell per complex entry would defeat the point of bounding payload
// size server-side, so a capped diagonal table plus a pointer to the JSON/CSV
// export stands in for it instead. Four heatmap modes (magnitude, real,
// imaginary, phase) share one grid; the numeric table below is the accessible
// non-color representation of exactly the same entries.
import { useState } from "react";
import type { ComplexNumber, StateAnalysisResponse } from "@/lib/labTypes";
import {
  complexMagnitude,
  complexPhaseRadians,
  formatComplex,
  magnitudeToHeatmapColor,
  phaseToHslColor,
  signedToHeatmapColor,
} from "@/lib/stateAnalysisFormat";
import { Callout } from "../../ui/primitives";
import { AmplitudeTable } from "./AmplitudeTable";

const MAX_INLINE_HEATMAP_DIM = 16; // <= 4 qubits: 256 cells, safe to render directly

type HeatmapMode = "magnitude" | "real" | "imaginary" | "phase";

const MODE_LABELS: Record<HeatmapMode, string> = {
  magnitude: "Magnitude |ρᵢⱼ|",
  real: "Real part",
  imaginary: "Imaginary part",
  phase: "Phase",
};

function cellColor(cell: ComplexNumber, mode: HeatmapMode): string {
  if (mode === "magnitude") return magnitudeToHeatmapColor(complexMagnitude(cell));
  if (mode === "real") return signedToHeatmapColor(cell.re);
  if (mode === "imaginary") return signedToHeatmapColor(cell.im);
  const magnitude = complexMagnitude(cell);
  // Phase is meaningless for a ~zero entry; render it neutral instead of a
  // loud random hue from atan2 noise.
  return magnitude > 1e-6 ? phaseToHslColor(complexPhaseRadians(cell)) : "hsl(190, 20%, 94%)";
}

function cellText(cell: ComplexNumber, mode: HeatmapMode): string {
  if (mode === "magnitude") {
    const magnitude = complexMagnitude(cell);
    return magnitude > 0.01 ? magnitude.toFixed(2) : "";
  }
  if (mode === "real") return Math.abs(cell.re) > 0.01 ? cell.re.toFixed(2) : "";
  if (mode === "imaginary") return Math.abs(cell.im) > 0.01 ? cell.im.toFixed(2) : "";
  const magnitude = complexMagnitude(cell);
  return magnitude > 0.01 ? `${((complexPhaseRadians(cell) * 180) / Math.PI).toFixed(0)}°` : "";
}

function DensityHeatmap({ matrix, mode }: { matrix: ComplexNumber[][]; mode: HeatmapMode }) {
  const dim = matrix.length;
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-[9px]">
        <caption className="sr-only">
          Density matrix {MODE_LABELS[mode]} heatmap, {dim} by {dim} entries. Cell shade encodes the value; the
          numeric matrix table below carries the exact complex values without color.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="w-6" aria-hidden="true" />
            {matrix.map((_, col) => <th key={col} scope="col" className="w-8 pb-1 font-mono font-normal text-lab-faint">{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <th scope="row" className="pr-1 text-right font-mono font-normal text-lab-faint">{rowIndex}</th>
              {row.map((cell, colIndex) => (
                <td key={colIndex} className="p-0">
                  <div
                    className="grid h-8 w-8 place-items-center border border-lab-bg font-mono text-[8px] text-lab-text/70"
                    style={{ backgroundColor: cellColor(cell, mode) }}
                    title={`ρ[${rowIndex}][${colIndex}] = ${formatComplex(cell)} (|·| = ${complexMagnitude(cell).toFixed(3)})`}
                  >
                    {cellText(cell, mode)}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NumericMatrixTable({ matrix }: { matrix: ComplexNumber[][] }) {
  return (
    <div className="max-h-64 overflow-auto rounded-md border border-lab-border">
      <table className="border-collapse font-mono text-[10px]">
        <caption className="sr-only">Exact complex density-matrix entries, row by column.</caption>
        <thead className="sticky top-0 z-[1] bg-lab-surface">
          <tr>
            <th scope="col" className="border-b border-lab-border px-2 py-1 text-left font-normal text-lab-faint">ρ</th>
            {matrix.map((_, col) => <th key={col} scope="col" className="border-b border-lab-border px-2 py-1 text-right font-normal text-lab-faint">{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <th scope="row" className="px-2 py-1 text-left font-normal text-lab-faint">{rowIndex}</th>
              {row.map((cell, colIndex) => (
                <td key={colIndex} className="whitespace-nowrap px-2 py-1 text-right text-lab-muted">{formatComplex(cell, 3)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DensityMatrixView({ state }: { state: StateAnalysisResponse }) {
  const [mode, setMode] = useState<HeatmapMode>("magnitude");
  const [showNumeric, setShowNumeric] = useState(false);
  const metrics = state.global_metrics ?? {};
  const trace = typeof metrics.trace === "number" ? metrics.trace : null;
  const purity = typeof metrics.purity === "number" ? metrics.purity : null;
  const hermiticityError = typeof metrics.hermiticity_error === "number" ? metrics.hermiticity_error : null;
  const entropy = typeof metrics.von_neumann_entropy_bits === "number" ? metrics.von_neumann_entropy_bits : null;
  const mixedNote = typeof metrics.mixed_state_note === "string" ? metrics.mixed_state_note : null;
  const eigenvalues = Array.isArray(metrics.eigenvalues) ? (metrics.eigenvalues as number[]) : null;

  const matrix = state.density_matrix;
  const dim = matrix?.length ?? 0;

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-y border-lab-border py-3 text-[11px] sm:grid-cols-4">
        {trace !== null && <div><dt className="text-lab-faint">Trace</dt><dd className="font-mono text-lab-text">{trace.toFixed(6)}</dd></div>}
        {typeof state.normalization_error === "number" && <div><dt className="text-lab-faint">Trace error</dt><dd className="font-mono text-lab-text">{state.normalization_error.toExponential(1)}</dd></div>}
        {purity !== null && <div><dt className="text-lab-faint">Purity</dt><dd className="font-mono text-lab-text">{purity.toFixed(6)}</dd></div>}
        {entropy !== null && <div><dt className="text-lab-faint">Entropy</dt><dd className="font-mono text-lab-text">{entropy.toFixed(4)} bits</dd></div>}
        {hermiticityError !== null && <div><dt className="text-lab-faint">Hermiticity error</dt><dd className="font-mono text-lab-text">{hermiticityError.toExponential(1)}</dd></div>}
      </dl>
      {mixedNote && <Callout tone="info">{mixedNote}</Callout>}

      {eigenvalues && eigenvalues.length > 0 && (
        <div>
          <p className="instrument-label">Eigenvalue spectrum</p>
          <p className="mt-1 text-[10px] leading-4 text-lab-faint">
            Descending. A pure state has one eigenvalue ≈ 1 and the rest ≈ 0; the entropy above is computed from
            exactly this spectrum. Values below 10⁻⁴ are omitted here (full list in the JSON export).
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Density matrix eigenvalues">
            {eigenvalues.filter((value) => value >= 1e-4).slice(0, 16).map((value, index) => (
              <li key={index} className="rounded-md border border-lab-border bg-lab-bg px-2 py-0.5 font-mono text-[11px] text-lab-muted">
                λ{index + 1} = {value.toFixed(4)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {matrix && dim > 0 ? (
        dim <= MAX_INLINE_HEATMAP_DIM ? (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="instrument-label">Matrix heatmap</p>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Heatmap mode">
                {(Object.keys(MODE_LABELS) as HeatmapMode[]).map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    aria-pressed={mode === candidate}
                    onClick={() => setMode(candidate)}
                    className={`min-h-7 rounded-md border px-2 text-[10px] font-semibold transition ${mode === candidate ? "border-accent-cyan bg-accent-cyan/10 text-accent-cyan" : "border-lab-border text-lab-muted hover:border-lab-borderStrong"}`}
                  >
                    {MODE_LABELS[candidate]}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-1 text-[10px] text-lab-faint">
              {mode === "magnitude" && "Darker = larger |ρᵢⱼ|."}
              {mode === "real" && "Teal = positive, amber = negative; darker = larger magnitude."}
              {mode === "imaginary" && "Teal = positive, amber = negative; darker = larger magnitude."}
              {mode === "phase" && "Hue encodes phase angle; near-zero entries stay neutral because their phase is numerically meaningless."}
              {" "}Hover for the exact complex value; the numeric table below is the color-free representation.
            </p>
            <div className="mt-2"><DensityHeatmap matrix={matrix} mode={mode} /></div>
            <button
              type="button"
              className="mt-2 text-[11px] font-semibold text-accent-cyan hover:underline"
              aria-expanded={showNumeric}
              onClick={() => setShowNumeric((value) => !value)}
            >
              {showNumeric ? "Hide numeric matrix table" : "Show numeric matrix table"}
            </button>
            {showNumeric && <div className="mt-2"><NumericMatrixTable matrix={matrix} /></div>}
          </div>
        ) : (
          <Callout tone="info" title={`${dim}×${dim} matrix too large to render as a grid`}>
            This density matrix has {dim * dim} entries -- rendering one cell per entry in the browser would not stay
            responsive. Use the JSON export (Overview tab) for the complete matrix; diagonal probabilities below
            remain fully available.
          </Callout>
        )
      ) : (
        <Callout tone="info">
          The full density-matrix payload was not included in this response (enable &quot;Include full density
          matrix payload&quot; in run options, available up to 8 qubits). Summary metrics above and the diagonal
          probabilities below remain available regardless.
        </Callout>
      )}

      {state.basis_probabilities && state.basis_probabilities.length > 0 && (
        <div>
          <p className="instrument-label">Diagonal (basis-state) probabilities</p>
          <div className="mt-1.5"><AmplitudeTable entries={state.basis_probabilities} showAmplitude={false} showPhase={false} /></div>
        </div>
      )}

      <p className="text-[10px] text-lab-faint">See the Bloch tab for each qubit&apos;s reduced single-qubit state, and the Entanglement tab for concurrence.</p>
    </div>
  );
}
