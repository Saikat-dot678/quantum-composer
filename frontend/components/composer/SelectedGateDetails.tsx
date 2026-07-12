import { NumberInput } from "@/components/ui/primitives";
import { ROTATION_GATES, type GateName } from "@/lib/types";
import { GATE_DEFINITIONS } from "./GatePalette";

export function SelectedGateDetails({ gate, theta, onThetaChange }: { gate: GateName; theta: number; onThetaChange: (value: number) => void }) {
  const definition = GATE_DEFINITIONS[gate];
  const isRotation = ROTATION_GATES.includes(gate);
  return (
    <section className="mt-5 border-t border-lab-border pt-5" aria-labelledby="selected-gate-heading">
      <p className="instrument-label">Selected operation</p>
      <div className="mt-2 flex items-start gap-3">
        <span className="grid h-10 min-w-10 place-items-center rounded-lg border border-accent-cyan/45 bg-accent-cyan/10 px-2 font-mono text-xs font-bold text-accent-cyan">{definition.label}</span>
        <div className="min-w-0">
          <h3 id="selected-gate-heading" className="text-sm font-semibold text-lab-text">{definition.name}</h3>
          <p id="selected-gate-description" className="mt-1 text-xs leading-5 text-lab-muted">{definition.description}</p>
        </div>
      </div>
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
    </section>
  );
}
