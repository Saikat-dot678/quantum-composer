"use client";

// Progressive-disclosure creation/edit flow for custom gates and operations:
// basic details -> definition method (matrix / decomposition / from a canvas
// selection) -> kind-specific editor -> live validation -> code preview ->
// save. One scrollable form with clearly separated, conditionally-revealed
// sections rather than a paged wizard, so validation and preview can stay
// live throughout instead of only appearing on a final "review" page.
import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Badge, Button, CopyButton, FormField, NumberInput, SelectField, StatusNotice, inputClassName } from "@/components/ui/primitives";
import {
  CUSTOM_GATE_ICONS,
  MAX_DECOMPOSITION_QUBITS,
  MAX_MATRIX_QUBITS,
  MAX_PARAMETERS,
  customGateRef,
  definitionNumClbits,
  definitionNumQubits,
  type ComplexPair,
  type CustomDefinition,
  type CustomGateIcon,
  type CustomParameterSpec,
  type DecompositionStep,
} from "@/lib/customGates";
import { previewQiskitCode } from "@/lib/customGateCodePreview";
import { localCustomGateRepository } from "@/lib/customGateRepository";
import { CUSTOM_GATE_TEMPLATES, type DefinitionTemplate } from "@/lib/customGateTemplates";
import { stepOperandArity, validateDefinition } from "@/lib/customGateValidation";
import type { CircuitData, CircuitOperation } from "@/lib/types";
import { ModalPortal, useModalLifecycle } from "@/components/workspace/Modal";
import { CustomGateGlyph } from "./CustomGateGlyph";

type Kind = "matrix" | "decomposition" | "composite";

const BUILTIN_STEP_GATES = ["x", "y", "z", "h", "s", "t", "rx", "ry", "rz", "cx", "cz", "swap", "measure", "barrier"] as const;

function real(rows: number[][]): ComplexPair[][] {
  return rows.map((row) => row.map((value) => [value, 0] as ComplexPair));
}
function identityMatrix(dim: number): ComplexPair[][] {
  return real(Array.from({ length: dim }, (_, row) => Array.from({ length: dim }, (_, col) => (row === col ? 1 : 0))));
}
const HALF = Math.SQRT1_2;
const QUICK_FILLS: Record<number, Array<{ name: string; matrix: ComplexPair[][] }>> = {
  1: [
    { name: "Identity", matrix: identityMatrix(2) },
    { name: "Pauli X", matrix: real([[0, 1], [1, 0]]) },
    { name: "Pauli Y", matrix: [[[0, 0], [0, -1]], [[0, 1], [0, 0]]] },
    { name: "Pauli Z", matrix: real([[1, 0], [0, -1]]) },
    { name: "Hadamard", matrix: [[[HALF, 0], [HALF, 0]], [[HALF, 0], [-HALF, 0]]] },
    { name: "S", matrix: [[[1, 0], [0, 0]], [[0, 0], [0, 1]]] },
    { name: "T", matrix: [[[1, 0], [0, 0]], [[0, 0], [HALF, HALF]]] },
  ],
  2: [
    { name: "Identity", matrix: identityMatrix(4) },
    { name: "CNOT", matrix: real([[1, 0, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0], [0, 1, 0, 0]]) },
    { name: "CZ", matrix: real([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, -1]]) },
    { name: "SWAP", matrix: real([[1, 0, 0, 0], [0, 0, 1, 0], [0, 1, 0, 0], [0, 0, 0, 1]]) },
  ],
  3: [
    { name: "Identity", matrix: identityMatrix(8) },
    {
      name: "Toffoli",
      matrix: (() => {
        const m = identityMatrix(8).map((row) => [...row]);
        const swap = m[3]; m[3] = m[7]; m[7] = swap;
        return m;
      })(),
    },
  ],
};

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `cg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function blankStep(numQubits: number): DecompositionStep {
  return { gate: "h", qubits: [Math.min(0, numQubits - 1)], clbits: [], params: {}, moment: 0 };
}

interface SelectionMatch {
  operations: CircuitOperation[];
  numQubits: number;
  numClbits: number;
  steps: DecompositionStep[];
  qubitOffset: number;
}

/** Translates a rectangular (qubit-range x moment-range) slice of the live circuit into local-indexed macro steps. */
function computeSelectionMatch(circuit: CircuitData, qubitRange: [number, number], momentRange: [number, number]): SelectionMatch {
  const [qLo, qHi] = [Math.min(...qubitRange), Math.max(...qubitRange)];
  const [mLo, mHi] = [Math.min(...momentRange), Math.max(...momentRange)];
  const operations = circuit.operations
    .filter((op) => op.moment >= mLo && op.moment <= mHi && op.qubits.every((q) => q >= qLo && q <= qHi))
    .sort((a, b) => a.moment - b.moment || Math.min(...a.qubits) - Math.min(...b.qubits));
  const clbitSet = new Set<number>();
  for (const op of operations) for (const c of op.clbits) clbitSet.add(c);
  const clbitList = [...clbitSet].sort((a, b) => a - b);
  const steps: DecompositionStep[] = operations.map((op) => ({
    gate: op.gate === "custom" && op.customId ? customGateRef(op.customId) : op.gate,
    qubits: op.qubits.map((q) => q - qLo),
    clbits: op.clbits.map((c) => clbitList.indexOf(c)),
    params: { ...op.params },
    moment: op.moment - mLo,
  }));
  return { operations, numQubits: qHi - qLo + 1, numClbits: clbitList.length, steps, qubitOffset: qLo };
}

export function CustomGateWizard({
  open,
  onClose,
  library,
  editing,
  currentCircuit,
  initialSelection,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Full library (used for recursion-safe validation and step gate-reference options). */
  library: CustomDefinition[];
  editing?: CustomDefinition | null;
  /** Live circuit, used by the "from canvas selection" composite flow's range picker. */
  currentCircuit: CircuitData;
  /** Pre-set qubit/moment range (e.g. opened via "Create operation from selection" with a selection already known) — still editable. */
  initialSelection?: { qubitRange: [number, number]; momentRange: [number, number] } | null;
  onSaved: (definition: CustomDefinition) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useModalLifecycle(open, panelRef, onClose, nameRef);

  const [kind, setKind] = useState<Kind | null>(null);
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Custom");
  const [icon, setIcon] = useState<CustomGateIcon>("circle");
  const [tagsText, setTagsText] = useState("");

  const [matrixQubits, setMatrixQubits] = useState<1 | 2 | 3>(1);
  const [matrixCells, setMatrixCells] = useState<ComplexPair[][]>(identityMatrix(2));

  const [decompQubits, setDecompQubits] = useState(1);
  const [decompClbits, setDecompClbits] = useState(0);
  const [parameters, setParameters] = useState<CustomParameterSpec[]>([]);
  const [steps, setSteps] = useState<DecompositionStep[]>([blankStep(1)]);

  const [qubitRange, setQubitRange] = useState<[number, number]>(initialSelection?.qubitRange ?? [0, Math.max(0, currentCircuit.num_qubits - 1)]);
  const [momentRange, setMomentRange] = useState<[number, number]>(initialSelection?.momentRange ?? [0, 0]);
  // Set when a composite template is applied — its steps are already fully
  // known, so the live qubit/moment region picker below is bypassed rather
  // than (wrongly) re-deriving steps from whatever the picker currently
  // matches on the live circuit. Editing either range escapes back to
  // live-selection mode.
  const [lockedComposite, setLockedComposite] = useState<{ numQubits: number; numClbits: number; steps: DecompositionStep[]; sourceName: string } | null>(null);

  const [saveError, setSaveError] = useState<string | null>(null);
  const stableId = useRef(editing?.id ?? makeId());
  const idRef = stableId.current;

  // Reset the whole form whenever the wizard is (re)opened for a different target.
  useEffect(() => {
    if (!open) return;
    setSaveError(null);
    if (editing) {
      setKind(editing.kind);
      setName(editing.name);
      setLabel(editing.label);
      setDescription(editing.description);
      setCategory(editing.category);
      setIcon(editing.icon);
      setTagsText(editing.tags.join(", "));
      if (editing.kind === "matrix") {
        setMatrixQubits(editing.numQubits);
        setMatrixCells(editing.matrix);
        setLockedComposite(null);
      } else if (editing.kind === "composite") {
        // Editing an existing composite shows its own stored steps, same as
        // a template — not a re-derived live-circuit region match.
        setLockedComposite({ numQubits: editing.numQubits, numClbits: editing.numClbits, steps: editing.steps, sourceName: editing.name });
      } else {
        setDecompQubits(editing.numQubits);
        setDecompClbits(editing.numClbits);
        setSteps(editing.steps.length ? editing.steps : [blankStep(editing.numQubits)]);
        setParameters(editing.parameters);
        setLockedComposite(null);
      }
    } else {
      setKind(initialSelection ? "composite" : null);
      setName(""); setLabel(""); setDescription(""); setCategory("Custom"); setIcon("circle"); setTagsText("");
      setMatrixQubits(1); setMatrixCells(identityMatrix(2));
      setDecompQubits(1); setDecompClbits(0); setParameters([]); setSteps([blankStep(1)]);
      setLockedComposite(null);
      if (initialSelection) { setQubitRange(initialSelection.qubitRange); setMomentRange(initialSelection.momentRange); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id, initialSelection]);

  const applyTemplate = (template: DefinitionTemplate) => {
    setKind(template.kind);
    setName(template.name);
    setLabel(template.label);
    setDescription(template.description);
    setCategory(template.category);
    setIcon(template.icon);
    setTagsText(template.tags.join(", "));
    if (template.kind === "matrix") {
      setMatrixQubits(template.numQubits);
      setMatrixCells(template.matrix);
      setLockedComposite(null);
    } else if (template.kind === "composite") {
      setLockedComposite({ numQubits: template.numQubits, numClbits: template.numClbits, steps: template.steps, sourceName: template.name });
    } else {
      setDecompQubits(template.numQubits);
      setDecompClbits(template.numClbits);
      setSteps(template.steps);
      setParameters(template.parameters);
      setLockedComposite(null);
    }
  };

  const selectionMatch = useMemo(
    () => (kind === "composite" && !lockedComposite ? computeSelectionMatch(currentCircuit, qubitRange, momentRange) : null),
    [kind, lockedComposite, currentCircuit, qubitRange, momentRange],
  );

  const libraryMap = useMemo(() => new Map(library.filter((d) => d.id !== idRef).map((d) => [d.id, d])), [library, idRef]);

  const candidate: CustomDefinition | null = useMemo(() => {
    const base = {
      id: idRef,
      name: name.trim() || "Untitled",
      label: label.trim() || "?",
      description: description.trim(),
      category: category.trim() || "Custom",
      icon,
      tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
      favorite: editing?.favorite ?? false,
      createdAt: editing?.createdAt ?? 0,
      updatedAt: 0,
    };
    if (kind === "matrix") return { ...base, kind: "matrix", numQubits: matrixQubits, matrix: matrixCells, unitarityError: 0 };
    if (kind === "decomposition") return { ...base, kind: "decomposition", numQubits: decompQubits, numClbits: decompClbits, parameters, steps };
    if (kind === "composite") {
      const source = lockedComposite ?? selectionMatch;
      if (source) return { ...base, kind: "composite", numQubits: source.numQubits, numClbits: source.numClbits, steps: source.steps };
    }
    return null;
  }, [idRef, name, label, description, category, icon, tagsText, editing, kind, matrixQubits, matrixCells, decompQubits, decompClbits, parameters, steps, lockedComposite, selectionMatch]);

  const validation = useMemo(() => (candidate ? validateDefinition(candidate, libraryMap) : { ok: false, reason: "Choose a definition method to begin." }), [candidate, libraryMap]);
  const preview = useMemo(() => (candidate && validation.ok ? previewQiskitCode(candidate, libraryMap) : null), [candidate, validation.ok, libraryMap]);

  if (!open) return null;

  function setMatrixEntry(row: number, col: number, part: 0 | 1, raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    setMatrixCells((current) => current.map((r, ri) => (ri !== row ? r : r.map((c, ci) => (ci !== col ? c : (part === 0 ? [value, c[1]] : [c[0], value]) as ComplexPair)))));
  }

  function changeMatrixQubits(next: 1 | 2 | 3) {
    setMatrixQubits(next);
    setMatrixCells(identityMatrix(2 ** next));
  }

  function updateStep(index: number, patch: Partial<DecompositionStep>) {
    setSteps((current) => current.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  }

  function changeStepGate(index: number, gate: string) {
    const arity = stepOperandArity(gate, libraryMap) ?? { qubits: 1, clbits: 0 };
    const qubitCount = arity.qubits === -1 ? Math.max(1, decompQubits) : arity.qubits;
    updateStep(index, {
      gate,
      qubits: Array.from({ length: qubitCount }, (_, i) => Math.min(i, Math.max(0, decompQubits - 1))),
      clbits: Array.from({ length: arity.clbits }, () => 0),
      params: gate === "rx" || gate === "ry" || gate === "rz" ? { theta: Math.PI / 2 } : {},
    });
  }

  function handleSave() {
    if (!candidate || !validation.ok) return;
    const result = localCustomGateRepository.save(candidate);
    if (!result.ok || !result.value) { setSaveError(result.reason ?? "That definition could not be saved."); return; }
    onSaved(result.value);
    onClose();
  }

  const stepGateOptions = [...BUILTIN_STEP_GATES.map((g) => ({ value: g, label: g.toUpperCase() })), ...[...libraryMap.values()].map((d) => ({ value: customGateRef(d.id), label: `${d.label} (${d.name})` }))];

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[90] bg-black/50" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <section
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="custom-gate-wizard-title"
          tabIndex={-1}
          className="drawer-enter absolute inset-y-0 right-0 flex w-[min(40rem,100vw)] flex-col border-l border-line bg-surface shadow-floating"
        >
          <header className="flex items-center justify-between gap-3 border-b border-line-hairline px-5 py-4">
            <div>
              <p className="eyebrow text-accent-600">{editing ? "Edit custom gate" : "Create custom gate"}</p>
              <h2 id="custom-gate-wizard-title" className="mt-1 text-lg font-semibold text-ink-900">{editing ? editing.name : "New gate or operation"}</h2>
            </div>
            <Button variant="quiet" size="sm" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
          </header>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {!editing && !initialSelection && (
              <div>
                <p className="eyebrow mb-1.5">Start from a template (optional)</p>
                <div className="flex flex-wrap gap-1.5">
                  <Button variant="secondary" size="sm" onClick={() => { setKind(null); }}>Start blank</Button>
                  {CUSTOM_GATE_TEMPLATES.map((template) => (
                    <Button key={template.name} variant="secondary" size="sm" onClick={() => applyTemplate(template)}>{template.name}</Button>
                  ))}
                </div>
              </div>
            )}

            {!editing && (
              <div>
                <p className="eyebrow mb-1.5">1. Definition method</p>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => setKind("matrix")} aria-pressed={kind === "matrix"} className={`rounded-lg border p-3 text-left text-xs transition-colors ${kind === "matrix" ? "border-accent-500 bg-accent-50" : "border-line-hairline hover:border-accent-300"}`}>
                    <span className="block font-semibold text-ink-900">Matrix</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-ink-500">A literal unitary, 1-3 qubits.</span>
                  </button>
                  <button type="button" onClick={() => setKind("decomposition")} aria-pressed={kind === "decomposition"} className={`rounded-lg border p-3 text-left text-xs transition-colors ${kind === "decomposition" ? "border-accent-500 bg-accent-50" : "border-line-hairline hover:border-accent-300"}`}>
                    <span className="block font-semibold text-ink-900">Decomposition</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-ink-500">Built from existing gates, with parameters.</span>
                  </button>
                  <button type="button" onClick={() => setKind("composite")} aria-pressed={kind === "composite"} className={`rounded-lg border p-3 text-left text-xs transition-colors ${kind === "composite" ? "border-accent-500 bg-accent-50" : "border-line-hairline hover:border-accent-300"}`}>
                    <span className="block font-semibold text-ink-900">From selection</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-ink-500">Capture a region of the live circuit as a macro.</span>
                  </button>
                </div>
              </div>
            )}

            {kind && (
              <div className="space-y-3 border-t border-line-hairline pt-4">
                <p className="eyebrow">2. Basic details</p>
                <FormField label="Name" htmlFor="cg-name">
                  <input ref={nameRef} id="cg-name" className={inputClassName} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bell pair" />
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Canvas label" htmlFor="cg-label" hint="Up to 8 characters, shown on the canvas cell.">
                    <input id="cg-label" className={`${inputClassName} font-mono`} value={label} maxLength={8} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. BELL" />
                  </FormField>
                  <FormField label="Category" htmlFor="cg-category">
                    <input id="cg-category" className={inputClassName} value={category} maxLength={40} onChange={(e) => setCategory(e.target.value)} />
                  </FormField>
                </div>
                <FormField label="Description" htmlFor="cg-description" hint={`${description.length}/400`}>
                  <textarea id="cg-description" className={`${inputClassName} min-h-16 resize-y`} value={description} maxLength={400} onChange={(e) => setDescription(e.target.value)} />
                </FormField>
                <FormField label="Tags (comma-separated)" htmlFor="cg-tags">
                  <input id="cg-tags" className={inputClassName} value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="entanglement, teaching" />
                </FormField>
                <div>
                  <p className="mb-1.5 block text-xs font-medium text-ink-500">Icon</p>
                  <div className="flex gap-1.5">
                    {CUSTOM_GATE_ICONS.map((option) => (
                      <button key={option} type="button" onClick={() => setIcon(option)} aria-pressed={icon === option} aria-label={`${option} icon`} className={`rounded-lg border p-2 transition-colors ${icon === option ? "border-accent-500 bg-accent-50 text-accent-700" : "border-line-hairline text-ink-500 hover:border-accent-300"}`}>
                        <CustomGateGlyph icon={option} size={16} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {kind === "matrix" && (
              <div className="space-y-3 border-t border-line-hairline pt-4">
                <p className="eyebrow">3. Matrix</p>
                <SelectField label="Qubit count" hint={`Matrix size: ${2 ** matrixQubits}x${2 ** matrixQubits}. Capped at ${MAX_MATRIX_QUBITS} — the matrix doubles in size per qubit.`} value={matrixQubits} onChange={(e) => changeMatrixQubits(Number(e.target.value) as 1 | 2 | 3)}>
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n} qubit{n > 1 ? "s" : ""}</option>)}
                </SelectField>
                <div className="flex flex-wrap gap-1.5">
                  {(QUICK_FILLS[matrixQubits] ?? []).map((fill) => (
                    <Button key={fill.name} variant="secondary" size="sm" onClick={() => setMatrixCells(fill.matrix)}>{fill.name}</Button>
                  ))}
                </div>
                <div className="overflow-x-auto rounded-lg border border-line-hairline">
                  <table className="border-collapse text-[10px]">
                    <tbody>
                      {matrixCells.map((row, ri) => (
                        <tr key={ri}>
                          {row.map((cell, ci) => (
                            <td key={ci} className="border border-line-hairline p-1">
                              <div className="flex items-center gap-0.5">
                                <input aria-label={`Row ${ri} column ${ci} real part`} type="number" step="0.01" value={cell[0]} onChange={(e) => setMatrixEntry(ri, ci, 0, e.target.value)} className="w-14 rounded border border-line-hairline bg-surface-sunken px-1 py-0.5 font-mono text-[10px]" />
                                <span className="text-ink-500">{cell[1] < 0 ? "-" : "+"}i</span>
                                <input aria-label={`Row ${ri} column ${ci} imaginary part`} type="number" step="0.01" value={Math.abs(cell[1])} onChange={(e) => setMatrixEntry(ri, ci, 1, String(cell[1] < 0 ? -Number(e.target.value) : Number(e.target.value)))} className="w-14 rounded border border-line-hairline bg-surface-sunken px-1 py-0.5 font-mono text-[10px]" />
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {kind === "decomposition" && (
              <div className="space-y-3 border-t border-line-hairline pt-4">
                <p className="eyebrow">3. Definition</p>
                <div className="grid grid-cols-2 gap-3">
                  <NumberInput label="Qubits" min={1} max={MAX_DECOMPOSITION_QUBITS} value={decompQubits} onChange={(e) => setDecompQubits(Math.max(1, Math.min(MAX_DECOMPOSITION_QUBITS, Number(e.target.value) || 1)))} />
                  <NumberInput label="Classical bits" min={0} max={MAX_DECOMPOSITION_QUBITS} value={decompClbits} onChange={(e) => setDecompClbits(Math.max(0, Number(e.target.value) || 0))} />
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-xs font-medium text-ink-500">Parameters ({parameters.length}/{MAX_PARAMETERS})</p>
                    <Button variant="quiet" size="sm" disabled={parameters.length >= MAX_PARAMETERS} onClick={() => setParameters((p) => [...p, { name: `p${p.length + 1}`, label: `p${p.length + 1}`, default: 0 }])}><Plus className="h-3 w-3" />Add</Button>
                  </div>
                  <div className="space-y-1.5">
                    {parameters.map((param, index) => (
                      <div key={index} className="flex items-center gap-1.5">
                        <input aria-label="Parameter name" className={`${inputClassName} font-mono text-xs`} value={param.name} onChange={(e) => setParameters((p) => p.map((x, i) => (i === index ? { ...x, name: e.target.value } : x)))} />
                        <input aria-label="Parameter default value" type="number" step="0.01" className={`${inputClassName} w-24 text-xs`} value={param.default} onChange={(e) => setParameters((p) => p.map((x, i) => (i === index ? { ...x, default: Number(e.target.value) } : x)))} />
                        <Button variant="quiet" size="sm" aria-label="Remove parameter" onClick={() => setParameters((p) => p.filter((_, i) => i !== index))}><Minus className="h-3 w-3" /></Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-xs font-medium text-ink-500">Steps ({steps.length})</p>
                    <Button variant="quiet" size="sm" onClick={() => setSteps((s) => [...s, blankStep(decompQubits)])}><Plus className="h-3 w-3" />Add step</Button>
                  </div>
                  <div className="space-y-2">
                    {steps.map((step, index) => {
                      const arity = stepOperandArity(step.gate, libraryMap);
                      const isRotation = step.gate === "rx" || step.gate === "ry" || step.gate === "rz";
                      return (
                        <div key={index} className="rounded-lg border border-line-hairline p-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <select aria-label={`Step ${index + 1} gate`} className={`${inputClassName} min-h-8 w-auto py-1 text-xs`} value={step.gate} onChange={(e) => changeStepGate(index, e.target.value)}>
                              {stepGateOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                            {(step.gate === "barrier" ? step.qubits : step.qubits.slice(0, arity?.qubits === -1 ? step.qubits.length : arity?.qubits ?? step.qubits.length)).map((q, qi) => (
                              <input key={qi} aria-label={`Step ${index + 1} qubit ${qi + 1}`} type="number" min={0} max={Math.max(0, decompQubits - 1)} value={q} onChange={(e) => updateStep(index, { qubits: step.qubits.map((v, i) => (i === qi ? Number(e.target.value) : v)) })} className="w-12 rounded-md border border-line-hairline bg-surface-sunken px-1.5 py-1 text-center font-mono text-xs" />
                            ))}
                            {step.gate === "barrier" && (
                              <>
                                <Button variant="quiet" size="sm" onClick={() => updateStep(index, { qubits: [...step.qubits, 0] })}><Plus className="h-3 w-3" /></Button>
                                <Button variant="quiet" size="sm" disabled={step.qubits.length <= 1} onClick={() => updateStep(index, { qubits: step.qubits.slice(0, -1) })}><Minus className="h-3 w-3" /></Button>
                              </>
                            )}
                            {step.gate === "measure" && (
                              <input aria-label={`Step ${index + 1} classical bit`} type="number" min={0} max={Math.max(0, decompClbits - 1)} value={step.clbits[0] ?? 0} onChange={(e) => updateStep(index, { clbits: [Number(e.target.value)] })} className="w-12 rounded-md border border-line-hairline bg-warn-bg px-1.5 py-1 text-center font-mono text-xs" title="Classical bit" />
                            )}
                            {isRotation && (
                              parameters.length > 0 ? (
                                <select aria-label={`Step ${index + 1} angle source`} className={`${inputClassName} min-h-8 w-auto py-1 text-xs`} value={typeof step.params.theta === "string" ? step.params.theta : "literal"} onChange={(e) => updateStep(index, { params: { theta: e.target.value === "literal" ? Math.PI / 2 : (e.target.value as `param:${string}`) } })}>
                                  <option value="literal">literal angle</option>
                                  {parameters.map((p) => <option key={p.name} value={`param:${p.name}`}>param: {p.name}</option>)}
                                </select>
                              ) : null
                            )}
                            {isRotation && typeof step.params.theta !== "string" && (
                              <input aria-label={`Step ${index + 1} angle (radians)`} type="number" step="0.01" value={typeof step.params.theta === "number" ? step.params.theta : 0} onChange={(e) => updateStep(index, { params: { theta: Number(e.target.value) } })} className="w-20 rounded-md border border-line-hairline bg-surface-sunken px-1.5 py-1 text-center font-mono text-xs" />
                            )}
                            <Button variant="quiet" size="sm" className="ml-auto !text-red-500" aria-label={`Remove step ${index + 1}`} onClick={() => setSteps((s) => s.filter((_, i) => i !== index))}><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {kind === "composite" && lockedComposite && (
              <div className="space-y-3 border-t border-line-hairline pt-4">
                <p className="eyebrow">3. Steps</p>
                <div className="rounded-lg border border-line-hairline bg-surface-sunken p-2.5">
                  <p className="text-xs font-semibold text-ink-900">
                    {lockedComposite.steps.length} operation{lockedComposite.steps.length === 1 ? "" : "s"} from &ldquo;{lockedComposite.sourceName}&rdquo; {"->"} {lockedComposite.numQubits} qubit(s), {lockedComposite.numClbits} classical bit(s).
                  </p>
                  <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-ink-500">
                    {lockedComposite.steps.slice(0, 8).map((step, i) => (
                      <li key={i}>{step.gate.toUpperCase()} · q{step.qubits.join(",")} · t{step.moment}</li>
                    ))}
                    {lockedComposite.steps.length > 8 && <li>… and {lockedComposite.steps.length - 8} more</li>}
                  </ul>
                  <Button variant="quiet" size="sm" className="mt-2" onClick={() => setLockedComposite(null)}>Use a live selection instead</Button>
                </div>
              </div>
            )}

            {kind === "composite" && !lockedComposite && (
              <div className="space-y-3 border-t border-line-hairline pt-4">
                <p className="eyebrow">3. Select a region of the live circuit</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid grid-cols-2 gap-1.5">
                    <NumberInput label="Qubit from" min={0} max={Math.max(0, currentCircuit.num_qubits - 1)} value={qubitRange[0]} onChange={(e) => setQubitRange([Number(e.target.value), qubitRange[1]])} />
                    <NumberInput label="Qubit to" min={0} max={Math.max(0, currentCircuit.num_qubits - 1)} value={qubitRange[1]} onChange={(e) => setQubitRange([qubitRange[0], Number(e.target.value)])} />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <NumberInput label="Time from" min={0} value={momentRange[0]} onChange={(e) => setMomentRange([Number(e.target.value), momentRange[1]])} />
                    <NumberInput label="Time to" min={0} value={momentRange[1]} onChange={(e) => setMomentRange([momentRange[0], Number(e.target.value)])} />
                  </div>
                </div>
                <div className="rounded-lg border border-line-hairline bg-surface-sunken p-2.5">
                  {selectionMatch && selectionMatch.operations.length > 0 ? (
                    <>
                      <p className="text-xs font-semibold text-ink-900">{selectionMatch.operations.length} operation{selectionMatch.operations.length === 1 ? "" : "s"} in this region {"->"} {selectionMatch.numQubits} qubit(s), {selectionMatch.numClbits} classical bit(s).</p>
                      <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-ink-500">
                        {selectionMatch.operations.slice(0, 8).map((op, i) => (
                          <li key={i}>{op.gate.toUpperCase()} · q{op.qubits.join(",")} · t{op.moment}</li>
                        ))}
                        {selectionMatch.operations.length > 8 && <li>… and {selectionMatch.operations.length - 8} more</li>}
                      </ul>
                    </>
                  ) : (
                    <p className="text-xs text-ink-500">No placed operations fall inside that qubit/time range yet — adjust the ranges above.</p>
                  )}
                </div>
              </div>
            )}

            {kind && (
              <div className="space-y-3 border-t border-line-hairline pt-4">
                <p className="eyebrow">4. Validation</p>
                <StatusNotice kind={validation.ok ? "success" : "error"}>{validation.ok ? "This definition is valid and ready to save." : validation.reason}</StatusNotice>

                {preview && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="eyebrow">5. Preview</p>
                      <CopyButton text={preview} label="Copy code" />
                    </div>
                    <pre className="max-h-56 overflow-auto rounded-lg border border-line-hairline bg-ink-900 p-3 font-mono text-[11px] leading-5 text-white">{preview}</pre>
                  </div>
                )}

                {saveError && <StatusNotice kind="error">{saveError}</StatusNotice>}
              </div>
            )}
          </div>

          <footer className="flex items-center justify-between gap-2 border-t border-line-hairline px-5 py-3">
            <div className="flex items-center gap-1.5">
              {candidate && <Badge tone={validation.ok ? "green" : "red"}>{validation.ok ? "Valid" : "Invalid"}</Badge>}
              {candidate && <span className="font-mono text-[11px] text-ink-500">{definitionNumQubits(candidate)}q{definitionNumClbits(candidate) > 0 ? ` · ${definitionNumClbits(candidate)}c` : ""}</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="quiet" size="sm" onClick={onClose}>Cancel</Button>
              <Button variant="primary" size="sm" disabled={!candidate || !validation.ok} onClick={handleSave}>{editing ? "Save changes" : "Create gate"}</Button>
            </div>
          </footer>
        </section>
      </div>
    </ModalPortal>
  );
}
