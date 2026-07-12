"use client";

import { useMemo } from "react";
import { LIMITS } from "@/lib/constants";
import { LAB_PRESETS } from "@/lib/labPresets";
import { formatEngineName, formatInteger } from "@/lib/formatting";
import type { EngineId, EnginesResponse, LabPreset } from "@/lib/labTypes";
import type { CircuitData } from "@/lib/types";
import {
  Badge,
  Button,
  Callout,
  FormField,
  NumberInput,
  Panel,
  SectionHeader,
  SelectField,
  Toggle,
} from "../ui/primitives";
import {
  ENGINE_ORDER,
  clampFloat,
  clampInteger,
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
  onEngineChange: (engine: EngineId) => void;
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

export function SimulatorControlPanel({
  circuit,
  composerCircuit,
  sourceId,
  sourceLabel,
  sourceNote,
  sourceExpectsRejection,
  engines,
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
  onEngineChange,
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
  const engineInfo = useMemo(
    () => new Map((engines?.engines ?? []).map((entry) => [entry.id, entry])),
    [engines],
  );
  const selectedEngine = engineInfo.get(engine);
  const selectedUnavailable = selectedEngine?.available === false;
  const noiseSupported = engineSupportsNoise(engine);
  const mpsControlsEnabled = engineUsesMpsControls(engine, allowApproximation);
  const explicitMps = engine === "aer_mps";

  return (
    <aside className="space-y-4" aria-label="Simulator controls">
      <Panel className="p-4">
        <SectionHeader
          eyebrow="Circuit source"
          title="Active workload"
          description="Load the live composer circuit or a teaching workload. Every source is analyzed automatically."
        />

        <div className="rounded-lg border border-accent-cyan/25 bg-accent-cyan/[.045] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-lab-text">{sourceLabel}</p>
            {sourceExpectsRejection && <Badge tone="red">rejection lesson</Badge>}
          </div>
          <p className="mt-1 text-[11px] leading-4 text-lab-muted">{sourceNote}</p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-lab-bg/80 px-2 py-1.5">
              <dt className="instrument-label">Qubits</dt>
              <dd className="mt-0.5 font-mono text-xs font-semibold text-lab-text">{formatInteger(circuit.num_qubits)}</dd>
            </div>
            <div className="rounded-md bg-lab-bg/80 px-2 py-1.5">
              <dt className="instrument-label">Operations</dt>
              <dd className="mt-0.5 font-mono text-xs font-semibold text-lab-text">{formatInteger(circuit.operations.length)}</dd>
            </div>
            <div className="rounded-md bg-lab-bg/80 px-2 py-1.5">
              <dt className="instrument-label">Source shots</dt>
              <dd className="mt-0.5 font-mono text-xs font-semibold text-lab-text">{formatInteger(circuit.shots)}</dd>
            </div>
          </dl>
        </div>

        <Button
          variant={sourceId === "composer" ? "primary" : "secondary"}
          size="sm"
          className="mt-3 w-full"
          onClick={onLoadComposer}
        >
          Load current composer circuit
          <span className="font-mono text-[10px] opacity-70">{composerCircuit.num_qubits}q</span>
        </Button>

        <div className="mt-4">
          <p className="instrument-label mb-2">Teaching presets</p>
          <div className="max-h-[390px] space-y-1.5 overflow-y-auto pr-1">
            {LAB_PRESETS.map((preset) => {
              const active = sourceId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onLoadPreset(preset)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan ${
                    active
                      ? "border-accent-cyan/45 bg-accent-cyan/[.08]"
                      : "border-lab-border bg-lab-raised/35 hover:border-lab-borderStrong hover:bg-lab-raised/70"
                  }`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className={`text-xs font-semibold ${active ? "text-accent-cyan" : "text-lab-text"}`}>
                      {preset.name}
                    </span>
                    {preset.expectRejection && <Badge tone="red" className="shrink-0 px-1.5 py-0.5 text-[9px]">rejects</Badge>}
                  </span>
                  <span className="mt-1 block text-[11px] leading-4 text-lab-faint">{preset.description}</span>
                  <span className="mt-1 block font-mono text-[10px] text-lab-faint">
                    {formatInteger(preset.descriptor.numQubits)}q · ~{formatInteger(preset.descriptor.operationsEstimate)} ops · {preset.descriptor.family.replaceAll("_", " ")}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-4 text-lab-faint">
            Presets are generated on demand from compact descriptors — nothing is drawn on the visual grid. Protocol-level workloads (BB84, E91, B92, QRNG) live in the Cryptography Lab tab.
          </p>
        </div>
      </Panel>

      <Panel className="p-4">
        <SectionHeader
          eyebrow="Execution setup"
          title="Simulation controls"
          description="The V2 router checks the selected method before allocating exact state memory."
        />

        <div className="space-y-4">
          <SelectField
            id="simulator-engine"
            label="Engine"
            value={engine}
            onChange={(event) => onEngineChange(event.target.value as EngineId)}
            hint={selectedEngine?.description ?? "Engine availability is loaded from the backend catalog."}
          >
            {ENGINE_ORDER.map((id) => {
              const info = engineInfo.get(id);
              return (
                <option key={id} value={id} disabled={info?.available === false}>
                  {info?.name ?? formatEngineName(id)}{info?.available === false ? " (unavailable)" : ""}
                </option>
              );
            })}
          </SelectField>

          {selectedEngine && (
            <div className="rounded-lg border border-lab-border bg-lab-raised/35 p-3 text-[11px] leading-4 text-lab-muted">
              <p><span className="font-semibold text-lab-text">Best for:</span> {selectedEngine.best_for}</p>
              <p className="mt-1"><span className="font-semibold text-lab-text">Limit:</span> {selectedEngine.limitations}</p>
            </div>
          )}

          {selectedUnavailable && (
            <Callout tone="danger" title="Selected engine unavailable">
              {selectedEngine?.unavailable_reason ?? "The backend reports that this engine cannot run."}
            </Callout>
          )}

          {explicitMps && (
            <Callout tone="warning" title="Explicit MPS is an approximation opt-in">
              Selecting Aer MPS directly bypasses the auto router&apos;s approximation gate. Accuracy and runtime depend on entanglement and bond-dimension growth.
            </Callout>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <NumberInput
              id="simulator-shots"
              label="Measurement shots"
              min={LIMITS.shots.min}
              max={LIMITS.shots.v2Max}
              value={shots}
              onChange={(event) => onShotsChange(clampInteger(Number(event.target.value), LIMITS.shots.min, LIMITS.shots.v2Max, 1024))}
              hint="V2 accepts 1 to 1,000,000 samples."
            />
            <NumberInput
              id="simulator-seed"
              label="Seed (optional)"
              min={0}
              max={Number.MAX_SAFE_INTEGER}
              value={seed}
              placeholder="random"
              onChange={(event) => {
                const value = event.target.value;
                onSeedChange(value === "" ? "" : clampInteger(Number(value), 0, Number.MAX_SAFE_INTEGER, 0));
              }}
              hint="Set a non-negative seed for repeatable samples."
            />
          </div>

          <FormField
            htmlFor="simulator-memory-budget"
            label={<>Run memory budget <span className="font-mono text-accent-cyan">{formatInteger(maxMemoryMb)} MB</span></>}
            hint="This budget is sent to simulate-v2. It does not measure the server's physical RAM."
          >
            <input
              id="simulator-memory-budget"
              type="range"
              min={LIMITS.simulation.minMemoryBudgetMb}
              max={LIMITS.simulation.maxMemoryBudgetMb}
              step={16}
              value={maxMemoryMb}
              onChange={(event) => onMaxMemoryChange(clampInteger(Number(event.target.value), LIMITS.simulation.minMemoryBudgetMb, LIMITS.simulation.maxMemoryBudgetMb, LIMITS.simulation.defaultMemoryBudgetMb))}
              className="w-full accent-cyan-400"
            />
          </FormField>

          <Toggle
            checked={noiseEnabled && noiseSupported}
            disabled={!noiseSupported}
            onChange={onNoiseChange}
            label="Depolarizing noise"
            description={
              noiseSupported
                ? "Auto routes feasible noisy workloads to density-matrix simulation."
                : "Noise is only implemented by Auto and Aer density matrix; this engine would ignore it."
            }
          />

          <Toggle
            checked={explicitMps ? true : allowApproximation}
            disabled={engine !== "auto"}
            onChange={onAllowApproximationChange}
            label={explicitMps ? "MPS approximation acknowledged" : "Allow auto-router MPS"}
            description={
              explicitMps
                ? "Direct MPS selection already opts into its entanglement-dependent trade-offs."
                : engine === "auto"
                  ? "When exact simulation is infeasible, Auto may try MPS for a low-entanglement circuit."
                  : "This switch only affects Auto. Choose Aer MPS directly to request that method."
            }
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <NumberInput
              id="simulator-mps-bond"
              label="MPS max bond (optional)"
              min={1}
              max={100_000}
              disabled={!mpsControlsEnabled}
              value={mpsBondDimension}
              placeholder="backend default"
              onChange={(event) => {
                const value = event.target.value;
                onMpsBondDimensionChange(value === "" ? "" : clampInteger(Number(value), 1, 100_000, 1));
              }}
              hint="A cap can control cost but may truncate the state."
            />
            <NumberInput
              id="simulator-mps-threshold"
              label="MPS truncation (optional)"
              min={Number.MIN_VALUE}
              max={1}
              step="any"
              disabled={!mpsControlsEnabled}
              value={mpsTruncationThreshold}
              placeholder="backend default"
              onChange={(event) => {
                const value = event.target.value;
                onMpsTruncationThresholdChange(value === "" ? "" : clampFloat(Number(value), Number.EPSILON, 1, Number.EPSILON));
              }}
              hint="Smaller thresholds retain more information and cost more."
            />
          </div>

          <Callout tone="info" title="Two different memory baselines">
            Analyze uses the backend&apos;s fixed 1,024 MB baseline. The slider above affects only the simulation run, so its final resource classification may differ.
          </Callout>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" loading={analysisLoading} disabled={runLoading} onClick={onAnalyze}>
              Re-analyze
            </Button>
            <Button variant="primary" loading={runLoading} disabled={analysisLoading || selectedUnavailable} onClick={onRun}>
              Run simulation
            </Button>
          </div>

          <p className="text-[11px] leading-4 text-lab-faint">
            No hardware job is submitted. Real-hardware recommendations are guidance only; this repository exposes no provider execution route.
          </p>
        </div>
      </Panel>
    </aside>
  );
}
