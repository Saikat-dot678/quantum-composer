import { CodeBlock } from "./ui/CodeBlock";
import { HistogramPanel } from "./ui/HistogramPanel";
import { Badge, Panel, SectionHeader, Spinner, WarningCallout } from "./ui/primitives";

export interface ResultView {
  counts: Record<string, number>;
  depth: number;
  gate_counts: Record<string, number>;
  diagram?: string | null;
  warnings: string[];
  selectedEngine?: string;
  engineReason?: string;
  timingMs?: number;
}

interface Props {
  result: ResultView | null;
  running: boolean;
}

export function ResultsPanel({ result, running }: Props) {
  const total = result ? Object.values(result.counts).reduce((sum, v) => sum + v, 0) : 0;
  return (
    <Panel className="p-5">
      <SectionHeader
        eyebrow="Local simulator"
        title="Measurement results"
        right={
          <div className="flex flex-wrap gap-2">
            {result?.selectedEngine && <Badge tone="cyan">{result.selectedEngine}</Badge>}
            <span className="rounded-lg bg-lab-raised px-3 py-1.5 text-xs text-lab-muted">
              Depth <b className="ml-1 text-lab-text">{result?.depth ?? "—"}</b>
            </span>
            <span className="rounded-lg bg-lab-raised px-3 py-1.5 text-xs text-lab-muted">
              Shots <b className="ml-1 text-lab-text">{total || "—"}</b>
            </span>
            {result?.timingMs != null && (
              <span className="rounded-lg bg-lab-raised px-3 py-1.5 text-xs text-lab-muted">{result.timingMs.toFixed(1)} ms</span>
            )}
          </div>
        }
      />

      {running ? (
        <Spinner label="Running on local Qiskit…" />
      ) : result ? (
        <HistogramPanel counts={result.counts} />
      ) : (
        <div className="flex h-40 items-center justify-center text-sm text-lab-faint">Run a circuit to see outcome probabilities.</div>
      )}

      {result?.engineReason && (
        <p className="mt-4 rounded-lg border border-lab-border bg-lab-raised/40 px-3 py-2 text-[12px] leading-5 text-lab-muted">{result.engineReason}</p>
      )}

      {result && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-lab-faint">Gate counts</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(result.gate_counts).map(([gate, count]) => (
                <span key={gate} className="rounded-full border border-lab-border bg-lab-raised/60 px-3 py-1 font-mono text-xs text-lab-muted">
                  {gate.toUpperCase()} · {count}
                </span>
              ))}
            </div>
          </div>
          {result.diagram && (
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-lab-faint">Circuit diagram</h3>
              <CodeBlock content={result.diagram} label="text diagram" maxHeight="max-h-44" />
            </div>
          )}
        </div>
      )}

      {result?.warnings.map((warning) => (
        <div key={warning} className="mt-3">
          <WarningCallout>{warning}</WarningCallout>
        </div>
      ))}
    </Panel>
  );
}
