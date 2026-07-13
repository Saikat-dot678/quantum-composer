"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HONESTY_NOTE, LIMITS } from "@/lib/constants";
import { analyzeLocally } from "@/lib/feasibility";
import { formatEngineName, formatInteger } from "@/lib/formatting";
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
import { Activity, Play, RefreshCw } from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import { useRegisterActions, type RegisteredAction } from "@/components/workspace/ActionRegistry";
import { CircuitAnalysisPanel } from "./CircuitAnalysisPanel";
import { EngineAvailabilityPanel } from "./EngineAvailabilityPanel";
import { EngineScalingChart } from "./EngineScalingChart";
import { EngineStrip } from "./EngineStrip";
import { SimulationResultPanel } from "./SimulationResultPanel";
import { SimulatorControlPanel } from "./SimulatorControlPanel";
import {
  SIMULATOR_PREFERENCES_KEY,
  clampFloat,
  clampInteger,
  engineIsAvailable,
  engineSupportsNoise,
  errorMessage,
  isEngineId,
  parseSimulatorPreferences,
  preferredStabilizerEngine,
  type OptionalNumber,
  type SimulatorNotice,
  type SimulatorPreferences,
} from "./simulatorModel";

interface SimulatorLabProps {
  /** Live circuit from the shared workspace. */
  composerCircuit: CircuitData;
  /** One-time explicit handoff; defaults to the live circuit. */
  initialCircuit?: CircuitData;
  initialEngineParam?: string | null;
  initialSourceParam?: string | null;
}

type MobilePane = "source" | "engines" | "results";

function orderedCircuit(circuit: CircuitData): CircuitData {
  return { ...circuit, operations: [...circuit.operations].sort((left, right) => left.moment - right.moment) };
}

function presetById(id: string | null | undefined): LabPreset | null {
  return id ? LAB_PRESETS.find((preset) => preset.id === id) ?? null : null;
}

function countSamples(counts: Record<string, number>): number {
  let total = 0;
  for (const key in counts) {
    if (Object.prototype.hasOwnProperty.call(counts, key)) total += counts[key];
  }
  return total;
}

export function SimulatorLab({ composerCircuit, initialCircuit, initialEngineParam, initialSourceParam }: SimulatorLabProps) {
  const bootRef = useRef<{
    circuit: CircuitData;
    preset: LabPreset | null;
    engine: EngineId;
    sourceId: string;
    sourceLabel: string;
    sourceNote: string;
    expectsRejection: boolean;
  } | null>(null);

  if (!bootRef.current) {
    const preset = presetById(initialSourceParam);
    const circuit = orderedCircuit(preset ? preset.build() : initialCircuit ?? composerCircuit);
    const requestedEngine = isEngineId(initialEngineParam) ? initialEngineParam : null;
    bootRef.current = {
      circuit,
      preset,
      engine: requestedEngine ?? preset?.suggestedEngine ?? "auto",
      sourceId: preset?.id ?? "composer",
      sourceLabel: preset?.name ?? "Live Composer circuit",
      sourceNote: preset?.teaches ?? "Following the current circuit in the shared visual workspace.",
      expectsRejection: Boolean(preset?.expectRejection),
    };
  }
  const boot = bootRef.current;

  const [circuit, setCircuit] = useState<CircuitData>(boot.circuit);
  const [sourceId, setSourceId] = useState(boot.sourceId);
  const [sourceLabel, setSourceLabel] = useState(boot.sourceLabel);
  const [sourceNote, setSourceNote] = useState(boot.sourceNote);
  const [sourceExpectsRejection, setSourceExpectsRejection] = useState(boot.expectsRejection);

  const [engine, setEngine] = useState<EngineId>(boot.engine);
  const [shots, setShots] = useState(() => clampInteger(boot.circuit.shots, LIMITS.shots.min, LIMITS.shots.v2Max, 1024));
  const [seed, setSeed] = useState<OptionalNumber>(42);
  const [noiseEnabled, setNoiseEnabled] = useState(false);
  const [allowApproximation, setAllowApproximation] = useState(Boolean(boot.preset?.allowApproximation) || boot.engine === "aer_mps");
  const [maxMemoryMb, setMaxMemoryMb] = useState<number>(LIMITS.simulation.defaultMemoryBudgetMb);
  const [mpsBondDimension, setMpsBondDimension] = useState<OptionalNumber>("");
  const [mpsTruncationThreshold, setMpsTruncationThreshold] = useState<OptionalNumber>("");
  const [preferencesReady, setPreferencesReady] = useState(false);

  const [engines, setEngines] = useState<EnginesResponse | null>(null);
  const [engineLoading, setEngineLoading] = useState(true);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<CircuitAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationV2Response | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runElapsedMs, setRunElapsedMs] = useState(0);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [mobilePane, setMobilePane] = useState<MobilePane>("engines");
  const [hoveredLaneId, setHoveredLaneId] = useState<string | null>(null);
  const [notice, setNotice] = useState<SimulatorNotice>({
    kind: "info",
    text: "Circuit analysis starts automatically. Select an engine lane when its evidence matches your goal.",
  });

  const engineRequestToken = useRef(0);
  const analysisRequestToken = useRef(0);
  const runRequestToken = useRef(0);
  const lastComposerCircuit = useRef(composerCircuit);

  const localAnalysis = useMemo(() => analyzeLocally(circuit), [circuit]);
  const selectedEngineAvailable = engineIsAvailable(engine, engines, analysis);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SIMULATOR_PREFERENCES_KEY);
      const stored = parseSimulatorPreferences(raw ? JSON.parse(raw) : null);
      const preferredEngine = isEngineId(initialEngineParam)
        ? initialEngineParam
        : boot.preset
          ? boot.engine
          : stored.engine;
      const nextEngine = preferredEngine ?? boot.engine;
      setEngine(nextEngine);
      if (stored.shots !== undefined && !boot.preset) setShots(stored.shots);
      if (stored.seed !== undefined) setSeed(stored.seed);
      if (stored.maxMemoryMb !== undefined) setMaxMemoryMb(stored.maxMemoryMb);
      if (stored.mpsBondDimension !== undefined) setMpsBondDimension(stored.mpsBondDimension);
      if (stored.mpsTruncationThreshold !== undefined) setMpsTruncationThreshold(stored.mpsTruncationThreshold);
      setNoiseEnabled(engineSupportsNoise(nextEngine) && Boolean(stored.noiseEnabled));
      setAllowApproximation(nextEngine === "aer_mps" || Boolean(boot.preset?.allowApproximation) || Boolean(stored.allowApproximation));
    } catch {
      // Malformed or blocked preference storage falls back to safe defaults.
    } finally {
      setPreferencesReady(true);
    }
  }, [boot.engine, boot.preset, initialEngineParam]);

  useEffect(() => {
    if (!preferencesReady) return;
    const preferences: SimulatorPreferences = {
      engine,
      shots,
      seed,
      noiseEnabled,
      allowApproximation,
      maxMemoryMb,
      mpsBondDimension,
      mpsTruncationThreshold,
    };
    try {
      window.localStorage.setItem(SIMULATOR_PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
      // Preference persistence is optional; circuit/project persistence is separate.
    }
  }, [preferencesReady, engine, shots, seed, noiseEnabled, allowApproximation, maxMemoryMb, mpsBondDimension, mpsTruncationThreshold]);

  useEffect(() => {
    if (!preferencesReady) return;
    const url = new URL(window.location.href);
    url.searchParams.set("engine", engine);
    url.searchParams.set("source", sourceId);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [preferencesReady, engine, sourceId]);

  useEffect(() => {
    if (!runLoading || runStartedAt === null) return;
    const update = () => setRunElapsedMs(Date.now() - runStartedAt);
    update();
    const interval = window.setInterval(update, 120);
    return () => window.clearInterval(interval);
  }, [runLoading, runStartedAt]);

  const loadEngineCatalog = useCallback(async () => {
    const token = ++engineRequestToken.current;
    setEngineLoading(true);
    setEngineError(null);
    try {
      const catalog = await labApi.engines();
      if (token === engineRequestToken.current) setEngines(catalog);
    } catch (error) {
      if (token === engineRequestToken.current) {
        setEngines(null);
        setEngineError(errorMessage(error, "The backend engine catalog could not be loaded."));
      }
    } finally {
      if (token === engineRequestToken.current) setEngineLoading(false);
    }
  }, []);

  const requestAnalysis = useCallback(async (target: CircuitData, announce = false) => {
    const token = ++analysisRequestToken.current;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const nextAnalysis = await labApi.analyze(target);
      if (token !== analysisRequestToken.current) return;
      setAnalysis(nextAnalysis);
      if (announce) {
        setNotice({ kind: "success", text: `Analysis refreshed: ${formatInteger(nextAnalysis.num_qubits)} qubits · ${nextAnalysis.feasibility_status.replaceAll("_", " ")}.` });
      }
    } catch (error) {
      if (token === analysisRequestToken.current) {
        setAnalysis(null);
        setAnalysisError(errorMessage(error, "Circuit analysis failed."));
      }
    } finally {
      if (token === analysisRequestToken.current) setAnalysisLoading(false);
    }
  }, []);

  const invalidateRun = useCallback(() => {
    runRequestToken.current += 1;
    setRunLoading(false);
    setRunStartedAt(null);
    setRunElapsedMs(0);
    setRunError(null);
    setResult(null);
  }, []);

  const activateCircuit = useCallback((
    nextCircuit: CircuitData,
    nextSource: { id: string; label: string; note: string; expectsRejection: boolean },
    preset?: LabPreset,
  ) => {
    analysisRequestToken.current += 1;
    setAnalysis(null);
    setAnalysisError(null);
    invalidateRun();
    const next = orderedCircuit(nextCircuit);
    setCircuit(next);
    setSourceId(nextSource.id);
    setSourceLabel(nextSource.label);
    setSourceNote(nextSource.note);
    setSourceExpectsRejection(nextSource.expectsRejection);
    setShots(clampInteger(next.shots, LIMITS.shots.min, LIMITS.shots.v2Max, 1024));
    if (preset) {
      setEngine(preset.suggestedEngine);
      setAllowApproximation(Boolean(preset.allowApproximation) || preset.suggestedEngine === "aer_mps");
      if (!engineSupportsNoise(preset.suggestedEngine)) setNoiseEnabled(false);
    }
    setMobilePane("engines");
    setNotice({
      kind: nextSource.expectsRejection ? "info" : "success",
      text: `Loaded ${nextSource.label}. Its structure is being analyzed before execution.`,
    });
  }, [invalidateRun]);

  const loadComposerCircuit = useCallback(() => {
    activateCircuit(composerCircuit, {
      id: "composer",
      label: "Live Composer circuit",
      note: "Following the current circuit in the shared visual workspace.",
      expectsRejection: false,
    });
    lastComposerCircuit.current = composerCircuit;
  }, [activateCircuit, composerCircuit]);

  const loadPreset = useCallback((preset: LabPreset) => {
    activateCircuit(preset.build(), {
      id: preset.id,
      label: preset.name,
      note: preset.teaches,
      expectsRejection: Boolean(preset.expectRejection),
    }, preset);
  }, [activateCircuit]);

  useEffect(() => {
    void loadEngineCatalog();
    return () => { engineRequestToken.current += 1; };
  }, [loadEngineCatalog]);

  useEffect(() => {
    void requestAnalysis(circuit);
  }, [circuit, requestAnalysis]);

  useEffect(() => {
    if (sourceId !== "composer" || composerCircuit === lastComposerCircuit.current || runLoading) return;
    lastComposerCircuit.current = composerCircuit;
    activateCircuit(composerCircuit, {
      id: "composer",
      label: "Live Composer circuit",
      note: "Updated from the current circuit in the shared visual workspace.",
      expectsRejection: false,
    });
  }, [activateCircuit, composerCircuit, runLoading, sourceId]);

  useEffect(() => () => {
    analysisRequestToken.current += 1;
    runRequestToken.current += 1;
  }, []);

  function updateEngine(nextEngine: EngineId) {
    if (runLoading) return;
    invalidateRun();
    setEngine(nextEngine);
    if (!engineSupportsNoise(nextEngine) && noiseEnabled) {
      setNoiseEnabled(false);
      setNotice({ kind: "info", text: `${formatEngineName(nextEngine)} does not implement this noise option, so noise was disabled.` });
    } else {
      setNotice({ kind: "info", text: `${formatEngineName(nextEngine)} selected. Compatibility lanes now reflect this execution route.` });
    }
    if (nextEngine === "aer_mps") setAllowApproximation(true);
    else if (nextEngine !== "auto") setAllowApproximation(false);
  }

  function updateShots(value: number) {
    if (runLoading) return;
    invalidateRun();
    setShots(clampInteger(value, LIMITS.shots.min, LIMITS.shots.v2Max, 1024));
  }

  function updateSeed(value: OptionalNumber) {
    if (runLoading) return;
    invalidateRun();
    setSeed(value === "" ? "" : clampInteger(value, 0, Number.MAX_SAFE_INTEGER, 0));
  }

  function updateNoise(enabled: boolean) {
    if (runLoading) return;
    invalidateRun();
    setNoiseEnabled(engineSupportsNoise(engine) && enabled);
  }

  function updateAllowApproximation(enabled: boolean) {
    if (runLoading) return;
    invalidateRun();
    setAllowApproximation(engine === "auto" && enabled);
  }

  function updateMaxMemory(value: number) {
    if (runLoading) return;
    invalidateRun();
    setMaxMemoryMb(clampInteger(value, LIMITS.simulation.minMemoryBudgetMb, LIMITS.simulation.maxMemoryBudgetMb, LIMITS.simulation.defaultMemoryBudgetMb));
  }

  function updateMpsBondDimension(value: OptionalNumber) {
    if (runLoading) return;
    invalidateRun();
    setMpsBondDimension(value === "" ? "" : clampInteger(value, 1, 100_000, 1));
  }

  function updateMpsTruncationThreshold(value: OptionalNumber) {
    if (runLoading) return;
    invalidateRun();
    setMpsTruncationThreshold(value === "" ? "" : clampFloat(value, Number.EPSILON, 1, Number.EPSILON));
  }

  async function runSimulation() {
    if (runLoading) return;
    if (selectedEngineAvailable === false) {
      const selectedEngine = engines?.engines.find((entry) => entry.id === engine);
      setRunError(selectedEngine?.unavailable_reason ?? `${formatEngineName(engine)} is unavailable on this backend.`);
      setResult(null);
      setMobilePane("results");
      return;
    }

    const normalizedShots = clampInteger(shots, LIMITS.shots.min, LIMITS.shots.v2Max, 1024);
    const normalizedMemory = clampInteger(maxMemoryMb, LIMITS.simulation.minMemoryBudgetMb, LIMITS.simulation.maxMemoryBudgetMb, LIMITS.simulation.defaultMemoryBudgetMb);
    const normalizedBond = mpsBondDimension === "" ? null : clampInteger(mpsBondDimension, 1, 100_000, 1);
    const normalizedThreshold = mpsTruncationThreshold === "" ? null : clampFloat(mpsTruncationThreshold, Number.EPSILON, 1, Number.EPSILON);
    const normalizedSeed = seed === "" ? null : clampInteger(seed, 0, Number.MAX_SAFE_INTEGER, 0);
    const options: SimulationOptions = {
      engine,
      shots: normalizedShots,
      noise_enabled: engineSupportsNoise(engine) && noiseEnabled,
      noise_model_type: "depolarizing",
      max_memory_mb: normalizedMemory,
      allow_approximation: engine === "aer_mps" || (engine === "auto" && allowApproximation),
      mps_max_bond_dimension: normalizedBond,
      mps_truncation_threshold: normalizedThreshold,
      seed: normalizedSeed,
    };

    setShots(normalizedShots);
    setMaxMemoryMb(normalizedMemory);
    setMpsBondDimension(normalizedBond ?? "");
    setMpsTruncationThreshold(normalizedThreshold ?? "");
    setSeed(normalizedSeed ?? "");
    if (!analysis && !analysisLoading) void requestAnalysis(circuit);

    const token = ++runRequestToken.current;
    const startedAt = Date.now();
    setRunStartedAt(startedAt);
    setRunElapsedMs(0);
    setRunLoading(true);
    setRunError(null);
    setResult(null);
    setMobilePane("results");
    setNotice({ kind: "info", text: `Running ${sourceLabel} with ${formatEngineName(engine)} under a ${formatInteger(normalizedMemory)} MB declared budget.` });

    try {
      const nextResult = await labApi.simulateV2(circuit, options);
      if (token !== runRequestToken.current) return;
      setRunElapsedMs(Date.now() - startedAt);
      setResult(nextResult);
      setNotice({
        kind: "success",
        text: `${formatEngineName(nextResult.selected_engine)} returned ${formatInteger(countSamples(nextResult.counts))} samples in ${nextResult.timing_ms.toFixed(1)} ms of engine time.`,
      });
    } catch (error) {
      if (token !== runRequestToken.current) return;
      setRunElapsedMs(Date.now() - startedAt);
      setRunError(errorMessage(error, "Simulation failed."));
      setNotice({ kind: "error", text: "The selected run was rejected or failed. The execution dock contains the backend reason." });
    } finally {
      if (token === runRequestToken.current) {
        setRunLoading(false);
        setRunStartedAt(null);
      }
    }
  }

  const stabilizerEngine = preferredStabilizerEngine(engines);
  const actions: RegisteredAction[] = [
    { id: "simulator-run", group: "Simulator", label: "Run current simulation", hint: formatEngineName(engine), disabled: runLoading || analysisLoading || selectedEngineAvailable === false, run: () => void runSimulation() },
    { id: "simulator-analyze", group: "Simulator", label: "Analyze current circuit", hint: `${circuit.num_qubits}q · ${circuit.operations.length} ops`, disabled: analysisLoading || runLoading, run: () => void requestAnalysis(circuit, true) },
    { id: "simulator-engine-auto", group: "Simulator engines", label: "Use Auto router", disabled: runLoading, run: () => updateEngine("auto") },
    { id: "simulator-engine-statevector", group: "Simulator engines", label: "Select Statevector", disabled: runLoading || engineIsAvailable("aer_statevector", engines, analysis) === false, run: () => updateEngine("aer_statevector") },
    { id: "simulator-engine-stabilizer", group: "Simulator engines", label: `Select ${formatEngineName(stabilizerEngine)}`, disabled: runLoading || engineIsAvailable(stabilizerEngine, engines, analysis) === false, run: () => updateEngine(stabilizerEngine) },
    { id: "simulator-engine-mps", group: "Simulator engines", label: "Select Matrix Product State", hint: "approximation opt-in", disabled: runLoading || engineIsAvailable("aer_mps", engines, analysis) === false, run: () => updateEngine("aer_mps") },
    { id: "simulator-engine-density", group: "Simulator engines", label: "Select Density Matrix", hint: "noise capable", disabled: runLoading || engineIsAvailable("aer_density_matrix", engines, analysis) === false, run: () => updateEngine("aer_density_matrix") },
    { id: "simulator-source-composer", group: "Simulator workloads", label: "Load live Composer circuit", disabled: runLoading, run: loadComposerCircuit },
    ...LAB_PRESETS.map((preset) => ({
      id: `simulator-preset-${preset.id}`,
      group: "Simulator workloads",
      label: `Load workload: ${preset.name}`,
      hint: `${preset.descriptor.numQubits}q · ${formatEngineName(preset.suggestedEngine)}`,
      disabled: runLoading,
      run: () => loadPreset(preset),
    })),
  ];
  useRegisterActions("simulator-lab", actions);

  const noticeClass = notice.kind === "error"
    ? "border-danger-border bg-danger-bg text-danger-text"
    : notice.kind === "success"
      ? "border-safe-border bg-safe-bg text-safe-text"
      : "border-accent-100 bg-accent-50 text-accent-700";
  const offline = Boolean(engineError && analysisError);

  return (
    <div className="mx-auto max-w-[1920px] px-3 py-3 sm:px-4 lg:px-5">
      <header className="mb-3 overflow-hidden rounded-xl2 border border-line bg-surface shadow-floating">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="eyebrow text-accent-700">Simulator Lab</p>
              <Badge tone={sourceExpectsRejection ? "red" : "neutral"}>{sourceLabel}</Badge>
            </div>
            <h1 className="mt-1 font-display text-lg font-semibold tracking-[-0.01em] text-ink-900 sm:text-xl">Engine evidence, execution, and diagnostics in one bench</h1>
            <p className="mt-1 max-w-3xl text-[11px] leading-4 text-ink-500">Compare methods against the live circuit and selected options, then keep results docked while refining the route.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" loading={analysisLoading} disabled={runLoading} onClick={() => void requestAnalysis(circuit, true)}><Activity className="h-3.5 w-3.5" /> Analyze</Button>
            <Button variant="primary" size="sm" loading={runLoading} disabled={analysisLoading || selectedEngineAvailable === false} onClick={() => void runSimulation()}><Play className="h-3.5 w-3.5" /> Run {formatEngineName(engine)}</Button>
          </div>
        </div>

        <div className="flex overflow-x-auto border-t border-line-hairline bg-canvas-dim/50 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Active simulator telemetry">
          {[
            ["Circuit", `${formatInteger(circuit.num_qubits)}q · ${formatInteger(circuit.num_clbits)}c · ${formatInteger(circuit.operations.length)} ops`],
            ["Structure", localAnalysis.isClifford ? "Clifford-compatible" : `non-Clifford · T ${localAnalysis.tCount}`],
            ["Exact memory", localAnalysis.statevectorHuman],
            ["Selected route", formatEngineName(engine)],
            ["Run policy", `${formatInteger(maxMemoryMb)} MB · ${noiseEnabled ? "noise" : "ideal"} · ${allowApproximation ? "MPS allowed" : "exact first"}`],
          ].map(([label, value]) => (
            <div key={label} className="shrink-0 border-r border-line-hairline px-3 py-2 last:border-r-0 sm:px-4">
              <span className="block font-display text-[8px] font-semibold uppercase tracking-[.14em] text-ink-400">{label}</span>
              <span className="mt-0.5 block whitespace-nowrap font-mono text-[10px] font-semibold text-ink-900">{value}</span>
            </div>
          ))}
        </div>

        <div className={`border-t px-4 py-2 text-[10px] leading-4 sm:px-5 ${noticeClass}`} role={notice.kind === "error" ? "alert" : "status"} aria-live="polite">
          {notice.text}
        </div>
        <div className="border-t border-line-hairline bg-surface-sunken px-4 py-2 text-[9px] leading-4 text-ink-400 sm:px-5">
          <strong className="text-ink-700">Technical boundary:</strong> {HONESTY_NOTE} Statevector uses 16 × 2ⁿ bytes; density matrix uses 16 × 4ⁿ. A real QPU is a separate noisy sampling system and is not connected here.
        </div>
      </header>

      {offline && (
        <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl2 border border-danger-border bg-danger-bg px-4 py-3 text-xs text-danger-text">
          <span>The FastAPI analysis and engine catalog are unavailable. Workload selection and saved preferences remain local; execution requires the backend.</span>
          <Button variant="secondary" size="sm" onClick={() => { void loadEngineCatalog(); void requestAnalysis(circuit, true); }}><RefreshCw className="h-3.5 w-3.5" /> Retry backend</Button>
        </div>
      )}

      <nav className="mb-3 grid grid-cols-3 gap-1 rounded-lg border border-line bg-surface p-1 xl:hidden" aria-label="Simulator workspace pane">
        {([
          ["source", "Circuits"],
          ["engines", "Engine bench"],
          ["results", runLoading ? "Running…" : result ? "Results" : "Run dock"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={mobilePane === id} onClick={() => setMobilePane(id)} className={`min-h-9 rounded-md px-2 text-[11px] font-semibold transition ${mobilePane === id ? "bg-accent-50 text-accent-700" : "text-ink-400"}`}>{label}</button>
        ))}
      </nav>

      <div className="xl:grid xl:h-[calc(100vh-11rem)] xl:min-h-[42rem] xl:grid-cols-[260px_minmax(0,1fr)] xl:gap-3">
        <aside className={`${mobilePane === "source" ? "flex" : "hidden"} min-h-[32rem] flex-col overflow-hidden rounded-xl2 border border-line bg-surface shadow-floating xl:flex xl:min-h-0`} aria-label="Circuit sources and run options">
          <SimulatorControlPanel
            circuit={circuit}
            composerCircuit={composerCircuit}
            sourceId={sourceId}
            sourceLabel={sourceLabel}
            sourceNote={sourceNote}
            sourceExpectsRejection={sourceExpectsRejection}
            engines={engines}
            analysis={analysis}
            engine={engine}
            shots={shots}
            seed={seed}
            noiseEnabled={noiseEnabled}
            allowApproximation={allowApproximation}
            maxMemoryMb={maxMemoryMb}
            mpsBondDimension={mpsBondDimension}
            mpsTruncationThreshold={mpsTruncationThreshold}
            analysisLoading={analysisLoading}
            runLoading={runLoading}
            onLoadComposer={loadComposerCircuit}
            onLoadPreset={loadPreset}
            onShotsChange={updateShots}
            onSeedChange={updateSeed}
            onNoiseChange={updateNoise}
            onAllowApproximationChange={updateAllowApproximation}
            onMaxMemoryChange={updateMaxMemory}
            onMpsBondDimensionChange={updateMpsBondDimension}
            onMpsTruncationThresholdChange={updateMpsTruncationThreshold}
            onAnalyze={() => void requestAnalysis(circuit, true)}
            onRun={() => void runSimulation()}
          />
          <EngineAvailabilityPanel engines={engines} loading={engineLoading} error={engineError} onRetry={() => void loadEngineCatalog()} />
        </aside>

        <main className="mt-3 min-w-0 xl:mt-0 xl:grid xl:min-h-0 xl:grid-rows-[minmax(0,1fr)_minmax(14rem,26vh)] xl:gap-3">
          <div className={`${mobilePane === "engines" ? "block" : "hidden"} min-w-0 space-y-3 xl:block xl:min-h-0 xl:overflow-y-auto`}>
            <EngineStrip
              analysis={analysis}
              engines={engines}
              selectedEngine={engine}
              maxMemoryMb={maxMemoryMb}
              noiseEnabled={noiseEnabled}
              allowApproximation={allowApproximation}
              disabled={runLoading}
              onSelectEngine={updateEngine}
              onHoverLane={setHoveredLaneId}
            />
            <EngineScalingChart
              numQubits={analysis?.num_qubits ?? circuit.num_qubits}
              maxMemoryMb={maxMemoryMb}
              isClifford={analysis?.is_clifford ?? null}
              highlightLaneId={hoveredLaneId}
            />
            <div className="overflow-hidden rounded-xl2 border border-line bg-surface shadow-floating">
              <CircuitAnalysisPanel analysis={analysis} loading={analysisLoading} error={analysisError} engines={engines} runMemoryMb={maxMemoryMb} onRetry={() => void requestAnalysis(circuit, true)} />
            </div>
          </div>

          <div className={`${mobilePane === "results" ? "block" : "hidden"} mt-3 min-w-0 overflow-hidden rounded-xl2 border border-line bg-surface shadow-floating xl:mt-0 xl:block xl:min-h-0`}>
            <SimulationResultPanel result={result} loading={runLoading} error={runError} elapsedMs={runElapsedMs} onRetry={() => void runSimulation()} />
          </div>
        </main>
      </div>
    </div>
  );
}
