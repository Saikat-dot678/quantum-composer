"use client";

// The "Quantum State" result tab: the actual simulated state returned by the
// backend for this run (see backend/analysis/state_postprocessing.py and
// docs/ARCHITECTURE.md's state-analysis section), never the Composer's local
// live preview. Three concerns kept apart on purpose:
//  - this file: container, sub-tab nav, Overview / Probabilities / Phases
//    (they all read the same per-basis-state list)
//  - BlochQubitView.tsx: per-qubit reduced-state Bloch spheres
//  - DensityMatrixView.tsx: full density-matrix heatmaps/table
//  - EntanglementView.tsx: concurrence / Schmidt / entropy
//
// Every field the backend returns is either rendered here, rendered in a
// sub-view, or carried verbatim by the JSON export -- the audit's
// field-by-field mapping lives in docs/ARCHITECTURE.md.
import { useMemo, useState } from "react";
import type { StateAnalysisResponse } from "@/lib/labTypes";
import {
  diracNotation,
  displayEntries,
  downloadTextFile,
  isApproximate,
  qubitOrderLabel,
  representationLabel,
  semanticPointLabel,
  stateAnalysisToCsv,
  stateAnalysisToJson,
} from "@/lib/stateAnalysisFormat";
import { Download } from "lucide-react";
import { Badge, Button, Callout } from "../../ui/primitives";
import { AmplitudeTable } from "./AmplitudeTable";
import { BlochQubitView } from "./BlochQubitView";
import { DensityMatrixView } from "./DensityMatrixView";
import { EntanglementView } from "./EntanglementView";

type StateSubView = "overview" | "probabilities" | "phases" | "bloch" | "density" | "entanglement";

function ExportRow({ state }: { state: StateAnalysisResponse }) {
  const [exportError, setExportError] = useState<string | null>(null);

  function tryExport(kind: "json" | "csv") {
    try {
      setExportError(null);
      if (kind === "json") {
        downloadTextFile("quantum-state.json", stateAnalysisToJson(state), "application/json");
      } else {
        const csv = stateAnalysisToCsv(state);
        if (!csv) {
          setExportError("This representation has no per-basis-state table to export as CSV -- use the JSON export instead.");
          return;
        }
        downloadTextFile("quantum-state.csv", csv, "text/csv");
      }
    } catch (error) {
      setExportError(error instanceof Error ? `Export failed: ${error.message}` : "Export failed in this browser.");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => tryExport("json")}>
          <Download className="h-3.5 w-3.5" /> Export JSON
        </Button>
        <Button size="sm" variant="secondary" disabled={stateAnalysisToCsv(state) === null} onClick={() => tryExport("csv")}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>
      {exportError && <p role="alert" className="mt-1.5 text-[11px] text-danger-text">{exportError}</p>}
    </div>
  );
}

function PreMeasurementNotice() {
  return (
    <Callout tone="info" title="Pre-measurement analysis copy">
      This circuit ends in measurement, so its final state is not a single deterministic quantum state to
      display -- the state shown here is from a separate analysis copy of the circuit with those terminal
      measurements removed, evaluated up to that point. The Distribution tab still reflects real sampled
      outcomes from the actual measured circuit; nothing about the counts was changed to produce this view.
    </Callout>
  );
}

function MixedFinalNotice() {
  return (
    <Callout tone="info" title="Mixed final state">
      No measurement was removed to produce this state -- it is the circuit&apos;s actual final state under this
      engine. It is shown as a density matrix (rather than a single amplitude vector) because this engine
      represents mixed states directly, e.g. under a noise model.
    </Callout>
  );
}

function StabilizerGenerators({ state }: { state: StateAnalysisResponse }) {
  const generators = Array.isArray(state.global_metrics?.stabilizer_generators)
    ? (state.global_metrics.stabilizer_generators as string[])
    : [];
  if (generators.length === 0) return null;
  return (
    <div>
      <p className="instrument-label">Stabilizer generators</p>
      <p className="mt-1 text-[10px] leading-4 text-lab-faint">
        These {generators.length} Pauli strings fully determine the state under the stabilizer formalism --
        they are the state, in this representation. Sign, then one Pauli letter per qubit (leftmost = highest
        qubit index, matching the basis-label convention).
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Stabilizer generator list">
        {generators.map((generator, index) => (
          <li key={`${generator}-${index}`} className="rounded-md border border-lab-border bg-lab-bg px-2 py-1 font-mono text-[11px] text-lab-text">
            {generator}
          </li>
        ))}
      </ul>
    </div>
  );
}

function OverviewView({ state, shots, timingMs }: { state: StateAnalysisResponse; shots: number | null; timingMs: number | null }) {
  const entries = displayEntries(state);
  const topForDirac = state.top_states ?? entries ?? [];
  const dirac = diracNotation(topForDirac, 6);
  const metrics = state.global_metrics ?? {};
  const purity = typeof metrics.purity === "number" ? metrics.purity : null;
  const isPure = typeof metrics.is_pure === "boolean" ? metrics.is_pure : null;
  const amplitudeCount = typeof metrics.amplitude_count === "number" ? metrics.amplitude_count : null;
  const nonzeroCount = typeof metrics.nonzero_amplitude_count === "number" ? metrics.nonzero_amplitude_count : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="cyan">{representationLabel(state.representation)}</Badge>
        <Badge tone="neutral">{semanticPointLabel(state.semantic_point)}</Badge>
        {state.source_engine && <Badge tone="neutral">{state.source_engine}</Badge>}
        <Badge tone={isApproximate(state) ? "amber" : "green"}>{isApproximate(state) ? "approximate" : "exact"}</Badge>
        {isPure !== null && <Badge tone={isPure ? "green" : "violet"}>{isPure ? "pure state" : "mixed state"}</Badge>}
      </div>

      {state.semantic_point === "pre_measurement_state" && <PreMeasurementNotice />}
      {state.semantic_point === "mixed_final_state" && <MixedFinalNotice />}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-y border-lab-border py-3 text-[11px] sm:grid-cols-3 lg:grid-cols-6">
        <div><dt className="text-lab-faint">Qubits</dt><dd className="font-mono text-lab-text">{state.num_qubits ?? "—"}</dd></div>
        {shots !== null && <div><dt className="text-lab-faint">Shots sampled</dt><dd className="font-mono text-lab-text">{shots.toLocaleString()}</dd></div>}
        {timingMs !== null && <div><dt className="text-lab-faint">Engine time</dt><dd className="font-mono text-lab-text">{timingMs.toFixed(1)} ms</dd></div>}
        <div><dt className="text-lab-faint">Normalized</dt><dd className="font-mono text-lab-text">{state.normalized ? "yes" : "no"}{typeof state.normalization_error === "number" && <span className="text-lab-faint"> ({state.normalization_error.toExponential(1)})</span>}</dd></div>
        {purity !== null && <div><dt className="text-lab-faint">Purity</dt><dd className="font-mono text-lab-text">{purity.toFixed(4)}</dd></div>}
        {amplitudeCount !== null && (
          <div><dt className="text-lab-faint">Amplitudes</dt><dd className="font-mono text-lab-text">{amplitudeCount.toLocaleString()}{nonzeroCount !== null && <span className="text-lab-faint"> ({nonzeroCount.toLocaleString()} nonzero)</span>}</dd></div>
        )}
      </dl>

      <p className="text-[10px] leading-4 text-lab-faint">
        Bit ordering: {qubitOrderLabel(state.qubit_order)}. In a label like |01⟩ the rightmost character is qubit 0.
      </p>

      {state.representation === "stabilizer_summary" && <StabilizerGenerators state={state} />}

      {dirac && (
        <div>
          <p className="instrument-label">Dominant terms (Dirac notation)</p>
          <p className="mt-1.5 overflow-x-auto whitespace-nowrap font-mono text-xs text-lab-text">{dirac}</p>
        </div>
      )}

      {state.top_states && state.top_states.length > 0 && (
        <div>
          <p className="instrument-label">Top basis states</p>
          <div className="mt-1.5"><AmplitudeTable entries={state.top_states} maxRows={8} /></div>
        </div>
      )}

      {state.warnings.length > 0 && (
        <ul className="space-y-1 border-t border-lab-border pt-3 text-[10px] leading-4 text-accent-amber">
          {state.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
        </ul>
      )}

      <ExportRow state={state} />
    </div>
  );
}

function CountsComparison({ state, counts, shots }: { state: StateAnalysisResponse; counts: Record<string, number>; shots: number }) {
  const rows = useMemo(() => {
    const exactByBasis = new Map<string, number>();
    for (const entry of displayEntries(state) ?? []) exactByBasis.set(entry.basis, entry.probability);
    const bases = new Set<string>([...exactByBasis.keys(), ...Object.keys(counts)]);
    return [...bases]
      .map((basis) => {
        const exact = exactByBasis.get(basis) ?? null;
        const count = counts[basis] ?? 0;
        const frequency = shots > 0 ? count / shots : 0;
        return { basis, exact, count, frequency, delta: exact !== null ? Math.abs(exact - frequency) : null };
      })
      .filter((row) => (row.exact ?? 0) > 1e-10 || row.count > 0)
      .sort((left, right) => (right.exact ?? right.frequency) - (left.exact ?? left.frequency))
      .slice(0, 24);
  }, [state, counts, shots]);

  if (rows.length === 0 || rows.every((row) => row.exact === null)) return null;

  return (
    <div>
      <p className="instrument-label">Exact probability vs. sampled frequency</p>
      <p className="mt-1 text-[10px] leading-4 text-lab-faint">
        The sampled column comes from {shots.toLocaleString()} finite shots of the real measured circuit -- it
        approaches the exact column only statistically. A nonzero difference here is expected shot noise, not
        an error.
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[22rem] border-collapse text-left text-[11px]">
          <thead>
            <tr className="border-b border-lab-border text-lab-faint">
              <th scope="col" className="py-1 pr-3 font-medium">Basis</th>
              <th scope="col" className="py-1 pr-3 font-medium">Exact</th>
              <th scope="col" className="py-1 pr-3 font-medium">Sampled count</th>
              <th scope="col" className="py-1 pr-3 font-medium">Sampled freq.</th>
              <th scope="col" className="py-1 pr-3 font-medium">|Δ|</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.basis} className="border-b border-lab-border/60">
                <td className="py-1 pr-3 font-mono text-lab-text">|{row.basis}⟩</td>
                <td className="py-1 pr-3 font-mono text-lab-muted">{row.exact !== null ? `${(row.exact * 100).toFixed(2)}%` : "—"}</td>
                <td className="py-1 pr-3 font-mono text-lab-muted">{row.count.toLocaleString()}</td>
                <td className="py-1 pr-3 font-mono text-lab-muted">{(row.frequency * 100).toFixed(2)}%</td>
                <td className="py-1 pr-3 font-mono text-lab-faint">{row.delta !== null ? `${(row.delta * 100).toFixed(2)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProbabilitiesView({ state, counts, shots }: { state: StateAnalysisResponse; counts: Record<string, number> | null; shots: number | null }) {
  const entries = displayEntries(state);
  const marginals = state.per_qubit?.filter((entry) => entry.marginal_probability_1 !== null) ?? [];

  return (
    <div className="space-y-4">
      <Callout tone="info">
        These are exact theoretical probabilities computed from the returned quantum state -- not sampled
        shot counts. Compare against the Distribution tab, which shows actual sampled measurement outcomes.
      </Callout>
      {entries && entries.length > 0 ? (
        <AmplitudeTable entries={entries} showAmplitude={false} showPhase={false} />
      ) : (
        <p className="text-xs text-lab-faint">No per-basis-state probability list is available for this representation.</p>
      )}
      {counts && shots !== null && shots > 0 && <CountsComparison state={state} counts={counts} shots={shots} />}
      {marginals.length > 0 && (
        <div>
          <p className="instrument-label">Per-qubit marginal probability of |1⟩</p>
          <p className="mt-1 text-[10px] text-lab-faint">Each qubit&apos;s own measurement probability, independent of the others -- not the same as the joint basis-state probabilities above.</p>
          <div className="mt-2 space-y-1.5">
            {marginals.map((entry) => (
              <div key={entry.qubit} className="grid grid-cols-[3rem_1fr_3.5rem] items-center gap-2 text-[11px]">
                <span className="font-mono text-lab-muted">q{entry.qubit}</span>
                <div className="h-2 overflow-hidden rounded-sm bg-lab-raised" role="meter" aria-label={`Marginal probability of |1> for qubit ${entry.qubit}`} aria-valuemin={0} aria-valuemax={1} aria-valuenow={entry.marginal_probability_1 ?? 0}>
                  <div className="h-full rounded-sm bg-accent-cyan" style={{ width: `${(entry.marginal_probability_1 ?? 0) * 100}%` }} />
                </div>
                <span className="text-right font-mono text-lab-muted">{((entry.marginal_probability_1 ?? 0) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PhaseWheelLegend() {
  const gradient = "conic-gradient(from 0deg, hsl(0,75%,55%), hsl(90,75%,55%), hsl(180,75%,55%), hsl(270,75%,55%), hsl(360,75%,55%))";
  return (
    <div className="flex items-center gap-3">
      <span className="h-6 w-6 shrink-0 rounded-full border border-lab-border" style={{ backgroundImage: gradient }} aria-hidden="true" />
      <p className="text-[10px] leading-4 text-lab-faint">
        Color is a redundant visual cue for phase (0° = red, wrapping through the hue circle back to 360°) --
        the exact phase in degrees is always shown numerically alongside it, never color alone. Enable the
        radians column for phase in radians.
      </p>
    </div>
  );
}

function PhasesView({ state }: { state: StateAnalysisResponse }) {
  const entries = (displayEntries(state) ?? []).filter((entry) => entry.phase_radians !== null);
  const globalPhaseNote = typeof state.global_metrics?.global_phase_note === "string" ? state.global_metrics.global_phase_note : null;

  if (entries.length === 0) {
    return <p className="text-xs text-lab-faint">Phase is not defined for this representation (a mixed-state diagonal has no single per-basis phase).</p>;
  }

  return (
    <div className="space-y-4">
      <PhaseWheelLegend />
      <AmplitudeTable entries={entries} showAmplitude />
      {globalPhaseNote && <Callout tone="info">{globalPhaseNote}</Callout>}
    </div>
  );
}

function UnavailableView({ state }: { state: StateAnalysisResponse }) {
  return (
    <Callout tone="warning" title="Quantum state not available for this run">
      {state.unavailable_reason ?? "The backend could not produce a state analysis for this run."}
    </Callout>
  );
}

function NotRequestedView() {
  return (
    <div className="grid min-h-[10rem] place-items-center px-5 py-6 text-center">
      <div>
        <p className="text-sm font-semibold text-lab-text">Quantum state analysis was not requested</p>
        <p className="mx-auto mt-1 max-w-md text-[11px] leading-5 text-lab-muted">
          Enable &quot;Post-simulation quantum state analysis&quot; in the run options and re-run the simulation
          to inspect the actual backend-returned state -- amplitudes, probabilities, phases, Bloch spheres,
          and entanglement metrics.
        </p>
      </div>
    </div>
  );
}

export function QuantumStatePanel({
  state,
  counts = null,
  timingMs = null,
}: {
  state: StateAnalysisResponse | null;
  /** Sampled counts from the same run, for the exact-vs-sampled comparison. */
  counts?: Record<string, number> | null;
  timingMs?: number | null;
}) {
  const [view, setView] = useState<StateSubView>("overview");

  const shots = useMemo(() => {
    if (!counts) return null;
    let total = 0;
    for (const key in counts) {
      if (Object.prototype.hasOwnProperty.call(counts, key)) total += counts[key];
    }
    return total;
  }, [counts]);

  const entries = state ? displayEntries(state) : null;
  const hasPhases = (entries ?? []).some((entry) => entry.phase_radians !== null);
  const hasBloch = !!state?.per_qubit && state.per_qubit.length > 0;
  const hasDensity = state?.representation === "density_matrix";
  const hasEntanglement = !!state?.entanglement;

  const tabs = useMemo(() => {
    if (!state || !state.available) return [];
    const list: Array<{ id: StateSubView; label: string }> = [{ id: "overview", label: "Overview" }];
    if (entries && entries.length > 0) list.push({ id: "probabilities", label: "Probabilities" });
    if (hasPhases) list.push({ id: "phases", label: "Phases" });
    if (hasBloch) list.push({ id: "bloch", label: "Bloch" });
    if (hasDensity) list.push({ id: "density", label: "Density Matrix" });
    if (hasEntanglement) list.push({ id: "entanglement", label: "Entanglement" });
    return list;
  }, [state, entries, hasPhases, hasBloch, hasDensity, hasEntanglement]);

  if (!state) return <NotRequestedView />;
  if (!state.available) return <UnavailableView state={state} />;

  const activeView = tabs.some((tab) => tab.id === view) ? view : "overview";

  return (
    <div>
      <div className="flex min-h-9 items-center gap-1 overflow-x-auto border-b border-lab-border" aria-label="Quantum state view">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={activeView === tab.id}
            onClick={() => setView(tab.id)}
            className={`min-h-8 shrink-0 border-b-2 px-2.5 text-[11px] font-semibold transition ${activeView === tab.id ? "border-accent-cyan text-accent-cyan" : "border-transparent text-lab-faint hover:text-lab-muted"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="pt-4">
        {activeView === "overview" && <OverviewView state={state} shots={shots} timingMs={timingMs} />}
        {activeView === "probabilities" && <ProbabilitiesView state={state} counts={counts} shots={shots} />}
        {activeView === "phases" && <PhasesView state={state} />}
        {activeView === "bloch" && <BlochQubitView state={state} />}
        {activeView === "density" && <DensityMatrixView state={state} />}
        {activeView === "entanglement" && <EntanglementView state={state} />}
      </div>
    </div>
  );
}
