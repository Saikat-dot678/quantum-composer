"use client";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { COMPOSER_MAX_COLUMNS, SAFE_V1_SIM_MAX_QUBITS } from "@/lib/constants";
import { circuitApi } from "@/lib/api";
import { labApi } from "@/lib/labApi";
import { PRESETS } from "@/lib/presets";
import { ROTATION_GATES, TWO_QUBIT_GATES } from "@/lib/types";
import type { CircuitData, CircuitOperation, GateName, Preset } from "@/lib/types";
import { CircuitGrid } from "./CircuitGrid";
import { CircuitSettings } from "./CircuitSettings";
import { CodePanel } from "./CodePanel";
import { GatePalette } from "./GatePalette";
import { PresetCircuits } from "./PresetCircuits";
import { ResultsPanel, type ResultView } from "./ResultsPanel";
import { Panel, SectionHeader } from "./ui/primitives";

interface Props {
  circuit: CircuitData;
  setCircuit: Dispatch<SetStateAction<CircuitData>>;
  onOpenSimulatorLab: (circuit: CircuitData) => void;
}

type Notice = { kind: "info" | "error" | "success"; text: string };

const noticeClass = (kind: Notice["kind"]) =>
  kind === "error"
    ? "border-accent-red/30 bg-accent-red/[.07] text-red-200"
    : kind === "success"
      ? "border-accent-green/30 bg-accent-green/[.07] text-emerald-100"
      : "border-accent-cyan/30 bg-accent-cyan/[.06] text-cyan-100";

export function ComposerMode({ circuit, setCircuit, onOpenSimulatorLab }: Props) {
  const [columns, setColumns] = useState(8);
  const [selectedGate, setSelectedGate] = useState<GateName>("h");
  const [theta, setTheta] = useState(Math.PI / 2);
  const [pending, setPending] = useState<{ qubit: number; moment: number } | null>(null);
  const [code, setCode] = useState("");
  const [qasm, setQasm] = useState("");
  const [result, setResult] = useState<ResultView | null>(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<Notice | null>({ kind: "info", text: "Choose a gate, then click a cell to place it." });

  const sortedCircuit = useMemo(
    () => ({ ...circuit, operations: [...circuit.operations].sort((a, b) => a.moment - b.moment) }),
    [circuit],
  );
  const isLarge = circuit.num_qubits > SAFE_V1_SIM_MAX_QUBITS;

  useEffect(() => {
    setCode("");
    setQasm("");
    setResult(null);
  }, [circuit]);

  const removeConflicts = (ops: CircuitOperation[], moment: number, qubits: number[]) =>
    ops.filter((item) => item.moment !== moment || !item.qubits.some((q) => qubits.includes(q)));

  function handleCellClick(qubit: number, moment: number) {
    const existing = circuit.operations.find((item) => item.moment === moment && item.qubits.includes(qubit));
    if (existing) {
      setCircuit((current) => ({ ...current, operations: current.operations.filter((item) => item !== existing) }));
      setPending(null);
      setNotice({ kind: "info", text: `${existing.gate.toUpperCase()} removed from t${moment}.` });
      return;
    }
    if (TWO_QUBIT_GATES.includes(selectedGate)) {
      if (!pending || pending.moment !== moment) {
        setPending({ qubit, moment });
        setNotice({ kind: "info", text: `${selectedGate.toUpperCase()}: q${qubit} selected. Choose a different qubit in t${moment}.` });
        return;
      }
      if (pending.qubit === qubit) {
        setPending(null);
        return;
      }
      const qubits = [pending.qubit, qubit];
      const operation: CircuitOperation = { gate: selectedGate, qubits, clbits: [], params: {}, moment };
      setCircuit((current) => ({ ...current, operations: [...removeConflicts(current.operations, moment, qubits), operation] }));
      setPending(null);
      setNotice({ kind: "success", text: `${selectedGate.toUpperCase()} placed on q${qubits[0]} → q${qubits[1]}.` });
      return;
    }
    if (selectedGate === "measure" && circuit.num_clbits === 0) {
      setNotice({ kind: "error", text: "Add at least one classical bit before placing a measurement." });
      return;
    }
    const operation: CircuitOperation = {
      gate: selectedGate,
      qubits: selectedGate === "barrier" ? Array.from({ length: circuit.num_qubits }, (_, i) => i) : [qubit],
      clbits: selectedGate === "measure" ? [Math.min(qubit, circuit.num_clbits - 1)] : [],
      params: ROTATION_GATES.includes(selectedGate) ? { theta } : {},
      moment,
    };
    setCircuit((current) => ({ ...current, operations: [...removeConflicts(current.operations, moment, operation.qubits), operation] }));
    setNotice({ kind: "success", text: `${selectedGate.toUpperCase()} placed at t${moment}.` });
  }

  function loadPreset(preset: Preset) {
    const next: CircuitData = JSON.parse(JSON.stringify(preset.circuit));
    const last = Math.max(0, ...next.operations.map((item) => item.moment));
    setCircuit(next);
    setColumns(Math.min(COMPOSER_MAX_COLUMNS, Math.max(8, last + 2)));
    setPending(null);
    setNotice({ kind: "success", text: `${preset.name} preset loaded.` });
  }

  function changeQubits(value: number) {
    setCircuit((c) => ({ ...c, num_qubits: value, operations: c.operations.filter((item) => item.qubits.every((q) => q < value)) }));
    setPending(null);
  }
  function changeClbits(value: number) {
    setCircuit((c) => ({ ...c, num_clbits: value, operations: c.operations.filter((item) => item.clbits.every((bit) => bit < value)) }));
  }
  function changeColumns(value: number) {
    setColumns(value);
    setCircuit((c) => ({ ...c, operations: c.operations.filter((item) => item.moment < value) }));
    setPending(null);
  }

  async function fetchGeneratedCode(): Promise<string> {
    if (isLarge) {
      setCode(
        `# Qiskit / QASM export via the V1 endpoint supports circuits up to ${SAFE_V1_SIM_MAX_QUBITS} qubits.\n` +
          `# The circuit JSON tab is always available. Use the Simulator Lab to analyze and run larger structured circuits.`,
      );
      setQasm(`// OpenQASM export via the V1 endpoint supports up to ${SAFE_V1_SIM_MAX_QUBITS} qubits.`);
      return "Large circuit: JSON is ready. Code/QASM export is available for small circuits.";
    }
    const validation = await circuitApi.validate(sortedCircuit);
    const generated = await circuitApi.code(sortedCircuit);
    setCode(generated.code);
    try {
      setQasm((await circuitApi.qasm(sortedCircuit)).qasm);
    } catch (error) {
      setQasm(`// OpenQASM export unavailable\n// ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    return validation.message;
  }

  async function generate() {
    setBusy(true);
    try {
      const message = await fetchGeneratedCode();
      setNotice({ kind: "success", text: `${message} Generated outputs are ready.` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Generation failed." });
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    setBusy(true);
    setRunning(true);
    setNotice({ kind: "info", text: isLarge ? "Routing to the multi-engine simulator (v2)…" : "Running on local Qiskit Aer…" });
    try {
      await fetchGeneratedCode();
      if (isLarge) {
        const sim = await labApi.simulateV2(sortedCircuit, {
          engine: "auto",
          shots: circuit.shots,
          noise_enabled: false,
          noise_model_type: "depolarizing",
          max_memory_mb: 1024,
          allow_approximation: false,
          mps_max_bond_dimension: null,
          mps_truncation_threshold: null,
          seed: null,
        });
        setResult({
          counts: sim.counts,
          depth: sim.depth,
          gate_counts: sim.gate_counts,
          diagram: sim.diagram,
          warnings: sim.warnings,
          selectedEngine: sim.selected_engine,
          engineReason: sim.engine_reason,
          timingMs: sim.timing_ms,
        });
        setNotice({ kind: "success", text: `Ran on ${sim.selected_engine}. Open the Simulator Lab for full analysis.` });
      } else {
        const sim = await circuitApi.simulate(sortedCircuit);
        setResult({ counts: sim.counts, depth: sim.depth, gate_counts: sim.gate_counts, diagram: sim.diagram, warnings: sim.warnings });
        setNotice({ kind: "success", text: `Simulation complete · ${Object.values(sim.counts).reduce((s, c) => s + c, 0)} shots.` });
      }
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Simulation failed." });
    } finally {
      setBusy(false);
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1800px] p-5 lg:p-8">
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-full border border-lab-border bg-lab-panel px-3 py-1.5 text-xs text-lab-muted">
          {circuit.num_qubits} qubits · {circuit.operations.length} gates {isLarge && <span className="text-accent-amber">· v2 routing</span>}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenSimulatorLab(sortedCircuit)}
            className="rounded-lg border border-accent-cyan/30 bg-accent-cyan/10 px-4 py-2 text-sm font-semibold text-accent-cyan transition hover:bg-accent-cyan/20"
          >
            Open in Simulator Lab
          </button>
          <button
            type="button"
            onClick={() => {
              setCircuit({ ...circuit, operations: [] });
              setPending(null);
            }}
            className="rounded-lg border border-lab-border bg-lab-panel px-4 py-2 text-sm font-medium text-lab-muted transition hover:text-lab-text"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={generate}
            className="rounded-lg border border-lab-border bg-lab-panel px-4 py-2 text-sm font-semibold text-lab-text transition hover:border-accent-cyan/40 disabled:opacity-50"
          >
            Generate
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={run}
            className="rounded-lg bg-accent-cyan px-5 py-2 text-sm font-semibold text-lab-bg shadow-glow transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Working…" : "Run circuit"}
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)_340px]">
        <Panel as="aside" className="p-4 lg:max-h-[calc(100vh-150px)] lg:overflow-y-auto">
          <GatePalette
            selected={selectedGate}
            theta={theta}
            onSelect={(gate) => {
              setSelectedGate(gate);
              setPending(null);
            }}
            onThetaChange={setTheta}
          />
          <PresetCircuits presets={PRESETS} onLoad={loadPreset} />
        </Panel>

        <section className="min-w-0 space-y-5">
          <Panel className="p-5">
            <SectionHeader
              eyebrow="Circuit workspace"
              title="Compose across time"
              right={
                <p className="max-w-md text-right text-xs leading-5 text-lab-faint">
                  Click an occupied cell to remove it. For CX, CZ, or SWAP, select two qubits in the same time step.
                </p>
              }
            />
            <CircuitGrid
              numQubits={circuit.num_qubits}
              numClbits={circuit.num_clbits}
              columns={columns}
              operations={circuit.operations}
              selectedGate={selectedGate}
              pending={pending}
              onCellClick={handleCellClick}
            />
            {notice && <div className={`mt-4 rounded-lg border px-3 py-2 text-xs ${noticeClass(notice.kind)}`}>{notice.text}</div>}
          </Panel>
          <ResultsPanel result={result} running={running} />
        </section>

        <Panel as="aside" className="p-4 lg:max-h-[calc(100vh-150px)] lg:overflow-y-auto">
          <CircuitSettings
            qubits={circuit.num_qubits}
            clbits={circuit.num_clbits}
            columns={columns}
            shots={circuit.shots}
            onQubitsChange={changeQubits}
            onClbitsChange={changeClbits}
            onColumnsChange={changeColumns}
            onShotsChange={(shots) => setCircuit((c) => ({ ...c, shots }))}
          />
          <CodePanel circuit={sortedCircuit} code={code} qasm={qasm} />
        </Panel>
      </div>
    </div>
  );
}
