"use client";

// Contextual properties panel (reference study #2 Figma, #11 Framer): empty/
// register-settings by default, and fills in with exactly the selected gate's
// editable fields the moment something is selected on the canvas. Replaces
// the old permanently-visible CircuitSettings + SelectedGateDetails split.
import { Copy, Trash2 } from "lucide-react";
import { Badge, Button, NumberInput, SelectField } from "@/components/ui/primitives";
import { gridRenderState } from "@/lib/circuitSizing";
import type { SimulationPath } from "@/lib/circuitRouting";
import { LIMITS, SHOT_OPTIONS } from "@/lib/constants";
import type { CircuitAnalysis } from "@/lib/labTypes";
import { ROTATION_GATES, type CircuitOperation } from "@/lib/types";
import { GATE_DEFINITIONS } from "./GateDock";
import { StatePreviewPanel } from "./StatePreviewPanel";
import type { CircuitData } from "@/lib/types";

function NumberStepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const id = `inspector-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next)));
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-500">{label}</label>
      <div className="grid grid-cols-[28px_minmax(0,1fr)_28px] gap-1">
        <Button variant="quiet" size="sm" disabled={value <= min} onClick={() => onChange(clamp(value - 1))} aria-label={`Decrease ${label}`} className="!min-h-8 !px-0">−</Button>
        <input id={id} type="number" min={min} max={max} value={value} onChange={(event) => onChange(clamp(Number(event.target.value) || min))} className="min-h-8 w-full rounded-md border border-line-hairline bg-surface-sunken px-2 text-center font-mono text-sm font-semibold text-ink-900 outline-none focus:border-accent-500" />
        <Button variant="quiet" size="sm" disabled={value >= max} onClick={() => onChange(clamp(value + 1))} aria-label={`Increase ${label}`} className="!min-h-8 !px-0">+</Button>
      </div>
    </div>
  );
}

export function CircuitInspector({
  circuit,
  columns,
  selectedOperation,
  simulationPath,
  analysis,
  onQubitsChange,
  onClbitsChange,
  onColumnsChange,
  onShotsChange,
  onThetaChange,
  onDeleteSelected,
  onDuplicateSelected,
}: {
  circuit: CircuitData;
  columns: number;
  selectedOperation: CircuitOperation | null;
  simulationPath: SimulationPath;
  /** Backend-verified analysis from the last explicit "Analyze" run, if any (advisory only — see StatePreviewPanel for the always-on local estimate). */
  analysis: CircuitAnalysis | null;
  onQubitsChange: (value: number) => void;
  onClbitsChange: (value: number) => void;
  onColumnsChange: (value: number) => void;
  onShotsChange: (value: number) => void;
  onThetaChange: (value: number) => void;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
}) {
  if (selectedOperation) {
    const definition = GATE_DEFINITIONS[selectedOperation.gate];
    const isRotation = ROTATION_GATES.includes(selectedOperation.gate);
    const theta = typeof selectedOperation.params.theta === "number" ? selectedOperation.params.theta : 0;
    return (
      <div className="flex h-full flex-col overflow-y-auto rounded-xl2 border border-line bg-surface p-4 shadow-floating">
        <p className="eyebrow">Selected operation</p>
        <div className="mt-2 flex items-start gap-3">
          <span className="grid h-10 min-w-10 place-items-center rounded-lg border border-accent-200 bg-accent-50 px-2 font-mono text-xs font-bold text-accent-700">{definition.label}</span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink-900">{definition.name}</h3>
            <p className="mt-1 text-xs leading-5 text-ink-500">{definition.description}</p>
          </div>
        </div>
        <p className="mt-3 font-mono text-[11px] text-ink-500">
          qubit{selectedOperation.qubits.length > 1 ? "s" : ""} {selectedOperation.qubits.map((q) => `q${q}`).join(" → ")}
          {selectedOperation.clbits.length > 0 && ` · c${selectedOperation.clbits.join(",")}`} · t{selectedOperation.moment}
        </p>
        {isRotation && (
          <div className="mt-4">
            <NumberInput
              id="rotation-theta"
              label="Rotation angle θ (radians)"
              step="0.1"
              value={Number.isFinite(theta) ? theta : ""}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) onThetaChange(next);
              }}
              hint={`Current angle: ${theta.toFixed(4)} rad · ${(theta / Math.PI).toFixed(3)}π`}
            />
          </div>
        )}
        <div className="mt-4 flex gap-2 border-t border-line-hairline pt-4">
          <Button variant="secondary" size="sm" onClick={onDuplicateSelected} className="flex-1">
            <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Duplicate
          </Button>
          <Button variant="danger" size="sm" onClick={onDeleteSelected} className="flex-1">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
          </Button>
        </div>
        <p className="mt-3 text-[11px] leading-4 text-ink-500">Delete/Backspace and Ctrl/Cmd+D also work directly on the canvas.</p>
      </div>
    );
  }

  const renderState = gridRenderState(circuit.num_qubits, circuit.num_clbits, columns);
  const renderTone = renderState.level === "smooth" ? "green" : renderState.level === "heavy" ? "amber" : "red";

  return (
    <div className="flex h-full flex-col overflow-y-auto rounded-xl2 border border-line bg-surface p-4 shadow-floating">
      <p className="eyebrow">Nothing selected</p>
      <p className="mt-1 text-xs leading-5 text-ink-500">Click a placed gate to edit it here, or adjust the circuit below.</p>

      <div className="mt-4 space-y-3 border-t border-line-hairline pt-4">
        <p className="eyebrow">Register &amp; run settings</p>
        <NumberStepper label="Qubits" value={circuit.num_qubits} min={LIMITS.composer.minQubits} max={LIMITS.composer.interactiveMaxQubits} onChange={onQubitsChange} />
        <NumberStepper label="Classical bits" value={circuit.num_clbits} min={0} max={LIMITS.composer.interactiveMaxClbits} onChange={onClbitsChange} />
        <NumberStepper label="Time steps" value={columns} min={LIMITS.composer.minColumns} max={LIMITS.composer.interactiveMaxColumns} onChange={onColumnsChange} />
        <SelectField id="composer-shots" label="Measurement shots" value={circuit.shots} onChange={(event) => onShotsChange(Number(event.target.value))}>
          {SHOT_OPTIONS.map((value) => <option key={value} value={value}>{value.toLocaleString()}</option>)}
        </SelectField>
      </div>

      <div className="mt-4 rounded-lg border border-line-hairline bg-surface-sunken p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow">Grid rendering</p>
          <Badge tone={renderTone}>{renderState.level}</Badge>
        </div>
        <p className="mt-1 text-[11px] leading-4 text-ink-500">{renderState.message}</p>
      </div>

      <div className="mt-2 rounded-lg border border-line-hairline bg-surface-sunken p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow">Simulation route</p>
          <Badge tone={simulationPath.id === "v1" ? "green" : "amber"}>{simulationPath.id.toUpperCase()}</Badge>
        </div>
        <p className="mt-1.5 text-xs font-semibold text-ink-900">{simulationPath.label}</p>
        <p className="mt-1 text-[11px] leading-4 text-ink-500">{simulationPath.reason}</p>
      </div>

      {analysis && (
        <div className="mt-2 rounded-lg border border-accent-100 bg-accent-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow text-accent-700">Backend analysis</p>
            <Badge tone={analysis.is_clifford ? "green" : "violet"}>{analysis.is_clifford ? "Clifford" : "Non-Clifford"}</Badge>
          </div>
          <p className="mt-1.5 text-xs font-semibold text-ink-900">{analysis.feasibility_status.replaceAll("_", " ")}</p>
          <p className="mt-1 font-mono text-[11px] text-ink-500">
            depth {analysis.depth} · statevector {analysis.estimated_statevector_memory_human} · {analysis.recommended_engines[0] ?? "no feasible engine"}
          </p>
        </div>
      )}

      <StatePreviewPanel circuit={circuit} />
    </div>
  );
}
