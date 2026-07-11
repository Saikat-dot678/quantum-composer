"use client";
import { useEffect, useMemo, useState } from "react";
import { labApi } from "@/lib/labApi";
import { LAB_PRESETS } from "@/lib/labPresets";
import type {
  CircuitAnalysis,
  EngineId,
  EnginesResponse,
  LabPreset,
  SimulationOptions,
  SimulationV2Response,
} from "@/lib/labTypes";
import type { CircuitData } from "@/lib/types";

const ENGINE_ORDER: EngineId[] = [
  "auto",
  "aer_statevector",
  "aer_mps",
  "aer_stabilizer",
  "aer_density_matrix",
  "stim_stabilizer",
];

function badgeColor(status: string): string {
  if (["clifford_scalable", "exact_feasible", "safe"].includes(status)) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (["exact_borderline", "heavy"].includes(status)) return "bg-amber-50 text-amber-700 border-amber-200";
  if (["dangerous"].includes(status)) return "bg-orange-50 text-orange-700 border-orange-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
}

function truncateKey(key: string): string {
  if (key.length <= 24) return key;
  return `${key.slice(0, 14)}…${key.slice(-8)} (${key.length} bits)`;
}

function CountsView({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, v]) => sum + v, 0) || 1;
  const shown = entries.slice(0, 16);
  return (
    <div className="space-y-1.5">
      {shown.map(([key, value]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="w-56 shrink-0 truncate font-mono text-[11px] text-slate-500" title={key}>
            {truncateKey(key)}
          </span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
            <div className="h-full rounded bg-violet-500" style={{ width: `${(value / total) * 100}%` }} />
          </div>
          <span className="w-16 shrink-0 text-right font-mono text-[11px] text-slate-600">{value}</span>
        </div>
      ))}
      {entries.length > shown.length && (
        <p className="text-[11px] text-slate-400">+ {entries.length - shown.length} more outcome(s)</p>
      )}
    </div>
  );
}

interface Props {
  composerCircuit: CircuitData;
}

export function SimulatorLab({ composerCircuit }: Props) {
  const [engines, setEngines] = useState<EnginesResponse | null>(null);
  const [circuit, setCircuit] = useState<CircuitData>(composerCircuit);
  const [circuitLabel, setCircuitLabel] = useState("Composer circuit");
  const [engine, setEngine] = useState<EngineId>("auto");
  const [shots, setShots] = useState(1024);
  const [seed, setSeed] = useState<number | "">(42);
  const [noiseEnabled, setNoiseEnabled] = useState(false);
  const [allowApprox, setAllowApprox] = useState(false);
  const [maxMemoryMb, setMaxMemoryMb] = useState(1024);
  const [mpsBond, setMpsBond] = useState<number | "">("");

  const [analysis, setAnalysis] = useState<CircuitAnalysis | null>(null);
  const [result, setResult] = useState<SimulationV2Response | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    labApi.engines().then(setEngines).catch(() => setEngines(null));
  }, []);

  const engineInfo = useMemo(() => {
    const map = new Map((engines?.engines ?? []).map((e) => [e.id, e]));
    return map;
  }, [engines]);

  function loadPreset(preset: LabPreset) {
    setCircuit(preset.circuit);
    setCircuitLabel(preset.name);
    setEngine(preset.suggestedEngine);
    setAllowApprox(Boolean(preset.allowApproximation));
    setAnalysis(null);
    setResult(null);
    setNotice({
      kind: preset.expectRejection ? "info" : "success",
      text: `Loaded "${preset.name}" (${preset.circuit.num_qubits} qubits). ${preset.teaches}`,
    });
  }

  function loadFromComposer() {
    setCircuit(composerCircuit);
    setCircuitLabel("Composer circuit");
    setAnalysis(null);
    setResult(null);
    setNotice({ kind: "success", text: "Loaded the current composer circuit." });
  }

  async function analyze() {
    setBusy(true);
    setNotice({ kind: "info", text: "Analyzing circuit structure…" });
    try {
      const data = await labApi.analyze(circuit);
      setAnalysis(data);
      setNotice({ kind: "success", text: "Analysis complete." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Analysis failed." });
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    setBusy(true);
    setResult(null);
    setNotice({ kind: "info", text: "Routing to a feasible engine and running…" });
    const options: SimulationOptions = {
      engine,
      shots,
      noise_enabled: noiseEnabled,
      noise_model_type: "depolarizing",
      max_memory_mb: maxMemoryMb,
      allow_approximation: allowApprox,
      mps_max_bond_dimension: mpsBond === "" ? null : Number(mpsBond),
      mps_truncation_threshold: null,
      seed: seed === "" ? null : Number(seed),
    };
    try {
      if (!analysis) {
        try {
          setAnalysis(await labApi.analyze(circuit));
        } catch {
          /* analysis is best-effort before running */
        }
      }
      const data = await labApi.simulateV2(circuit, options);
      setResult(data);
      setNotice({ kind: "success", text: `Ran on ${data.selected_engine} in ${data.timing_ms.toFixed(1)} ms.` });
    } catch (error) {
      // Honest rejection is expected for infeasible circuits: show it clearly.
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Simulation failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1800px] gap-5 p-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:p-8">
      {/* Left: circuit source + options */}
      <aside className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-panel">
          <h2 className="mb-1 text-sm font-semibold text-slate-800">Circuit source</h2>
          <p className="mb-3 text-[11px] text-slate-400">Active: <b className="text-slate-600">{circuitLabel}</b> · {circuit.num_qubits} qubits · {circuit.operations.length} ops</p>
          <button type="button" onClick={loadFromComposer} className="mb-3 w-full rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700">
            Load current composer circuit
          </button>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Teaching presets</h3>
          <div className="space-y-1.5">
            {LAB_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => loadPreset(preset)}
                title={preset.teaches}
                className="group w-full rounded-lg border border-transparent px-2.5 py-2 text-left transition hover:border-slate-200 hover:bg-slate-50"
              >
                <span className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700 group-hover:text-violet-700">{preset.name}</span>
                  {preset.expectRejection && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[9px] font-semibold text-rose-600">REJECTS</span>}
                </span>
                <span className="mt-0.5 block text-[10px] leading-4 text-slate-400">{preset.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-panel">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Simulation options</h2>
          <label className="mb-1 block text-[11px] font-medium text-slate-500">Engine</label>
          <select value={engine} onChange={(e) => setEngine(e.target.value as EngineId)} className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            {ENGINE_ORDER.map((id) => {
              const info = engineInfo.get(id);
              const available = info?.available ?? true;
              return (
                <option key={id} value={id} disabled={!available}>
                  {info?.name ?? id}{available ? "" : " (unavailable)"}
                </option>
              );
            })}
          </select>
          {engineInfo.get(engine) && (
            <p className="mb-3 text-[10px] leading-4 text-slate-400">{engineInfo.get(engine)!.description} · <span className="text-slate-500">{engineInfo.get(engine)!.limitations}</span></p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">Shots</label>
              <input type="number" min={1} max={1000000} value={shots} onChange={(e) => setShots(Number(e.target.value))} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">Seed</label>
              <input type="number" value={seed} onChange={(e) => setSeed(e.target.value === "" ? "" : Number(e.target.value))} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-[11px] font-medium text-slate-500">Memory budget (MB) — {maxMemoryMb}</label>
              <input type="range" min={64} max={16384} step={64} value={maxMemoryMb} onChange={(e) => setMaxMemoryMb(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">MPS bond dim</label>
              <input type="number" min={1} placeholder="auto" value={mpsBond} onChange={(e) => setMpsBond(e.target.value === "" ? "" : Number(e.target.value))} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
            </div>
            <div className="flex flex-col justify-end gap-1.5">
              <label className="flex items-center gap-2 text-[11px] text-slate-600"><input type="checkbox" checked={noiseEnabled} onChange={(e) => setNoiseEnabled(e.target.checked)} /> Noise</label>
              <label className="flex items-center gap-2 text-[11px] text-slate-600"><input type="checkbox" checked={allowApprox} onChange={(e) => setAllowApprox(e.target.checked)} /> Allow MPS approx</label>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button type="button" disabled={busy} onClick={analyze} className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">Analyze circuit</button>
            <button type="button" disabled={busy} onClick={run} className="flex-1 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{busy ? "Working…" : "Run simulation"}</button>
          </div>
        </section>
      </aside>

      {/* Right: analysis + results */}
      <section className="space-y-5">
        <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 text-[12px] leading-5 text-violet-900">
          <b>How large-circuit simulation really works.</b> 100+ qubit support only applies to <b>structured</b> circuits: Clifford/stabilizer (Stim, Aer&nbsp;stabilizer) or low-entanglement (Aer&nbsp;MPS). Arbitrary 100-qubit statevector simulation needs 16·2<sup>n</sup> bytes (~2×10<sup>16</sup> PB at n=100) and is infeasible — the router rejects it with an explanation instead of crashing. Real quantum hardware differs: the chip <i>is</i> the quantum system and returns measurement samples, not a 2<sup>n</sup> statevector.
        </section>

        {notice && (
          <div className={`rounded-lg px-3 py-2 text-xs ${notice.kind === "error" ? "bg-rose-50 text-rose-700" : notice.kind === "success" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>{notice.text}</div>
        )}

        {analysis && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-800">Circuit analysis</h2>
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${badgeColor(analysis.feasibility_status)}`}>{analysis.feasibility_status.replace(/_/g, " ")}</span>
                <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${analysis.is_clifford ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>{analysis.is_clifford ? "Clifford" : "non-Clifford"}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Qubits", analysis.num_qubits],
                ["Depth", analysis.depth],
                ["Operations", analysis.operation_count],
                ["2-qubit gates", analysis.two_qubit_gate_count],
                ["T-count", analysis.t_count],
                ["Rotations", analysis.rotation_count],
                ["Measurements", analysis.measurement_count],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
                  <p className="font-mono text-sm font-semibold text-slate-800">{value as number}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Statevector memory (exact)</p>
                <p className="font-mono text-sm text-slate-800">{analysis.estimated_statevector_memory_human}</p>
                <span className={`mt-1 inline-block rounded border px-2 py-0.5 text-[10px] font-semibold ${badgeColor(analysis.statevector_risk)}`}>{analysis.statevector_risk}</span>
              </div>
              <div className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Density-matrix memory (noisy)</p>
                <p className="font-mono text-sm text-slate-800">{analysis.estimated_density_matrix_memory_human}</p>
                <span className={`mt-1 inline-block rounded border px-2 py-0.5 text-[10px] font-semibold ${badgeColor(analysis.density_matrix_risk)}`}>{analysis.density_matrix_risk}</span>
              </div>
            </div>
            <div className="mt-3">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Recommended engines</p>
              <div className="flex flex-wrap gap-1.5">
                {analysis.recommended_engines.length === 0 && <span className="text-xs text-rose-600">None feasible — see warnings.</span>}
                {analysis.recommended_engines.map((e) => (
                  <span key={e} className="rounded-full bg-violet-50 px-2.5 py-0.5 font-mono text-[11px] text-violet-700">{e}</span>
                ))}
              </div>
            </div>
            {analysis.warnings.map((w) => (
              <p key={w} className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">{w}</p>
            ))}
          </section>
        )}

        {result && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-800">Simulation result</h2>
              <div className="flex gap-2">
                <span className="rounded-full bg-slate-950 px-3 py-1 font-mono text-[11px] text-white">{result.selected_engine}</span>
                <span className="rounded-lg bg-slate-100 px-3 py-1 text-[11px] text-slate-500">{result.timing_ms.toFixed(1)} ms</span>
              </div>
            </div>
            <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">{result.engine_reason}</p>
            <CountsView counts={result.counts} />
            {result.warnings.map((w) => (
              <p key={w} className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">{w}</p>
            ))}
            {result.diagram && (
              <pre className="mt-3 max-h-52 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] text-slate-200">{result.diagram}</pre>
            )}
          </section>
        )}

        {engines && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-panel">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Available engines</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {engines.engines.filter((e) => e.id !== "auto").map((e) => (
                <div key={e.id} className="rounded-lg border border-slate-200 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">{e.name}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${e.available ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{e.available ? "available" : "unavailable"}</span>
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-slate-400">{e.description}</p>
                  {e.scales_to_large_structured_circuits && <span className="mt-1 inline-block rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-semibold text-violet-600">scales to large structured circuits</span>}
                </div>
              ))}
            </div>
          </section>
        )}
      </section>
    </div>
  );
}
