import { BitStringViewer } from "@/components/ui/BitStringViewer";
import { AlertTriangle } from "lucide-react";
import { Badge, Callout } from "@/components/ui/primitives";
import { formatPercent } from "@/lib/formatting";
import type { E91Result } from "@/lib/labTypes";
import styles from "./cryptoLab.module.css";

function choiceCounts(choices: number[], length: number): number[] {
  return Array.from({ length }, (_, choice) => choices.reduce((count, value) => count + (value === choice ? 1 : 0), 0));
}

function Analyzer({ actor, angles, counts, tone }: { actor: string; angles: number[]; counts: number[]; tone: "cyan" | "green" }) {
  const max = Math.max(1, ...counts);
  return (
    <div className={`rounded-xl border p-4 ${tone === "cyan" ? "border-accent-cyan/35 bg-accent-cyan/[.055]" : "border-accent-green/35 bg-accent-green/[.05]"}`}>
      <div className="flex items-center justify-between gap-3">
        <div><p className="instrument-label">{actor}</p><p className="mt-1 text-sm font-semibold text-lab-text">Analyzer settings</p></div>
        <span className={`grid h-9 w-9 place-items-center rounded-full border font-mono text-xs ${tone === "cyan" ? "border-accent-cyan/40 text-accent-cyan" : "border-accent-green/40 text-accent-green"}`}>θ</span>
      </div>
      <div className="mt-4 space-y-2">
        {angles.map((angle, index) => (
          <div key={angle} className="grid grid-cols-[34px_minmax(0,1fr)_34px] items-center gap-2">
            <span className="font-mono text-[10px] text-lab-muted">{angle}°</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-lab-bg" aria-hidden="true"><span className={`block h-full rounded-full ${tone === "cyan" ? "bg-accent-cyan/75" : "bg-accent-green/75"}`} style={{ width: `${(counts[index] / max) * 100}%` }} /></span>
            <span className="text-right font-mono text-[9px] text-lab-faint">{counts[index]}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[9px] leading-3 text-lab-faint">Choice counts use the first {counts.reduce((sum, value) => sum + value, 0).toLocaleString()} returned pair settings.</p>
    </div>
  );
}

export function E91Panel({ result }: { result: E91Result }) {
  const classical = result.charts_data.chsh_classical_bound;
  const quantum = result.charts_data.chsh_quantum_bound;
  const samplePosition = Math.max(0, Math.min(100, (result.chsh_s / quantum) * 100));
  const classicalPosition = (classical / quantum) * 100;
  const aliceCounts = choiceCounts(result.alice_choices, result.alice_angles_deg.length);
  const bobCounts = choiceCounts(result.bob_choices, result.bob_angles_deg.length);
  const pairSample = Array.from({ length: Math.min(18, result.alice_choices.length, result.bob_choices.length) }, (_, index) => {
    const aliceChoice = result.alice_choices[index];
    const bobChoice = result.bob_choices[index];
    const kept = (aliceChoice === 1 && bobChoice === 0) || (aliceChoice === 2 && bobChoice === 1);
    return { index, aliceAngle: result.alice_angles_deg[aliceChoice], bobAngle: result.bob_angles_deg[bobChoice], kept };
  });

  return (
    <div>
      <div className="grid grid-cols-2 divide-x divide-y divide-lab-border border-b border-lab-border sm:grid-cols-4 sm:divide-y-0">
        <div className="px-4 py-3"><p className="instrument-label">Entangled pairs</p><p className="mt-1 font-mono text-base font-semibold text-lab-text">{result.num_pairs.toLocaleString()}</p></div>
        <div className="px-4 py-3"><p className="instrument-label">CHSH |S|</p><p className={`mt-1 font-mono text-base font-semibold ${result.chsh_violation ? "text-accent-green" : "text-accent-amber"}`}>{result.chsh_s.toFixed(3)}</p></div>
        <div className="px-4 py-3"><p className="instrument-label">Sifted positions</p><p className="mt-1 font-mono text-base font-semibold text-accent-cyan">{result.sifted_key_length.toLocaleString()}</p></div>
        <div className="px-4 py-3"><p className="instrument-label">Key QBER</p><p className={`mt-1 font-mono text-base font-semibold ${result.qber > 0.11 ? "text-accent-red" : "text-accent-green"}`}>{formatPercent(result.qber)}</p></div>
      </div>

      <section className={`border-b border-lab-border p-4 sm:p-5 ${styles.stageGrid}`} aria-labelledby="e91-pair-path">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="instrument-label">Entangled-pair routing</p><h3 id="e91-pair-path" className="mt-1 font-display text-base font-semibold text-lab-text">Independent analyzer choices</h3></div>
          <div className="flex gap-2"><Badge tone={result.eve_enabled ? "red" : "green"} dot>{result.eve_enabled ? "intercept–resend active" : "singlet model intact"}</Badge><Badge tone="neutral">{formatPercent(result.channel_error_rate)} channel error</Badge></div>
        </div>

        <div className="mt-4 grid items-center gap-3 lg:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)]">
          <Analyzer actor="Alice" angles={result.alice_angles_deg} counts={aliceCounts} tone="cyan" />
          <div className="relative flex min-h-[126px] flex-col items-center justify-center overflow-hidden rounded-xl border border-quantum-400/35 bg-quantum-400/[.055] p-4 text-center">
            <span className="absolute left-0 top-1/2 h-px w-1/4 bg-gradient-to-r from-transparent to-quantum-400/80" aria-hidden="true" />
            <span className="absolute right-0 top-1/2 h-px w-1/4 bg-gradient-to-l from-transparent to-quantum-400/80" aria-hidden="true" />
            <span className="grid h-12 w-12 place-items-center rounded-full border border-quantum-400/55 bg-lab-panel font-mono text-sm text-quantum-400 shadow-[0_0_28px_rgba(167,139,250,.18)]">Ψ⁻</span>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[.14em] text-violet-200">pair source</p>
            {result.eve_enabled && <span className="mt-1 inline-flex items-center gap-1 text-[9px] text-accent-red"><AlertTriangle className="h-3 w-3" />product-state substitution model</span>}
          </div>
          <Analyzer actor="Bob" angles={result.bob_angles_deg} counts={bobCounts} tone="green" />
        </div>

        <div className="mt-4">
          <p className="instrument-label mb-2">Pair-setting stream · first {pairSample.length}</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]" aria-label="Sampled analyzer setting pairs">
            {pairSample.map((pair) => (
              <div key={pair.index} className={`min-w-[72px] rounded-md border px-2 py-1.5 text-center ${pair.kept ? "border-accent-green/35 bg-accent-green/[.06]" : "border-lab-border bg-lab-panel/65"}`}>
                <p className="font-mono text-[10px] text-lab-text">{pair.aliceAngle}°↔{pair.bobAngle}°</p>
                <p className={`mt-0.5 text-[8px] font-semibold uppercase ${pair.kept ? "text-accent-green" : "text-lab-faint"}`}>{pair.kept ? "key" : "test"}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid border-b border-lab-border xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]" aria-labelledby="e91-correlation-title">
        <div className="p-4 sm:p-5 xl:border-r xl:border-lab-border">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="instrument-label">Correlation field</p><h3 id="e91-correlation-title" className="mt-1 font-display text-sm font-semibold text-lab-text">Measured E(a,b)</h3></div>
            <span className="text-[9px] text-lab-faint">−1 anti-correlated · +1 correlated</span>
          </div>
          <div className="mt-3 grid grid-cols-4 overflow-hidden rounded-lg border border-lab-border">
            <div className="border-b border-r border-lab-border bg-lab-surface p-2 text-[9px] text-lab-faint">A \ B</div>
            {result.bob_angles_deg.map((angle) => <div key={`bh-${angle}`} className="border-b border-r border-lab-border bg-lab-surface p-2 text-center font-mono text-[9px] text-lab-faint last:border-r-0">{angle}°</div>)}
            {result.alice_angles_deg.map((aliceAngle) => (
              <div key={`row-${aliceAngle}`} className="contents">
                <div className="border-b border-r border-lab-border bg-lab-surface p-2 font-mono text-[9px] text-lab-faint last:border-b-0">{aliceAngle}°</div>
                {result.bob_angles_deg.map((bobAngle) => {
                  const value = result.correlations[`A${aliceAngle}_B${bobAngle}`] ?? 0;
                  const alpha = 0.035 + Math.abs(value) * 0.12;
                  return <div key={`${aliceAngle}-${bobAngle}`} className={`border-b border-r border-lab-border p-3 text-center font-mono text-xs font-semibold last:border-r-0 ${value < 0 ? "text-accent-cyan" : "text-quantum-400"}`} style={{ backgroundColor: value < 0 ? `rgba(34,211,238,${alpha})` : `rgba(167,139,250,${alpha})` }}>{value.toFixed(3)}</div>;
                })}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-lab-faint">The four CHSH test settings are combined into |S|; matched physical angles at 45° and 90° supply sifted key positions.</p>
        </div>

        <div className="flex flex-col justify-center p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3"><div><p className="instrument-label">CHSH evidence scale</p><p className="mt-1 font-mono text-2xl font-semibold text-lab-text">|S| {result.chsh_s.toFixed(3)}</p></div><Badge tone={result.chsh_violation ? "green" : "amber"} dot>{result.chsh_violation ? "above classical bound" : "no sampled violation"}</Badge></div>
          <div className="relative mt-5 h-5 overflow-hidden rounded-full border border-lab-border bg-lab-raised" role="meter" aria-label={`CHSH absolute S ${result.chsh_s.toFixed(3)}; classical bound ${classical.toFixed(2)}; quantum maximum ${quantum.toFixed(2)}`} aria-valuemin={0} aria-valuemax={quantum} aria-valuenow={result.chsh_s}>
            <span className="absolute inset-y-0 left-0 bg-accent-amber/12" style={{ width: `${classicalPosition}%` }} />
            <span className="absolute inset-y-0 right-0 bg-accent-green/[.09]" style={{ left: `${classicalPosition}%` }} />
            <span className="absolute inset-y-0 w-px bg-accent-amber" style={{ left: `${classicalPosition}%` }} />
            <span className={`absolute inset-y-0 w-1 -translate-x-1/2 rounded-full bg-accent-cyan shadow-glow ${styles.transitionWidth}`} style={{ left: `${samplePosition}%` }} />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[9px] text-lab-faint"><span>0</span><span>classical 2.00</span><span>quantum 2.83</span></div>
          <p className="mt-4 text-[10px] leading-4 text-lab-muted">A value above 2 is evidence only inside this finite software sample. A physical claim would require controlled devices, source assumptions, and statistical analysis beyond this interface.</p>
        </div>
      </section>

      <div className="grid gap-3 border-b border-lab-border p-4 sm:p-5 lg:grid-cols-2">
        <BitStringViewer bits={result.sifted_key_alice} label="Alice matched-angle key" limit={128} />
        <BitStringViewer bits={result.sifted_key_bob} label="Bob corrected anti-correlation key" limit={128} />
      </div>

      <div className="p-4 sm:p-5">
        <Callout tone={result.eve_enabled || !result.chsh_violation ? "warning" : "info"} title="Finite-sample interpretation">{result.explanation} This interface does not certify genuine entanglement or produce a deployable shared key.</Callout>
      </div>
    </div>
  );
}
