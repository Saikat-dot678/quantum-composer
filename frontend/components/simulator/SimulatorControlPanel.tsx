"use client";

import { useState } from "react";
import { LIMITS } from "@/lib/constants";
import { LAB_PRESETS } from "@/lib/labPresets";
import { formatEngineName, formatInteger } from "@/lib/formatting";
import type { CircuitAnalysis, EngineId, EnginesResponse, LabPreset } from "@/lib/labTypes";
import type { CircuitData } from "@/lib/types";
import { PlayIcon, RefreshIcon } from "@/components/ui/icons";
import {
  Badge,
  Button,
  FormField,
  NumberInput,
  Toggle,
} from "../ui/primitives";
import {
  clampFloat,
  clampInteger,
  engineIsAvailable,
  engineSupportsNoise,
  engineUsesMpsControls,
  type OptionalNumber,
} from "./simulatorModel";

interface SimulatorControlPanelProps {
  circuit: CircuitData;
  composerCircuit: CircuitData;
  sourceId: string;
  sourceLabel: string;
  sourceNote: string;
  sourceExpectsRejection: boolean;
  engines: EnginesResponse | null;
  analysis: CircuitAnalysis | null;
  engine: EngineId;
  shots: number;
  seed: OptionalNumber;
  noiseEnabled: boolean;
  allowApproximation: boolean;
  maxMemoryMb: number;
  mpsBondDimension: OptionalNumber;
  mpsTruncationThreshold: OptionalNumber;
  analysisLoading: boolean;
  runLoading: boolean;
  onLoadComposer: () => void;
  onLoadPreset: (preset: LabPreset) => void;
  onShotsChange: (value: number) => void;
  onSeedChange: (value: OptionalNumber) => void;
  onNoiseChange: (enabled: boolean) => void;
  onAllowApproximationChange: (enabled: boolean) => void;
  onMaxMemoryChange: (value: number) => void;
  onMpsBondDimensionChange: (value: OptionalNumber) => void;
  onMpsTruncationThresholdChange: (value: OptionalNumber) => void;
  onAnalyze: () => void;
  onRun: () => void;
}

type RailView = "sources" | "options";

export function SimulatorControlPanel({
  circuit,
  composerCircuit,
  sourceId,
  sourceLabel,
  sourceNote,
  sourceExpectsRejection,
  engines,
  analysis,
  engine,
  shots,
  seed,
  noiseEnabled,
  allowApproximation,
  maxMemoryMb,
  mpsBondDimension,
  mpsTruncationThreshold,
  analysisLoading,
  runLoading,
  onLoadComposer,
  onLoadPreset,
  onShotsChange,
  onSeedChange,
  onNoiseChange,
  onAllowApproximationChange,
  onMaxMemoryChange,
  onMpsBondDimensionChange,
  onMpsTruncationThresholdChange,
  onAnalyze,
  onRun,
}: SimulatorControlPanelProps) {
  const [view, setView] = useState<RailView>("sources");
  const noiseSupported = engineSupportsNoise(engine);
  const mpsControlsEnabled = engineUsesMpsControls(engine, allowApproximation);
  const engineAvailable = engineIsAvailable(engine, engines, analysis);
  const controlsDisabled = runLoading;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-lab-surface/70">
      <div className="border-b border-lab-border p-3">
        <p className="instrument-label text-accent-cyan">Workload rail</p>
        <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-lab-border bg-lab-bg p-1" aria-label="Simulator rail view">
          {(["sources", "options"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={view === item}
              onClick={() => setView(item)}
              className={`min-h-8 rounded-md px-2 text-[11px] font-semibold capitalize transition ${view === item ? "bg-lab-raised text-accent-cyan" : "text-lab-faint hover:text-lab-muted"}`}
            >
              {item === "sources" ? "Circuits" : "Run options"}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === "sources" ? (
          <div className="p-3">
            <div className="border-l-2 border-accent-cyan bg-accent-cyan/[.045] px-3 py-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-lab-text">{sourceLabel}</p>
                  <p className="mt-1 text-[10px] leading-4 text-lab-muted">{sourceNote}</p>
                </div>
                {sourceExpectsRejection ? <Badge tone="red">rejection lesson</Badge> : <Badge tone="cyan">active</Badge>}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-lab-faint">
                <span>{formatInteger(circuit.num_qubits)}q</span>
                <span>{formatInteger(circuit.num_clbits)}c</span>
                <span>{formatInteger(circuit.operations.length)} ops</span>
                <span>{formatInteger(circuit.shots)} source shots</span>
              </div>
            </div>

            <button
              type="button"
              disabled={controlsDisabled}
              onClick={onLoadComposer}
              className={`mt-3 flex min-h-10 w-full items-center justify-between rounded-lg border px-3 text-left text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${sourceId === "composer" ? "border-accent-cyan/45 bg-accent-cyan/[.08] text-accent-cyan" : "border-lab-borderStrong bg-lab-raised/35 text-lab-text hover:border-accent-cyan/40"}`}
            >
              <span>Follow live Composer</span>
              <span className="font-mono text-[10px] text-lab-faint">{composerCircuit.num_qubits}q · {composerCircuit.operations.length} ops</span>
            </button>

            <div className="mt-4 flex items-center justify-between gap-2">
              <p className="instrument-label">Structured teaching workloads</p>
              <Badge tone="neutral">generated on demand</Badge>
            </div>
            <div className="mt-2 space-y-1.5">
              {LAB_PRESETS.map((preset) => {
                const active = sourceId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={controlsDisabled}
                    aria-pressed={active}
                    onClick={() => onLoadPreset(preset)}
                    className={`w-full border-l-2 px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${active ? "border-l-accent-cyan bg-accent-cyan/[.065]" : "border-l-lab-borderStrong bg-lab-raised/20 hover:border-l-accent-cyan/45 hover:bg-lab-raised/45"}`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className={`text-[11px] font-semibold ${active ? "text-accent-cyan" : "text-lab-text"}`}>{preset.name}</span>
                      {preset.expectRejection && <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-accent-red">rejects</span>}
                    </span>
                    <span className="mt-1 block text-[10px] leading-4 text-lab-faint">{preset.teaches}</span>
                    <span className="mt-1 block font-mono text-[9px] text-lab-faint">
                      {formatInteger(preset.descriptor.numQubits)}q · ~{formatInteger(preset.descriptor.operationsEstimate)} ops · {formatEngineName(preset.suggestedEngine)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-3">
            <div className="border-l-2 border-accent-cyan bg-lab-raised/35 px-3 py-2.5">
              <p className="instrument-label">Selected execution route</p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-accent-cyan">{formatEngineName(engine)}</span>
                <Badge tone={engineAvailable === false ? "red" : engineAvailable === true ? "green" : "neutral"} dot>
                  {engineAvailable === false ? "unavailable" : engineAvailable === true ? "available" : "checking"}
                </Badge>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-lab-faint">Select a method from the engine lanes in the analysis canvas.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <NumberInput
                id="simulator-shots"
                label="Measurement shots"
                min={LIMITS.shots.min}
                max={LIMITS.shots.v2Max}
                disabled={controlsDisabled}
                value={shots}
                onChange={(event) => onShotsChange(clampInteger(Number(event.target.value), LIMITS.shots.min, LIMITS.shots.v2Max, 1024))}
                hint="1–1,000,000 samples."
              />
              <NumberInput
                id="simulator-seed"
                label="Seed (optional)"
                min={0}
                max={Number.MAX_SAFE_INTEGER}
                disabled={controlsDisabled}
                value={seed}
                placeholder="random"
                onChange={(event) => {
                  const value = event.target.value;
                  onSeedChange(value === "" ? "" : clampInteger(Number(value), 0, Number.MAX_SAFE_INTEGER, 0));
                }}
                hint="Fix for repeatable sampling."
              />
            </div>

            <FormField
              htmlFor="simulator-memory-budget"
              label={<>Run budget <span className="font-mono text-accent-cyan">{formatInteger(maxMemoryMb)} MB</span></>}
              hint="A router guard, not a measurement of free server RAM. Engine lanes recalculate immediately."
            >
              <div className="flex items-center gap-2">
                <input
                  id="simulator-memory-budget"
                  type="range"
                  min={LIMITS.simulation.minMemoryBudgetMb}
                  max={LIMITS.simulation.maxMemoryBudgetMb}
                  step={16}
                  disabled={controlsDisabled}
                  value={maxMemoryMb}
                  onChange={(event) => onMaxMemoryChange(clampInteger(Number(event.target.value), LIMITS.simulation.minMemoryBudgetMb, LIMITS.simulation.maxMemoryBudgetMb, LIMITS.simulation.defaultMemoryBudgetMb))}
                  className="min-w-0 flex-1 accent-cyan-400 disabled:opacity-45"
                />
                <input
                  type="number"
                  aria-label="Run memory budget in megabytes"
                  min={LIMITS.simulation.minMemoryBudgetMb}
                  max={LIMITS.simulation.maxMemoryBudgetMb}
                  step={16}
                  disabled={controlsDisabled}
                  value={maxMemoryMb}
                  onChange={(event) => onMaxMemoryChange(clampInteger(Number(event.target.value), LIMITS.simulation.minMemoryBudgetMb, LIMITS.simulation.maxMemoryBudgetMb, LIMITS.simulation.defaultMemoryBudgetMb))}
                  className="h-9 w-24 rounded-md border border-lab-borderStrong bg-lab-bg px-2 text-right font-mono text-[11px] text-lab-text outline-none focus:border-accent-cyan"
                />
              </div>
            </FormField>

            <Toggle
              checked={noiseEnabled && noiseSupported}
              disabled={controlsDisabled || !noiseSupported}
              onChange={onNoiseChange}
              label="Depolarizing noise"
              description={noiseSupported ? "Auto or density matrix can model this option." : "Selecting this explicit engine disabled noise."}
            />

            <Toggle
              checked={engine === "aer_mps" ? true : allowApproximation}
              disabled={controlsDisabled || engine !== "auto"}
              onChange={onAllowApproximationChange}
              label={engine === "aer_mps" ? "MPS trade-off acknowledged" : "Allow Auto to try MPS"}
              description={engine === "auto" ? "Permits an entanglement-dependent approximation path after exact methods stop fitting." : "Only Auto uses this switch; choosing MPS directly is the opt-in."}
            />

            <details className="border-t border-lab-border pt-3" open={mpsControlsEnabled}>
              <summary className="cursor-pointer text-[11px] font-semibold text-lab-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan">MPS accuracy controls</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <NumberInput
                  id="simulator-mps-bond"
                  label="Maximum bond dimension"
                  min={1}
                  max={100_000}
                  disabled={controlsDisabled || !mpsControlsEnabled}
                  value={mpsBondDimension}
                  placeholder="backend default"
                  onChange={(event) => {
                    const value = event.target.value;
                    onMpsBondDimensionChange(value === "" ? "" : clampInteger(Number(value), 1, 100_000, 1));
                  }}
                  hint="A restrictive cap can truncate the state."
                />
                <NumberInput
                  id="simulator-mps-threshold"
                  label="Truncation threshold"
                  min={Number.EPSILON}
                  max={1}
                  step="any"
                  disabled={controlsDisabled || !mpsControlsEnabled}
                  value={mpsTruncationThreshold}
                  placeholder="backend default"
                  onChange={(event) => {
                    const value = event.target.value;
                    onMpsTruncationThresholdChange(value === "" ? "" : clampFloat(Number(value), Number.EPSILON, 1, Number.EPSILON));
                  }}
                  hint="Smaller retains more information and costs more."
                />
              </div>
            </details>
          </div>
        )}
      </div>

      <div className="border-t border-lab-border bg-lab-panel/95 p-3">
        {runLoading && (
          <p className="mb-2 flex items-center gap-2 text-[10px] leading-4 text-accent-amber">
            <RefreshIcon className="h-3.5 w-3.5 animate-spin" /> Options are locked while the synchronous backend run is active.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" loading={analysisLoading} disabled={runLoading} onClick={onAnalyze}>Analyze</Button>
          <Button variant="primary" size="sm" loading={runLoading} disabled={analysisLoading || engineAvailable === false} onClick={onRun}>
            {!runLoading && <PlayIcon className="h-3.5 w-3.5" />} Run
          </Button>
        </div>
        <p className="mt-2 text-[9px] leading-4 text-lab-faint">Classical simulation only. No hardware job is submitted.</p>
      </div>
    </div>
  );
}
