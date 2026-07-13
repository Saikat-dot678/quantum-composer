"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BitStringViewer } from "@/components/ui/BitStringViewer";
import { Check, X } from "lucide-react";
import { Badge, Callout } from "@/components/ui/primitives";
import { formatPercent } from "@/lib/formatting";
import type { B92Result } from "@/lib/labTypes";
import styles from "./cryptoLab.module.css";
import { DistributionBar } from "./DistributionBar";

const SAMPLE_LIMIT = 18;

function MatrixCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex min-h-8 items-center justify-center border-b border-r border-lab-border px-1 font-mono text-[10px] ${className}`}>{children}</div>;
}

export function B92Panel({ result }: { result: B92Result }) {
  const [selected, setSelected] = useState(0);
  const sampleCount = Math.min(SAMPLE_LIMIT, result.num_bits, result.alice_bits.length);
  const indices = useMemo(() => Array.from({ length: sampleCount }, (_, index) => index), [sampleCount]);
  const conclusionOrdinals = useMemo(() => {
    let ordinal = -1;
    return result.conclusive_flags.map((conclusive) => {
      if (conclusive) ordinal += 1;
      return conclusive ? ordinal : null;
    });
  }, [result.conclusive_flags]);

  useEffect(() => setSelected(0), [result]);

  const selectedIndex = Math.min(selected, Math.max(0, sampleCount - 1));
  const conclusive = result.conclusive_flags[selectedIndex] ?? false;
  const ordinal = conclusionOrdinals[selectedIndex];
  const inferredBit = conclusive ? (result.bob_bases[selectedIndex] === "Z" ? 1 : 0) : null;
  const selectedError = ordinal != null && result.sifted_key_alice[ordinal] !== result.sifted_key_bob[ordinal];
  const conclusiveRate = result.conclusive_count / Math.max(1, result.num_bits);

  return (
    <div>
      <div className="grid grid-cols-2 divide-x divide-y divide-lab-border border-b border-lab-border sm:grid-cols-4 sm:divide-y-0">
        <div className="px-4 py-3"><p className="instrument-label">Transmitted</p><p className="mt-1 font-mono text-base font-semibold text-lab-text">{result.num_bits.toLocaleString()}</p></div>
        <div className="px-4 py-3"><p className="instrument-label">Conclusive</p><p className="mt-1 font-mono text-base font-semibold text-accent-cyan">{result.conclusive_count.toLocaleString()}</p><p className="mt-0.5 text-[9px] text-lab-faint">{formatPercent(conclusiveRate)} of signals</p></div>
        <div className="px-4 py-3"><p className="instrument-label">Inconclusive</p><p className="mt-1 font-mono text-base font-semibold text-lab-muted">{result.inconclusive_count.toLocaleString()}</p></div>
        <div className="px-4 py-3"><p className="instrument-label">Retained QBER</p><p className={`mt-1 font-mono text-base font-semibold ${result.qber > 0.11 ? "text-accent-red" : "text-accent-green"}`}>{formatPercent(result.qber)}</p></div>
      </div>

      <section className={`border-b border-lab-border p-4 sm:p-5 ${styles.stageGrid}`} aria-labelledby="b92-decision-path">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="instrument-label">Conclusive-decision microscope</p><h3 id="b92-decision-path" className="mt-1 font-display text-base font-semibold text-lab-text">Signal #{String(selectedIndex + 1).padStart(2, "0")}</h3></div>
          <Badge tone={selectedError ? "red" : conclusive ? "green" : "neutral"} dot>{selectedError ? "retained error" : conclusive ? `infers bit ${inferredBit}` : "inconclusive"}</Badge>
        </div>

        <div className="mt-5 overflow-x-auto pb-2 [scrollbar-width:thin]">
          <div className="flex min-w-max items-center">
            <div className="flex min-h-[96px] min-w-[150px] flex-col justify-between rounded-xl border border-accent-cyan/40 bg-accent-cyan/[.06] p-3">
              <p className="instrument-label text-accent-cyan/70">Alice prepares</p>
              <div><p className="font-mono text-xl font-semibold text-accent-cyan">{result.alice_states[selectedIndex]}</p><p className="mt-0.5 text-[10px] text-lab-muted">encodes bit {result.alice_bits[selectedIndex]}</p></div>
            </div>
            <div className="mx-3 w-16 sm:w-24" aria-hidden="true"><div className={styles.signalTrack} /></div>
            <div className="flex min-h-[96px] min-w-[150px] flex-col justify-between rounded-xl border border-quantum-400/40 bg-quantum-400/[.055] p-3">
              <p className="instrument-label text-violet-300/70">Two-state channel</p>
              <div><p className="font-mono text-lg font-semibold text-quantum-400">{formatPercent(result.channel_error_rate)}</p><p className="mt-0.5 text-[10px] text-lab-muted">modeled bit-flip rate</p></div>
            </div>
            <div className="mx-3 w-16 sm:w-24" aria-hidden="true"><div className={styles.signalTrack} /></div>
            <div className="flex min-h-[96px] min-w-[150px] flex-col justify-between rounded-xl border border-accent-green/35 bg-accent-green/[.05] p-3">
              <p className="instrument-label text-emerald-200/70">Bob tests</p>
              <div><p className="font-mono text-xl font-semibold text-accent-green">{result.bob_bases[selectedIndex]} → {result.bob_measurements[selectedIndex]}</p><p className="mt-0.5 text-[10px] text-lab-muted">basis and raw outcome</p></div>
            </div>
            <div className="mx-3 w-16 sm:w-24" aria-hidden="true"><div className={styles.signalTrack} /></div>
            <div className={`flex min-h-[96px] min-w-[160px] flex-col justify-between rounded-xl border p-3 ${selectedError ? "border-accent-red/45 bg-accent-red/[.07]" : conclusive ? "border-accent-green/40 bg-accent-green/[.06]" : "border-lab-borderStrong bg-lab-panel/75"}`}>
              <p className="instrument-label">Logical decision</p>
              <div className="flex items-end justify-between gap-3"><div><p className={`text-sm font-semibold ${selectedError ? "text-accent-red" : conclusive ? "text-accent-green" : "text-lab-muted"}`}>{conclusive ? `Keep bit ${inferredBit}` : "Discard"}</p><p className="mt-0.5 text-[10px] text-lab-faint">{conclusive ? "one state ruled out" : "neither state ruled out"}</p></div>{conclusive ? <Check className={`h-5 w-5 ${selectedError ? "text-accent-red" : "text-accent-green"}`} /> : <X className="h-5 w-5 text-lab-faint" />}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-lab-border p-4 sm:p-5" aria-labelledby="b92-matrix-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="instrument-label">Outcome stream · first {sampleCount}</p><h3 id="b92-matrix-title" className="mt-1 font-display text-sm font-semibold text-lab-text">Preparation-to-decision matrix</h3></div>
          <p className="max-w-lg text-right text-[9px] leading-3 text-lab-faint">Outcome 1 in Z rules out |0⟩; outcome 1 in X rules out |+⟩. Outcome 0 is inconclusive.</p>
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border border-lab-border [scrollbar-width:thin]">
          <div className="min-w-[880px]" style={{ display: "grid", gridTemplateColumns: `116px repeat(${sampleCount}, minmax(40px, 1fr))` }}>
            <MatrixCell className="justify-start bg-lab-surface px-3 text-lab-faint">position</MatrixCell>{indices.map((index) => <button key={`position-${index}`} type="button" aria-label={`Inspect B92 transmission ${index + 1}`} aria-pressed={selectedIndex === index} onClick={() => setSelected(index)} className={`min-h-8 border-b border-r border-lab-border font-mono text-[10px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-cyan ${selectedIndex === index ? "bg-accent-cyan/15 text-accent-cyan" : "bg-lab-surface text-lab-faint hover:bg-lab-raised"}`}>{String(index + 1).padStart(2, "0")}</button>)}
            <MatrixCell className="justify-start bg-lab-surface/60 px-3 text-lab-faint">Alice bit</MatrixCell>{indices.map((index) => <MatrixCell key={`bit-${index}`} className={selectedIndex === index ? "bg-accent-cyan/[.06] text-lab-text" : "text-lab-muted"}>{result.alice_bits[index]}</MatrixCell>)}
            <MatrixCell className="justify-start bg-lab-surface/60 px-3 text-lab-faint">Prepared</MatrixCell>{indices.map((index) => <MatrixCell key={`state-${index}`} className={selectedIndex === index ? "bg-accent-cyan/[.06] text-accent-cyan" : "text-accent-cyan/75"}>{result.alice_states[index].replace(">", "⟩")}</MatrixCell>)}
            <MatrixCell className="justify-start bg-lab-surface/60 px-3 text-lab-faint">Bob basis</MatrixCell>{indices.map((index) => <MatrixCell key={`basis-${index}`} className={selectedIndex === index ? "bg-accent-cyan/[.06] text-accent-green" : "text-emerald-200/70"}>{result.bob_bases[index]}</MatrixCell>)}
            <MatrixCell className="justify-start bg-lab-surface/60 px-3 text-lab-faint">Outcome</MatrixCell>{indices.map((index) => <MatrixCell key={`outcome-${index}`} className={selectedIndex === index ? "bg-accent-cyan/[.06] text-lab-text" : "text-lab-muted"}>{result.bob_measurements[index]}</MatrixCell>)}
            <MatrixCell className="justify-start border-b-0 bg-lab-surface/60 px-3 text-lab-faint">Decision</MatrixCell>{indices.map((index) => { const flag = result.conclusive_flags[index]; const keyOrdinal = conclusionOrdinals[index]; const error = keyOrdinal != null && result.sifted_key_alice[keyOrdinal] !== result.sifted_key_bob[keyOrdinal]; return <MatrixCell key={`decision-${index}`} className={`border-b-0 font-sans text-[9px] font-semibold uppercase ${error ? "bg-accent-red/[.12] text-accent-red" : flag ? "bg-accent-green/[.08] text-accent-green" : "bg-lab-raised/30 text-lab-faint"}`}>{error ? "error" : flag ? "keep" : "drop"}</MatrixCell>; })}
          </div>
        </div>
        {result.num_bits > sampleCount && <p className="mt-2 text-[10px] text-lab-faint">Showing {sampleCount} transmissions; all {result.num_bits.toLocaleString()} contribute to the aggregates.</p>}
      </section>

      <div className="grid border-b border-lab-border xl:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]">
        <div className="p-4 sm:p-5 xl:border-r xl:border-lab-border">
          <p className="instrument-label mb-2">Acceptance distribution</p>
          <DistributionBar label="B92 decision outcomes" segments={[
            { label: "inconclusive", value: result.inconclusive_count, className: "bg-lab-borderStrong text-lab-text" },
            { label: "conclusive", value: result.conclusive_count - result.charts_data.sifted_error_count, className: "bg-accent-cyan text-white" },
            { label: "errors", value: result.charts_data.sifted_error_count, className: "bg-accent-red text-white" },
          ]} />
          <p className="mt-3 text-[10px] leading-4 text-lab-faint">The conclusive rate is not a monotonic noise indicator in this symmetric bit-flip model; inspect retained QBER for Alice/Bob disagreement.</p>
        </div>
        <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-2">
          <BitStringViewer bits={result.sifted_key_alice} label="Alice conclusive key" limit={128} />
          <BitStringViewer bits={result.sifted_key_bob} label="Bob inferred key" limit={128} />
        </div>
      </div>

      <div className="p-4 sm:p-5"><Callout tone={result.qber > 0.11 ? "warning" : "info"} title="Protocol interpretation">{result.explanation} This teaching model omits the authenticated classical processing and security proof required by a real QKD system.</Callout></div>
    </div>
  );
}
