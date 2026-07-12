import { Badge, EmptyState, Panel, SectionHeader, Spinner, WarningCallout } from "@/components/ui/primitives";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { HistogramPanel } from "@/components/ui/HistogramPanel";

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

export function ResultsPanel({ result, running }: { result: ResultView | null; running: boolean }) {
  const total = result ? Object.values(result.counts).reduce((sum, value) => sum + value, 0) : 0;
  return (
    <Panel className="min-w-0 p-4 sm:p-5">
      <SectionHeader
        eyebrow="Measurement analysis"
        title="Simulation results"
        description="Shot counts, circuit metrics, warnings, and the backend-rendered text diagram."
        right={result ? (
          <div className="flex flex-wrap gap-2">
            {result.selectedEngine && <Badge tone="cyan">{result.selectedEngine}</Badge>}
            <Badge tone="neutral">Depth <b className="ml-1 font-mono text-lab-text">{result.depth}</b></Badge>
            <Badge tone="neutral">Shots <b className="ml-1 font-mono text-lab-text">{total.toLocaleString()}</b></Badge>
            {result.timingMs != null && <Badge tone="neutral"><span className="font-mono">{result.timingMs.toFixed(1)} ms</span></Badge>}
          </div>
        ) : undefined}
      />

      {running ? (
        <Spinner label="Running the validated circuit…" />
      ) : result ? (
        <HistogramPanel counts={result.counts} />
      ) : (
        <EmptyState title="No measurement data yet" description="Run the current circuit to populate outcome counts, depth, engine metadata, and warnings." />
      )}

      {result?.engineReason && <p className="mt-4 rounded-lg border border-lab-border bg-lab-raised/45 px-3 py-2 text-xs leading-5 text-lab-muted">{result.engineReason}</p>}

      {result && (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <div>
            <h3 className="instrument-label mb-2">Gate counts</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(result.gate_counts).length > 0
                ? Object.entries(result.gate_counts).map(([gate, count]) => <Badge key={gate} tone="neutral"><span className="font-mono">{gate.toUpperCase()} · {count}</span></Badge>)
                : <span className="text-xs text-lab-faint">No gates reported.</span>}
            </div>
          </div>
          {result.diagram && (
            <div className="min-w-0">
              <h3 className="instrument-label mb-2">Circuit diagram</h3>
              <CodeBlock content={result.diagram} label="Text diagram" maxHeight="max-h-48" />
            </div>
          )}
        </div>
      )}

      {result?.warnings.map((warning, index) => <div key={`${warning}-${index}`} className="mt-3"><WarningCallout>{warning}</WarningCallout></div>)}
    </Panel>
  );
}
