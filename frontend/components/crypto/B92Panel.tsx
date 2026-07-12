import { BitStringViewer } from "@/components/ui/BitStringViewer";
import { QBERMeter } from "@/components/ui/QBERMeter";
import { Callout, Panel, SectionHeader, StatTile } from "@/components/ui/primitives";
import type { B92Result } from "@/lib/labTypes";
import { DistributionBar } from "./DistributionBar";

export function B92Panel({ result }: { result: B92Result }) {
  const rows = Array.from({ length: Math.min(24, result.num_bits) }, (_, index) => index);
  return (
    <Panel className="p-4 sm:p-5">
      <SectionHeader eyebrow="B92 · two-state QKD" title="Conclusive measurement analysis" description="Only outcomes that rule out one non-orthogonal state contribute to the sifted key." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Transmitted" value={result.num_bits} />
        <StatTile label="Conclusive" value={result.conclusive_count} tone="cyan" />
        <StatTile label="Inconclusive" value={result.inconclusive_count} />
        <StatTile label="Sifted errors" value={result.charts_data.sifted_error_count} tone={result.charts_data.sifted_error_count ? "amber" : "green"} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-lab-border bg-lab-surface/45 p-4">
          <p className="instrument-label mb-2">Outcome acceptance</p>
          <DistributionBar label="B92 outcomes" segments={[
            { label: "inconclusive", value: result.inconclusive_count, className: "bg-lab-borderStrong text-lab-text" },
            { label: "conclusive", value: result.conclusive_count, className: "bg-accent-cyan text-lab-bg" },
          ]} />
        </div>
        <div className="rounded-lg border border-lab-border bg-lab-surface/45 p-4"><QBERMeter qber={result.qber} /></div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-lab-border">
        <table className="w-full min-w-[650px] border-collapse text-left text-xs">
          <caption className="sr-only">First B92 transmissions and whether Bob obtained a conclusive measurement</caption>
          <thead className="bg-lab-raised/70 text-lab-faint">
            <tr><th className="px-3 py-2 font-medium">Position</th><th className="px-3 py-2 font-medium">Alice bit</th><th className="px-3 py-2 font-medium">Prepared state</th><th className="px-3 py-2 font-medium">Bob basis</th><th className="px-3 py-2 font-medium">Measurement</th><th className="px-3 py-2 font-medium">Decision</th></tr>
          </thead>
          <tbody>
            {rows.map((index) => <tr key={index} className="border-t border-lab-border text-lab-muted"><td className="px-3 py-2 font-mono">{index}</td><td className="px-3 py-2 font-mono">{result.alice_bits[index]}</td><td className="px-3 py-2 font-mono text-accent-cyan">{result.alice_states[index]}</td><td className="px-3 py-2 font-mono">{result.bob_bases[index]}</td><td className="px-3 py-2 font-mono">{result.bob_measurements[index]}</td><td className={`px-3 py-2 font-medium ${result.conclusive_flags[index] ? "text-accent-green" : "text-lab-faint"}`}>{result.conclusive_flags[index] ? "Keep" : "Discard"}</td></tr>)}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <BitStringViewer bits={result.sifted_key_alice} label="Alice sifted key" limit={128} />
        <BitStringViewer bits={result.sifted_key_bob} label="Bob sifted key" limit={128} />
      </div>
      <div className="mt-4"><Callout tone="info" title="Interpretation">{result.explanation}</Callout></div>
    </Panel>
  );
}
