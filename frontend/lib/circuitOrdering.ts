import type { CircuitData, CircuitOperation } from "./types";

/** Numeric visual moment order with stable input position as the tie-breaker. */
export function canonicalOperationOrder<T extends Pick<CircuitOperation, "moment">>(operations: readonly T[]): T[] {
  return [...operations].sort((left, right) => left.moment - right.moment);
}

/** Return a shallow circuit copy with a new canonical operations array. */
export function canonicalizeCircuit<T extends CircuitData>(circuit: T): T {
  return { ...circuit, operations: canonicalOperationOrder(circuit.operations) };
}
