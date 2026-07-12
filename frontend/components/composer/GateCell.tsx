import type { CircuitOperation, GateName } from "@/lib/types";

function gateLabel(operation: CircuitOperation, qubit: number): string {
  if (operation.gate === "cx") return operation.qubits[0] === qubit ? "●" : "⊕";
  if (operation.gate === "cz") return operation.qubits[0] === qubit ? "●" : "Z";
  if (operation.gate === "swap") return "×";
  if (operation.gate === "measure") return "M";
  if (operation.gate === "barrier") return "║";
  return operation.gate.toUpperCase();
}

function operationDescription(operation: CircuitOperation, qubit: number, moment: number): string {
  const qubits = operation.qubits.map((value) => `q${value}`).join(" and ");
  const angle = typeof operation.params.theta === "number" ? ` at ${operation.params.theta.toFixed(4)} radians` : "";
  const role = operation.qubits.length === 2 ? (operation.qubits[0] === qubit ? ", first qubit" : ", second qubit") : "";
  return `${operation.gate.toUpperCase()} on ${qubits}${role}${angle}, time step ${moment}. Activate to remove.`;
}

export function GateCell({
  operation,
  connector,
  qubit,
  moment,
  selectedGate,
  pending,
  onClick,
  tabIndex = 0,
  onFocusCell,
  cellRef,
}: {
  operation?: CircuitOperation;
  connector?: CircuitOperation;
  qubit: number;
  moment: number;
  selectedGate: GateName;
  pending: boolean;
  onClick: () => void;
  /** Roving-tabindex value assigned by the grid (0 for the active cell, -1 otherwise). */
  tabIndex?: number;
  onFocusCell?: () => void;
  cellRef?: (element: HTMLButtonElement | null) => void;
}) {
  const min = connector ? Math.min(...connector.qubits) : -1;
  const max = connector ? Math.max(...connector.qubits) : -1;
  const label = operation
    ? operationDescription(operation, qubit, moment)
    : pending
      ? `First qubit q${qubit} selected for ${selectedGate.toUpperCase()} at time step ${moment}. Activate again to cancel.`
      : `Place ${selectedGate.toUpperCase()} on q${qubit} at time step ${moment}`;

  return (
    <button
      type="button"
      ref={cellRef}
      onClick={onClick}
      onFocus={onFocusCell}
      tabIndex={tabIndex}
      aria-label={label}
      aria-pressed={pending || undefined}
      className={`group relative flex h-12 w-14 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent-cyan/[.045] ${pending ? "bg-accent-cyan/10 ring-2 ring-inset ring-accent-cyan" : ""}`}
    >
      <span className="absolute left-0 right-0 top-1/2 h-px bg-lab-borderStrong" aria-hidden="true" />
      {connector && qubit >= min && qubit <= max && (
        <span
          aria-hidden="true"
          className={`absolute left-1/2 z-0 w-px bg-accent-cyan ${qubit === min ? "bottom-0 top-1/2" : qubit === max ? "bottom-1/2 top-0" : "inset-y-0"}`}
        />
      )}
      {operation ? (
        <span
          aria-hidden="true"
          className={`relative z-10 flex h-9 min-w-9 items-center justify-center rounded-md border px-1 font-mono text-xs font-bold shadow-sm ${
            operation.gate === "barrier"
              ? "border-dashed border-lab-borderStrong bg-lab-raised text-lab-faint"
              : operation.gate === "measure"
                ? "border-accent-green/60 bg-accent-green/10 text-accent-green"
                : "border-accent-cyan/60 bg-[#0b1d25] text-accent-cyan"
          }`}
        >
          {gateLabel(operation, qubit)}
        </span>
      ) : (
        <span aria-hidden="true" className={`relative z-10 h-2 w-2 rounded-full border border-accent-cyan/50 bg-lab-panel transition-opacity ${pending ? "opacity-100" : "opacity-0 group-hover:opacity-70"}`} />
      )}
    </button>
  );
}
