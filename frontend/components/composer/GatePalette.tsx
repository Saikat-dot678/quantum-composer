import type { GateName } from "@/lib/types";

export interface GateDefinition {
  id: GateName;
  label: string;
  name: string;
  description: string;
  category: "Single-qubit" | "Rotations" | "Two-qubit" | "Utility";
}

export const GATE_DEFINITIONS: Record<GateName, GateDefinition> = {
  x: { id: "x", label: "X", name: "Pauli X", description: "Flips |0〉 and |1〉, analogous to a classical NOT operation.", category: "Single-qubit" },
  y: { id: "y", label: "Y", name: "Pauli Y", description: "Combines a bit flip with a phase rotation around the Y axis.", category: "Single-qubit" },
  z: { id: "z", label: "Z", name: "Pauli Z", description: "Applies a phase flip to the |1〉 component.", category: "Single-qubit" },
  h: { id: "h", label: "H", name: "Hadamard", description: "Creates or removes an equal superposition in the computational basis.", category: "Single-qubit" },
  s: { id: "s", label: "S", name: "S phase", description: "Applies a quarter-turn phase; it remains Clifford-compatible.", category: "Single-qubit" },
  t: { id: "t", label: "T", name: "T phase", description: "Applies an eighth-turn phase and makes a circuit non-Clifford.", category: "Single-qubit" },
  rx: { id: "rx", label: "RX", name: "X rotation", description: "Rotates one qubit around the Bloch-sphere X axis by θ radians.", category: "Rotations" },
  ry: { id: "ry", label: "RY", name: "Y rotation", description: "Rotates one qubit around the Bloch-sphere Y axis by θ radians.", category: "Rotations" },
  rz: { id: "rz", label: "RZ", name: "Z rotation", description: "Rotates one qubit around the Bloch-sphere Z axis by θ radians.", category: "Rotations" },
  cx: { id: "cx", label: "CX", name: "Controlled X", description: "Choose a control qubit, then a target qubit in the same time step.", category: "Two-qubit" },
  cz: { id: "cz", label: "CZ", name: "Controlled Z", description: "Applies a Z phase when both selected qubits are |1〉.", category: "Two-qubit" },
  swap: { id: "swap", label: "SWAP", name: "Swap", description: "Exchanges the quantum states of two selected qubits.", category: "Two-qubit" },
  measure: { id: "measure", label: "M", name: "Measurement", description: "Measures into the matching classical bit, or the last available bit.", category: "Utility" },
  barrier: { id: "barrier", label: "║", name: "Barrier", description: "Places a full-register scheduling barrier at the selected time step.", category: "Utility" },
};

const GROUPS: GateDefinition["category"][] = ["Single-qubit", "Rotations", "Two-qubit", "Utility"];

export function GatePalette({ selected, onSelect }: { selected: GateName; onSelect: (gate: GateName) => void }) {
  return (
    <section aria-labelledby="gate-library-heading">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="gate-library-heading" className="instrument-label">Gate library</h2>
        <span className="rounded border border-lab-border bg-lab-surface px-2 py-1 font-mono text-[10px] text-lab-faint">select → place</span>
      </div>
      <div className="space-y-4">
        {GROUPS.map((group) => (
          <div key={group}>
            <p className="mb-2 text-xs font-medium text-lab-muted">{group}</p>
            <div className="grid grid-cols-3 gap-2">
              {Object.values(GATE_DEFINITIONS).filter((gate) => gate.category === group).map((gate) => {
                const active = selected === gate.id;
                return (
                  <button
                    key={gate.id}
                    type="button"
                    aria-pressed={active}
                    aria-label={`${gate.name}. ${gate.description}`}
                    onClick={() => onSelect(gate.id)}
                    className={`min-h-10 rounded-lg border px-2 font-mono text-xs font-semibold transition-colors ${
                      active
                        ? "border-accent-cyan bg-accent-cyan/15 text-accent-cyan shadow-glow"
                        : "border-lab-border bg-lab-raised/45 text-lab-muted hover:border-accent-cyan/45 hover:text-lab-text"
                    }`}
                  >
                    {gate.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
