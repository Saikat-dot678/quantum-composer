import { Button, Badge, FormField, SelectField } from "@/components/ui/primitives";
import { LIMITS, SHOT_OPTIONS } from "@/lib/constants";
import { gridRenderState } from "@/lib/circuitSizing";
import type { SimulationPath } from "@/lib/circuitRouting";
import { InfoIcon } from "@/components/ui/icons";

function NumberStepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const id = `composer-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next)));
  return (
    <FormField label={label} htmlFor={id}>
      <div className="grid grid-cols-[32px_minmax(0,1fr)_32px] gap-1.5">
        <Button variant="quiet" size="sm" disabled={value <= min} onClick={() => onChange(clamp(value - 1))} aria-label={`Decrease ${label}`} className="!min-h-10 !px-0">−</Button>
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(clamp(Number(event.target.value) || min))}
          className="min-h-10 w-full rounded-lg border border-lab-borderStrong bg-lab-bg px-2 text-center font-mono text-sm font-semibold text-lab-text outline-none focus:border-accent-cyan focus:ring-2 focus:ring-accent-cyan/15"
        />
        <Button variant="quiet" size="sm" disabled={value >= max} onClick={() => onChange(clamp(value + 1))} aria-label={`Increase ${label}`} className="!min-h-10 !px-0">+</Button>
      </div>
    </FormField>
  );
}

export function CircuitSettings({
  qubits,
  clbits,
  columns,
  shots,
  simulationPath,
  onQubitsChange,
  onClbitsChange,
  onColumnsChange,
  onShotsChange,
}: {
  qubits: number;
  clbits: number;
  columns: number;
  shots: number;
  simulationPath: SimulationPath;
  onQubitsChange: (value: number) => void;
  onClbitsChange: (value: number) => void;
  onColumnsChange: (value: number) => void;
  onShotsChange: (value: number) => void;
}) {
  const renderState = gridRenderState(qubits, clbits, columns);
  const renderTone = renderState.level === "smooth" ? "green" : renderState.level === "heavy" ? "amber" : "red";
  return (
    <section aria-labelledby="circuit-settings-heading">
      <h2 id="circuit-settings-heading" className="instrument-label">Circuit settings</h2>
      <div className="mt-3 space-y-3">
        <NumberStepper label="Qubits" value={qubits} min={LIMITS.composer.minQubits} max={LIMITS.composer.interactiveMaxQubits} onChange={onQubitsChange} />
        <NumberStepper label="Classical bits" value={clbits} min={0} max={LIMITS.composer.interactiveMaxClbits} onChange={onClbitsChange} />
        <NumberStepper label="Time steps" value={columns} min={LIMITS.composer.minColumns} max={LIMITS.composer.interactiveMaxColumns} onChange={onColumnsChange} />
        <SelectField id="composer-shots" label="Measurement shots" value={shots} onChange={(event) => onShotsChange(Number(event.target.value))}>
          {SHOT_OPTIONS.map((value) => <option key={value} value={value}>{value.toLocaleString()}</option>)}
        </SelectField>
      </div>

      <div className="mt-5 rounded-lg border border-lab-border bg-lab-surface/70 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="instrument-label">Grid rendering</p>
          <Badge tone={renderTone}>{renderState.level}</Badge>
        </div>
        <p className="mt-1 text-[11px] leading-4 text-lab-faint">{renderState.message}</p>
      </div>

      <div className="mt-3 rounded-lg border border-lab-border bg-lab-surface/70 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="instrument-label">Simulation route</p>
          <Badge tone={simulationPath.id === "v1" ? "green" : "amber"}>{simulationPath.id.toUpperCase()}</Badge>
        </div>
        <p className="mt-2 text-xs font-semibold text-lab-text">{simulationPath.label}</p>
        <p className="mt-1 text-[11px] leading-4 text-lab-faint">{simulationPath.reason}</p>
      </div>

      <div className="mt-3 flex gap-2 text-[11px] leading-4 text-lab-faint">
        <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-cyan" />
        <p>
          The interactive grid draws up to {LIMITS.composer.interactiveMaxQubits} qubits; larger structured circuits (up to {LIMITS.largeCircuit.maxDescriptorQubits.toLocaleString()} qubits) are handled as generated presets in Simulator Lab. Reducing register size or time steps removes operations that no longer fit. Simulation feasibility is decided by the backend estimator, not by these visual limits.
        </p>
      </div>
    </section>
  );
}
