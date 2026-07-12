import { Button, Badge, Panel } from "@/components/ui/primitives";
import type { CircuitAnalysis } from "@/lib/labTypes";

const riskTone = (risk: CircuitAnalysis["statevector_risk"]): "green" | "amber" | "red" => risk === "safe" ? "green" : risk === "heavy" || risk === "dangerous" ? "amber" : "red";

const feasibilityCopy: Record<CircuitAnalysis["feasibility_status"], string> = {
  clifford_scalable: "Clifford-compatible · stabilizer candidate",
  exact_feasible: "Exact simulation feasible",
  exact_borderline: "Exact simulation is memory-heavy",
  approximation_or_hardware: "Approximation or real hardware recommended",
};

export function FeasibilitySummary({ analysis, onOpenSimulatorLab }: { analysis: CircuitAnalysis; onOpenSimulatorLab: () => void }) {
  return (
    <Panel className="border-accent-cyan/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="instrument-label text-accent-cyan/80">Feasibility snapshot</p>
          <h2 className="mt-1 text-sm font-semibold text-lab-text">{feasibilityCopy[analysis.feasibility_status]}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={analysis.is_clifford ? "green" : "violet"}>{analysis.is_clifford ? "Clifford" : "Non-Clifford"}</Badge>
          <Badge tone={riskTone(analysis.statevector_risk)}>Statevector: {analysis.statevector_risk}</Badge>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-lab-border bg-lab-surface/60 px-3 py-2">
          <p className="instrument-label">Exact statevector</p>
          <p className="mt-1 font-mono text-sm font-semibold text-accent-cyan">{analysis.estimated_statevector_memory_human}</p>
        </div>
        <div className="rounded-lg border border-lab-border bg-lab-surface/60 px-3 py-2">
          <p className="instrument-label">Circuit depth</p>
          <p className="mt-1 font-mono text-sm font-semibold text-lab-text">{analysis.depth}</p>
        </div>
        <div className="rounded-lg border border-lab-border bg-lab-surface/60 px-3 py-2">
          <p className="instrument-label">Recommended engines</p>
          <p className="mt-1 truncate font-mono text-xs font-semibold text-lab-text" title={analysis.recommended_engines.join(", ")}>{analysis.recommended_engines.join(", ") || "No feasible engine"}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-xs leading-5 text-lab-muted">{analysis.warnings[0] ?? "The backend found no additional feasibility warnings."}</p>
        <Button variant="secondary" size="sm" onClick={onOpenSimulatorLab}>Open full analysis</Button>
      </div>
    </Panel>
  );
}
