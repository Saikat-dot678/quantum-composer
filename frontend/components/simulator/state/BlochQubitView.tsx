"use client";

// Per-qubit reduced-state Bloch sphere -- backend-derived, not the
// Composer's local live preview. For a multi-qubit state there is no single
// global Bloch sphere (a multi-qubit pure state does not live on a single
// qubit's sphere); instead each qubit's own reduced density matrix (partial
// trace over the rest of the system, computed server-side) gets its own
// sphere, selected here. A Bell-state qubit is the canonical example: its
// reduced state sits at the origin (fully mixed) even though the two-qubit
// global state is pure and maximally entangled.
import { useState } from "react";
import type { StateAnalysisResponse } from "@/lib/labTypes";
import { Badge, Callout } from "../../ui/primitives";
import { BlochSphere3D } from "../../composer/BlochSphere3D";

export function BlochQubitView({ state }: { state: StateAnalysisResponse }) {
  const perQubit = state.per_qubit ?? [];
  const [selected, setSelected] = useState(0);
  if (perQubit.length === 0) return <p className="text-xs text-lab-faint">No per-qubit reduced states are available for this representation.</p>;

  const entry = perQubit[Math.min(selected, perQubit.length - 1)];
  const isMultiQubit = perQubit.length > 1;

  return (
    <div className="space-y-4">
      {isMultiQubit && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Select qubit">
          {perQubit.map((q) => (
            <button
              key={q.qubit}
              type="button"
              aria-pressed={selected === q.qubit}
              onClick={() => setSelected(q.qubit)}
              className={`min-h-8 rounded-md border px-2.5 font-mono text-[11px] font-semibold transition ${selected === q.qubit ? "border-accent-cyan bg-accent-cyan/10 text-accent-cyan" : "border-lab-border text-lab-muted hover:border-lab-borderStrong"}`}
            >
              q{q.qubit}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div className="grid place-items-center rounded-lg border border-lab-border bg-lab-bg p-3">
          <BlochSphere3D x={entry.bloch_vector.x} y={entry.bloch_vector.y} z={entry.bloch_vector.z} />
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={entry.is_mixed ? "amber" : "green"}>{entry.is_mixed ? "mixed reduced state" : "pure reduced state"}</Badge>
            <Badge tone="neutral">magnitude {entry.bloch_magnitude.toFixed(3)}</Badge>
          </div>
          <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-[11px]">
            <div><dt className="text-lab-faint">x</dt><dd className="font-mono text-lab-text">{entry.bloch_vector.x.toFixed(4)}</dd></div>
            <div><dt className="text-lab-faint">y</dt><dd className="font-mono text-lab-text">{entry.bloch_vector.y.toFixed(4)}</dd></div>
            <div><dt className="text-lab-faint">z</dt><dd className="font-mono text-lab-text">{entry.bloch_vector.z.toFixed(4)}</dd></div>
            <div><dt className="text-lab-faint">⟨X⟩</dt><dd className="font-mono text-lab-text">{entry.expectation_x.toFixed(4)}</dd></div>
            <div><dt className="text-lab-faint">⟨Y⟩</dt><dd className="font-mono text-lab-text">{entry.expectation_y.toFixed(4)}</dd></div>
            <div><dt className="text-lab-faint">⟨Z⟩</dt><dd className="font-mono text-lab-text">{entry.expectation_z.toFixed(4)}</dd></div>
            <div><dt className="text-lab-faint">Purity</dt><dd className="font-mono text-lab-text">{entry.purity.toFixed(4)}</dd></div>
            <div><dt className="text-lab-faint">Entropy</dt><dd className="font-mono text-lab-text">{entry.von_neumann_entropy_bits.toFixed(4)} bits</dd></div>
            <div><dt className="text-lab-faint">P(|1⟩)</dt><dd className="font-mono text-lab-text">{(entry.probability_1 * 100).toFixed(2)}%</dd></div>
          </dl>
        </div>
      </div>

      {entry.is_mixed && (
        <Callout tone="info" title="Why is this qubit's reduced state mixed?">
          {isMultiQubit
            ? "A Bloch-vector magnitude below 1 means this qubit's reduced state is mixed. For a pure global state (statevector), this always means the qubit is entangled with the rest of the system -- entanglement, not measurement or noise, is what pulls the point inside the sphere. For a mixed global state (density matrix, e.g. under a noise model), it may reflect entanglement, noise, or both, and the two cannot be separated from this qubit's Bloch vector alone."
            : "A Bloch-vector magnitude below 1 for a single-qubit state reflects noise or decoherence in the simulation (a single qubit cannot be entangled with nothing) -- see the Density Matrix tab for the full mixed-state diagnostics."}
        </Callout>
      )}
    </div>
  );
}
