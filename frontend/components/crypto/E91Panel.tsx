import { BitStringViewer } from "@/components/ui/BitStringViewer";
import { QBERMeter } from "@/components/ui/QBERMeter";
import { Badge, Callout, Panel, SectionHeader, StatTile } from "@/components/ui/primitives";
import type { E91Result } from "@/lib/labTypes";

export function E91Panel({ result }: { result: E91Result }) {
  const classical = result.charts_data.chsh_classical_bound;
  const quantum = result.charts_data.chsh_quantum_bound;
  const position = Math.min(100, (result.chsh_s / quantum) * 100);
  const boundPosition = (classical / quantum) * 100;
  return (
    <Panel className="p-4 sm:p-5">
      <SectionHeader
        eyebrow="E91 · entanglement based"
        title="Correlation and CHSH analysis"
        description="Matched settings contribute key bits; the other settings estimate a finite-sample Bell-correlation indicator."
        right={<Badge tone={result.chsh_violation ? "green" : "amber"} dot>{result.chsh_violation ? "Sample above classical bound" : "No sampled violation"}</Badge>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Entangled pairs" value={result.num_pairs} />
        <StatTile label="CHSH |S|" value={result.chsh_s.toFixed(3)} tone={result.chsh_violation ? "green" : "amber"} />
        <StatTile label="Sifted key" value={result.sifted_key_length} tone="cyan" />
        <StatTile label="Eve model" value={result.eve_enabled ? "enabled" : "disabled"} tone={result.eve_enabled ? "amber" : "slate"} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-lab-border bg-lab-surface/45 p-4">
          <p className="instrument-label">CHSH scale · 0 to quantum bound</p>
          <div className="relative mt-3 h-5 overflow-hidden rounded-md bg-lab-raised" role="meter" aria-label={`CHSH absolute S ${result.chsh_s.toFixed(3)}, classical bound ${classical.toFixed(3)}`} aria-valuemin={0} aria-valuemax={quantum} aria-valuenow={result.chsh_s}>
            <div className="absolute inset-y-0 left-0 bg-accent-amber/15" style={{ width: `${boundPosition}%` }} />
            <div className="absolute inset-y-0 right-0 bg-accent-green/12" style={{ left: `${boundPosition}%` }} />
            <div className="absolute inset-y-0 w-px bg-lab-text/70" style={{ left: `${boundPosition}%` }} title={`Classical bound ${classical}`} />
            <div className="absolute inset-y-0 w-1 -translate-x-1/2 bg-accent-cyan shadow-glow" style={{ left: `${position}%` }} title={`Sample ${result.chsh_s.toFixed(3)}`} />
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-lab-faint"><span>0</span><span>classical {classical.toFixed(2)}</span><span>quantum {quantum.toFixed(2)}</span></div>
          <p className="mt-3 text-xs leading-5 text-lab-muted">This is a simulated finite-sample indicator, not device-independent certification of a physical source.</p>
        </div>
        <div className="rounded-lg border border-lab-border bg-lab-surface/45 p-4"><QBERMeter qber={result.qber} /></div>
      </div>

      <div className="mt-4">
        <p className="instrument-label mb-2">Measured setting correlations</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(result.correlations).map(([setting, correlation]) => (
            <div key={setting} className="flex items-center justify-between rounded-md border border-lab-border bg-lab-raised/35 px-3 py-2">
              <span className="font-mono text-[11px] text-lab-faint">{setting}</span>
              <span className="font-mono text-xs font-semibold text-lab-text">{correlation.toFixed(3)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <BitStringViewer bits={result.sifted_key_alice} label="Alice sifted key" limit={128} />
        <BitStringViewer bits={result.sifted_key_bob} label="Bob sifted key" limit={128} />
      </div>
      <div className="mt-4"><Callout tone="info" title="Interpretation">{result.explanation}</Callout></div>
    </Panel>
  );
}
