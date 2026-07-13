"use client";

// Live state preview: computes the ideal pre-measurement state locally for
// small circuits and renders basis probabilities with phases, an interactive
// Bloch sphere for one qubit (lazy-loaded), and an honest entanglement hint
// for two qubits. Above the preview bound it teaches the exponential wall
// instead of rendering.
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Badge, Spinner } from "@/components/ui/primitives";
import type { CustomDefinition } from "@/lib/customGates";
import { resolveCustomOperations } from "@/lib/customGateResolve";
import { computeStatePreview, MAX_PREVIEW_QUBITS, type StatePreview } from "@/lib/statevector";
import type { CircuitData } from "@/lib/types";

const BlochSphere3D = dynamic(() => import("./BlochSphere3D"), {
  ssr: false,
  loading: () => <Spinner label="Loading Bloch sphere" />,
});

const RAD_TO_DEG = 180 / Math.PI;
const SHOWN_STATES = 6;

// Concurrence of a pure 2-qubit state |ψ⟩ = a|00⟩ + b|01⟩ + c|10⟩ + d|11⟩:
// C = 2·|ad − bc|. C = 0 → product state; C = 1 → maximally entangled.
function concurrence(preview: StatePreview): number | null {
  if (preview.numQubits !== 2 || preview.entries.length !== 4) return null;
  const [a, b, c, d] = preview.entries;
  const adRe = a.re * d.re - a.im * d.im;
  const adIm = a.re * d.im + a.im * d.re;
  const bcRe = b.re * c.re - b.im * c.im;
  const bcIm = b.re * c.im + b.im * c.re;
  return 2 * Math.hypot(adRe - bcRe, adIm - bcIm);
}

function entanglementHint(value: number): { tone: "violet" | "green" | "neutral"; label: string; note: string } {
  if (value > 0.98) return { tone: "violet", label: `maximally entangled · C ≈ ${value.toFixed(2)}`, note: "No single-qubit description exists for either qubit — that is why there is no Bloch sphere here." };
  if (value > 0.05) return { tone: "violet", label: `entangled · C ≈ ${value.toFixed(2)}`, note: "The two qubits are correlated beyond any product state (concurrence > 0)." };
  return { tone: "green", label: "product state · C ≈ 0", note: "Each qubit could be described independently on its own Bloch sphere." };
}

export function StatePreviewPanel({ circuit, customLibrary }: { circuit: CircuitData; customLibrary?: ReadonlyMap<string, CustomDefinition> }) {
  const resolved = useMemo(() => resolveCustomOperations(circuit, customLibrary ?? new Map()), [circuit, customLibrary]);
  const preview = useMemo(() => (resolved.ok && resolved.circuit ? computeStatePreview(resolved.circuit) : null), [resolved]);
  const entanglement = useMemo(() => (preview ? concurrence(preview) : null), [preview]);
  const blockedReason = !resolved.ok ? resolved.reason : null;

  return (
    <section className="mt-5 border-t border-lab-border pt-4" aria-labelledby="state-preview-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="state-preview-heading" className="instrument-label">Live state preview</h2>
        <Badge tone={preview ? "cyan" : "neutral"}>{preview ? "ideal · local" : blockedReason ? "blocked" : `> ${MAX_PREVIEW_QUBITS} qubits`}</Badge>
      </div>

      {blockedReason ? (
        <p role="status" className="mt-2 rounded-md border border-dashed border-danger-border bg-danger-bg px-3 py-2 text-[11px] leading-4 text-danger-text">
          Preview unavailable: {blockedReason}
        </p>
      ) : !preview ? (
        <p className="mt-2 rounded-md border border-dashed border-lab-border px-3 py-2 text-[11px] leading-4 text-lab-faint">
          The in-browser preview computes 2ⁿ amplitudes and stops above {MAX_PREVIEW_QUBITS} qubits — the same exponential wall that
          limits every exact simulator. Use Simulator Lab for engine-routed analysis.
        </p>
      ) : (
        <>
          {preview.bloch && (
            <div className="mt-3 rounded-lg border border-lab-border bg-lab-raised/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="instrument-label mb-2">Bloch sphere</p>
                  <BlochSphere3D x={preview.bloch.x} y={preview.bloch.y} z={preview.bloch.z} />
                </div>
                <dl className="space-y-0.5 pt-6 font-mono text-[11px] text-lab-muted">
                  <div className="flex gap-2"><dt className="w-8 text-lab-faint">⟨X⟩</dt><dd className="tabular-nums text-lab-text">{preview.bloch.x.toFixed(3)}</dd></div>
                  <div className="flex gap-2"><dt className="w-8 text-lab-faint">⟨Y⟩</dt><dd className="tabular-nums text-lab-text">{preview.bloch.y.toFixed(3)}</dd></div>
                  <div className="flex gap-2"><dt className="w-8 text-lab-faint">⟨Z⟩</dt><dd className="tabular-nums text-lab-text">{preview.bloch.z.toFixed(3)}</dd></div>
                </dl>
              </div>
            </div>
          )}

          {entanglement !== null && (() => {
            const hint = entanglementHint(entanglement);
            return (
              <div className="mt-3 rounded-lg border border-lab-border bg-lab-raised/40 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="instrument-label">Two-qubit correlation</p>
                  <Badge tone={hint.tone}>{hint.label}</Badge>
                </div>
                <p className="mt-1.5 text-[11px] leading-4 text-lab-faint">{hint.note}</p>
              </div>
            );
          })()}

          <ol className="mt-3 space-y-1.5" aria-label="Basis-state probabilities">
            {[...preview.entries]
              .sort((left, right) => right.probability - left.probability)
              .slice(0, SHOWN_STATES)
              .filter((entry) => entry.probability > 1e-9)
              .map((entry) => (
                <li key={entry.basis} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                  <span className="font-mono text-[11px] text-lab-muted">|{entry.basis}⟩</span>
                  <span className="relative h-2.5 overflow-hidden rounded-sm bg-lab-raised" role="meter" aria-label={`State ${entry.basis}: ${(entry.probability * 100).toFixed(1)} percent`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(entry.probability * 100)}>
                    <span className="absolute inset-y-0 left-0 rounded-sm bg-accent-cyan/80" style={{ width: `${entry.probability * 100}%` }} />
                  </span>
                  <span className="whitespace-nowrap text-right font-mono text-[10px] tabular-nums text-lab-faint">
                    {(entry.probability * 100).toFixed(1)}% <span className="text-lab-muted">∠{(entry.phase * RAD_TO_DEG).toFixed(0)}°</span>
                  </span>
                </li>
              ))}
          </ol>

          <p className="mt-2 text-[10px] leading-4 text-lab-faint">
            Ideal pre-measurement state, computed locally as you edit.
            {preview.ignoredMeasurements > 0 && ` ${preview.ignoredMeasurements} measurement op${preview.ignoredMeasurements === 1 ? "" : "s"} ignored here — run the circuit for sampled counts.`}
          </p>
        </>
      )}
    </section>
  );
}
