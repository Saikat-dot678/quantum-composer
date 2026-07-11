"use client";
import { useState } from "react";
import { labApi } from "@/lib/labApi";
import type { BB84Result, B92Result, E91Result, QRNGResult } from "@/lib/labTypes";
import { BasisComparisonTable } from "./ui/BasisComparisonTable";
import { BitStringViewer } from "./ui/BitStringViewer";
import { QBERMeter } from "./ui/QBERMeter";
import { Badge, EducationalCallout, Panel, SectionHeader, Spinner, StatTile, WarningCallout } from "./ui/primitives";

type Protocol = "bb84" | "e91" | "b92" | "qrng";

const PROTOCOLS: { id: Protocol; name: string; blurb: string }[] = [
  { id: "bb84", name: "BB84", blurb: "Prepare-and-measure QKD (1984)" },
  { id: "e91", name: "E91", blurb: "Entanglement + CHSH test (1991)" },
  { id: "b92", name: "B92", blurb: "Two-state QKD (1992)" },
  { id: "qrng", name: "QRNG", blurb: "Quantum randomness (educational)" },
];

function DistributionBar({ zero, one }: { zero: number; one: number }) {
  const total = zero + one || 1;
  return (
    <div className="flex h-5 overflow-hidden rounded font-mono text-[10px] text-lab-bg">
      <div className="flex items-center justify-center bg-lab-borderStrong" style={{ width: `${(zero / total) * 100}%` }}>{zero > 0 ? `0: ${zero}` : ""}</div>
      <div className="flex items-center justify-center bg-accent-cyan" style={{ width: `${(one / total) * 100}%` }}>{one > 0 ? `1: ${one}` : ""}</div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-lab-muted">
        {label} — <b className="text-lab-text">{value}</b>
      </label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-cyan-400" />
    </div>
  );
}

export function CryptographyLab() {
  const [protocol, setProtocol] = useState<Protocol>("bb84");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [numBits, setNumBits] = useState(256);
  const [eve, setEve] = useState(false);
  const [channelError, setChannelError] = useState(0.02);
  const [seed, setSeed] = useState<number | "">(123);

  const [bb84, setBb84] = useState<BB84Result | null>(null);
  const [e91, setE91] = useState<E91Result | null>(null);
  const [b92, setB92] = useState<B92Result | null>(null);
  const [qrng, setQrng] = useState<QRNGResult | null>(null);

  const seedValue = seed === "" ? null : Number(seed);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      if (protocol === "bb84") setBb84(await labApi.bb84({ num_bits: numBits, eve_enabled: eve, channel_error_rate: channelError, seed: seedValue }));
      else if (protocol === "e91") setE91(await labApi.e91({ num_pairs: numBits, eve_enabled: eve, channel_error_rate: channelError, seed: seedValue }));
      else if (protocol === "b92") setB92(await labApi.b92({ num_bits: numBits, channel_error_rate: channelError, seed: seedValue }));
      else setQrng(await labApi.qrng({ num_bits: numBits, seed: seedValue }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Protocol simulation failed.");
    } finally {
      setBusy(false);
    }
  }

  const showResult =
    (protocol === "bb84" && bb84) || (protocol === "e91" && e91) || (protocol === "b92" && b92) || (protocol === "qrng" && qrng);

  return (
    <div className="mx-auto grid max-w-[1800px] gap-5 p-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:p-8">
      <aside className="space-y-5">
        <Panel className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-lab-text">Protocol</h2>
          <div className="space-y-1.5">
            {PROTOCOLS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProtocol(p.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition ${protocol === p.id ? "border-accent-cyan/40 bg-accent-cyan/10" : "border-transparent hover:bg-lab-raised/50"}`}
              >
                <span className={`block text-sm font-medium ${protocol === p.id ? "text-accent-cyan" : "text-lab-muted"}`}>{p.name}</span>
                <span className="text-[10px] text-lab-faint">{p.blurb}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-lab-text">Parameters</h2>
          <div className="space-y-3">
            <Slider label={protocol === "e91" ? "Entangled pairs" : "Bits"} value={numBits} min={16} max={2048} step={16} onChange={setNumBits} />
            {protocol !== "qrng" && <Slider label="Channel error rate" value={channelError} min={0} max={0.5} step={0.01} onChange={setChannelError} />}
            {(protocol === "bb84" || protocol === "e91") && (
              <label className="flex items-center gap-2 rounded-lg border border-lab-border bg-lab-raised/40 px-3 py-2 text-xs text-lab-muted">
                <input type="checkbox" checked={eve} onChange={(e) => setEve(e.target.checked)} className="accent-cyan-400" /> Enable eavesdropper (Eve)
              </label>
            )}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-lab-muted">Seed (reproducible)</label>
              <input type="number" value={seed} onChange={(e) => setSeed(e.target.value === "" ? "" : Number(e.target.value))} className="w-full rounded-lg bg-lab-bg px-2 py-1.5 text-sm text-lab-text ring-1 ring-lab-border outline-none focus:ring-accent-cyan" />
            </div>
            <button type="button" disabled={busy} onClick={run} className="w-full rounded-lg bg-accent-cyan px-3 py-2 text-sm font-semibold text-lab-bg shadow-glow transition hover:brightness-110 disabled:opacity-50">
              {busy ? "Running…" : "Run protocol"}
            </button>
          </div>
        </Panel>
      </aside>

      <section className="space-y-5">
        <EducationalCallout>
          These are <b>educational, protocol-level</b> simulators (seeded for reproducibility) — not simulations of thousands of physical qubits, and the QRNG is not a certified hardware generator. QKD detects eavesdropping via the disturbance it causes; it still needs an authenticated classical channel.
        </EducationalCallout>

        {error && <WarningCallout tone="red">{error}</WarningCallout>}
        {busy && !showResult && <Panel className="p-5"><Spinner label="Running protocol…" /></Panel>}

        {protocol === "bb84" && bb84 && (
          <Panel className="p-5">
            <SectionHeader
              eyebrow="BB84 · prepare-and-measure"
              title="Key distribution result"
              right={<Badge tone={bb84.eve_detected ? "red" : "green"}>{bb84.eve_detected ? "Eavesdropping detected" : "Channel looks secure"}</Badge>}
            />
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Sent bits" value={bb84.num_bits} />
              <StatTile label="Sifted key" value={bb84.sifted_key_length} />
              <StatTile label="Final key" value={bb84.final_key_length} tone="violet" hint="after privacy amplification" />
              <StatTile label="Eve" value={bb84.eve_enabled ? "on" : "off"} tone={bb84.eve_enabled ? "amber" : "slate"} />
            </div>
            <div className="mb-4">
              <QBERMeter qber={bb84.qber} threshold={bb84.charts_data.qber_threshold} />
            </div>
            <div className="mb-4 grid gap-4 lg:grid-cols-2">
              <BitStringViewer bits={bb84.sifted_key_alice} label="Sifted key (Alice)" limit={128} />
              <BitStringViewer bits={bb84.sifted_key_bob} label="Sifted key (Bob)" limit={128} />
            </div>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-lab-faint">Basis reconciliation</p>
            <BasisComparisonTable aliceBases={bb84.alice_bases} bobBases={bb84.bob_bases} aliceBits={bb84.alice_bits} bobMeasurements={bb84.bob_measurements} limit={40} />
            <p className="mt-4 rounded-lg border border-lab-border bg-lab-raised/40 px-3 py-2 text-[12px] leading-5 text-lab-muted">{bb84.explanation}</p>
          </Panel>
        )}

        {protocol === "e91" && e91 && (
          <Panel className="p-5">
            <SectionHeader
              eyebrow="E91 · entanglement-based"
              title="Ekert protocol result"
              right={<Badge tone={e91.chsh_violation ? "green" : "red"}>{e91.chsh_violation ? "Bell inequality violated" : "No violation — entanglement broken"}</Badge>}
            />
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="CHSH |S|" value={e91.chsh_s.toFixed(3)} tone={e91.chsh_violation ? "green" : "red"} />
              <StatTile label="Classical bound" value="2.000" />
              <StatTile label="Quantum bound" value={e91.charts_data.chsh_quantum_bound.toFixed(3)} tone="cyan" />
              <StatTile label="QBER" value={`${(e91.qber * 100).toFixed(1)}%`} />
            </div>
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-lab-faint">CHSH |S| on the classical → quantum scale</p>
            <div className="relative h-6 overflow-hidden rounded bg-lab-raised">
              <div className="absolute inset-y-0 left-0 bg-accent-red/20" style={{ width: `${(2.0 / 2.83) * 100}%` }} />
              <div className="absolute inset-y-0 bg-accent-green/20" style={{ left: `${(2.0 / 2.83) * 100}%`, right: 0 }} />
              <div className="absolute inset-y-0 w-0.5 bg-lab-text/70" style={{ left: `${(2.0 / 2.83) * 100}%` }} title="classical bound 2.0" />
              <div className="absolute inset-y-0 w-1 bg-accent-cyan" style={{ left: `${Math.min(100, (e91.chsh_s / 2.83) * 100)}%` }} title={`measured ${e91.chsh_s.toFixed(3)}`} />
            </div>
            <p className="mt-1 text-[10px] text-lab-faint">grey line = classical limit (2.0), cyan = measured, right edge ≈ quantum max (2.83)</p>
            <p className="mt-4 rounded-lg border border-lab-border bg-lab-raised/40 px-3 py-2 text-[12px] leading-5 text-lab-muted">{e91.explanation}</p>
          </Panel>
        )}

        {protocol === "b92" && b92 && (
          <Panel className="p-5">
            <SectionHeader eyebrow="B92 · two-state" title="Key distribution result" />
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Sent bits" value={b92.num_bits} />
              <StatTile label="Conclusive" value={b92.conclusive_count} tone="cyan" />
              <StatTile label="Sifted key" value={b92.sifted_key_length} />
              <StatTile label="QBER" value={`${(b92.qber * 100).toFixed(1)}%`} />
            </div>
            <div className="mb-4">
              <QBERMeter qber={b92.qber} />
            </div>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-lab-faint">Conclusive vs inconclusive measurements</p>
            <DistributionBar zero={b92.charts_data.inconclusive_count} one={b92.charts_data.conclusive_count} />
            <p className="mt-1 text-[10px] text-lab-faint">grey = inconclusive (discarded), cyan = conclusive (key)</p>
            <p className="mt-4 rounded-lg border border-lab-border bg-lab-raised/40 px-3 py-2 text-[12px] leading-5 text-lab-muted">{b92.explanation}</p>
          </Panel>
        )}

        {protocol === "qrng" && qrng && (
          <Panel className="p-5">
            <SectionHeader eyebrow="QRNG · Hadamard measurement" title="Quantum randomness (educational)" />
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Bits" value={qrng.num_bits} />
              <StatTile label="Zeros" value={qrng.zero_count} />
              <StatTile label="Ones" value={qrng.one_count} />
              <StatTile label="Freq(1)" value={qrng.frequency_1.toFixed(3)} tone="cyan" hint="ideal 0.500" />
            </div>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-lab-faint">Bit distribution (ideal is 50/50)</p>
            <DistributionBar zero={qrng.zero_count} one={qrng.one_count} />
            <p className="mb-1 mt-4 text-[10px] uppercase tracking-wider text-lab-faint">Generated bit string (sample)</p>
            <pre className="max-h-32 overflow-auto rounded-lg border border-lab-border bg-lab-surface p-3 font-mono text-[10px] leading-4 text-slate-300">{qrng.bit_string}</pre>
            <div className="mt-3">
              <WarningCallout>{qrng.explanation}</WarningCallout>
            </div>
          </Panel>
        )}

        {!showResult && !busy && (
          <Panel className="border-dashed p-8 text-center">
            <p className="text-sm text-lab-faint">
              Choose a protocol and click <b className="text-accent-cyan">Run protocol</b>.
            </p>
          </Panel>
        )}
      </section>
    </div>
  );
}
