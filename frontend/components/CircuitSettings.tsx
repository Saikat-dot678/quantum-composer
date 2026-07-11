import {
  COMPOSER_MAX_CLBITS,
  COMPOSER_MAX_COLUMNS,
  COMPOSER_MAX_QUBITS,
  COMPOSER_MIN_COLUMNS,
  COMPOSER_MIN_QUBITS,
  SAFE_V1_SIM_MAX_QUBITS,
  SHOT_OPTIONS,
} from "@/lib/constants";
import { WarningCallout } from "./ui/primitives";

interface Props {
  qubits: number;
  clbits: number;
  columns: number;
  shots: number;
  onQubitsChange: (v: number) => void;
  onClbitsChange: (v: number) => void;
  onColumnsChange: (v: number) => void;
  onShotsChange: (v: number) => void;
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));
  return (
    <div className="flex items-center justify-between rounded-lg border border-lab-border bg-lab-raised/40 px-3 py-2">
      <span className="text-xs text-lab-muted">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          className="h-6 w-6 rounded bg-lab-bg text-lab-muted ring-1 ring-lab-border transition hover:text-accent-cyan disabled:opacity-30"
        >
          −
        </button>
        <input
          type="number"
          aria-label={label}
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(clamp(Number(e.target.value) || min))}
          className="w-14 rounded bg-lab-bg px-1.5 py-1 text-center font-mono text-xs font-semibold text-lab-text ring-1 ring-lab-border outline-none focus:ring-accent-cyan"
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          className="h-6 w-6 rounded bg-lab-bg text-lab-muted ring-1 ring-lab-border transition hover:text-accent-cyan disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function CircuitSettings(props: Props) {
  const overSafe = props.qubits > SAFE_V1_SIM_MAX_QUBITS;
  return (
    <section>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[.18em] text-lab-faint">Circuit settings</h2>
      <div className="space-y-2">
        <NumberField label="Qubits" value={props.qubits} min={COMPOSER_MIN_QUBITS} max={COMPOSER_MAX_QUBITS} onChange={props.onQubitsChange} />
        <NumberField label="Classical bits" value={props.clbits} min={0} max={COMPOSER_MAX_CLBITS} onChange={props.onClbitsChange} />
        <NumberField label="Time steps" value={props.columns} min={COMPOSER_MIN_COLUMNS} max={COMPOSER_MAX_COLUMNS} onChange={props.onColumnsChange} />
        <label className="block rounded-lg border border-lab-border bg-lab-raised/40 px-3 py-2 text-xs text-lab-muted">
          Shots
          <select
            value={props.shots}
            onChange={(e) => props.onShotsChange(Number(e.target.value))}
            className="mt-1 w-full rounded bg-lab-bg py-1 font-mono font-semibold text-lab-text ring-1 ring-lab-border outline-none focus:ring-accent-cyan"
          >
            {SHOT_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-lab-faint">
        The composer can draw up to {COMPOSER_MAX_QUBITS} qubits, but whether a circuit can actually be simulated depends on engine feasibility.
      </p>
      {overSafe && (
        <div className="mt-2">
          <WarningCallout>
            Above {SAFE_V1_SIM_MAX_QUBITS} qubits, running here uses the multi-engine router (v2) instead of the exact V1 path. Open the <b>Simulator Lab</b> for full feasibility analysis.
          </WarningCallout>
        </div>
      )}
    </section>
  );
}
