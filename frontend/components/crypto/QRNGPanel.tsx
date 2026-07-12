import { BitStringViewer } from "@/components/ui/BitStringViewer";
import { Badge, Callout } from "@/components/ui/primitives";
import { formatPercent } from "@/lib/formatting";
import type { QRNGResult } from "@/lib/labTypes";
import styles from "./cryptoLab.module.css";
import { DistributionBar } from "./DistributionBar";

function ProcessNode({ label, value, detail, tone = "cyan" }: { label: string; value: string; detail: string; tone?: "cyan" | "violet" | "green" }) {
  const color = tone === "violet" ? "border-quantum-400/40 bg-quantum-400/[.06] text-quantum-400" : tone === "green" ? "border-accent-green/40 bg-accent-green/[.055] text-accent-green" : "border-accent-cyan/40 bg-accent-cyan/[.06] text-accent-cyan";
  return <div className={`flex min-h-[96px] min-w-[145px] flex-col justify-between rounded-xl border p-3 ${color}`}><p className="instrument-label">{label}</p><div><p className="font-mono text-xl font-semibold">{value}</p><p className="mt-0.5 text-[10px] leading-4 text-lab-muted">{detail}</p></div></div>;
}

export function QRNGPanel({ result }: { result: QRNGResult }) {
  const sigma = result.charts_data.deviation_sigma;
  const biasTone = sigma < 2 ? "green" : sigma < 3 ? "amber" : "red";
  const biasLabel = sigma < 2 ? "ordinary sample variation" : sigma < 3 ? "noticeable sample imbalance" : "unusual sample imbalance";
  const signedBias = result.frequency_1 - 0.5;
  const previewBits = result.generated_bits.slice(0, 64);
  const previewOnes = previewBits.reduce((sum, bit) => sum + bit, 0);

  return (
    <div>
      <div className="grid grid-cols-2 divide-x divide-y divide-lab-border border-b border-lab-border sm:grid-cols-4 sm:divide-y-0">
        <div className="px-4 py-3"><p className="instrument-label">Generated bits</p><p className="mt-1 font-mono text-base font-semibold text-lab-text">{result.num_bits.toLocaleString()}</p></div>
        <div className="px-4 py-3"><p className="instrument-label">Zeros</p><p className="mt-1 font-mono text-base font-semibold text-lab-muted">{result.zero_count.toLocaleString()}</p><p className="mt-0.5 text-[9px] text-lab-faint">{formatPercent(result.frequency_0)}</p></div>
        <div className="px-4 py-3"><p className="instrument-label">Ones</p><p className="mt-1 font-mono text-base font-semibold text-accent-cyan">{result.one_count.toLocaleString()}</p><p className="mt-0.5 text-[9px] text-lab-faint">{formatPercent(result.frequency_1)}</p></div>
        <div className="px-4 py-3"><p className="instrument-label">Bias distance</p><p className={`mt-1 font-mono text-base font-semibold ${biasTone === "green" ? "text-accent-green" : biasTone === "amber" ? "text-accent-amber" : "text-accent-red"}`}>{sigma.toFixed(2)}σ</p><p className="mt-0.5 text-[9px] text-lab-faint">finite-sample diagnostic</p></div>
      </div>

      <section className={`border-b border-lab-border p-4 sm:p-5 ${styles.stageGrid}`} aria-labelledby="qrng-process-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="instrument-label">Measurement pipeline</p><h3 id="qrng-process-title" className="mt-1 font-display text-base font-semibold text-lab-text">Idealized one-qubit sampling loop</h3></div>
          <Badge tone={biasTone} dot>{biasLabel}</Badge>
        </div>
        <div className="mt-5 overflow-x-auto pb-2 [scrollbar-width:thin]">
          <div className="flex min-w-max items-center">
            <ProcessNode label="Initialize" value="|0⟩" detail="known basis state" />
            <div className="mx-3 w-14 sm:w-24" aria-hidden="true"><div className={styles.signalTrack} /></div>
            <ProcessNode label="Superpose" value="H" detail="(|0⟩ + |1⟩) / √2" tone="violet" />
            <div className="mx-3 w-14 sm:w-24" aria-hidden="true"><div className={styles.signalTrack} /></div>
            <ProcessNode label="Measure" value="Z" detail="sample classical 0 or 1" tone="green" />
            <div className="mx-3 w-14 sm:w-24" aria-hidden="true"><div className={styles.signalTrack} /></div>
            <ProcessNode label="Record" value={result.generated_bits[0]?.toString() ?? "—"} detail={`repeat ${result.num_bits.toLocaleString()} times`} />
          </div>
        </div>
        <div className={`mt-4 overflow-hidden rounded-lg border border-lab-border bg-lab-panel/75 px-3 py-3 ${styles.streamMask}`}>
          <p className="sr-only">First {previewBits.length} generated bits, with {previewOnes} ones</p>
          <div className="flex min-w-max gap-1" aria-hidden="true">{previewBits.map((bit, index) => <span key={index} className={`grid h-6 w-6 place-items-center rounded-sm border font-mono text-[10px] ${bit ? "border-accent-cyan/35 bg-accent-cyan/[.1] text-accent-cyan" : "border-lab-borderStrong bg-lab-raised text-lab-muted"}`}>{bit}</span>)}</div>
        </div>
      </section>

      <section className="grid border-b border-lab-border xl:grid-cols-[minmax(0,1fr)_minmax(300px,.8fr)]" aria-labelledby="qrng-distribution-title">
        <div className="p-4 sm:p-5 xl:border-r xl:border-lab-border">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="instrument-label">Observed distribution</p><h3 id="qrng-distribution-title" className="mt-1 font-display text-sm font-semibold text-lab-text">Zero / one balance</h3></div>
            <span className="text-[9px] text-lab-faint">ideal reference · 50% each</span>
          </div>
          <div className="mt-4"><DistributionBar label="QRNG bit distribution" idealPercent={50} segments={[
            { label: `0 · ${formatPercent(result.frequency_0)}`, value: result.zero_count, className: "bg-lab-borderStrong text-lab-text" },
            { label: `1 · ${formatPercent(result.frequency_1)}`, value: result.one_count, className: "bg-accent-cyan text-[#031014]" },
          ]} /></div>

          <div className="relative mt-6 h-36 border-b border-lab-borderStrong" role="img" aria-label={`Column chart: zero frequency ${formatPercent(result.frequency_0)}, one frequency ${formatPercent(result.frequency_1)}, ideal frequency 50 percent`}>
            <span className="absolute inset-x-0 border-t border-dashed border-accent-amber/45" style={{ bottom: "50%" }}><span className="absolute -top-4 right-0 text-[8px] text-accent-amber">ideal 50%</span></span>
            <div className="absolute inset-0 flex items-end justify-center gap-8 px-10">
              <div className="flex h-full w-20 flex-col justify-end"><span className={`block w-full rounded-t-md border border-lab-borderStrong bg-lab-borderStrong/70 ${styles.transitionWidth}`} style={{ height: `${result.frequency_0 * 100}%` }} /><span className="absolute -bottom-5 w-20 text-center font-mono text-[10px] text-lab-muted">0</span></div>
              <div className="flex h-full w-20 flex-col justify-end"><span className={`block w-full rounded-t-md border border-accent-cyan/40 bg-accent-cyan/65 ${styles.transitionWidth}`} style={{ height: `${result.frequency_1 * 100}%` }} /><span className="absolute -bottom-5 w-20 text-center font-mono text-[10px] text-accent-cyan">1</span></div>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center p-4 sm:p-5">
          <p className="instrument-label">Bias audit</p>
          <div className="mt-2 flex items-end justify-between gap-3"><p className="font-mono text-2xl font-semibold text-lab-text">{signedBias >= 0 ? "+" : ""}{(signedBias * 100).toFixed(2)} pp</p><Badge tone={biasTone}>{sigma.toFixed(2)}σ from balance</Badge></div>
          <div className="relative mt-5 h-3 rounded-full bg-gradient-to-r from-lab-borderStrong via-accent-green/30 to-accent-cyan/55" role="meter" aria-label={`Observed one frequency ${formatPercent(result.frequency_1)}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(result.frequency_1 * 100)}>
            <span className="absolute -inset-y-1 left-1/2 w-px bg-accent-green" title="Ideal 50 percent" />
            <span className={`absolute -top-1.5 h-6 w-1 -translate-x-1/2 rounded-full bg-lab-text shadow-glow ${styles.transitionWidth}`} style={{ left: `${result.frequency_1 * 100}%` }} />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[8px] text-lab-faint"><span>all zeros</span><span>balanced</span><span>all ones</span></div>
          <p className="mt-4 text-[10px] leading-4 text-lab-muted">Finite samples rarely land at exactly 50/50. The σ distance describes this sample only; it is not a randomness test suite, min-entropy bound, or certification.</p>
        </div>
      </section>

      <div className="border-b border-lab-border p-4 sm:p-5">
        <BitStringViewer bits={result.generated_bits} label="Generated bitstring" limit={512} />
        {result.num_bits > 512 && <p className="mt-2 text-[10px] text-lab-faint">Showing the first 512 bit chips. Counts and frequencies use all {result.num_bits.toLocaleString()} returned bits.</p>}
      </div>

      <div className="p-4 sm:p-5"><Callout tone="warning" title="Educational randomness only">{result.explanation} Do not use this output for keys, tokens, seeds, or any security-sensitive purpose.</Callout></div>
    </div>
  );
}
