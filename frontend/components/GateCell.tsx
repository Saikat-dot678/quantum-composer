import type { CircuitOperation, GateName } from "@/lib/types";

interface Props {
  operation?: CircuitOperation;
  connector?: CircuitOperation;
  qubit: number;
  selectedGate: GateName;
  pending: boolean;
  onClick: () => void;
}

function gateLabel(op: CircuitOperation, qubit: number) {
  if (op.gate === "cx") return op.qubits[0] === qubit ? "●" : "⊕";
  if (op.gate === "cz") return op.qubits[0] === qubit ? "●" : "Z";
  if (op.gate === "swap") return "×";
  if (op.gate === "measure") return "M";
  if (op.gate === "barrier") return "║";
  return op.gate.toUpperCase();
}

export function GateCell({ operation, connector, qubit, selectedGate, pending, onClick }: Props) {
  const min = connector ? Math.min(...connector.qubits) : -1;
  const max = connector ? Math.max(...connector.qubits) : -1;
  return (
    <button
      type="button"
      onClick={onClick}
      title={operation ? `Remove ${operation.gate.toUpperCase()}` : `Place ${selectedGate.toUpperCase()} on q${qubit}`}
      className={`relative flex h-12 w-14 shrink-0 items-center justify-center ${pending ? "rounded-lg bg-accent-cyan/10 ring-2 ring-accent-cyan" : ""}`}
    >
      <span className="absolute left-0 right-0 top-1/2 h-px bg-lab-borderStrong" />
      {connector && qubit >= min && qubit <= max && (
        <span className={`absolute left-1/2 z-0 w-px bg-accent-cyan ${qubit === min ? "bottom-0 top-1/2" : qubit === max ? "bottom-1/2 top-0" : "inset-y-0"}`} />
      )}
      {operation && (
        <span
          className={`relative z-10 flex h-9 min-w-9 items-center justify-center rounded-lg border px-1 text-xs font-bold shadow-sm ${
            operation.gate === "barrier"
              ? "border-dashed border-lab-borderStrong bg-lab-raised text-lab-faint"
              : operation.gate === "measure"
                ? "border-accent-green/60 bg-accent-green/10 text-accent-green"
                : "border-accent-cyan/60 bg-accent-cyan/10 text-accent-cyan"
          }`}
        >
          {gateLabel(operation, qubit)}
        </span>
      )}
      {!operation && !pending && (
        <span className="relative z-10 h-2 w-2 rounded-full bg-accent-cyan opacity-0 ring-1 ring-accent-cyan/40 transition hover:opacity-60" />
      )}
    </button>
  );
}
