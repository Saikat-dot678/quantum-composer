import type { SimulationV2Response } from "@/lib/labTypes";
import { Badge } from "./primitives";

// Answers "which engine ran, and why?" after a v2 simulation.
export function EngineReasonPanel({ result }: { result: SimulationV2Response }) {
  const meta = result.metadata ?? {};
  return (
    <div className="rounded-xl border border-lab-border bg-lab-raised/40 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-lab-bg px-2.5 py-1 font-mono text-[11px] font-semibold text-accent-cyan ring-1 ring-accent-cyan/30">
          {result.selected_engine}
        </span>
        {meta.auto_selected ? <Badge tone="cyan">auto-selected</Badge> : <Badge tone="neutral">manual</Badge>}
        {typeof meta.approximate === "boolean" && meta.approximate && <Badge tone="amber">approximate</Badge>}
        <span className="ml-auto rounded-md bg-lab-bg px-2 py-1 text-[11px] text-lab-muted">{result.timing_ms.toFixed(1)} ms</span>
      </div>
      <p className="text-[12px] leading-5 text-lab-muted">{result.engine_reason}</p>
    </div>
  );
}
