import { formatEngineName, formatInteger } from "@/lib/formatting";
import type { SimulationV2Response } from "@/lib/labTypes";
import { HistogramPanel } from "../ui/HistogramPanel";
import { RiskBadge } from "../ui/FeasibilityBadge";
import {
  Badge,
  Button,
  CopyButton,
  EmptyState,
  ErrorState,
  Panel,
  SectionHeader,
  Spinner,
  StatTile,
  WarningCallout,
} from "../ui/primitives";

interface SimulationResultPanelProps {
  result: SimulationV2Response | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function SimulationResultPanel({ result, loading, error, onRetry }: SimulationResultPanelProps) {
  if (loading) {
    return (
      <Panel className="p-5">
        <SectionHeader
          eyebrow="Engine output"
          title="Simulation in progress"
          description="The backend is executing the selected classical simulation method."
        />
        <Spinner label="Running simulation" />
        <p className="text-center text-[10px] leading-4 text-lab-faint">
          Large MPS or high-shot workloads can take significantly longer. This UI does not imply a hardware quantum job.
        </p>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel className="p-5">
        <SectionHeader eyebrow="Engine output" title="Simulation rejected or failed" />
        <ErrorState
          title="The requested run did not complete"
          message={error}
          action={<Button size="sm" variant="secondary" onClick={onRetry}>Retry with current options</Button>}
        />
      </Panel>
    );
  }

  if (!result) {
    return (
      <Panel className="p-5">
        <SectionHeader
          eyebrow="Engine output"
          title="Simulation result"
          description="Run only after reviewing the feasibility report and selected method."
        />
        <EmptyState
          title="No execution result"
          description="The circuit has been analyzed, but no simulation has run with the current source and options."
          action={<Button size="sm" variant="primary" onClick={onRetry}>Run simulation</Button>}
        />
      </Panel>
    );
  }

  const shotCount = Object.values(result.counts).reduce((total, count) => total + count, 0);
  const gateTotal = Object.values(result.gate_counts).reduce((total, count) => total + count, 0);
  const metadataText = JSON.stringify(result.metadata, null, 2);
  const autoSelected = result.metadata.auto_selected === true;
  const approximate = result.metadata.approximate === true;
  const requestedEngine = typeof result.metadata.requested_engine === "string" ? result.metadata.requested_engine : null;

  return (
    <Panel className="p-5">
      <SectionHeader
        eyebrow="Engine output"
        title="Simulation result"
        description="Measurement counts and run diagnostics returned by the V2 classical simulator router."
        right={
          <div className="flex flex-wrap gap-2">
            <Badge tone="cyan">{formatEngineName(result.selected_engine)}</Badge>
            <Badge tone={autoSelected ? "cyan" : "neutral"}>{autoSelected ? "auto-selected" : "manual engine"}</Badge>
            {approximate && <Badge tone="amber">approximation-capable MPS</Badge>}
          </div>
        }
      />

      <div className="rounded-lg border border-accent-cyan/25 bg-accent-cyan/[.045] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold text-accent-cyan">{result.selected_engine}</span>
          {requestedEngine && requestedEngine !== result.selected_engine && (
            <span className="text-[10px] text-lab-faint">requested {requestedEngine}</span>
          )}
        </div>
        <p className="mt-2 text-xs leading-5 text-lab-muted">{result.engine_reason}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Shots returned" value={formatInteger(shotCount)} />
        <StatTile label="Distinct outcomes" value={formatInteger(Object.keys(result.counts).length)} />
        <StatTile label="Depth estimate" value={formatInteger(result.depth)} />
        <StatTile label="Input gates" value={formatInteger(gateTotal)} />
        <StatTile
          label="Engine execution"
          value={`${result.timing_ms.toFixed(1)} ms`}
          tone="cyan"
          hint="Excludes request transport and analysis."
        />
      </div>

      <div className="mt-5 rounded-lg border border-lab-border bg-lab-raised/30 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="instrument-label">Measurement distribution</p>
            <p className="mt-1 text-xs text-lab-muted">Top outcomes sorted by measured frequency.</p>
          </div>
          <Badge tone="neutral">{formatInteger(shotCount)} samples</Badge>
        </div>
        <HistogramPanel counts={result.counts} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-lab-border bg-lab-raised/35 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="instrument-label">Run resource estimate</p>
              <p className="mt-1 text-[11px] text-lab-faint">Evaluated against the configured simulate-v2 budget.</p>
            </div>
            <RiskBadge risk={result.resource_estimate.risk_label} prefix="Statevector" />
          </div>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-3 border-b border-lab-border pb-2">
              <dt className="text-lab-muted">Budget</dt>
              <dd className="font-mono font-semibold text-accent-cyan">{formatInteger(result.resource_estimate.max_memory_mb)} MB</dd>
            </div>
            <div className="flex items-start justify-between gap-3 border-b border-lab-border pb-2">
              <dt className="text-lab-muted">Exact statevector</dt>
              <dd className="text-right font-mono font-semibold text-lab-text">{result.resource_estimate.statevector_memory_human}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-lab-muted">Density matrix</dt>
              <dd className="text-right font-mono font-semibold text-lab-text">{result.resource_estimate.density_matrix_memory_human}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-lab-border bg-lab-raised/35 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="instrument-label">Run metadata</p>
              <p className="mt-1 text-[11px] text-lab-faint">Router and engine diagnostics.</p>
            </div>
            <CopyButton text={metadataText} label="Copy metadata" />
          </div>
          <pre className="mt-3 max-h-44 overflow-auto rounded-md border border-lab-border bg-lab-bg p-3 font-mono text-[10px] leading-4 text-lab-muted">
            {metadataText}
          </pre>
        </div>
      </div>

      {result.warnings.length > 0 && (
        <div className="mt-4 space-y-2">
          {result.warnings.map((warning) => <WarningCallout key={warning}>{warning}</WarningCallout>)}
        </div>
      )}

      <div className="mt-4 rounded-lg border border-lab-border bg-lab-raised/30 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="instrument-label">Circuit diagram</p>
            <p className="mt-1 text-[11px] text-lab-faint">Text rendering is returned only for circuits up to 12 qubits and 80 operations.</p>
          </div>
          <Badge tone={result.diagram ? "green" : "neutral"}>{result.diagram ? "available" : "omitted at this scale"}</Badge>
        </div>
        {result.diagram ? (
          <pre className="max-h-64 overflow-auto rounded-md border border-lab-border bg-lab-bg p-3 font-mono text-[10px] leading-4 text-slate-300">
            {result.diagram}
          </pre>
        ) : (
          <p className="rounded-md border border-dashed border-lab-borderStrong px-4 py-5 text-center text-xs leading-5 text-lab-faint">
            Diagram generation was skipped to keep a large workload readable and responsive. The operation and gate summaries remain available above.
          </p>
        )}
      </div>

      {result.resource_estimate.notes.length > 0 && (
        <details className="mt-4 rounded-lg border border-lab-border bg-lab-raised/25 px-4 py-3">
          <summary className="cursor-pointer text-xs font-semibold text-lab-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan">
            Resource-estimator notes
          </summary>
          <ul className="mt-3 space-y-1.5 text-[11px] leading-4 text-lab-faint">
            {result.resource_estimate.notes.map((note) => <li key={note}>• {note}</li>)}
          </ul>
        </details>
      )}
    </Panel>
  );
}
