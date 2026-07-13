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
import { definitionNumClbits, definitionNumQubits, type CustomDefinition } from "@/lib/customGates";
import { localCustomGateRepository } from "@/lib/customGateRepository";
import { collectReferencedDefinitions, resolveCustomOperations } from "@/lib/customGateResolve";
import { labApi } from "@/lib/labApi";
import type { CircuitAnalysis } from "@/lib/labTypes";
import { checkPlacement } from "@/lib/placement";
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
import { CustomGateExpandPreview } from "./CustomGateExpandPreview";
import { CustomGateLibraryDrawer } from "./CustomGateLibraryDrawer";
import { CustomGateWizard } from "./CustomGateWizard";
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
  const [clipboard, setClipboard] = useState<CircuitOperation | null>(null);
  const [customDefinitions, setCustomDefinitions] = useState<CustomDefinition[]>([]);
  const [customRecentIds, setCustomRecentIds] = useState<string[]>([]);
  const [selectedCustomId, setSelectedCustomId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [wizardState, setWizardState] = useState<{ editing: CustomDefinition | null; initialSelection: { qubitRange: [number, number]; momentRange: [number, number] } | null } | null>(null);
  const [expandPreviewOpen, setExpandPreviewOpen] = useState(false);
  const requestToken = useRef(0);
  const canvasHandle = useRef<CircuitCanvasHandle | null>(null);
  const { pushToast } = useToast();

  const refreshCustomLibrary = () => {
    setCustomDefinitions(localCustomGateRepository.list());
    setCustomRecentIds(localCustomGateRepository.recentIds());
  };
  useEffect(() => { refreshCustomLibrary(); }, []);
  const customLibraryMap = useMemo(() => new Map(customDefinitions.map((definition) => [definition.id, definition])), [customDefinitions]);

  const sortedCircuit = useMemo(
    () => ({ ...circuit, operations: [...circuit.operations].sort((left, right) => left.moment - right.moment) }),
    [circuit],
  );
  // Every backend call (validate/code/qasm/simulate/analyze) needs custom
  // operations flattened first — the backend never learns the custom-gate
  // schema exists. Resolved once per render and reused by generate/run/
  // analyze below; routing (V1 vs V2) uses the *expanded* operation count too,
  // since a handful of composite instances can expand into far more built-in
  // operations than the V1 envelope's raw top-level operation count implies.
  const resolved = useMemo(() => resolveCustomOperations(sortedCircuit, customLibraryMap), [sortedCircuit, customLibraryMap]);
  const routableCircuit = resolved.ok && resolved.circuit ? resolved.circuit : sortedCircuit;
  const simulationPath = useMemo(() => getSimulationPath(routableCircuit), [routableCircuit]);
  const selectedOperation = useMemo(() => {
    if (!selectedCell) return null;
    return circuit.operations.find((op) => op.moment === selectedCell.moment && op.qubits.includes(selectedCell.qubit)) ?? null;
  }, [circuit.operations, selectedCell]);
  const selectedCustomDefinition = selectedOperation?.gate === "custom" && selectedOperation.customId
    ? customLibraryMap.get(selectedOperation.customId) ?? null
    : null;

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
    // A circuit swap (project switch, share-link load, JSON import) may have
    // just brought in custom gate definitions through a different component
    // (ProjectsDrawer, the share-link loader) that don't share this
    // component's cached library state — re-read so the dock/canvas/inspector
    // see them immediately rather than after some unrelated library edit.
    refreshCustomLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circuit]);

  function placeOperation(gate: GateName, qubits: number[], moment: number, clbits: number[], theta?: number) {
    const operation: CircuitOperation = { gate, qubits, clbits, params: theta !== undefined ? { theta } : {}, moment };
    setCircuit((current) => ({ ...current, operations: [...removeConflicts(current.operations, moment, qubits), operation] }));
  }

  // Custom gates place immediately (no multi-click endpoint picking, even for
  // gates spanning many qubits) anchored at the clicked qubit, spanning
  // downward. Unlike built-in placement above (which silently overwrites a
  // conflicting cell — a pre-existing, unchanged convention), this routes
  // through the same lib/placement.ts checkPlacement used by drag/keyboard
  // movement, per the "one shared placement-validation system" requirement:
  // a conflict here is rejected with a clear reason instead of silently
  // deleting whatever was already there.
  function placeCustomGate(anchorQubit: number, moment: number, customId: string | null = selectedCustomId) {
    if (!customId) return;
    const definition = customLibraryMap.get(customId);
    if (!definition) {
      pushToast("That custom gate is no longer available — pick another from the dock.", "error");
      return;
    }
    const span = definitionNumQubits(definition);
    const qubits = Array.from({ length: span }, (_, index) => anchorQubit + index);
    const clbitCount = definitionNumClbits(definition);
    const clbits = Array.from({ length: clbitCount }, (_, index) => index);
    const check = checkPlacement(circuit, { qubits, clbits, moment }, { columns });
    if (!check.ok) {
      pushToast(check.reason ?? "That placement is not valid.", "error");
      return;
    }
    const params = definition.kind === "decomposition"
      ? Object.fromEntries(definition.parameters.map((param) => [param.name, param.default]))
      : {};
    const operation: CircuitOperation = { gate: "custom", customId, qubits, clbits, params, moment };
    setCircuit((current) => ({ ...current, operations: [...current.operations, operation] }));
    localCustomGateRepository.touch(customId);
    setCustomRecentIds(localCustomGateRepository.recentIds());
    setSelectedCell({ qubit: anchorQubit, moment });
  }

  function handlePlaceOrSelect(cell: CanvasCell, hasOperation: boolean) {
    if (hasOperation) {
      setSelectedCell(cell);
      setPending(null);
      return;
    }
    setSelectedCell(null);
    const { qubit, moment } = cell;

    if (selectedGate === "custom") {
      placeCustomGate(qubit, moment);
      return;
    }

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

  function handleDropGate(gate: GateName, cell: CanvasCell, customId?: string) {
    const { qubit, moment } = cell;
    setSelectedGate(gate);
    setSelectedCell(null);
    setPending(null);
    if (gate === "custom") {
      const id = customId ?? selectedCustomId;
      setSelectedCustomId(id);
      placeCustomGate(qubit, moment, id);
      return;
    }
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

  // Single setCircuit call = single undo/redo step (WorkspaceProvider commits
  // history per call, not per field change), so a whole move — however many
  // qubits it touches — is exactly one Ctrl+Z away from being undone.
  function moveOperation(operation: CircuitOperation, targetQubits: number[], targetMoment: number) {
    setCircuit((current) => ({
      ...current,
      operations: current.operations.map((op) => (op === operation ? { ...op, qubits: targetQubits, moment: targetMoment } : op)),
    }));
    setSelectedCell({ qubit: targetQubits[0], moment: targetMoment });
    pushToast(`${operation.gate.toUpperCase()} moved to q${targetQubits.join(",")} · t${targetMoment}.`);
  }

  function nextFreeMoment(source: CircuitOperation): number | null {
    const conflictsAt = (moment: number) => circuit.operations.some((op) => op.moment === moment && op.qubits.some((q) => source.qubits.includes(q)));
    let target = source.moment + 1;
    while (target < columns && conflictsAt(target)) target += 1;
    return target < columns ? target : null;
  }

  function duplicateSelected() {
    if (!selectedOperation) return;
    const source = selectedOperation;
    const target = nextFreeMoment(source);
    if (target === null) {
      pushToast("No free time step to duplicate into — add more time steps first.", "error");
      return;
    }
    const clone: CircuitOperation = { ...source, moment: target, params: { ...source.params } };
    setCircuit((current) => ({ ...current, operations: [...current.operations, clone] }));
    setSelectedCell({ qubit: source.qubits[0], moment: target });
    pushToast(`${source.gate.toUpperCase()} duplicated to t${target}.`);
  }

  function moveSelected() {
    if (!selectedOperation) return;
    canvasHandle.current?.enterMoveMode();
  }

  function copySelected() {
    if (!selectedOperation) return;
    setClipboard({ ...selectedOperation, params: { ...selectedOperation.params } });
    pushToast(`${selectedOperation.gate.toUpperCase()} copied. Ctrl/Cmd+V to paste.`);
  }

  function pasteClipboard() {
    if (!clipboard) {
      pushToast("Nothing copied yet — select a gate and press Ctrl/Cmd+C.", "error");
      return;
    }
    const target = nextFreeMoment(clipboard);
    if (target === null) {
      pushToast("No free time step to paste into — add more time steps first.", "error");
      return;
    }
    if (clipboard.qubits.some((q) => q >= circuit.num_qubits) || clipboard.clbits.some((c) => c >= circuit.num_clbits)) {
      pushToast("The copied operation no longer fits this circuit's register size.", "error");
      return;
    }
    const clone: CircuitOperation = { ...clipboard, moment: target, params: { ...clipboard.params } };
    setCircuit((current) => ({ ...current, operations: [...current.operations, clone] }));
    setSelectedCell({ qubit: clipboard.qubits[0], moment: target });
    pushToast(`${clipboard.gate.toUpperCase()} pasted to t${target}.`);
  }

  function replaceSelectedGate(gate: GateName) {
    if (!selectedOperation) return;
    const source = selectedOperation;
    const stillRotation = ROTATION_GATES.includes(gate);
    const wasRotation = ROTATION_GATES.includes(source.gate);
    setCircuit((current) => ({
      ...current,
      operations: current.operations.map((op) => (op === source
        ? { ...op, gate, params: stillRotation ? { theta: wasRotation ? (op.params.theta ?? Math.PI / 2) : Math.PI / 2 } : {} }
        : op)),
    }));
    pushToast(`Replaced with ${gate.toUpperCase()}.`);
  }

  function swapSelectedEndpoints() {
    if (!selectedOperation || selectedOperation.qubits.length !== 2) return;
    const source = selectedOperation;
    setCircuit((current) => ({
      ...current,
      operations: current.operations.map((op) => (op === source ? { ...op, qubits: [op.qubits[1], op.qubits[0]] } : op)),
    }));
    pushToast(`${source.gate.toUpperCase()} control/target swapped.`);
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
    if (!resolved.ok || !resolved.circuit) { pushToast(resolved.reason ?? "This circuit could not be resolved.", "error"); return; }
    const backendCircuit = resolved.circuit;
    setBusyAction("generate");
    try {
      if (simulationPath.id === "v2") {
        setGuardedExportMessage();
        if (requestToken.current === token) pushToast("Circuit JSON is ready. Qiskit and OpenQASM export remain inside the guarded V1 envelope.", "success");
        return;
      }
      const validation = await circuitApi.validate(backendCircuit);
      if (requestToken.current !== token) return;
      const [codeResponse, qasmResponse] = await Promise.allSettled([circuitApi.code(backendCircuit), circuitApi.qasm(backendCircuit)]);
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
    if (!resolved.ok || !resolved.circuit) { pushToast(resolved.reason ?? "This circuit could not be resolved.", "error"); return; }
    const backendCircuit = resolved.circuit;
    setBusyAction("analyze");
    try {
      const response = await labApi.analyze(backendCircuit);
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
    if (!resolved.ok || !resolved.circuit) { pushToast(resolved.reason ?? "This circuit could not be resolved.", "error"); return; }
    const backendCircuit = resolved.circuit;
    setBusyAction("run");
    setRunning(true);
    setResult(null);
    try {
      if (simulationPath.id === "v2") {
        setGuardedExportMessage();
        const response = await labApi.simulateV2(backendCircuit, {
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

      await circuitApi.validate(backendCircuit);
      if (requestToken.current !== token) return;
      const [codeResponse, qasmResponse, simulationResponse] = await Promise.allSettled([
        circuitApi.code(backendCircuit),
        circuitApi.qasm(backendCircuit),
        circuitApi.simulate(backendCircuit),
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
    // Shares the *editable* circuit (custom gates stay as named blocks, not
    // flattened) plus every definition it transitively references, so the
    // link is self-contained — unlike generate/run/analyze above, which need
    // the flattened backend-facing form instead.
    const referencedDefinitions = collectReferencedDefinitions(sortedCircuit, customLibraryMap);
    const result = await encodeCircuitLinkCompressed(sortedCircuit, window.location.origin, referencedDefinitions);
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

  // Simulator Lab has no concept of custom gates (no glyph rendering, no
  // resolver call before its own backend requests) — handing it the resolved
  // (flattened) circuit is both what its /circuit/analyze and
  // /circuit/simulate-v2 calls actually need and, for viewing purposes,
  // strictly more honest than an opaque "custom" block it cannot render.
  function openSimulatorLab() {
    if (!resolved.ok || !resolved.circuit) {
      pushToast(resolved.reason ?? "This circuit could not be resolved for Simulator Lab.", "error");
      return;
    }
    onOpenSimulatorLab(resolved.circuit);
  }
  const working = busyAction !== null;

  function openCreateCustomGate() {
    setWizardState({ editing: null, initialSelection: null });
  }

  function openCreateOperationFromSelection() {
    const maxMoment = Math.max(0, ...circuit.operations.map((operation) => operation.moment));
    setWizardState({
      editing: null,
      initialSelection: { qubitRange: [0, Math.max(0, circuit.num_qubits - 1)], momentRange: [0, maxMoment] },
    });
  }

  function editSelectedCustomDefinition() {
    if (!selectedCustomDefinition) return;
    setWizardState({ editing: selectedCustomDefinition, initialSelection: null });
  }

  function handleCustomSaved(definition: CustomDefinition) {
    refreshCustomLibrary();
    setSelectedGate("custom");
    setSelectedCustomId(definition.id);
    pushToast(`"${definition.name}" saved.`, "success");
  }

  useRegisterActions("composer", [
    { id: "composer-run", group: "Composer", label: "Run current circuit", hint: simulationPath.id.toUpperCase(), disabled: working, run: () => void run() },
    { id: "composer-analyze", group: "Composer", label: "Analyze feasibility", hint: "backend analyzer", disabled: working, run: () => void analyze() },
    { id: "composer-generate", group: "Composer", label: "Generate Qiskit / QASM outputs", disabled: working, run: () => void generate() },
    { id: "composer-move", group: "Composer", label: "Move selected gate", hint: "M, then arrow keys", disabled: !selectedOperation, run: moveSelected },
    { id: "composer-duplicate", group: "Composer", label: "Duplicate selected operation", hint: "Control D", disabled: !selectedOperation, run: duplicateSelected },
    { id: "composer-copy", group: "Composer", label: "Copy selected operation", hint: "Control C", disabled: !selectedOperation, run: copySelected },
    { id: "composer-paste", group: "Composer", label: "Paste copied operation", hint: "Control V", disabled: !clipboard, run: pasteClipboard },
    { id: "composer-delete", group: "Composer", label: "Delete selected operation", hint: "Delete", disabled: !selectedOperation, run: deleteSelected },
    { id: "composer-custom-create", group: "Custom gates", label: "Create custom gate", run: openCreateCustomGate },
    { id: "composer-custom-from-selection", group: "Custom gates", label: "Create operation from selection", disabled: circuit.operations.length === 0, run: openCreateOperationFromSelection },
    { id: "composer-custom-library", group: "Custom gates", label: "Open custom gate library", run: () => setLibraryOpen(true) },
    { id: "composer-custom-edit", group: "Custom gates", label: "Edit selected custom definition", disabled: !selectedCustomDefinition, run: editSelectedCustomDefinition },
    { id: "composer-custom-expand", group: "Custom gates", label: "Expand/collapse selected custom operation", disabled: !selectedCustomDefinition, run: () => setExpandPreviewOpen(true) },
    {
      id: "composer-custom-favorite",
      group: "Custom gates",
      label: "Favorite / unfavorite selected custom definition",
      disabled: !selectedCustomDefinition,
      run: () => {
        if (!selectedCustomDefinition) return;
        localCustomGateRepository.setFavorite(selectedCustomDefinition.id, !selectedCustomDefinition.favorite);
        refreshCustomLibrary();
      },
    },
  ]);

  const gateDock = (
    <GateDock
      selected={selectedGate}
      onSelect={(gate) => { setSelectedGate(gate); setSelectedCustomId(null); setPending(null); }}
      presets={PRESETS}
      onLoadPreset={loadPreset}
      customDefinitions={customDefinitions}
      selectedCustomId={selectedCustomId}
      onSelectCustom={(id) => { setSelectedGate("custom"); setSelectedCustomId(id); setPending(null); }}
      onOpenLibrary={() => setLibraryOpen(true)}
      onCreateCustom={openCreateCustomGate}
    />
  );
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
      onMoveSelected={moveSelected}
      onCopySelected={copySelected}
      onReplaceGate={replaceSelectedGate}
      onSwapEndpoints={swapSelectedEndpoints}
      customDefinition={selectedCustomDefinition}
      customLibrary={customLibraryMap}
      onEditCustomDefinition={editSelectedCustomDefinition}
      onExpandCustom={() => setExpandPreviewOpen(true)}
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
              onMoveOperation={moveOperation}
              onCopySelected={copySelected}
              onPasteClipboard={pasteClipboard}
              onDropGate={handleDropGate}
              handleRef={(handle) => { canvasHandle.current = handle; }}
              customLibrary={customLibraryMap}
              selectedCustomId={selectedCustomId}
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

      {libraryOpen && (
        <CustomGateLibraryDrawer
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          definitions={customDefinitions}
          recentIds={customRecentIds}
          onSelect={(id) => { setSelectedGate("custom"); setSelectedCustomId(id); }}
          onCreate={() => { setLibraryOpen(false); openCreateCustomGate(); }}
          onEdit={(definition) => { setLibraryOpen(false); setWizardState({ editing: definition, initialSelection: null }); }}
          onChanged={refreshCustomLibrary}
        />
      )}

      {wizardState && (
        <CustomGateWizard
          open={Boolean(wizardState)}
          onClose={() => setWizardState(null)}
          library={customDefinitions}
          editing={wizardState.editing}
          currentCircuit={circuit}
          initialSelection={wizardState.initialSelection}
          onSaved={handleCustomSaved}
        />
      )}

      <CustomGateExpandPreview
        open={expandPreviewOpen}
        onClose={() => setExpandPreviewOpen(false)}
        operation={selectedOperation}
        definition={selectedCustomDefinition}
        library={customLibraryMap}
        circuit={circuit}
      />
    </div>
  );
}
