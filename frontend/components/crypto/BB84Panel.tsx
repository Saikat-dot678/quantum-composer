"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BitStringViewer } from "@/components/ui/BitStringViewer";
import { AlertTriangle, Check, X } from "lucide-react";
import { Badge, Callout } from "@/components/ui/primitives";
import { formatPercent } from "@/lib/formatting";
import type { BB84Result } from "@/lib/labTypes";
import styles from "./cryptoLab.module.css";
import { DistributionBar } from "./DistributionBar";

const SAMPLE_LIMIT = 18;

function preparedState(bit: number, basis: string): string {
  if (basis === "Z") return bit === 0 ? "|0⟩" : "|1⟩";
  return bit === 0 ? "|+⟩" : "|−⟩";
}

function Metric({ label, value, tone = "text-lab-text", detail }: { label: string; value: ReactNode; tone?: string; detail?: string }) {
  return (
    <div className="min-w-0 px-3 py-3 sm:px-4">
      <p className="instrument-label truncate">{label}</p>
      <p className={`mt-1 truncate font-mono text-base font-semibold ${tone}`}>{value}</p>
      {detail && <p className="mt-0.5 truncate text-[9px] text-lab-faint">{detail}</p>}
    </div>
  );
}

function ActorNode({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "cyan" | "red" | "green" | "violet" }) {
  const color = tone === "red" ? "border-accent-red/45 bg-accent-red/[.075] text-danger-text" : tone === "green" ? "border-accent-green/40 bg-accent-green/[.06] text-safe-text" : tone === "violet" ? "border-quantum-400/40 bg-quantum-400/[.07] text-quantum-text" : "border-accent-cyan/40 bg-accent-cyan/[.065] text-accent-700";
  return (
    <div className={`flex min-h-[92px] min-w-[142px] flex-col justify-between rounded-xl border p-3 ${color}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[.14em] opacity-70">{label}</p>
      <div>
        <p className="font-mono text-lg font-semibold">{value}</p>
        <p className="mt-0.5 text-[10px] leading-4 opacity-70">{detail}</p>
      </div>
    </div>
  );
}

function MatrixCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex min-h-8 items-center justify-center border-b border-r border-lab-border px-1 font-mono text-[10px] ${className}`}>{children}</div>;
}

export function BB84Panel({ result }: { result: BB84Result }) {
  const [selected, setSelected] = useState(0);
  const sampleCount = Math.min(SAMPLE_LIMIT, result.num_bits, result.alice_bits.length);
  const indices = useMemo(() => Array.from({ length: sampleCount }, (_, index) => index), [sampleCount]);
  const selectedIndex = Math.min(selected, Math.max(0, sampleCount - 1));
  const threshold = result.charts_data.qber_threshold;
  const disturbed = result.qber > threshold;

  useEffect(() => setSelected(0), [result]);

  const aliceBit = result.alice_bits[selectedIndex] ?? 0;
  const aliceBasis = result.alice_bases[selectedIndex] ?? "Z";
  const bobBasis = result.bob_bases[selectedIndex] ?? "Z";
  const bobBit = result.bob_measurements[selectedIndex] ?? 0;
  const eveBasis = result.eve_bases[selectedIndex];
  const kept = aliceBasis === bobBasis;
  const selectedError = kept && aliceBit !== bobBit;
  const errorTransmissions = indices.filter((index) => result.alice_bases[index] === result.bob_bases[index] && result.alice_bits[index] !== result.bob_measurements[index]);
  const qberDegrees = Math.max(0, Math.min(100, result.qber * 100));

  return (
    <div>
      <div className="grid grid-cols-2 divide-x divide-y divide-lab-border border-b border-lab-border sm:grid-cols-4 sm:divide-y-0">
        <Metric label="Transmitted" value={result.num_bits.toLocaleString()} detail="prepared qubits" />
        <Metric label="Basis matches" value={result.charts_data.basis_match_count.toLocaleString()} tone="text-accent-cyan" detail={`${formatPercent(result.charts_data.basis_match_count / result.num_bits)} retained`} />
        <Metric label="Sifted errors" value={result.charts_data.sifted_error_count.toLocaleString()} tone={result.charts_data.sifted_error_count ? "text-accent-amber" : "text-accent-green"} detail="Alice ↔ Bob disagreement" />
        <Metric label="Alice-side output" value={result.final_key_length.toLocaleString()} tone="text-quantum-400" detail="illustrative compression only" />
      </div>

      <div className="grid border-b border-lab-border 2xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className={`min-w-0 p-4 sm:p-5 ${styles.stageGrid}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="instrument-label">Transmission microscope</p>
              <h3 className="mt-1 font-display text-base font-semibold text-lab-text">Signal #{String(selectedIndex + 1).padStart(2, "0")}</h3>
              <p className="mt-1 text-[11px] leading-4 text-lab-muted">Select any column in the reconciliation matrix to inspect its path.</p>
            </div>
            <Badge tone={selectedError ? "red" : kept ? "green" : "neutral"} dot>{selectedError ? "kept with error" : kept ? "kept" : "discarded"}</Badge>
          </div>

          <div className="mt-5 overflow-x-auto pb-2 [scrollbar-width:thin]">
            <div className="flex min-w-max items-center">
              <ActorNode label="Alice" value={`${aliceBit} · ${aliceBasis}`} detail={`prepares ${preparedState(aliceBit, aliceBasis)}`} tone="cyan" />
              <div className="mx-3 w-12 sm:w-20" aria-hidden="true"><div className={styles.signalTrack} /></div>
              <ActorNode label="Quantum channel" value={`${(result.channel_error_rate * 100).toFixed(0)}%`} detail="modeled bit-flip error" tone="violet" />
              {result.eve_enabled && (
                <>
                  <div className="mx-3 w-12 sm:w-20" aria-hidden="true"><div className={`${styles.signalTrack} ${styles.signalTrackAlert}`} /></div>
                  <ActorNode label="Eve · intercept/resend" value={eveBasis ?? "—"} detail="random measurement basis" tone="red" />
                </>
              )}
              <div className="mx-3 w-12 sm:w-20" aria-hidden="true"><div className={result.eve_enabled ? `${styles.signalTrack} ${styles.signalTrackAlert}` : styles.signalTrack} /></div>
              <ActorNode label="Bob" value={`${bobBit} · ${bobBasis}`} detail={kept ? "basis agrees with Alice" : "basis mismatch"} tone="green" />
            </div>
          </div>

          <div className={`mt-3 flex gap-3 rounded-lg border px-3 py-2.5 text-[11px] leading-4 ${selectedError ? "border-accent-red/30 bg-accent-red/[.055] text-danger-text" : kept ? "border-accent-green/25 bg-accent-green/[.045] text-safe-text" : "border-lab-border bg-lab-panel/70 text-lab-muted"}`}>
            {selectedError ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : kept ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-lab-faint" />}
            <p>{selectedError ? `Alice and Bob chose ${aliceBasis}, so this position survives sifting—but Bob measured ${bobBit} instead of ${aliceBit}.` : kept ? `Both parties chose ${aliceBasis}. The measured bit agrees, so this position enters the sifted strings.` : `Alice used ${aliceBasis} while Bob used ${bobBasis}. They reveal only their bases and discard this position.`}</p>
          </div>
        </div>

        <div className="flex flex-col justify-center border-t border-lab-border p-5 2xl:border-l 2xl:border-t-0">
          <div
            role="meter"
            aria-label={`QBER ${formatPercent(result.qber)}, alert threshold ${formatPercent(threshold)}`}
            aria-valuemin={0}
            aria-valuemax={50}
            aria-valuenow={Math.round(result.qber * 100)}
            className="mx-auto grid h-36 w-36 place-items-center rounded-full p-3"
            style={{ background: `conic-gradient(${disturbed ? "#dc2626" : "#059669"} ${qberDegrees}%, #e4e4e7 ${qberDegrees}% 100%)` }}
          >
            <div className="grid h-full w-full place-items-center rounded-full border border-lab-border bg-lab-panel text-center">
              <div><p className="font-mono text-2xl font-semibold text-lab-text">{formatPercent(result.qber, 1)}</p><p className="instrument-label mt-1">QBER</p></div>
            </div>
          </div>
          <div className="mt-4 text-center">
            <Badge tone={disturbed ? "red" : "green"} dot>{disturbed ? "disturbance alert" : "below model threshold"}</Badge>
            <p className="mt-2 text-[10px] leading-4 text-lab-faint">Threshold {formatPercent(threshold, 0)} · noise and attacks can both raise QBER</p>
          </div>
        </div>
      </div>

      <section className="border-b border-lab-border p-4 sm:p-5" aria-labelledby="bb84-reconciliation-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="instrument-label">Basis reconciliation · first {sampleCount}</p>
            <h3 id="bb84-reconciliation-title" className="mt-1 font-display text-sm font-semibold text-lab-text">Transmission matrix</h3>
          </div>
          <div className="flex gap-3 text-[9px] text-lab-faint"><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-accent-green/70" />kept</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-lab-borderStrong" />discarded</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-accent-red/75" />error</span></div>
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-lab-border [scrollbar-width:thin]">
          <div className="min-w-[880px]" style={{ display: "grid", gridTemplateColumns: `116px repeat(${sampleCount}, minmax(40px, 1fr))` }}>
            <MatrixCell className="justify-start bg-lab-surface px-3 text-lab-faint">position</MatrixCell>
            {indices.map((index) => <button key={`position-${index}`} type="button" onClick={() => setSelected(index)} aria-label={`Inspect transmission ${index + 1}`} aria-pressed={selectedIndex === index} className={`min-h-8 border-b border-r border-lab-border font-mono text-[10px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-cyan ${selectedIndex === index ? "bg-accent-cyan/15 text-accent-cyan" : "bg-lab-surface text-lab-faint hover:bg-lab-raised"}`}>{String(index + 1).padStart(2, "0")}</button>)}
            <MatrixCell className="justify-start bg-lab-surface/60 px-3 text-lab-faint">Alice bit</MatrixCell>{indices.map((index) => <MatrixCell key={`a-bit-${index}`} className={selectedIndex === index ? "bg-accent-cyan/[.06] text-lab-text" : "text-lab-muted"}>{result.alice_bits[index]}</MatrixCell>)}
            <MatrixCell className="justify-start bg-lab-surface/60 px-3 text-lab-faint">Alice basis</MatrixCell>{indices.map((index) => <MatrixCell key={`a-basis-${index}`} className={selectedIndex === index ? "bg-accent-cyan/[.06] text-accent-cyan" : "text-accent-cyan/75"}>{result.alice_bases[index]}</MatrixCell>)}
            <MatrixCell className="justify-start bg-lab-surface/60 px-3 text-lab-faint">Prepared</MatrixCell>{indices.map((index) => <MatrixCell key={`state-${index}`} className={selectedIndex === index ? "bg-accent-cyan/[.06] text-quantum-400" : "text-quantum-400/75"}>{preparedState(result.alice_bits[index], result.alice_bases[index])}</MatrixCell>)}
            {result.eve_enabled && <><MatrixCell className="justify-start bg-accent-red/[.035] px-3 text-red-200/70">Eve basis</MatrixCell>{indices.map((index) => <MatrixCell key={`eve-${index}`} className={selectedIndex === index ? "bg-accent-red/[.09] text-accent-red" : "bg-accent-red/[.025] text-red-200/65"}>{result.eve_bases[index] ?? "—"}</MatrixCell>)}</>}
            <MatrixCell className="justify-start bg-lab-surface/60 px-3 text-lab-faint">Bob basis</MatrixCell>{indices.map((index) => <MatrixCell key={`b-basis-${index}`} className={selectedIndex === index ? "bg-accent-cyan/[.06] text-accent-green" : "text-emerald-200/70"}>{result.bob_bases[index]}</MatrixCell>)}
            <MatrixCell className="justify-start bg-lab-surface/60 px-3 text-lab-faint">Measurement</MatrixCell>{indices.map((index) => <MatrixCell key={`measure-${index}`} className={selectedIndex === index ? "bg-accent-cyan/[.06] text-lab-text" : "text-lab-muted"}>{result.bob_measurements[index]}</MatrixCell>)}
            <MatrixCell className="justify-start border-b-0 bg-lab-surface/60 px-3 text-lab-faint">Reconcile</MatrixCell>{indices.map((index) => { const match = result.alice_bases[index] === result.bob_bases[index]; const error = match && result.alice_bits[index] !== result.bob_measurements[index]; return <MatrixCell key={`decision-${index}`} className={`border-b-0 font-sans text-[9px] font-semibold uppercase ${error ? "bg-accent-red/[.12] text-accent-red" : match ? "bg-accent-green/[.08] text-accent-green" : "bg-lab-raised/30 text-lab-faint"}`}>{error ? "error" : match ? "keep" : "drop"}</MatrixCell>; })}
          </div>
        </div>
        {result.num_bits > sampleCount && <p className="mt-2 text-[10px] text-lab-faint">Showing {sampleCount} of {result.num_bits.toLocaleString()} transmissions. Aggregate metrics use the complete run.</p>}
      </section>

      <div className="grid border-b border-lab-border xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="p-4 sm:p-5 xl:border-r xl:border-lab-border">
          <p className="instrument-label mb-2">Sifting outcome</p>
          <DistributionBar label="BB84 basis reconciliation" segments={[
            { label: "discarded", value: result.charts_data.basis_mismatch_count, className: "bg-lab-borderStrong text-lab-text" },
            { label: "kept", value: result.charts_data.basis_match_count - result.charts_data.sifted_error_count, className: "bg-accent-green text-white" },
            { label: "errors", value: result.charts_data.sifted_error_count, className: "bg-accent-red text-white" },
          ]} />
          <p className="mt-3 text-[10px] leading-4 text-lab-faint">In the visible sample, retained-bit errors occur at transmission position{errorTransmissions.length === 1 ? "" : "s"} {errorTransmissions.length ? errorTransmissions.map((index) => index + 1).join(", ") : "none"}.</p>
        </div>
        <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <BitStringViewer bits={result.sifted_key_alice} label="Alice sifted string" limit={128} />
          <BitStringViewer bits={result.sifted_key_bob} label="Bob sifted string" limit={128} />
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,.8fr)]">
        <Callout tone={disturbed ? "warning" : "info"} title={disturbed ? "Channel should be rejected in this model" : "Current modeled channel"}>{result.explanation} QBER alone cannot attribute the disturbance to Eve.</Callout>
        <div className="rounded-lg border border-quantum-400/25 bg-quantum-400/[.045] px-3.5 py-3 text-[11px] leading-4 text-quantum-text">
          <p className="font-semibold text-quantum-text">Privacy-amplification boundary</p>
          <p className="mt-1">The displayed {result.final_key_length}-bit Alice-side output is an educational compression illustration. This model does not perform authenticated error reconciliation, so it is not a proven shared final key.</p>
        </div>
      </div>
    </div>
  );
}
