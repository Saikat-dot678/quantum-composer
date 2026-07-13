"use client";

// Live state preview: computes the ideal pre-measurement state locally for
// small circuits and renders basis probabilities with phases, an interactive
// Bloch sphere for one qubit (lazy-loaded), and an honest entanglement hint
// for two qubits. Above the preview bound it teaches the exponential wall
// instead of rendering.
//
// This is explicitly NOT a simulation result: it is an ideal, local,
// browser-computed preview, kept clearly labeled as such (see
// docs/ARCHITECTURE.md's state-analysis section). The actual backend
// statevector -- with real engine routing, measurement semantics, and the
// full Quantum State views (Probabilities/Phases/Bloch/Density
// Matrix/Entanglement) -- lives in Simulator Lab; the two actions below hand
// off to it or fetch one comparison point on demand. Neither ever runs
// automatically on edit -- both are explicit clicks.
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Spinner } from "@/components/ui/primitives";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import type { CustomDefinition } from "@/lib/customGates";
import { resolveCustomOperations } from "@/lib/customGateResolve";
import { labApi } from "@/lib/labApi";
import type { AmplitudeEntry } from "@/lib/labTypes";
import { computeStatePreview, MAX_PREVIEW_QUBITS, type StatePreview } from "@/lib/statevector";
import type { CircuitData } from "@/lib/types";
import { ArrowRight, GitCompareArrows } from "lucide-react";

const BlochSphere3D = dynamic(() => import("./BlochSphere3D"), {
  ssr: false,
  loading: () => <Spinner label="Loading Bloch sphere" />,
});

const COMPARISON_SHOTS = 64;

interface ComparisonRow {
  basis: string;
  localProbability: number;
  backendProbability: number;
}

type ComparisonState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "done"; sourceEngine: string; rows: ComparisonRow[] };

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
  const router = useRouter();
  const { setLabCircuit } = useWorkspace();
  const resolved = useMemo(() => resolveCustomOperations(circuit, customLibrary ?? new Map()), [circuit, customLibrary]);
  const preview = useMemo(() => (resolved.ok && resolved.circuit ? computeStatePreview(resolved.circuit) : null), [resolved]);
  const entanglement = useMemo(() => (preview ? concurrence(preview) : null), [preview]);
  const blockedReason = !resolved.ok ? resolved.reason : null;

  const [comparison, setComparison] = useState<ComparisonState>({ kind: "idle" });
  // A stale comparison for a circuit the user has since edited would be
  // misleading -- drop it the moment the circuit changes. This never
  // triggers a new backend call by itself; it only clears the old one.
  useEffect(() => setComparison({ kind: "idle" }), [circuit, customLibrary]);

  function openInSimulatorLab() {
    if (!resolved.ok || !resolved.circuit) return;
    setLabCircuit(resolved.circuit);
    router.push("/simulator");
  }

  async function compareWithBackend() {
    if (!resolved.ok || !resolved.circuit) return;
    setComparison({ kind: "loading" });
    try {
      const response = await labApi.simulateV2(resolved.circuit, {
        engine: "auto",
        shots: COMPARISON_SHOTS,
        noise_enabled: false,
        noise_model_type: "depolarizing",
        max_memory_mb: 1024,
        allow_approximation: false,
        mps_max_bond_dimension: null,
        mps_truncation_threshold: null,
        seed: null,
        include_state_analysis: true,
        state_detail: "full",
      });
      const state = response.state_analysis;
      if (!state || !state.available) {
        setComparison({ kind: "unavailable", reason: state?.unavailable_reason ?? "The backend did not return a state analysis for this circuit." });
        return;
      }
      const backendByBasis = new Map<string, number>();
      for (const entry of (state.amplitudes ?? state.top_states ?? []) as AmplitudeEntry[]) backendByBasis.set(entry.basis, entry.probability);
      const rows: ComparisonRow[] = (preview?.entries ?? [])
        .filter((entry) => entry.probability > 1e-9 || (backendByBasis.get(entry.basis) ?? 0) > 1e-9)
        .map((entry) => ({ basis: entry.basis, localProbability: entry.probability, backendProbability: backendByBasis.get(entry.basis) ?? 0 }))
        .sort((left, right) => right.backendProbability - left.backendProbability);
      setComparison({ kind: "done", sourceEngine: response.selected_engine, rows });
    } catch (error) {
      setComparison({ kind: "error", message: error instanceof Error ? error.message : "The comparison request failed." });
    }
  }

  return (
    <section className="mt-5 border-t border-lab-border pt-4" aria-labelledby="state-preview-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="state-preview-heading" className="instrument-label">Live ideal preview <span className="font-normal normal-case text-lab-faint">— calculated locally in this browser</span></h2>
        <Badge tone={preview ? "cyan" : "neutral"}>{preview ? "ideal · local" : blockedReason ? "blocked" : `> ${MAX_PREVIEW_QUBITS} qubits`}</Badge>
      </div>
      <p className="mt-1 text-[10px] leading-4 text-lab-faint">
        Not a simulation result: an idealized, noiseless state recomputed instantly as you edit. For the actual
        backend-simulated quantum state — with real engine routing, honest measurement semantics, and full
        probability/phase/Bloch/entanglement views — use the actions below.
      </p>

      {resolved.ok && resolved.circuit && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={openInSimulatorLab}>
            <ArrowRight className="h-3.5 w-3.5" /> Open in Simulator Lab
          </Button>
          <Button size="sm" variant="quiet" loading={comparison.kind === "loading"} onClick={() => void compareWithBackend()}>
            <GitCompareArrows className="h-3.5 w-3.5" /> Compare with backend result
          </Button>
        </div>
      )}

      {comparison.kind === "error" && (
        <p role="alert" className="mt-2 rounded-md border border-dashed border-danger-border bg-danger-bg px-3 py-2 text-[11px] leading-4 text-danger-text">
          Comparison failed: {comparison.message}
        </p>
      )}
      {comparison.kind === "unavailable" && (
        <p role="status" className="mt-2 rounded-md border border-dashed border-lab-border px-3 py-2 text-[11px] leading-4 text-lab-faint">
          Backend comparison unavailable: {comparison.reason}
        </p>
      )}
      {comparison.kind === "done" && (
        <div className="mt-2.5 rounded-lg border border-lab-border bg-lab-raised/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="instrument-label">Local preview vs. {comparison.sourceEngine} (exact)</p>
            <Badge tone="cyan">both theoretical, no sampling</Badge>
          </div>
          <table className="mt-2 w-full border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-lab-border text-lab-faint">
                <th scope="col" className="py-1 pr-3 font-medium">Basis</th>
                <th scope="col" className="py-1 pr-3 font-medium">Local</th>
                <th scope="col" className="py-1 pr-3 font-medium">Backend</th>
                <th scope="col" className="py-1 pr-3 font-medium">|Δ|</th>
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row) => (
                <tr key={row.basis} className="border-b border-lab-border/60">
                  <td className="py-1 pr-3 font-mono text-lab-text">|{row.basis}⟩</td>
                  <td className="py-1 pr-3 font-mono text-lab-muted">{(row.localProbability * 100).toFixed(1)}%</td>
                  <td className="py-1 pr-3 font-mono text-lab-muted">{(row.backendProbability * 100).toFixed(1)}%</td>
                  <td className="py-1 pr-3 font-mono text-lab-faint">{(Math.abs(row.localProbability - row.backendProbability) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] leading-4 text-lab-faint">
            Both columns are exact theoretical probabilities (no shot noise) — the local preview&apos;s ideal math
            against the backend engine&apos;s actual returned state. A nonzero difference points to a real
            divergence (e.g. a custom gate resolving differently) rather than sampling variance.
          </p>
        </div>
      )}

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
