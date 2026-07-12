"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Panel } from "@/components/ui/primitives";
import { circuitApi } from "@/lib/api";
import { getSimulationPath } from "@/lib/circuitRouting";
import { LIMITS } from "@/lib/constants";
import { labApi } from "@/lib/labApi";
import type { CircuitAnalysis } from "@/lib/labTypes";
import { PRESETS } from "@/lib/presets";
import { ROTATION_GATES, TWO_QUBIT_GATES } from "@/lib/types";
import type { CircuitData, CircuitOperation, GateName, Preset } from "@/lib/types";
import { CodePanel } from "@/components/output/CodePanel";
import { ResultsPanel, type ResultView } from "@/components/output/ResultsPanel";
import { useRegisterActions } from "@/components/workspace/ActionRegistry";
import { CircuitSettings } from "./CircuitSettings";
import { CircuitWorkspace } from "./CircuitWorkspace";
import { StatePreviewPanel } from "./StatePreviewPanel";
import { ComposerToolbar } from "./ComposerToolbar";
import { FeasibilitySummary } from "./FeasibilitySummary";
import { GatePalette } from "./GatePalette";
import { PresetCircuits } from "./PresetCircuits";
import { SelectedGateDetails } from "./SelectedGateDetails";
import type { ComposerBusyAction, ComposerNotice, PendingGateSelection } from "./types";

interface Props {
  circuit: CircuitData;
  setCircuit: Dispatch<SetStateAction<CircuitData>>;
  onOpenSimulatorLab: (circuit: CircuitData) => void;
}

const removeConflicts = (operations: CircuitOperation[], moment: number, qubits: number[]) =>
  operations.filter((operation) => operation.moment !== moment || !operation.qubits.some((qubit) => qubits.includes(qubit)));

const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export function ComposerMode({ circuit, setCircuit, onOpenSimulatorLab }: Props) {
  const [columns, setColumns] = useState(8);
  const [selectedGate, setSelectedGate] = useState<GateName>("h");
  const [theta, setTheta] = useState(Math.PI / 2);
  const [pending, setPending] = useState<PendingGateSelection | null>(null);
  const [code, setCode] = useState("");
  const [qasm, setQasm] = useState("");
  const [result, setResult] = useState<ResultView | null>(null);
  const [analysis, setAnalysis] = useState<CircuitAnalysis | null>(null);
  const [busyAction, setBusyAction] = useState<ComposerBusyAction>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<ComposerNotice | null>({ kind: "info", text: "Select a gate, then activate a circuit cell to place it." });
  const requestToken = useRef(0);

  const sortedCircuit = useMemo(
    () => ({ ...circuit, operations: [...circuit.operations].sort((left, right) => left.moment - right.moment) }),
    [circuit],
  );
  const simulationPath = useMemo(() => getSimulationPath(sortedCircuit), [sortedCircuit]);

  useEffect(() => {
    requestToken.current += 1;
    setCode("");
    setQasm("");
    setResult(null);
    setAnalysis(null);
    setBusyAction(null);
    setRunning(false);
  }, [circuit]);

  function handleCellClick(qubit: number, moment: number) {
    const existing = circuit.operations.find((operation) => operation.moment === moment && operation.qubits.includes(qubit));
    if (existing) {
      setCircuit((current) => ({ ...current, operations: current.operations.filter((operation) => operation !== existing) }));
      setPending(null);
      setNotice({ kind: "info", text: `${existing.gate.toUpperCase()} removed from t${moment}.` });
      return;
    }

    if (TWO_QUBIT_GATES.includes(selectedGate)) {
      if (!pending || pending.moment !== moment) {
        setPending({ qubit, moment });
        setNotice({ kind: "info", text: `${selectedGate.toUpperCase()}: q${qubit} is the first endpoint. Choose a different qubit in t${moment}.` });
        return;
      }
      if (pending.qubit === qubit) {
        setPending(null);
        setNotice({ kind: "info", text: `${selectedGate.toUpperCase()} placement cancelled.` });
        return;
      }
      const qubits = [pending.qubit, qubit];
      const operation: CircuitOperation = { gate: selectedGate, qubits, clbits: [], params: {}, moment };
      setCircuit((current) => ({ ...current, operations: [...removeConflicts(current.operations, moment, qubits), operation] }));
      setPending(null);
      setNotice({ kind: "success", text: `${selectedGate.toUpperCase()} placed on q${qubits[0]} → q${qubits[1]} at t${moment}.` });
      return;
    }

    if (selectedGate === "measure" && circuit.num_clbits === 0) {
      setNotice({ kind: "error", text: "Add at least one classical bit before placing a measurement." });
      return;
    }

    const operation: CircuitOperation = {
      gate: selectedGate,
      qubits: selectedGate === "barrier" ? Array.from({ length: circuit.num_qubits }, (_, index) => index) : [qubit],
      clbits: selectedGate === "measure" ? [Math.min(qubit, circuit.num_clbits - 1)] : [],
      params: ROTATION_GATES.includes(selectedGate) ? { theta } : {},
      moment,
    };
    setCircuit((current) => ({ ...current, operations: [...removeConflicts(current.operations, moment, operation.qubits), operation] }));
    setNotice({ kind: "success", text: `${selectedGate.toUpperCase()} placed at t${moment}.` });
  }

  function loadPreset(preset: Preset) {
    const next = JSON.parse(JSON.stringify(preset.circuit)) as CircuitData;
    const lastMoment = Math.max(0, ...next.operations.map((operation) => operation.moment));
    setCircuit(next);
    setColumns(Math.min(LIMITS.composer.interactiveMaxColumns, Math.max(8, lastMoment + 2)));
    setPending(null);
    setNotice({ kind: "success", text: `${preset.name} preset loaded.` });
  }

  function changeQubits(value: number) {
    setCircuit((current) => ({
      ...current,
      num_qubits: value,
      operations: current.operations.filter((operation) => operation.qubits.every((qubit) => qubit < value)),
    }));
    setPending(null);
  }

  function changeClbits(value: number) {
    setCircuit((current) => ({
      ...current,
      num_clbits: value,
      operations: current.operations.filter((operation) => operation.clbits.every((clbit) => clbit < value)),
    }));
  }

  function changeColumns(value: number) {
    setColumns(value);
    setCircuit((current) => ({ ...current, operations: current.operations.filter((operation) => operation.moment < value) }));
    setPending(null);
  }

  function setGuardedExportMessage() {
    setCode(`# Qiskit export is guarded by the V1 request envelope.\n# ${simulationPath.reason}\n# Circuit JSON remains available. Use Simulator Lab for structured-circuit analysis and execution.`);
    setQasm(`// OpenQASM export is guarded by the V1 request envelope.\n// ${simulationPath.reason}`);
  }

  async function generate() {
    const token = ++requestToken.current;
    setBusyAction("generate");
    setNotice({ kind: "info", text: simulationPath.id === "v1" ? "Validating circuit and generating source artifacts…" : "Preparing guarded large-circuit output…" });
    try {
      if (simulationPath.id === "v2") {
        setGuardedExportMessage();
        if (requestToken.current === token) setNotice({ kind: "success", text: "Circuit JSON is ready. Qiskit and OpenQASM export remain inside the guarded V1 envelope." });
        return;
      }

      const validation = await circuitApi.validate(sortedCircuit);
      if (requestToken.current !== token) return;
      const [codeResponse, qasmResponse] = await Promise.allSettled([
        circuitApi.code(sortedCircuit),
        circuitApi.qasm(sortedCircuit),
      ]);
      if (requestToken.current !== token) return;

      setCode(codeResponse.status === "fulfilled" ? codeResponse.value.code : `# Qiskit export unavailable\n# ${errorMessage(codeResponse.reason, "Unknown error")}`);
      setQasm(qasmResponse.status === "fulfilled" ? qasmResponse.value.qasm : `// OpenQASM export unavailable\n// ${errorMessage(qasmResponse.reason, "Unknown error")}`);
      const failed = [codeResponse, qasmResponse].filter((response) => response.status === "rejected").length;
      setNotice(failed
        ? { kind: "error", text: `${validation.message} ${failed} source artifact${failed === 1 ? "" : "s"} could not be generated; see the output panel.` }
        : { kind: "success", text: `${validation.message} Qiskit and OpenQASM outputs are ready.` });
    } catch (error) {
      if (requestToken.current === token) setNotice({ kind: "error", text: errorMessage(error, "Generation failed.") });
    } finally {
      if (requestToken.current === token) setBusyAction(null);
    }
  }

  async function analyze() {
    const token = ++requestToken.current;
    setBusyAction("analyze");
    setNotice({ kind: "info", text: "Analyzing memory requirements, Clifford structure, and engine compatibility…" });
    try {
      const response = await labApi.analyze(sortedCircuit);
      if (requestToken.current !== token) return;
      setAnalysis(response);
      setNotice({ kind: "success", text: "Feasibility analysis complete. Review the snapshot below the circuit." });
    } catch (error) {
      if (requestToken.current === token) setNotice({ kind: "error", text: errorMessage(error, "Analysis failed.") });
    } finally {
      if (requestToken.current === token) setBusyAction(null);
    }
  }

  async function run() {
    const token = ++requestToken.current;
    setBusyAction("run");
    setRunning(true);
    setResult(null);
    setNotice({ kind: "info", text: simulationPath.id === "v2" ? "Routing through the multi-engine simulator…" : "Validating and running the guarded exact path…" });

    try {
      if (simulationPath.id === "v2") {
        setGuardedExportMessage();
        const response = await labApi.simulateV2(sortedCircuit, {
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
        if (requestToken.current !== token) return;
        setResult({
          counts: response.counts,
          depth: response.depth,
          gate_counts: response.gate_counts,
          diagram: response.diagram,
          warnings: response.warnings,
          selectedEngine: response.selected_engine,
          engineReason: response.engine_reason,
          timingMs: response.timing_ms,
        });
        setNotice({ kind: "success", text: `Simulation completed on ${response.selected_engine}. Open Simulator Lab for the full resource analysis.` });
        return;
      }

      await circuitApi.validate(sortedCircuit);
      if (requestToken.current !== token) return;
      const [codeResponse, qasmResponse, simulationResponse] = await Promise.allSettled([
        circuitApi.code(sortedCircuit),
        circuitApi.qasm(sortedCircuit),
        circuitApi.simulate(sortedCircuit),
      ]);
      if (requestToken.current !== token) return;

      setCode(codeResponse.status === "fulfilled" ? codeResponse.value.code : `# Qiskit export unavailable\n# ${errorMessage(codeResponse.reason, "Unknown error")}`);
      setQasm(qasmResponse.status === "fulfilled" ? qasmResponse.value.qasm : `// OpenQASM export unavailable\n// ${errorMessage(qasmResponse.reason, "Unknown error")}`);
      if (simulationResponse.status === "rejected") throw simulationResponse.reason;
      const simulation = simulationResponse.value;
      setResult({ counts: simulation.counts, depth: simulation.depth, gate_counts: simulation.gate_counts, diagram: simulation.diagram, warnings: simulation.warnings });
      setNotice({ kind: "success", text: `Simulation complete · ${Object.values(simulation.counts).reduce((sum, count) => sum + count, 0).toLocaleString()} shots.` });
    } catch (error) {
      if (requestToken.current === token) setNotice({ kind: "error", text: errorMessage(error, "Simulation failed.") });
    } finally {
      if (requestToken.current === token) {
        setBusyAction(null);
        setRunning(false);
      }
    }
  }

  const openSimulatorLab = () => onOpenSimulatorLab(sortedCircuit);

  // Contribute Composer actions to the global command palette while mounted.
  const working = busyAction !== null;
  useRegisterActions("composer", [
    { id: "composer-run", group: "Composer", label: "Run current circuit", hint: simulationPath.id.toUpperCase(), disabled: working, run: () => void run() },
    { id: "composer-analyze", group: "Composer", label: "Analyze feasibility", hint: "backend analyzer", disabled: working, run: () => void analyze() },
    { id: "composer-generate", group: "Composer", label: "Generate Qiskit / QASM outputs", disabled: working, run: () => void generate() },
  ]);

  return (
    <div className="mx-auto min-w-0 max-w-[1800px] px-4 py-5 sm:px-5 lg:px-8 lg:py-6">
      <ComposerToolbar
        qubits={circuit.num_qubits}
        operationCount={circuit.operations.length}
        simulationPath={simulationPath}
        busyAction={busyAction}
        onOpenSimulatorLab={openSimulatorLab}
        onAnalyze={() => void analyze()}
        onClear={() => {
          setCircuit((current) => ({ ...current, operations: [] }));
          setPending(null);
          setNotice({ kind: "info", text: "Circuit operations cleared. Register settings were preserved." });
        }}
        onGenerate={() => void generate()}
        onRun={() => void run()}
      />

      <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_310px]">
        <Panel as="aside" className="p-4 md:max-h-[calc(100vh-190px)] md:overflow-y-auto">
          <GatePalette selected={selectedGate} onSelect={(gate) => { setSelectedGate(gate); setPending(null); }} />
          <SelectedGateDetails gate={selectedGate} theta={theta} onThetaChange={setTheta} />
          <PresetCircuits presets={PRESETS} onLoad={loadPreset} />
        </Panel>

        <div className="min-w-0 space-y-4">
          <CircuitWorkspace
            numQubits={circuit.num_qubits}
            numClbits={circuit.num_clbits}
            columns={columns}
            operations={circuit.operations}
            selectedGate={selectedGate}
            pending={pending}
            notice={notice}
            onCellClick={handleCellClick}
            onCancelPending={() => {
              setPending(null);
              setNotice({ kind: "info", text: `${selectedGate.toUpperCase()} placement cancelled.` });
            }}
            onOpenSimulatorLab={openSimulatorLab}
          />
          {analysis && <FeasibilitySummary analysis={analysis} onOpenSimulatorLab={openSimulatorLab} />}
        </div>

        <Panel as="aside" className="p-4 md:col-span-2 xl:col-span-1 xl:max-h-[calc(100vh-190px)] xl:overflow-y-auto">
          <CircuitSettings
            qubits={circuit.num_qubits}
            clbits={circuit.num_clbits}
            columns={columns}
            shots={circuit.shots}
            simulationPath={simulationPath}
            onQubitsChange={changeQubits}
            onClbitsChange={changeClbits}
            onColumnsChange={changeColumns}
            onShotsChange={(shots) => setCircuit((current) => ({ ...current, shots }))}
          />
          <StatePreviewPanel circuit={sortedCircuit} />
        </Panel>
      </div>

      <section className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]" aria-label="Generated output and simulation results">
        <CodePanel circuit={sortedCircuit} code={code} qasm={qasm} />
        <ResultsPanel result={result} running={running} />
      </section>
    </div>
  );
}
