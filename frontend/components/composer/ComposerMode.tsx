"use client";

// The Composer, rebuilt as a spatial editor: a full-height pannable/zoomable
// SVG canvas (CircuitCanvas) is the workspace, with a floating searchable
// gate dock on the left, a contextual properties inspector on the right
// (empty until something is selected — reference study #2/#11), a floating
// toolbar over the canvas, and a collapsible bottom dock for generated code
// and results. On narrow screens the dock/inspector become bottom sheets.
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutGrid, SlidersHorizontal, X } from "lucide-react";
import { circuitApi } from "@/lib/api";
import { getSimulationPath } from "@/lib/circuitRouting";
import { encodeCircuitLinkCompressed } from "@/lib/circuitShare";
import { LIMITS } from "@/lib/constants";
import { labApi } from "@/lib/labApi";
import type { CircuitAnalysis } from "@/lib/labTypes";
import { PRESETS } from "@/lib/presets";
import { ROTATION_GATES, TWO_QUBIT_GATES } from "@/lib/types";
import type { CircuitData, CircuitOperation, GateName, Preset } from "@/lib/types";
import { Button } from "@/components/ui/primitives";
import { useRegisterActions } from "@/components/workspace/ActionRegistry";
import { ModalPortal, useModalLifecycle } from "@/components/workspace/Modal";
import { useToast } from "@/components/workspace/ToastProvider";
import { CanvasToolbar } from "./CanvasToolbar";
import { CircuitCanvas, type CanvasCell, type CircuitCanvasHandle } from "./CircuitCanvas";
import { CircuitInspector } from "./CircuitInspector";
import { GateDock } from "./GateDock";
import { OutputDock } from "./OutputDock";
import type { ResultView } from "@/components/output/ResultsPanel";
import type { ComposerBusyAction } from "./types";

interface Props {
  circuit: CircuitData;
  setCircuit: Dispatch<SetStateAction<CircuitData>>;
  onOpenSimulatorLab: (circuit: CircuitData) => void;
}

const removeConflicts = (operations: CircuitOperation[], moment: number, qubits: number[]) =>
  operations.filter((operation) => operation.moment !== moment || !operation.qubits.some((qubit) => qubits.includes(qubit)));

const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

/** Only ever mounted while open — the caller conditionally renders it so
 * AnimatePresence can observe the mount/unmount and play the exit transition. */
function MobileSheet({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  const panelRef = useRef<HTMLElement>(null);
  useModalLifecycle(true, panelRef, onClose);
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[80] bg-black/40" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <motion.section
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          initial={{ y: 32, opacity: 0.6 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-hidden rounded-t-2xl border-t border-line bg-surface shadow-floating"
        >
          <div className="flex items-center justify-between border-b border-line-hairline px-4 py-2.5">
            <p className="text-sm font-semibold text-ink-900">{title}</p>
            <Button variant="quiet" size="sm" onClick={onClose} aria-label={`Close ${title}`}><X className="h-4 w-4" /></Button>
          </div>
          <div className="max-h-[calc(80vh-48px)] overflow-y-auto p-2">{children}</div>
        </motion.section>
      </div>
    </ModalPortal>
  );
}

export function ComposerMode({ circuit, setCircuit, onOpenSimulatorLab }: Props) {
  const [columns, setColumns] = useState(8);
  const [selectedGate, setSelectedGate] = useState<GateName>("h");
  const [pending, setPending] = useState<CanvasCell | null>(null);
  const [selectedCell, setSelectedCell] = useState<CanvasCell | null>(null);
  const [code, setCode] = useState("");
  const [qasm, setQasm] = useState("");
  const [result, setResult] = useState<ResultView | null>(null);
  const [analysis, setAnalysis] = useState<CircuitAnalysis | null>(null);
  const [busyAction, setBusyAction] = useState<ComposerBusyAction>(null);
  const [running, setRunning] = useState(false);
  const [runCounter, setRunCounter] = useState(0);
  const [shareState, setShareState] = useState<"idle" | "copied" | "blocked">("idle");
  const [mobilePanel, setMobilePanel] = useState<"none" | "gates" | "inspector">("none");
  const requestToken = useRef(0);
  const canvasHandle = useRef<CircuitCanvasHandle | null>(null);
  const { pushToast } = useToast();

  const sortedCircuit = useMemo(
    () => ({ ...circuit, operations: [...circuit.operations].sort((left, right) => left.moment - right.moment) }),
    [circuit],
  );
  const simulationPath = useMemo(() => getSimulationPath(sortedCircuit), [sortedCircuit]);
  const selectedOperation = useMemo(() => {
    if (!selectedCell) return null;
    return circuit.operations.find((op) => op.moment === selectedCell.moment && op.qubits.includes(selectedCell.qubit)) ?? null;
  }, [circuit.operations, selectedCell]);

  useEffect(() => {
    requestToken.current += 1;
    setCode("");
    setQasm("");
    setResult(null);
    setAnalysis(null);
    setBusyAction(null);
    setRunning(false);
    setSelectedCell(null);
    setPending(null);
  }, [circuit]);

  function placeOperation(gate: GateName, qubits: number[], moment: number, clbits: number[], theta?: number) {
    const operation: CircuitOperation = { gate, qubits, clbits, params: theta !== undefined ? { theta } : {}, moment };
    setCircuit((current) => ({ ...current, operations: [...removeConflicts(current.operations, moment, qubits), operation] }));
  }

  function handlePlaceOrSelect(cell: CanvasCell, hasOperation: boolean) {
    if (hasOperation) {
      setSelectedCell(cell);
      setPending(null);
      return;
    }
    setSelectedCell(null);
    const { qubit, moment } = cell;

    if (TWO_QUBIT_GATES.includes(selectedGate)) {
      if (!pending || pending.moment !== moment) {
        setPending({ qubit, moment });
        pushToast(`${selectedGate.toUpperCase()}: q${qubit} is the first endpoint. Choose a different qubit in the same time step.`);
        return;
      }
      if (pending.qubit === qubit) { setPending(null); return; }
      placeOperation(selectedGate, [pending.qubit, qubit], moment, []);
      setPending(null);
      return;
    }

    if (selectedGate === "measure" && circuit.num_clbits === 0) {
      pushToast("Add at least one classical bit before placing a measurement.", "error");
      return;
    }

    placeOperation(
      selectedGate,
      selectedGate === "barrier" ? Array.from({ length: circuit.num_qubits }, (_, index) => index) : [qubit],
      moment,
      selectedGate === "measure" ? [Math.min(qubit, circuit.num_clbits - 1)] : [],
      ROTATION_GATES.includes(selectedGate) ? Math.PI / 2 : undefined,
    );
  }

  function handleDropGate(gate: GateName, cell: CanvasCell) {
    const { qubit, moment } = cell;
    setSelectedGate(gate);
    setSelectedCell(null);
    setPending(null);
    if (circuit.operations.some((op) => op.moment === moment && op.qubits.includes(qubit))) {
      pushToast("That cell is already occupied — pick an empty one to drop onto.", "error");
      return;
    }
    if (TWO_QUBIT_GATES.includes(gate)) {
      const partner = qubit + 1 < circuit.num_qubits ? qubit + 1 : qubit - 1;
      if (partner < 0) { pushToast("Add another qubit to place a two-qubit gate.", "error"); return; }
      placeOperation(gate, [qubit, partner], moment, []);
      pushToast(`${gate.toUpperCase()} connected q${qubit} → q${partner}. Click either endpoint to fine-tune.`);
      return;
    }
    if (gate === "measure" && circuit.num_clbits === 0) {
      pushToast("Add at least one classical bit before placing a measurement.", "error");
      return;
    }
    placeOperation(
      gate,
      gate === "barrier" ? Array.from({ length: circuit.num_qubits }, (_, index) => index) : [qubit],
      moment,
      gate === "measure" ? [Math.min(qubit, circuit.num_clbits - 1)] : [],
      ROTATION_GATES.includes(gate) ? Math.PI / 2 : undefined,
    );
  }

  function deleteSelected() {
    if (!selectedOperation) return;
    setCircuit((current) => ({ ...current, operations: current.operations.filter((op) => op !== selectedOperation) }));
    setSelectedCell(null);
    pushToast(`${selectedOperation.gate.toUpperCase()} removed.`);
  }

  function duplicateSelected() {
    if (!selectedOperation) return;
    const source = selectedOperation;
    const conflictsAt = (moment: number) => circuit.operations.some((op) => op.moment === moment && op.qubits.some((q) => source.qubits.includes(q)));
    let target = source.moment + 1;
    while (target < columns && conflictsAt(target)) target += 1;
    if (target >= columns) {
      pushToast("No free time step to duplicate into — add more time steps first.", "error");
      return;
    }
    const clone: CircuitOperation = { ...source, moment: target, params: { ...source.params } };
    setCircuit((current) => ({ ...current, operations: [...current.operations, clone] }));
    setSelectedCell({ qubit: source.qubits[0], moment: target });
    pushToast(`${source.gate.toUpperCase()} duplicated to t${target}.`);
  }

  function updateSelectedTheta(value: number) {
    if (!selectedOperation) return;
    setCircuit((current) => ({
      ...current,
      operations: current.operations.map((op) => (op === selectedOperation ? { ...op, params: { theta: value } } : op)),
    }));
  }

  function loadPreset(preset: Preset) {
    const next = JSON.parse(JSON.stringify(preset.circuit)) as CircuitData;
    const lastMoment = Math.max(0, ...next.operations.map((operation) => operation.moment));
    setCircuit(next);
    setColumns(Math.min(LIMITS.composer.interactiveMaxColumns, Math.max(8, lastMoment + 2)));
    setPending(null);
    setMobilePanel("none");
    pushToast(`${preset.name} preset loaded.`, "success");
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
    try {
      if (simulationPath.id === "v2") {
        setGuardedExportMessage();
        if (requestToken.current === token) pushToast("Circuit JSON is ready. Qiskit and OpenQASM export remain inside the guarded V1 envelope.", "success");
        return;
      }
      const validation = await circuitApi.validate(sortedCircuit);
      if (requestToken.current !== token) return;
      const [codeResponse, qasmResponse] = await Promise.allSettled([circuitApi.code(sortedCircuit), circuitApi.qasm(sortedCircuit)]);
      if (requestToken.current !== token) return;
      setCode(codeResponse.status === "fulfilled" ? codeResponse.value.code : `# Qiskit export unavailable\n# ${errorMessage(codeResponse.reason, "Unknown error")}`);
      setQasm(qasmResponse.status === "fulfilled" ? qasmResponse.value.qasm : `// OpenQASM export unavailable\n// ${errorMessage(qasmResponse.reason, "Unknown error")}`);
      const failed = [codeResponse, qasmResponse].filter((response) => response.status === "rejected").length;
      pushToast(
        failed ? `${validation.message} ${failed} source artifact${failed === 1 ? "" : "s"} could not be generated.` : `${validation.message} Qiskit and OpenQASM outputs are ready.`,
        failed ? "error" : "success",
      );
      setRunCounter((value) => value + 1);
    } catch (error) {
      if (requestToken.current === token) pushToast(errorMessage(error, "Generation failed."), "error");
    } finally {
      if (requestToken.current === token) setBusyAction(null);
    }
  }

  async function analyze() {
    const token = ++requestToken.current;
    setBusyAction("analyze");
    try {
      const response = await labApi.analyze(sortedCircuit);
      if (requestToken.current !== token) return;
      setAnalysis(response);
      pushToast("Feasibility analysis complete.", "success");
    } catch (error) {
      if (requestToken.current === token) pushToast(errorMessage(error, "Analysis failed."), "error");
    } finally {
      if (requestToken.current === token) setBusyAction(null);
    }
  }

  async function run() {
    const token = ++requestToken.current;
    setBusyAction("run");
    setRunning(true);
    setResult(null);
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
        pushToast(`Simulation completed on ${response.selected_engine}. Open Simulator Lab for the full resource analysis.`, "success");
        setRunCounter((value) => value + 1);
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
      pushToast(`Simulation complete · ${Object.values(simulation.counts).reduce((sum, count) => sum + count, 0).toLocaleString()} shots.`, "success");
      setRunCounter((value) => value + 1);
    } catch (error) {
      if (requestToken.current === token) pushToast(errorMessage(error, "Simulation failed."), "error");
    } finally {
      if (requestToken.current === token) {
        setBusyAction(null);
        setRunning(false);
      }
    }
  }

  async function shareLink() {
    const result = await encodeCircuitLinkCompressed(sortedCircuit, window.location.origin);
    if (!result.ok || !result.url) {
      setShareState("blocked");
      pushToast(result.reason ?? "This circuit cannot be shared as a link.", "error");
      window.setTimeout(() => setShareState("idle"), 2600);
      return;
    }
    try {
      await navigator.clipboard.writeText(result.url);
      setShareState("copied");
      pushToast("Compressed share link copied.", "success");
    } catch {
      setShareState("blocked");
      pushToast("Clipboard access was blocked.", "error");
    }
    window.setTimeout(() => setShareState("idle"), 2000);
  }

  const openSimulatorLab = () => onOpenSimulatorLab(sortedCircuit);
  const working = busyAction !== null;

  useRegisterActions("composer", [
    { id: "composer-run", group: "Composer", label: "Run current circuit", hint: simulationPath.id.toUpperCase(), disabled: working, run: () => void run() },
    { id: "composer-analyze", group: "Composer", label: "Analyze feasibility", hint: "backend analyzer", disabled: working, run: () => void analyze() },
    { id: "composer-generate", group: "Composer", label: "Generate Qiskit / QASM outputs", disabled: working, run: () => void generate() },
  ]);

  const gateDock = <GateDock selected={selectedGate} onSelect={(gate) => { setSelectedGate(gate); setPending(null); }} presets={PRESETS} onLoadPreset={loadPreset} />;
  const inspector = (
    <CircuitInspector
      circuit={circuit}
      columns={columns}
      selectedOperation={selectedOperation}
      simulationPath={simulationPath}
      analysis={analysis}
      onQubitsChange={changeQubits}
      onClbitsChange={changeClbits}
      onColumnsChange={changeColumns}
      onShotsChange={(shots) => setCircuit((current) => ({ ...current, shots }))}
      onThetaChange={updateSelectedTheta}
      onDeleteSelected={deleteSelected}
      onDuplicateSelected={duplicateSelected}
    />
  );

  return (
    <div className="flex h-[calc(100vh-56px)] min-h-[560px] flex-col">
      <div className="relative min-h-0 flex-1 p-3">
        <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[248px_minmax(0,1fr)_288px]">
          <div className="hidden min-h-0 xl:block">{gateDock}</div>

          <div className="relative min-h-0">
            <CircuitCanvas
              numQubits={circuit.num_qubits}
              numClbits={circuit.num_clbits}
              columns={columns}
              operations={circuit.operations}
              selectedGate={selectedGate}
              pending={pending}
              selectedCell={selectedCell}
              onPlaceOrSelect={handlePlaceOrSelect}
              onDeselect={() => { setSelectedCell(null); setPending(null); }}
              onDeleteSelected={deleteSelected}
              onDuplicateSelected={duplicateSelected}
              onDropGate={handleDropGate}
              handleRef={(handle) => { canvasHandle.current = handle; }}
            />
            <CanvasToolbar
              qubits={circuit.num_qubits}
              operationCount={circuit.operations.length}
              simulationPath={simulationPath}
              busyAction={busyAction}
              onZoomIn={() => canvasHandle.current?.zoomIn()}
              onZoomOut={() => canvasHandle.current?.zoomOut()}
              onZoomFit={() => canvasHandle.current?.zoomToFit()}
              onOpenSimulatorLab={openSimulatorLab}
              onAnalyze={() => void analyze()}
              onClear={() => { setCircuit((current) => ({ ...current, operations: [] })); setPending(null); setSelectedCell(null); pushToast("Circuit operations cleared."); }}
              onGenerate={() => void generate()}
              onRun={() => void run()}
              onShare={() => void shareLink()}
              shareState={shareState}
            />

            {/* Narrow-screen dock/inspector toggles (docks become bottom sheets below xl). */}
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex justify-center gap-2 xl:hidden">
              <Button variant="secondary" size="sm" className="pointer-events-auto shadow-floating" onClick={() => setMobilePanel("gates")}>
                <LayoutGrid className="h-3.5 w-3.5" /> Gates
              </Button>
              <Button variant="secondary" size="sm" className="pointer-events-auto shadow-floating" onClick={() => setMobilePanel("inspector")}>
                <SlidersHorizontal className="h-3.5 w-3.5" /> {selectedOperation ? "Selected gate" : "Settings"}
              </Button>
            </div>
          </div>

          <div className="hidden min-h-0 xl:block">{inspector}</div>
        </div>
      </div>

      <OutputDock circuit={sortedCircuit} code={code} qasm={qasm} result={result} running={running} autoExpandKey={runCounter} />

      <AnimatePresence>
        {mobilePanel === "gates" && <MobileSheet key="gates" onClose={() => setMobilePanel("none")} title="Gate library">{gateDock}</MobileSheet>}
      </AnimatePresence>
      <AnimatePresence>
        {mobilePanel === "inspector" && <MobileSheet key="inspector" onClose={() => setMobilePanel("none")} title={selectedOperation ? "Selected gate" : "Circuit settings"}>{inspector}</MobileSheet>}
      </AnimatePresence>
    </div>
  );
}
