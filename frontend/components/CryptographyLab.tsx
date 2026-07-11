"use client";
import { useState } from "react";
import { labApi } from "@/lib/labApi";
import type { BB84Result, B92Result, E91Result, QRNGResult } from "@/lib/labTypes";

type Protocol = "bb84" | "e91" | "b92" | "qrng";

const PROTOCOLS: { id: Protocol; name: string; blurb: string }[] = [
  { id: "bb84", name: "BB84", blurb: "Prepare-and-measure QKD (1984)" },
  { id: "e91", name: "E91", blurb: "Entanglement + CHSH test (1991)" },
  { id: "b92", name: "B92", blurb: "Two-state QKD (1992)" },
  { id: "qrng", name: "QRNG", blurb: "Quantum randomness (educational)" },
];

function Stat({ label, value, tone = "slate" }: { label: string; value: string; tone?: string }) {
  const toneClass =
    tone === "green" ? "text-emerald-700" : tone === "red" ? "text-rose-700" : tone === "violet" ? "text-violet-700" : "text-slate-800";
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`font-mono text-sm font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function DistributionBar({ zero, one }: { zero: number; one: number }) {
  const total = zero + one || 1;
  return (
    <div className="flex h-5 overflow-hidden rounded bg-slate-100 font-mono text-[10px] text-white">
      <div className="flex items-center justify-center bg-slate-500" style={{ width: `${(zero / total) * 100}%` }}>{zero > 0 ? `0: ${zero}` : ""}</div>
      <div className="flex items-center justify-center bg-violet-500" style={{ width: `${(one / total) * 100}%` }}>{one > 0 ? `1: ${one}` : ""}</div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-slate-500">{label} — <b className="text-slate-700">{value}</b></label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
}

export function CryptographyLab() {
  const [protocol, setProtocol] = useState<Protocol>("bb84");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shared-ish inputs
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

  return (
    <div className="mx-auto grid max-w-[1800px] gap-5 p-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:p-8">
      <aside className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-panel">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Protocol</h2>
          <div className="space-y-1.5">
            {PROTOCOLS.map((p) => (
              <button key={p.id} type="button" onClick={() => setProtocol(p.id)} className={`w-full rounded-lg border px-3 py-2 text-left transition ${protocol === p.id ? "border-violet-300 bg-violet-50" : "border-transparent hover:bg-slate-50"}`}>
                <span className={`block text-sm font-medium ${protocol === p.id ? "text-violet-700" : "text-slate-700"}`}>{p.name}</span>
                <span className="text-[10px] text-slate-400">{p.blurb}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-panel">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Parameters</h2>
          <div className="space-y-3">
            <Slider label={protocol === "e91" ? "Pairs" : "Bits"} value={numBits} min={16} max={2048} step={16} onChange={setNumBits} />
            {protocol !== "qrng" && <Slider label="Channel error rate" value={channelError} min={0} max={0.5} step={0.01} onChange={setChannelError} />}
            {(protocol === "bb84" || protocol === "e91") && (
              <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={eve} onChange={(e) => setEve(e.target.checked)} /> Enable eavesdropper (Eve)</label>
            )}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">Seed (reproducible)</label>
              <input type="number" value={seed} onChange={(e) => setSeed(e.target.value === "" ? "" : Number(e.target.value))} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
            </div>
            <button type="button" disabled={busy} onClick={run} className="w-full rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{busy ? "Running…" : "Run protocol"}</button>
          </div>
        </section>
      </aside>

      <section className="space-y-5">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

        {protocol === "bb84" && bb84 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-800">BB84 result</h2>
              <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${bb84.eve_detected ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{bb84.eve_detected ? "Eavesdropping detected" : "Channel looks secure"}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Sent bits" value={String(bb84.num_bits)} />
              <Stat label="Sifted key" value={String(bb84.sifted_key_length)} />
              <Stat label="QBER" value={`${(bb84.qber * 100).toFixed(1)}%`} tone={bb84.eve_detected ? "red" : "green"} />
              <Stat label="Final key" value={String(bb84.final_key_length)} tone="violet" />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Sifted key bit distribution</p>
                <DistributionBar zero={bb84.charts_data.sifted_key_bit_counts["0"] ?? 0} one={bb84.charts_data.sifted_key_bit_counts["1"] ?? 0} />
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Basis agreement</p>
                <DistributionBar zero={bb84.charts_data.basis_mismatch_count} one={bb84.charts_data.basis_match_count} />
                <p className="mt-1 text-[10px] text-slate-400">grey = bases differed (discarded), violet = matched (kept)</p>
              </div>
            </div>
            <div className="mt-3 overflow-x-auto">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">First 32 transmissions (Alice basis / Bob basis)</p>
              <div className="flex gap-0.5 font-mono text-[10px]">
                {bb84.alice_bases.slice(0, 32).map((a, i) => (
                  <span key={i} className={`flex flex-col items-center rounded px-1 py-0.5 ${a === bb84.bob_bases[i] ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-400"}`}>
                    <span>{a}</span><span>{bb84.bob_bases[i]}</span>
                  </span>
                ))}
              </div>
            </div>
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-5 text-slate-600">{bb84.explanation}</p>
          </section>
        )}

        {protocol === "e91" && e91 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-800">E91 result</h2>
              <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${e91.chsh_violation ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{e91.chsh_violation ? "Bell inequality violated" : "No violation — entanglement broken"}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="CHSH |S|" value={e91.chsh_s.toFixed(3)} tone={e91.chsh_violation ? "green" : "red"} />
              <Stat label="Classical bound" value="2.000" />
              <Stat label="Quantum bound" value={e91.charts_data.chsh_quantum_bound.toFixed(3)} />
              <Stat label="QBER" value={`${(e91.qber * 100).toFixed(1)}%`} />
            </div>
            <div className="mt-3">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">CHSH |S| on the classical → quantum scale</p>
              <div className="relative h-6 rounded bg-gradient-to-r from-slate-200 via-amber-100 to-emerald-200">
                <div className="absolute top-0 h-6 w-0.5 bg-slate-500" style={{ left: `${(2.0 / 2.83) * 100}%` }} title="classical bound 2.0" />
                <div className="absolute top-0 h-6 w-1 bg-violet-600" style={{ left: `${Math.min(100, (e91.chsh_s / 2.83) * 100)}%` }} title={`measured ${e91.chsh_s.toFixed(3)}`} />
              </div>
              <p className="mt-1 text-[10px] text-slate-400">grey line = classical limit (2.0), violet = measured, right edge ≈ quantum max (2.83)</p>
            </div>
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-5 text-slate-600">{e91.explanation}</p>
          </section>
        )}

        {protocol === "b92" && b92 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
            <h2 className="mb-4 text-lg font-semibold text-slate-800">B92 result</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Sent bits" value={String(b92.num_bits)} />
              <Stat label="Conclusive" value={String(b92.conclusive_count)} tone="violet" />
              <Stat label="Sifted key" value={String(b92.sifted_key_length)} />
              <Stat label="QBER" value={`${(b92.qber * 100).toFixed(1)}%`} />
            </div>
            <div className="mt-3">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Conclusive vs inconclusive measurements</p>
              <DistributionBar zero={b92.charts_data.inconclusive_count} one={b92.charts_data.conclusive_count} />
              <p className="mt-1 text-[10px] text-slate-400">grey = inconclusive (discarded), violet = conclusive (key)</p>
            </div>
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-5 text-slate-600">{b92.explanation}</p>
          </section>
        )}

        {protocol === "qrng" && qrng && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
            <h2 className="mb-4 text-lg font-semibold text-slate-800">QRNG result</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Bits" value={String(qrng.num_bits)} />
              <Stat label="Zeros" value={String(qrng.zero_count)} />
              <Stat label="Ones" value={String(qrng.one_count)} />
              <Stat label="Freq(1)" value={qrng.frequency_1.toFixed(3)} tone="violet" />
            </div>
            <div className="mt-3">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Bit distribution (ideal is 50/50)</p>
              <DistributionBar zero={qrng.zero_count} one={qrng.one_count} />
            </div>
            <div className="mt-3">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Generated bit string (sample)</p>
              <pre className="max-h-32 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] leading-4 text-slate-200">{qrng.bit_string}</pre>
            </div>
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-700">{qrng.explanation}</p>
          </section>
        )}

        {!bb84 && !e91 && !b92 && !qrng && (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
            Choose a protocol and click <b className="text-slate-600">Run protocol</b>. These are educational, protocol-level simulators (seeded for reproducibility) — not simulations of thousands of physical qubits, and QRNG is not a certified hardware generator.
          </section>
        )}
      </section>
    </div>
  );
}
