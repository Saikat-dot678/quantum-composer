import { formatEngineName, formatInteger } from "@/lib/formatting";
import type { CircuitAnalysis, EnginesResponse } from "@/lib/labTypes";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Badge, Button } from "../ui/primitives";
import { resourceRiskForBudget } from "./simulatorModel";

interface CircuitAnalysisPanelProps {
  analysis: CircuitAnalysis | null;
  loading: boolean;
  error: string | null;
  engines: EnginesResponse | null;
  runMemoryMb: number;
  onRetry: () => void;
}

const RISK_TONE = {
  safe: "green",
  heavy: "amber",
  dangerous: "amber",
  infeasible: "red",
} as const;

export function CircuitAnalysisPanel({ analysis, loading, error, engines, runMemoryMb, onRetry }: CircuitAnalysisPanelProps) {
  if (loading) {
    return (
      <section aria-labelledby="fingerprint-heading" className="border-b border-lab-border bg-lab-surface/45 px-4 py-4 sm:px-5">
        <div className="flex items-center gap-3" role="status" aria-live="polite">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-lab-borderStrong border-t-accent-cyan" aria-hidden="true" />
          <div>
            <h2 id="fingerprint-heading" className="text-xs font-semibold text-lab-text">Building circuit fingerprint</h2>
            <p className="mt-0.5 text-[10px] text-lab-faint">Classifying operations, scheduling depth, and estimating exact memory.</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => <span key={index} className="h-10 animate-pulse rounded-md bg-lab-raised/70" />)}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section aria-labelledby="fingerprint-heading" className="border-b border-accent-red/30 bg-accent-red/[.035] px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-red" />
            <div>
              <h2 id="fingerprint-heading" className="text-xs font-semibold text-danger-text">Circuit analysis unavailable</h2>
              <p className="mt-1 text-[11px] leading-4 text-danger-text">{error}</p>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" /> Retry</Button>
        </div>
      </section>
    );
  }

  if (!analysis) {
    return (
      <section aria-labelledby="fingerprint-heading" className="border-b border-lab-border bg-lab-surface/35 px-4 py-4 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="fingerprint-heading" className="text-xs font-semibold text-lab-text">No circuit fingerprint</h2>
            <p className="mt-1 text-[10px] text-lab-faint">Analysis is required before engine compatibility can be authoritative.</p>
          </div>
          <Button size="sm" variant="secondary" onClick={onRetry}>Analyze</Button>
        </div>
      </section>
    );
  }

  const gateCounts = Object.entries(analysis.gate_counts).sort((left, right) => right[1] - left[1]);
  const runStatevectorRisk = resourceRiskForBudget(analysis.resource_estimate.statevector_log2_bytes, runMemoryMb);
  const runDensityRisk = resourceRiskForBudget(analysis.resource_estimate.density_matrix_log2_bytes, runMemoryMb);
  const recommended = analysis.recommended_engines.map((id) => {
    const info = engines?.engines.find((entry) => entry.id === id);
    return { id, available: info?.available ?? null };
  });
  const metrics = [
    ["Qubits", analysis.num_qubits],
    ["Classical", analysis.num_clbits],
    ["Operations", analysis.operation_count],
    ["Depth", analysis.depth],
    ["2-qubit", analysis.two_qubit_gate_count],
    ["Measure", analysis.measurement_count],
    ["T count", analysis.t_count],
    ["Rotations", analysis.rotation_count],
  ] as const;

  return (
    <section aria-labelledby="fingerprint-heading" className="border-b border-lab-border bg-lab-surface/45">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5">
        <div>
          <p className="instrument-label">Circuit fingerprint</p>
          <h2 id="fingerprint-heading" className="mt-1 text-xs font-semibold text-lab-text">
            {analysis.is_clifford ? "Clifford-compatible structure" : "Universal / non-Clifford structure"}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={analysis.is_clifford ? "green" : "violet"}>{analysis.is_clifford ? "stabilizer candidate" : "non-Clifford"}</Badge>
          <Badge tone={analysis.feasibility_status === "approximation_or_hardware" ? "red" : analysis.feasibility_status === "exact_borderline" ? "amber" : "green"}>
            {analysis.feasibility_status.replaceAll("_", " ")}
          </Badge>
        </div>
      </div>

      <dl className="grid grid-cols-4 border-y border-lab-border sm:grid-cols-8">
        {metrics.map(([label, value], index) => (
          <div key={label} className={`min-w-0 border-l border-lab-border px-2 py-2.5 first:border-l-0 ${index >= 4 ? "border-t sm:border-t-0" : ""}`}>
            <dt className="truncate font-display text-[8px] font-semibold uppercase tracking-[.14em] text-lab-faint">{label}</dt>
            <dd className="mt-1 truncate font-mono text-xs font-semibold tabular-nums text-lab-text">{formatInteger(value)}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-px bg-lab-border sm:grid-cols-2">
        <div className="bg-lab-surface px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="instrument-label">Exact statevector</p>
              <p className="mt-1 font-mono text-xs font-semibold text-accent-cyan">{analysis.estimated_statevector_memory_human}</p>
            </div>
            <Badge tone={RISK_TONE[runStatevectorRisk]}>run budget: {runStatevectorRisk}</Badge>
          </div>
          <p className="mt-1 text-[10px] text-lab-faint">16 × 2ⁿ bytes · evaluated against {formatInteger(runMemoryMb)} MiB</p>
        </div>
        <div className="bg-lab-surface px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="instrument-label">Density matrix</p>
              <p className="mt-1 font-mono text-xs font-semibold text-lab-text">{analysis.estimated_density_matrix_memory_human}</p>
            </div>
            <Badge tone={RISK_TONE[runDensityRisk]}>run budget: {runDensityRisk}</Badge>
          </div>
          <p className="mt-1 text-[10px] text-lab-faint">16 × 4ⁿ bytes · appropriate only for small noisy workloads</p>
        </div>
      </div>

      <details className="group px-4 py-3 sm:px-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[11px] font-semibold text-lab-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan">
          <span>Gate evidence, recommendations, and analyzer warnings</span>
          <span className="font-mono text-[10px] text-lab-faint group-open:hidden">expand</span>
          <span className="hidden font-mono text-[10px] text-lab-faint group-open:inline">collapse</span>
        </summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_1fr_1.25fr]">
          <div>
            <p className="instrument-label">Gate profile</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {gateCounts.length === 0 && <Badge tone="neutral">empty circuit</Badge>}
              {gateCounts.map(([gate, count]) => <Badge key={gate} tone="neutral"><span className="font-mono">{gate.toUpperCase()} {formatInteger(count)}</span></Badge>)}
            </div>
          </div>
          <div>
            <p className="instrument-label">Analyzer recommendations</p>
            <div className="mt-2 space-y-1.5">
              {recommended.length === 0 && <p className="text-[10px] leading-4 text-accent-red">No classical engine is recommended under the analyzer baseline.</p>}
              {recommended.map(({ id, available }) => (
                <div key={id} className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="font-mono text-lab-muted">{formatEngineName(id)}</span>
                  <span className={available === false ? "text-accent-red" : available === true ? "text-accent-green" : "text-lab-faint"}>{available === false ? "unavailable" : available === true ? "available" : "catalog pending"}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="instrument-label">Evidence and warnings</p>
            <ul className="mt-2 space-y-1 text-[10px] leading-4 text-lab-muted">
              {[...new Set([...analysis.non_clifford_reasons, ...analysis.warnings])].slice(0, 12).map((item) => <li key={item}>• {item}</li>)}
              {analysis.non_clifford_reasons.length === 0 && analysis.warnings.length === 0 && <li className="text-lab-faint">No additional analyzer warnings.</li>}
            </ul>
          </div>
        </div>
      </details>
    </section>
  );
}
