import { BitStringViewer } from "@/components/ui/BitStringViewer";
import { Badge, Callout, Panel, SectionHeader, StatTile } from "@/components/ui/primitives";
import { formatPercent } from "@/lib/formatting";
import type { QRNGResult } from "@/lib/labTypes";
import { DistributionBar } from "./DistributionBar";

export function QRNGPanel({ result }: { result: QRNGResult }) {
  const sigma = result.charts_data.deviation_sigma;
  const biasTone = sigma < 2 ? "green" : sigma < 3 ? "amber" : "red";
  const biasLabel = sigma < 2 ? "Within 2σ" : sigma < 3 ? "Sample imbalance" : "Unusual sample imbalance";
  return (
    <Panel className="p-4 sm:p-5">
      <SectionHeader eyebrow="QRNG · Hadamard measurement model" title="Randomness sample analysis" description="Compare a finite sample with the ideal 50/50 measurement distribution." right={<Badge tone={biasTone} dot>{biasLabel}</Badge>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Generated bits" value={result.num_bits} />
        <StatTile label="Zeros" value={result.zero_count} />
        <StatTile label="Ones" value={result.one_count} tone="cyan" />
        <StatTile label="Bias distance" value={`${sigma.toFixed(2)}σ`} tone={biasTone} hint="finite-sample diagnostic" />
      </div>

      <div className="mt-4 rounded-lg border border-lab-border bg-lab-surface/45 p-4">
        <p className="instrument-label mb-2">Observed distribution</p>
        <DistributionBar label="QRNG bit distribution" segments={[
          { label: `0 · ${formatPercent(result.frequency_0)}`, value: result.zero_count, className: "bg-lab-borderStrong text-lab-text" },
          { label: `1 · ${formatPercent(result.frequency_1)}`, value: result.one_count, className: "bg-accent-cyan text-lab-bg" },
        ]} />
        <p className="mt-3 text-xs leading-5 text-lab-muted">A balanced quantum process still produces ordinary finite-sample variation. The σ value is descriptive, not an entropy certification.</p>
      </div>

      <div className="mt-4"><BitStringViewer bits={result.generated_bits} label="Generated bit string" limit={512} /></div>
      {result.num_bits > 1024 && <p className="mt-2 text-[11px] text-lab-faint">The API’s display string is truncated above 1,024 bits; this viewer uses the complete returned bit array and shows the first 512 chips.</p>}
      <div className="mt-4"><Callout tone="warning" title="Educational randomness only">{result.explanation}</Callout></div>
    </Panel>
  );
}
