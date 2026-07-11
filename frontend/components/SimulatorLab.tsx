"use client";
import { useEffect, useMemo, useState } from "react";
import { labApi } from "@/lib/labApi";
import { LAB_PRESETS } from "@/lib/labPresets";
import { HONESTY_NOTE } from "@/lib/constants";
import type {
  CircuitAnalysis,
  EngineId,
  EnginesResponse,
  LabPreset,
  SimulationOptions,
  SimulationV2Response,
} from "@/lib/labTypes";
import type { CircuitData } from "@/lib/types";
import { CliffordBadge, FeasibilityBadge } from "./ui/FeasibilityBadge";
import { EngineReasonPanel } from "./ui/EngineReasonPanel";
import { HistogramPanel } from "./ui/HistogramPanel";
import { ResourceEstimateCard } from "./ui/ResourceEstimateCard";
import { Badge, EducationalCallout, Panel, SectionHeader, Spinner, StatTile, WarningCallout } from "./ui/primitives";

const ENGINE_ORDER: EngineId[] = ["auto", "aer_statevector", "aer_mps", "aer_stabilizer", "aer_density_matrix", "stim_stabilizer"];

type Notice = { kind: "info" | "error" | "success"; text: string };

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
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    labApi.engines().then(setEngines).catch(() => setEngines(null));
  }, []);

  const engineInfo = useMemo(() => new Map((engines?.engines ?? []).map((e) => [e.id, e])), [engines]);

  function loadPreset(preset: LabPreset) {
    setCircuit(preset.circuit);
    setCircuitLabel(preset.name);
    setEngine(preset.suggestedEngine);
    setAllowApprox(Boolean(preset.allowApproximation));
    setAnalysis(null);
    setResult(null);
    setNotice({ kind: preset.expectRejection ? "info" : "success", text: `Loaded "${preset.name}" (${preset.circuit.num_qubits} qubits). ${preset.teaches}` });
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
      setAnalysis(await labApi.analyze(circuit));
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
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Simulation failed." });
    } finally {
      setBusy(false);
    }
  }

  const selectedEngineInfo = engineInfo.get(engine);

  return (
    <div className="mx-auto grid max-w-[1800px] gap-5 p-5 lg:grid-cols-[340px_minmax(0,1fr)] lg:p-8">
      {/* Controls */}
      <aside className="space-y-5">
        <Panel className="p-4">
          <h2 className="mb-1 text-sm font-semibold text-lab-text">Circuit source</h2>
          <p className="mb-3 text-[11px] text-lab-faint">
            Active: <b className="text-lab-muted">{circuitLabel}</b> · {circuit.num_qubits} qubits · {circuit.operations.length} ops
          </p>
          <button
            type="button"
            onClick={loadFromComposer}
            className="mb-4 w-full rounded-lg border border-accent-cyan/30 bg-accent-cyan/10 px-3 py-2 text-xs font-semibold text-accent-cyan transition hover:bg-accent-cyan/20"
          >
            Load current composer circuit
          </button>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-lab-faint">Teaching presets</h3>
          <div className="space-y-1.5">
            {LAB_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => loadPreset(preset)}
                title={preset.teaches}
                className="group w-full rounded-lg border border-transparent px-2.5 py-2 text-left transition hover:border-lab-border hover:bg-lab-raised/50"
              >
                <span className="flex items-center justify-between">
                  <span className="text-xs font-medium text-lab-muted group-hover:text-accent-cyan">{preset.name}</span>
                  {preset.expectRejection && <span className="rounded bg-accent-red/15 px-1.5 py-0.5 text-[9px] font-semibold text-accent-red">REJECTS</span>}
                </span>
                <span className="mt-0.5 block text-[10px] leading-4 text-lab-faint">{preset.description}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-lab-text">Simulation options</h2>
          <label className="mb-1 block text-[11px] font-medium text-lab-muted">Engine</label>
          <select
            value={engine}
            onChange={(e) => setEngine(e.target.value as EngineId)}
            className="mb-2 w-full rounded-lg bg-lab-bg px-3 py-2 text-sm text-lab-text ring-1 ring-lab-border outline-none focus:ring-accent-cyan"
          >
            {ENGINE_ORDER.map((id) => {
              const info = engineInfo.get(id);
              const available = info?.available ?? true;
              return (
                <option key={id} value={id} disabled={!available}>
                  {info?.name ?? id}
                  {available ? "" : " (unavailable)"}
                </option>
              );
            })}
          </select>
          {selectedEngineInfo && (
            <p className="mb-3 text-[10px] leading-4 text-lab-faint">
              {selectedEngineInfo.description} <span className="text-lab-muted">{selectedEngineInfo.limitations}</span>
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-lab-muted">Shots</label>
              <input type="number" min={1} max={1000000} value={shots} onChange={(e) => setShots(Number(e.target.value))} className="w-full rounded-lg bg-lab-bg px-2 py-1.5 text-sm text-lab-text ring-1 ring-lab-border outline-none focus:ring-accent-cyan" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-lab-muted">Seed</label>
              <input type="number" value={seed} onChange={(e) => setSeed(e.target.value === "" ? "" : Number(e.target.value))} className="w-full rounded-lg bg-lab-bg px-2 py-1.5 text-sm text-lab-text ring-1 ring-lab-border outline-none focus:ring-accent-cyan" />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-[11px] font-medium text-lab-muted">Memory budget — {maxMemoryMb} MB</label>
              <input type="range" min={64} max={16384} step={64} value={maxMemoryMb} onChange={(e) => setMaxMemoryMb(Number(e.target.value))} className="w-full accent-cyan-400" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-lab-muted">MPS bond dim</label>
              <input type="number" min={1} placeholder="auto" value={mpsBond} onChange={(e) => setMpsBond(e.target.value === "" ? "" : Number(e.target.value))} className="w-full rounded-lg bg-lab-bg px-2 py-1.5 text-sm text-lab-text ring-1 ring-lab-border outline-none focus:ring-accent-cyan" />
            </div>
            <div className="flex flex-col justify-end gap-1.5">
              <label className="flex items-center gap-2 text-[11px] text-lab-muted"><input type="checkbox" checked={noiseEnabled} onChange={(e) => setNoiseEnabled(e.target.checked)} className="accent-cyan-400" /> Noise</label>
              <label className="flex items-center gap-2 text-[11px] text-lab-muted"><input type="checkbox" checked={allowApprox} onChange={(e) => setAllowApprox(e.target.checked)} className="accent-cyan-400" /> Allow MPS approx</label>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button type="button" disabled={busy} onClick={analyze} className="flex-1 rounded-lg border border-lab-border bg-lab-panel px-3 py-2 text-xs font-semibold text-lab-text transition hover:border-accent-cyan/40 disabled:opacity-50">Analyze circuit</button>
            <button type="button" disabled={busy} onClick={run} className="flex-1 rounded-lg bg-accent-cyan px-3 py-2 text-xs font-semibold text-lab-bg shadow-glow transition hover:brightness-110 disabled:opacity-50">{busy ? "Working…" : "Run simulation"}</button>
          </div>
        </Panel>
      </aside>

      {/* Analysis + results */}
      <section className="space-y-5">
        <EducationalCallout>
          <b>How large-circuit simulation really works.</b> {HONESTY_NOTE} A full statevector needs 16·2<sup>n</sup> bytes (~2×10<sup>16</sup> PB at n=100), so the router rejects infeasible circuits with an explanation instead of crashing. Real quantum hardware differs: the chip <i>is</i> the quantum system and returns measurement samples, not a 2<sup>n</sup> statevector.
        </EducationalCallout>

        {notice && (
          <div
            className={`rounded-lg border px-3 py-2 text-xs ${
              notice.kind === "error"
                ? "border-accent-red/30 bg-accent-red/[.07] text-red-200"
                : notice.kind === "success"
                  ? "border-accent-green/30 bg-accent-green/[.07] text-emerald-100"
                  : "border-accent-cyan/30 bg-accent-cyan/[.06] text-cyan-100"
            }`}
          >
            {notice.text}
          </div>
        )}

        {analysis && (
          <Panel className="p-5">
            <SectionHeader
              eyebrow="Feasibility analysis"
              title="Circuit analysis"
              right={
                <div className="flex flex-wrap gap-2">
                  <FeasibilityBadge status={analysis.feasibility_status} />
                  <CliffordBadge isClifford={analysis.is_clifford} />
                </div>
              }
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Qubits" value={analysis.num_qubits} />
              <StatTile label="Depth" value={analysis.depth} />
              <StatTile label="Operations" value={analysis.operation_count} />
              <StatTile label="2-qubit gates" value={analysis.two_qubit_gate_count} />
              <StatTile label="T-count" value={analysis.t_count} tone={analysis.t_count ? "violet" : "slate"} />
              <StatTile label="Rotations" value={analysis.rotation_count} />
              <StatTile label="Measurements" value={analysis.measurement_count} />
              <StatTile label="Non-Clifford" value={analysis.contains_non_clifford ? "yes" : "no"} tone={analysis.contains_non_clifford ? "amber" : "green"} />
            </div>
            <div className="mt-3">
              <ResourceEstimateCard analysis={analysis} />
            </div>
            <div className="mt-3">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-lab-faint">Recommended engines</p>
              <div className="flex flex-wrap gap-1.5">
                {analysis.recommended_engines.length === 0 && <span className="text-xs text-accent-red">None feasible — see warnings.</span>}
                {analysis.recommended_engines.map((e) => (
                  <span key={e} className="rounded-full border border-lab-border bg-lab-raised/60 px-2.5 py-0.5 font-mono text-[11px] text-accent-cyan">{e}</span>
                ))}
              </div>
            </div>
            {analysis.warnings.map((w) => (
              <div key={w} className="mt-2">
                <WarningCallout>{w}</WarningCallout>
              </div>
            ))}
          </Panel>
        )}

        {busy && !result && <Panel className="p-5"><Spinner label="Working…" /></Panel>}

        {result && (
          <Panel className="p-5">
            <SectionHeader eyebrow="Engine output" title="Simulation result" />
            <EngineReasonPanel result={result} />
            <div className="mt-4">
              <HistogramPanel counts={result.counts} />
            </div>
            {result.warnings.map((w) => (
              <div key={w} className="mt-2">
                <WarningCallout>{w}</WarningCallout>
              </div>
            ))}
            {result.diagram && (
              <pre className="mt-3 max-h-52 overflow-auto rounded-lg border border-lab-border bg-lab-surface p-3 font-mono text-[10px] text-slate-300">{result.diagram}</pre>
            )}
          </Panel>
        )}

        {engines && (
          <Panel className="p-4">
            <SectionHeader eyebrow="Backend" title="Available engines" />
            <div className="grid gap-2 sm:grid-cols-2">
              {engines.engines.filter((e) => e.id !== "auto").map((e) => (
                <div key={e.id} className="rounded-lg border border-lab-border bg-lab-raised/40 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-lab-text">{e.id}</span>
                    <Badge tone={e.available ? "green" : "neutral"}>{e.available ? "available" : "unavailable"}</Badge>
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-lab-faint">{e.description}</p>
                  {e.scales_to_large_structured_circuits && <span className="mt-1 inline-block rounded bg-accent-cyan/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent-cyan">scales to large structured circuits</span>}
                </div>
              ))}
            </div>
            {!engines.stim_available && (
              <p className="mt-3 text-[11px] text-lab-faint">
                Stim is not installed — <code className="text-accent-cyan">stim_stabilizer</code> is unavailable and <code className="text-accent-cyan">auto</code> falls back to Aer&apos;s stabilizer method. Install with <code className="text-accent-cyan">pip install -r requirements-stim.txt</code>.
              </p>
            )}
          </Panel>
        )}
      </section>
    </div>
  );
}
