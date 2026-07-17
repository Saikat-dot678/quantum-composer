"use client";

// Entanglement metrics: concurrence (2-qubit only), Schmidt decomposition and
// entanglement entropy per selected bipartition, and per-qubit purity as a
// entanglement signal. Deliberately does not attempt a complete entanglement
// classification for arbitrary mixed multipartite states -- see the closing
// disclaimer, and backend/analysis/state_postprocessing.py's own scope notes.
import type { StateAnalysisResponse } from "@/lib/labTypes";
import { Badge, Callout } from "../../ui/primitives";

function PurityBars({ values, entropies }: { values: number[]; entropies: Array<number | null> }) {
  return (
    <div className="space-y-1.5">
      {values.map((purity, qubit) => (
        <div key={qubit} className="grid grid-cols-[3rem_1fr_4rem_minmax(4.5rem,auto)] items-center gap-2 text-[11px]">
          <span className="font-mono text-lab-muted">q{qubit}</span>
          <div className="h-2 overflow-hidden rounded-sm bg-lab-raised" role="meter" aria-label={`Reduced purity of qubit ${qubit}`} aria-valuemin={0} aria-valuemax={1} aria-valuenow={purity}>
            <div className="h-full rounded-sm bg-accent-cyan" style={{ width: `${purity * 100}%` }} />
          </div>
          <span className="text-right font-mono text-lab-muted">{purity.toFixed(4)}</span>
          <span className="text-right font-mono text-lab-faint">{entropies[qubit] !== null ? `${entropies[qubit]!.toFixed(3)} bits` : ""}</span>
        </div>
      ))}
    </div>
  );
}

export function EntanglementView({ state }: { state: StateAnalysisResponse }) {
  const entanglement = state.entanglement;
  if (!entanglement) return <p className="text-xs text-lab-faint">No entanglement summary is available for this representation.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {entanglement.concurrence !== null && <Badge tone={entanglement.concurrence > 1e-6 ? "violet" : "green"}>concurrence {entanglement.concurrence.toFixed(4)}</Badge>}
        {entanglement.product_state_indicator !== null && (
          <Badge tone={entanglement.product_state_indicator ? "green" : "violet"}>{entanglement.product_state_indicator ? "product state (unentangled)" : "entangled"}</Badge>
        )}
        {entanglement.global_purity !== null && <Badge tone="neutral">global purity {entanglement.global_purity.toFixed(4)}</Badge>}
      </div>

      {entanglement.concurrence !== null ? (
        entanglement.concurrence_note && <p className="text-[11px] leading-5 text-lab-muted">{entanglement.concurrence_note}</p>
      ) : (
        <p className="text-[11px] leading-5 text-lab-muted">
          Concurrence is only defined for exactly two qubits. For this system, the Schmidt coefficients and
          entanglement entropy below characterize entanglement for each listed bipartition instead.
        </p>
      )}

      {entanglement.per_qubit_purity.length > 0 && (
        <div>
          <p className="instrument-label">Per-qubit reduced purity and entropy</p>
          <p className="mt-1 text-[10px] text-lab-faint">Purity below 1 (equivalently, entropy above 0 bits) indicates that qubit is entangled with the rest of the system, for a pure global state.</p>
          <div className="mt-2">
            <PurityBars
              values={entanglement.per_qubit_purity}
              entropies={entanglement.per_qubit_purity.map((_, qubit) => state.per_qubit?.[qubit]?.von_neumann_entropy_bits ?? null)}
            />
          </div>
        </div>
      )}

      {entanglement.bipartitions.length > 0 && (
        <div>
          <p className="instrument-label">Bipartition entanglement</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-lab-border text-lab-faint">
                  <th scope="col" className="py-1.5 pr-3 font-medium">Partition A</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Partition B</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Schmidt rank</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Entanglement entropy</th>
                </tr>
              </thead>
              <tbody>
                {entanglement.bipartitions.map((bp, index) => (
                  <tr key={index} className="border-b border-lab-border/60">
                    <td className="py-1.5 pr-3 font-mono text-lab-text">{`{${bp.partition_a.join(",")}}`}</td>
                    <td className="py-1.5 pr-3 font-mono text-lab-text">{`{${bp.partition_b.join(",")}}`}</td>
                    <td className="py-1.5 pr-3 font-mono text-lab-muted">{bp.schmidt_rank}</td>
                    <td className="py-1.5 pr-3 font-mono text-lab-muted">{bp.entanglement_entropy_bits.toFixed(4)} bits</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px] leading-5 text-lab-muted">{entanglement.explanation}</p>

      <Callout tone="info">
        This is not a complete entanglement classification for arbitrary mixed, multipartite states --
        concurrence and the Schmidt/entropy figures above characterize specific two-body or bipartite aspects
        of the state only.
      </Callout>
    </div>
  );
}
