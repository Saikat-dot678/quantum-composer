import type { GateName } from "@/lib/types";

const groups: { label: string; gates: { id: GateName; label: string }[] }[] = [
  { label: "Single qubit", gates: ["x", "y", "z", "h", "s", "t"].map((id) => ({ id: id as GateName, label: id.toUpperCase() })) },
  { label: "Rotations", gates: ["rx", "ry", "rz"].map((id) => ({ id: id as GateName, label: `${id.toUpperCase()}(θ)` })) },
  { label: "Multi-qubit", gates: [{ id: "cx" as GateName, label: "CX" }, { id: "cz" as GateName, label: "CZ" }, { id: "swap" as GateName, label: "SWAP" }] },
  { label: "Circuit", gates: [{ id: "measure" as GateName, label: "Measure" }, { id: "barrier" as GateName, label: "Barrier" }] },
];

interface Props {
  selected: GateName;
  theta: number;
  onSelect: (gate: GateName) => void;
  onThetaChange: (theta: number) => void;
}

export function GatePalette({ selected, theta, onSelect, onThetaChange }: Props) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[.18em] text-lab-faint">Gate library</h2>
        <span className="rounded-full border border-accent-cyan/30 bg-accent-cyan/10 px-2 py-0.5 text-[10px] font-semibold text-accent-cyan">click to place</span>
      </div>
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 text-[11px] font-medium text-lab-faint">{group.label}</p>
            <div className="grid grid-cols-3 gap-2">
              {group.gates.map((gate) => (
                <button
                  key={gate.id}
                  type="button"
                  onClick={() => onSelect(gate.id)}
                  aria-pressed={selected === gate.id}
                  className={`min-h-10 rounded-lg border px-2 text-xs font-semibold transition ${
                    selected === gate.id
                      ? "border-accent-cyan bg-accent-cyan/15 text-accent-cyan shadow-glow"
                      : "border-lab-border bg-lab-raised/40 text-lab-muted hover:border-accent-cyan/40 hover:text-lab-text"
                  }`}
                >
                  {gate.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <label className="mt-4 block rounded-lg border border-lab-border bg-lab-raised/40 p-3 text-xs text-lab-muted">
        Rotation θ · radians
        <input
          type="number"
          step="0.1"
          value={theta}
          onChange={(event) => onThetaChange(Number(event.target.value))}
          className="mt-2 w-full rounded-md bg-lab-bg px-3 py-2 font-mono text-lab-text ring-1 ring-lab-border outline-none focus:ring-accent-cyan"
        />
      </label>
    </section>
  );
}
