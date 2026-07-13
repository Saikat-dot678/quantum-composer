"use client";

// Full density-matrix view: only shown when representation === "density_matrix"
// (see QuantumStatePanel's tab gating). The matrix itself is only ever
// rendered as a grid up to MAX_INLINE_HEATMAP_DIM -- above that, materializing
// one DOM cell per complex entry would defeat the point of bounding payload
// size server-side, so a capped diagonal table plus a pointer to the JSON/CSV
// export stands in for it instead.
import type { ComplexNumber, StateAnalysisResponse } from "@/lib/labTypes";
import { complexMagnitude, formatComplex, magnitudeToHeatmapColor } from "@/lib/stateAnalysisFormat";
import { Callout } from "../../ui/primitives";
import { AmplitudeTable } from "./AmplitudeTable";

const MAX_INLINE_HEATMAP_DIM = 16; // <= 4 qubits: 256 cells, safe to render directly

function DensityHeatmap({ matrix }: { matrix: ComplexNumber[][] }) {
  const dim = matrix.length;
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-[9px]">
        <caption className="sr-only">Density matrix magnitude heatmap, {dim} by {dim} entries. Cell shade encodes magnitude; exact complex values are in each cell&apos;s title and the JSON export.</caption>
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
              {row.map((cell, colIndex) => {
                const magnitude = complexMagnitude(cell);
                return (
                  <td key={colIndex} className="p-0">
                    <div
                      className="grid h-8 w-8 place-items-center border border-lab-bg font-mono text-[8px] text-lab-text/70"
                      style={{ backgroundColor: magnitudeToHeatmapColor(magnitude) }}
                      title={`ρ[${rowIndex}][${colIndex}] = ${formatComplex(cell)} (|·| = ${magnitude.toFixed(3)})`}
                    >
                      {magnitude > 0.01 ? magnitude.toFixed(2) : ""}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DensityMatrixView({ state }: { state: StateAnalysisResponse }) {
  const metrics = state.global_metrics ?? {};
  const trace = typeof metrics.trace === "number" ? metrics.trace : null;
  const purity = typeof metrics.purity === "number" ? metrics.purity : null;
  const hermiticityError = typeof metrics.hermiticity_error === "number" ? metrics.hermiticity_error : null;
  const entropy = typeof metrics.von_neumann_entropy_bits === "number" ? metrics.von_neumann_entropy_bits : null;
  const mixedNote = typeof metrics.mixed_state_note === "string" ? metrics.mixed_state_note : null;

  const matrix = state.density_matrix;
  const dim = matrix?.length ?? 0;

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-y border-lab-border py-3 text-[11px] sm:grid-cols-4">
        {trace !== null && <div><dt className="text-lab-faint">Trace</dt><dd className="font-mono text-lab-text">{trace.toFixed(6)}</dd></div>}
        {purity !== null && <div><dt className="text-lab-faint">Purity</dt><dd className="font-mono text-lab-text">{purity.toFixed(6)}</dd></div>}
        {entropy !== null && <div><dt className="text-lab-faint">Entropy</dt><dd className="font-mono text-lab-text">{entropy.toFixed(4)} bits</dd></div>}
        {hermiticityError !== null && <div><dt className="text-lab-faint">Hermiticity error</dt><dd className="font-mono text-lab-text">{hermiticityError.toExponential(1)}</dd></div>}
      </dl>
      {mixedNote && <Callout tone="info">{mixedNote}</Callout>}

      {matrix && dim > 0 ? (
        dim <= MAX_INLINE_HEATMAP_DIM ? (
          <div>
            <p className="instrument-label">Magnitude heatmap</p>
            <p className="mt-1 text-[10px] text-lab-faint">Darker = larger |ρᵢⱼ|. Hover (or use a screen reader) for the exact complex value of each entry.</p>
            <div className="mt-2"><DensityHeatmap matrix={matrix} /></div>
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
          <div className="mt-1.5"><AmplitudeTable entries={state.basis_probabilities} maxRows={24} showAmplitude={false} showPhase={false} /></div>
        </div>
      )}

      <p className="text-[10px] text-lab-faint">See the Bloch tab for each qubit&apos;s reduced single-qubit state, and the Entanglement tab for concurrence.</p>
    </div>
  );
}
