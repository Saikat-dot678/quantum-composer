// The single placement-validation system shared by every way an operation can
// land on the circuit: initial click/drag-from-dock placement, drag
// repositioning, multi-qubit endpoint placement, and keyboard movement. One
// function decides "is this a legal place for this operation" so those five
// interactions can never silently disagree with each other.
import type { CircuitData, CircuitOperation } from "./types";

export interface PlacementTarget {
  qubits: number[];
  clbits: number[];
  moment: number;
}

export interface PlacementCheck {
  ok: boolean;
  reason?: string;
}

export interface PlacementOptions {
  /** The operation being moved — excluded from conflict checks against itself. */
  excludeOperation?: CircuitOperation | null;
  /** Timeline width; omit to skip the upper bound (e.g. checking before columns grow). */
  columns?: number;
}

/**
 * Is `target` a legal place for an operation on `circuit`? Checks register
 * bounds, timeline bounds, internal qubit/clbit duplication, and occupancy
 * conflicts with every *other* existing operation. Never mutates anything —
 * callers decide what to do with a rejection (toast, red outline, etc).
 */
export function checkPlacement(circuit: CircuitData, target: PlacementTarget, options: PlacementOptions = {}): PlacementCheck {
  const { qubits, clbits, moment } = target;

  if (!Number.isInteger(moment) || moment < 0) return { ok: false, reason: "Time step must be a non-negative whole step." };
  if (options.columns !== undefined && moment >= options.columns) return { ok: false, reason: "Time step is outside the circuit's timeline." };
  if (qubits.length === 0) return { ok: false, reason: "An operation needs at least one qubit." };
  if (qubits.some((q) => !Number.isInteger(q) || q < 0 || q >= circuit.num_qubits)) return { ok: false, reason: "Target qubit is outside the register." };
  if (clbits.some((c) => !Number.isInteger(c) || c < 0 || c >= circuit.num_clbits)) return { ok: false, reason: "Target classical bit is outside the register." };
  if (new Set(qubits).size !== qubits.length) return { ok: false, reason: "An operation cannot target the same qubit twice." };

  const conflict = circuit.operations.find((op) => {
    if (options.excludeOperation && op === options.excludeOperation) return false;
    if (op.moment !== moment) return false;
    return op.qubits.some((q) => qubits.includes(q));
  });
  if (conflict) {
    const sharedQubit = conflict.qubits.find((q) => qubits.includes(q));
    return { ok: false, reason: `q${sharedQubit} at time ${moment} is already occupied by ${conflict.gate.toUpperCase()}.` };
  }

  return { ok: true };
}

/**
 * Shift every qubit in `qubits` by the same offset, derived from moving the
 * operation's anchor (first) qubit to `newAnchorQubit`. This is what keeps a
 * CX's control->target *gap* intact while it's dragged to a new row, instead
 * of collapsing both endpoints onto the same qubit.
 */
export function shiftQubits(qubits: number[], newAnchorQubit: number): number[] {
  const offset = newAnchorQubit - qubits[0];
  return qubits.map((q) => q + offset);
}

/** Bounding qubit range an operation's drag preview needs to render (control through target, inclusive). */
export function qubitSpan(qubits: number[]): { min: number; max: number } {
  return { min: Math.min(...qubits), max: Math.max(...qubits) };
}

/** True if moving this operation to `qubits` would carry it out of the register bounds. */
export function withinRegister(qubits: number[], numQubits: number): boolean {
  return qubits.every((q) => q >= 0 && q < numQubits);
}
