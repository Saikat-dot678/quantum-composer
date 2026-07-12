import { formatEngineName, formatInteger } from "@/lib/formatting";
import type { CircuitAnalysis, EnginesResponse } from "@/lib/labTypes";
import { CliffordBadge, FeasibilityBadge, RiskBadge } from "../ui/FeasibilityBadge";
import { ResourceEstimateCard } from "../ui/ResourceEstimateCard";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Panel,
  SectionHeader,
  Spinner,
  StatTile,
  WarningCallout,
} from "../ui/primitives";

interface CircuitAnalysisPanelProps {
  analysis: CircuitAnalysis | null;
  loading: boolean;
  error: string | null;
  engines: EnginesResponse | null;
  runMemoryMb: number;
  onRetry: () => void;
}

export function CircuitAnalysisPanel({
  analysis,
  loading,
  error,
  engines,
  runMemoryMb,
  onRetry,
}: CircuitAnalysisPanelProps) {
  if (loading) {
    return (
      <Panel className="p-5">
        <SectionHeader
          eyebrow="Feasibility analysis"
          title="Inspecting circuit structure"
          description="Counting operations, classifying Clifford compatibility, and estimating exact-memory cost."
        />
        <Spinner label="Analyzing the active circuit" />
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel className="p-5">
        <SectionHeader eyebrow="Feasibility analysis" title="Analysis unavailable" />
        <ErrorState
          title="Could not analyze this circuit"
          message={error}
          action={<Button size="sm" variant="secondary" onClick={onRetry}>Retry analysis</Button>}
        />
      </Panel>
    );
  }

  if (!analysis) {
    return (
      <Panel className="p-5">
        <SectionHeader eyebrow="Feasibility analysis" title="Circuit analysis" />
        <EmptyState
          title="No feasibility report yet"
          description="Load a circuit or request analysis to see engine recommendations and exact-memory estimates."
          action={<Button size="sm" variant="secondary" onClick={onRetry}>Analyze circuit</Button>}
        />
      </Panel>
    );
  }

  const recommended = analysis.recommended_engines.map((engineId) => ({
    id: engineId,
    info: engines?.engines.find((entry) => entry.id === engineId),
  }));
  const mpsCandidate = analysis.recommended_engines.includes("aer_mps");
  const hardwareCandidate = analysis.feasibility_status === "approximation_or_hardware";
  const uniqueReasons = [...new Set(analysis.non_clifford_reasons)].slice(0, 8);
  const gateCounts = Object.entries(analysis.gate_counts).sort((a, b) => b[1] - a[1]);

  return (
    <Panel className="p-5">
      <SectionHeader
        eyebrow="Feasibility analysis"
        title="Circuit viability"
        description={
          <>
            Structural analysis uses a fixed <span className="font-mono text-lab-text">{formatInteger(analysis.resource_estimate.max_memory_mb)} MB</span> baseline.
            Your configured run budget is <span className="font-mono text-accent-cyan">{formatInteger(runMemoryMb)} MB</span>.
          </>
        }
        right={
          <div className="flex flex-wrap items-center gap-2">
            <FeasibilityBadge status={analysis.feasibility_status} />
            <CliffordBadge isClifford={analysis.is_clifford} />
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2" aria-label="Circuit method candidates">
        <RiskBadge risk={analysis.statevector_risk} prefix="Statevector" />
        <RiskBadge risk={analysis.density_matrix_risk} prefix="Density" />
        {analysis.is_clifford && <Badge tone="green">Stabilizer candidate</Badge>}
        {mpsCandidate && <Badge tone="amber">MPS candidate</Badge>}
        {hardwareCandidate && <Badge tone="red">Real hardware candidate</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Qubits" value={formatInteger(analysis.num_qubits)} />
        <StatTile label="Classical bits" value={formatInteger(analysis.num_clbits)} />
        <StatTile label="Depth estimate" value={formatInteger(analysis.depth)} />
        <StatTile label="Operations" value={formatInteger(analysis.operation_count)} />
        <StatTile label="Two-qubit gates" value={formatInteger(analysis.two_qubit_gate_count)} />
        <StatTile label="Measurements" value={formatInteger(analysis.measurement_count)} />
        <StatTile label="T count" value={formatInteger(analysis.t_count)} tone={analysis.t_count > 0 ? "violet" : "slate"} />
        <StatTile label="Rotations" value={formatInteger(analysis.rotation_count)} tone={analysis.rotation_count > 0 ? "violet" : "slate"} />
      </div>

      <div className="mt-4">
        <ResourceEstimateCard analysis={analysis} />
        <p className="mt-2 text-[11px] leading-4 text-lab-faint">
          Analyzer classifications above use the 1,024 MB endpoint baseline. The run response below recalculates resource risk against the selected run budget.
        </p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-lab-border bg-lab-raised/35 p-4">
          <p className="instrument-label">Recommended engines</p>
          {recommended.length === 0 ? (
            <p className="mt-2 text-xs leading-5 text-accent-red">No engine is recommended under the analyzer baseline. Review the warnings and consider fewer qubits, a structured circuit, MPS where appropriate, or external real hardware.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {recommended.map(({ id, info }) => (
                <div key={id} className="flex items-center justify-between gap-3 rounded-md border border-lab-border bg-lab-bg/55 px-3 py-2">
                  <span className="min-w-0 truncate font-mono text-[11px] font-semibold text-lab-text" title={id}>
                    {formatEngineName(id)}
                  </span>
                  {!engines ? (
                    <Badge tone="neutral">availability unknown</Badge>
                  ) : info?.available ? (
                    <Badge tone="green" dot>available</Badge>
                  ) : (
                    <Badge tone="red" title={info?.unavailable_reason ?? "Not listed by backend"}>unavailable</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] leading-4 text-lab-faint">
            Recommendations describe method fit. Availability is cross-checked separately against the live backend engine catalog.
          </p>
        </div>

        <div className="rounded-lg border border-lab-border bg-lab-raised/35 p-4">
          <p className="instrument-label">Gate profile</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {gateCounts.length === 0 && <Badge tone="neutral">empty circuit</Badge>}
            {gateCounts.map(([gate, count]) => (
              <span key={gate} className="rounded-md border border-lab-border bg-lab-bg px-2 py-1 font-mono text-[11px] text-lab-muted">
                {gate.toUpperCase()} <span className="text-lab-text">{formatInteger(count)}</span>
              </span>
            ))}
          </div>
          {uniqueReasons.length > 0 && (
            <div className="mt-3 border-t border-lab-border pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-quantum-400">Non-Clifford evidence</p>
              <ul className="mt-1.5 space-y-1 text-[11px] leading-4 text-lab-muted">
                {uniqueReasons.map((reason) => <li key={reason}>• {reason}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>

      {analysis.warnings.length > 0 && (
        <div className="mt-4 space-y-2">
          {analysis.warnings.map((warning) => <WarningCallout key={warning}>{warning}</WarningCallout>)}
        </div>
      )}
    </Panel>
  );
}
