import type { CircuitAnalysis } from "@/lib/labTypes";
import { RiskBadge } from "./FeasibilityBadge";

// Two compact cards showing exact-simulation memory cost and its risk, with the
// governing formula so the exponential scaling is explicit and honest.
export function ResourceEstimateCard({ analysis }: { analysis: CircuitAnalysis }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-lab-border bg-lab-raised/40 px-4 py-3">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wider text-lab-faint">Statevector memory (exact)</p>
          <RiskBadge risk={analysis.statevector_risk} subject="Statevector memory" />
        </div>
        <p className="font-mono text-base font-semibold text-accent-cyan">{analysis.estimated_statevector_memory_human}</p>
        <p className="mt-1 font-mono text-[11px] text-lab-faint">16 · 2^{analysis.num_qubits} bytes</p>
      </div>
      <div className="rounded-xl border border-lab-border bg-lab-raised/40 px-4 py-3">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wider text-lab-faint">Density-matrix memory (noisy)</p>
          <RiskBadge risk={analysis.density_matrix_risk} subject="Density-matrix memory" />
        </div>
        <p className="font-mono text-base font-semibold text-lab-text">{analysis.estimated_density_matrix_memory_human}</p>
        <p className="mt-1 font-mono text-[11px] text-lab-faint">16 · 4^{analysis.num_qubits} bytes</p>
      </div>
    </div>
  );
}
