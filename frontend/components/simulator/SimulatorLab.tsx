"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HONESTY_NOTE, LIMITS } from "@/lib/constants";
import { formatEngineName, formatInteger } from "@/lib/formatting";
import { labApi } from "@/lib/labApi";
import type {
  CircuitAnalysis,
  EngineId,
  EnginesResponse,
  LabPreset,
  SimulationOptions,
  SimulationV2Response,
} from "@/lib/labTypes";
import type { CircuitData } from "@/lib/types";
import { Badge, EducationalCallout, StatusNotice } from "../ui/primitives";
import { CircuitAnalysisPanel } from "./CircuitAnalysisPanel";
import { EngineAvailabilityPanel } from "./EngineAvailabilityPanel";
import { SimulationMethodGuide } from "./SimulationMethodGuide";
import { SimulationResultPanel } from "./SimulationResultPanel";
import { SimulatorControlPanel } from "./SimulatorControlPanel";
import {
  clampFloat,
  clampInteger,
  engineSupportsNoise,
  errorMessage,
  type OptionalNumber,
  type SimulatorNotice,
} from "./simulatorModel";

interface SimulatorLabProps {
  composerCircuit: CircuitData;
}

function orderedCircuit(circuit: CircuitData): CircuitData {
  return {
    ...circuit,
    operations: [...circuit.operations].sort((left, right) => left.moment - right.moment),
  };
}

export function SimulatorLab({ composerCircuit }: SimulatorLabProps) {
  const initialCircuit = useMemo(() => orderedCircuit(composerCircuit), [composerCircuit]);

  const [circuit, setCircuit] = useState<CircuitData>(initialCircuit);
  const [sourceId, setSourceId] = useState("composer");
  const [sourceLabel, setSourceLabel] = useState("Composer circuit");
  const [sourceNote, setSourceNote] = useState("Snapshot of the circuit handed off from the visual composer.");
  const [sourceExpectsRejection, setSourceExpectsRejection] = useState(false);

  const [engine, setEngine] = useState<EngineId>("auto");
  const [shots, setShots] = useState(() => clampInteger(initialCircuit.shots, LIMITS.shots.min, LIMITS.shots.v2Max, 1024));
  const [seed, setSeed] = useState<OptionalNumber>(42);
  const [noiseEnabled, setNoiseEnabled] = useState(false);
  const [allowApproximation, setAllowApproximation] = useState(false);
  const [maxMemoryMb, setMaxMemoryMb] = useState<number>(LIMITS.simulation.defaultMemoryBudgetMb);
  const [mpsBondDimension, setMpsBondDimension] = useState<OptionalNumber>("");
  const [mpsTruncationThreshold, setMpsTruncationThreshold] = useState<OptionalNumber>("");

  const [engines, setEngines] = useState<EnginesResponse | null>(null);
  const [engineLoading, setEngineLoading] = useState(true);
  const [engineError, setEngineError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<CircuitAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [result, setResult] = useState<SimulationV2Response | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [notice, setNotice] = useState<SimulatorNotice>({
    kind: "info",
    text: "The active composer circuit is being analyzed automatically.",
  });

  const engineRequestToken = useRef(0);
  const analysisRequestToken = useRef(0);
  const runRequestToken = useRef(0);

  const engineById = useMemo(
    () => new Map((engines?.engines ?? []).map((entry) => [entry.id, entry])),
    [engines],
  );

  const loadEngineCatalog = useCallback(async () => {
    const token = ++engineRequestToken.current;
    setEngineLoading(true);
    setEngineError(null);
    try {
      const catalog = await labApi.engines();
      if (token !== engineRequestToken.current) return;
      setEngines(catalog);
    } catch (error) {
      if (token !== engineRequestToken.current) return;
      setEngines(null);
      setEngineError(errorMessage(error, "The backend engine catalog could not be loaded."));
    } finally {
      if (token === engineRequestToken.current) setEngineLoading(false);
    }
  }, []);

  const requestAnalysis = useCallback(async (target: CircuitData, announce = false) => {
    const token = ++analysisRequestToken.current;
    setAnalysisLoading(true);
    setAnalysisError(null);
    setAnalysis(null);
    try {
      const nextAnalysis = await labApi.analyze(target);
      if (token !== analysisRequestToken.current) return;
      setAnalysis(nextAnalysis);
      if (announce) {
        setNotice({
          kind: "success",
          text: `Analysis refreshed: ${formatInteger(nextAnalysis.num_qubits)} qubits, ${nextAnalysis.feasibility_status.replaceAll("_", " ")}.`,
        });
      }
    } catch (error) {
      if (token !== analysisRequestToken.current) return;
      setAnalysisError(errorMessage(error, "Circuit analysis failed."));
    } finally {
      if (token === analysisRequestToken.current) setAnalysisLoading(false);
    }
  }, []);

  const invalidateRun = useCallback(() => {
    runRequestToken.current += 1;
    setRunLoading(false);
    setRunError(null);
    setResult(null);
  }, []);

  useEffect(() => {
    void loadEngineCatalog();
    return () => {
      engineRequestToken.current += 1;
    };
  }, [loadEngineCatalog]);

  useEffect(() => {
    void requestAnalysis(circuit);
  }, [circuit, requestAnalysis]);

  useEffect(() => () => {
    analysisRequestToken.current += 1;
    runRequestToken.current += 1;
  }, []);

  function activateCircuit(
    nextCircuit: CircuitData,
    nextSource: { id: string; label: string; note: string; expectsRejection: boolean },
    preset?: LabPreset,
  ) {
    analysisRequestToken.current += 1;
    setAnalysis(null);
    setAnalysisError(null);
    setAnalysisLoading(true);
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

    setNotice({
      kind: nextSource.expectsRejection ? "info" : "success",
      text: `Loaded ${nextSource.label}. Source shots synchronized to ${formatInteger(next.shots)}; feasibility analysis started.`,
    });
  }

  function loadComposerCircuit() {
    activateCircuit(
      composerCircuit,
      {
        id: "composer",
        label: "Composer circuit",
        note: "Current snapshot from the visual circuit composer.",
        expectsRejection: false,
      },
    );
  }

  function loadPreset(preset: LabPreset) {
    // Presets are compact descriptors; the concrete circuit JSON is generated
    // on demand (and cached) so module load and the DOM stay light.
    activateCircuit(
      preset.build(),
      {
        id: preset.id,
        label: preset.name,
        note: preset.teaches,
        expectsRejection: Boolean(preset.expectRejection),
      },
      preset,
    );
  }

  function updateEngine(nextEngine: EngineId) {
    invalidateRun();
    setEngine(nextEngine);
    if (!engineSupportsNoise(nextEngine) && noiseEnabled) {
      setNoiseEnabled(false);
      setNotice({
        kind: "info",
        text: `${formatEngineName(nextEngine)} does not implement the noise option, so noise was disabled.`,
      });
    }
    if (nextEngine === "aer_mps") setAllowApproximation(true);
    if (nextEngine !== "auto" && nextEngine !== "aer_mps") setAllowApproximation(false);
  }

  function updateShots(value: number) {
    invalidateRun();
    setShots(clampInteger(value, LIMITS.shots.min, LIMITS.shots.v2Max, 1024));
  }

  function updateSeed(value: OptionalNumber) {
    invalidateRun();
    setSeed(value === "" ? "" : clampInteger(value, 0, Number.MAX_SAFE_INTEGER, 0));
  }

  function updateNoise(enabled: boolean) {
    invalidateRun();
    setNoiseEnabled(engineSupportsNoise(engine) && enabled);
  }

  function updateAllowApproximation(enabled: boolean) {
    invalidateRun();
    setAllowApproximation(engine === "auto" && enabled);
  }

  function updateMaxMemory(value: number) {
    invalidateRun();
    setMaxMemoryMb(clampInteger(value, LIMITS.simulation.minMemoryBudgetMb, LIMITS.simulation.maxMemoryBudgetMb, LIMITS.simulation.defaultMemoryBudgetMb));
  }

  function updateMpsBondDimension(value: OptionalNumber) {
    invalidateRun();
    setMpsBondDimension(value === "" ? "" : clampInteger(value, 1, 100_000, 1));
  }

  function updateMpsTruncationThreshold(value: OptionalNumber) {
    invalidateRun();
    setMpsTruncationThreshold(value === "" ? "" : clampFloat(value, Number.EPSILON, 1, Number.EPSILON));
  }

  async function runSimulation() {
    const selectedEngine = engineById.get(engine);
    if (selectedEngine?.available === false) {
      setRunError(selectedEngine.unavailable_reason ?? `${selectedEngine.name} is unavailable.`);
      setResult(null);
      return;
    }

    const normalizedShots = clampInteger(shots, LIMITS.shots.min, LIMITS.shots.v2Max, 1024);
    const normalizedMemory = clampInteger(maxMemoryMb, LIMITS.simulation.minMemoryBudgetMb, LIMITS.simulation.maxMemoryBudgetMb, LIMITS.simulation.defaultMemoryBudgetMb);
    const normalizedBond = mpsBondDimension === "" ? null : clampInteger(mpsBondDimension, 1, 100_000, 1);
    const normalizedThreshold = mpsTruncationThreshold === ""
      ? null
      : clampFloat(mpsTruncationThreshold, Number.EPSILON, 1, Number.EPSILON);
    const normalizedSeed = seed === "" ? null : clampInteger(seed, 0, Number.MAX_SAFE_INTEGER, 0);
    const explicitMps = engine === "aer_mps";

    setShots(normalizedShots);
    setMaxMemoryMb(normalizedMemory);
    setMpsBondDimension(normalizedBond ?? "");
    setMpsTruncationThreshold(normalizedThreshold ?? "");
    setSeed(normalizedSeed ?? "");

    const options: SimulationOptions = {
      engine,
      shots: normalizedShots,
      noise_enabled: engineSupportsNoise(engine) && noiseEnabled,
      noise_model_type: "depolarizing",
      max_memory_mb: normalizedMemory,
      allow_approximation: explicitMps || (engine === "auto" && allowApproximation),
      mps_max_bond_dimension: normalizedBond,
      mps_truncation_threshold: normalizedThreshold,
      seed: normalizedSeed,
    };

    if (!analysis && !analysisLoading) void requestAnalysis(circuit);

    const token = ++runRequestToken.current;
    setRunLoading(true);
    setRunError(null);
    setResult(null);
    setNotice({
      kind: "info",
      text: `Running ${sourceLabel} with ${formatEngineName(engine)}. The configured budget is ${formatInteger(normalizedMemory)} MB.`,
    });

    try {
      const nextResult = await labApi.simulateV2(circuit, options);
      if (token !== runRequestToken.current) return;
      setResult(nextResult);
      setNotice({
        kind: "success",
        text: `${formatEngineName(nextResult.selected_engine)} returned ${formatInteger(Object.values(nextResult.counts).reduce((total, count) => total + count, 0))} samples. Engine execution: ${nextResult.timing_ms.toFixed(1)} ms.`,
      });
    } catch (error) {
      if (token !== runRequestToken.current) return;
      setRunError(errorMessage(error, "Simulation failed."));
      setNotice({
        kind: "error",
        text: "The run was rejected or failed. Review the engine response below before changing methods.",
      });
    } finally {
      if (token === runRequestToken.current) setRunLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1920px] p-4 sm:p-5 lg:p-6 2xl:p-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="instrument-label text-accent-cyan">Simulator Lab</p>
          <h1 className="mt-1 font-display text-xl font-semibold tracking-[-0.01em] text-lab-text sm:text-2xl">Feasibility-first execution bench</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-lab-muted">
            Analyze circuit structure, compare classical simulation methods, and run only through the backend&apos;s guarded V2 router.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="cyan">{formatInteger(circuit.num_qubits)} qubits</Badge>
          <Badge tone="neutral">{formatInteger(circuit.operations.length)} operations</Badge>
          <Badge tone={analysis?.is_clifford ? "green" : analysis ? "violet" : "neutral"}>
            {analysis ? (analysis.is_clifford ? "Clifford-compatible" : "Non-Clifford") : "classification pending"}
          </Badge>
        </div>
      </div>

      <div className="mb-4">
        <EducationalCallout>
          <strong>Structured large-circuit simulation only.</strong> {HONESTY_NOTE} Exact statevector memory grows as <span className="font-mono">16 × 2ⁿ bytes</span>, while density-matrix memory grows as <span className="font-mono">16 × 4ⁿ bytes</span>. Real hardware is different and is not connected to this lab.
        </EducationalCallout>
      </div>

      <div className="mb-4">
        <StatusNotice kind={notice.kind}>{notice.text}</StatusNotice>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_320px] 2xl:grid-cols-[330px_minmax(0,1fr)_360px]">
        <SimulatorControlPanel
          circuit={circuit}
          composerCircuit={composerCircuit}
          sourceId={sourceId}
          sourceLabel={sourceLabel}
          sourceNote={sourceNote}
          sourceExpectsRejection={sourceExpectsRejection}
          engines={engines}
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
          onEngineChange={updateEngine}
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

        <section className="min-w-0 space-y-4" aria-label="Circuit analysis and simulation results">
          <CircuitAnalysisPanel
            analysis={analysis}
            loading={analysisLoading}
            error={analysisError}
            engines={engines}
            runMemoryMb={maxMemoryMb}
            onRetry={() => void requestAnalysis(circuit, true)}
          />
          <SimulationResultPanel
            result={result}
            loading={runLoading}
            error={runError}
            onRetry={() => void runSimulation()}
          />
        </section>

        <aside className="space-y-4 lg:col-span-2 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 xl:col-span-1 xl:block xl:space-y-4" aria-label="Simulator method and availability reference">
          <SimulationMethodGuide analysis={analysis} engines={engines} />
          <EngineAvailabilityPanel
            engines={engines}
            loading={engineLoading}
            error={engineError}
            onRetry={() => void loadEngineCatalog()}
          />
        </aside>
      </div>
    </div>
  );
}
