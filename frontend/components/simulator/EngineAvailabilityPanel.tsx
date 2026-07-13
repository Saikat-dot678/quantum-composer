import { formatEngineName } from "@/lib/formatting";
import type { EnginesResponse } from "@/lib/labTypes";
import { RefreshCw, Server } from "lucide-react";
import { Badge, Button } from "../ui/primitives";

interface EngineAvailabilityPanelProps {
  engines: EnginesResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function EngineAvailabilityPanel({ engines, loading, error, onRetry }: EngineAvailabilityPanelProps) {
  return (
    <details className="group border-t border-lab-border bg-lab-bg/45">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-[11px] font-semibold text-lab-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-cyan">
        <span className="flex items-center gap-2">
          <Server className={`h-3.5 w-3.5 ${loading ? "animate-pulse text-accent-amber" : error ? "text-accent-red" : "text-accent-green"}`} />
          Runtime inventory
        </span>
        <span className="flex items-center gap-1.5">
          {loading ? <Badge tone="amber">checking</Badge> : error ? <Badge tone="red">offline</Badge> : engines ? <Badge tone="green">catalog loaded</Badge> : <Badge tone="neutral">unknown</Badge>}
          <span className="font-mono text-[9px] text-lab-faint group-open:hidden">+</span>
          <span className="hidden font-mono text-[9px] text-lab-faint group-open:inline">−</span>
        </span>
      </summary>

      <div className="border-t border-lab-border px-3 py-3">
        {loading && <p role="status" className="text-[10px] leading-4 text-lab-faint">Contacting the backend engine catalog…</p>}
        {!loading && error && (
          <div role="alert">
            <p className="text-[10px] leading-4 text-danger-text">{error}</p>
            <Button size="sm" variant="secondary" onClick={onRetry} className="mt-2"><RefreshCw className="h-3.5 w-3.5" /> Retry</Button>
          </div>
        )}
        {!loading && engines && (
          <>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <Badge tone={engines.aer_available ? "green" : "red"} dot>Aer {engines.aer_available ? "detected" : "missing"}</Badge>
              <Badge tone={engines.stim_available ? "green" : "neutral"} dot>Stim {engines.stim_available ? "detected" : "optional"}</Badge>
            </div>
            <ul className="divide-y divide-lab-border/75" aria-label="Backend simulation engines">
              {engines.engines.map((engine) => (
                <li key={engine.id} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-mono text-[10px] font-semibold text-lab-muted" title={engine.name || formatEngineName(engine.id)}>{engine.name || formatEngineName(engine.id)}</span>
                    <span className={`shrink-0 text-[9px] font-semibold uppercase tracking-wide ${engine.available ? "text-accent-green" : "text-accent-red"}`}>{engine.available ? "ready" : "unavailable"}</span>
                  </div>
                  {!engine.available && engine.unavailable_reason && <p className="mt-1 text-[9px] leading-4 text-danger-text">{engine.unavailable_reason}</p>}
                </li>
              ))}
            </ul>
            <p className="mt-2 border-t border-lab-border pt-2 text-[9px] leading-4 text-lab-faint">Availability means the dependency was detected; it is not a feasibility or performance guarantee.</p>
          </>
        )}
      </div>
    </details>
  );
}
