import { LIMITS } from "./constants";
import type { CircuitData } from "./types";

export interface SimulationPath {
  id: "v1" | "v2";
  label: string;
  reason: string;
}

const V1 = LIMITS.simulation;

export function getSimulationPath(circuit: CircuitData): SimulationPath {
  const reasons: string[] = [];
  if (circuit.num_qubits > V1.safeV1MaxQubits) reasons.push(`${circuit.num_qubits} qubits`);
  if (circuit.num_clbits > V1.safeV1MaxClbits) reasons.push(`${circuit.num_clbits} classical bits`);
  if (circuit.operations.length > V1.safeV1MaxOperations) reasons.push(`${circuit.operations.length} operations`);
  if (circuit.shots > V1.safeV1MaxShots) reasons.push(`${circuit.shots} shots`);

  if (reasons.length) {
    return {
      id: "v2",
      label: "V2 multi-engine router",
      reason: `${reasons.join(", ")} exceed the guarded V1 request envelope.`,
    };
  }
  return {
    id: "v1",
    label: "V1 exact path",
    reason: `Within the ${V1.safeV1MaxQubits}-qubit, ${V1.safeV1MaxClbits}-classical-bit, ${V1.safeV1MaxOperations}-operation, ${V1.safeV1MaxShots}-shot V1 envelope.`,
  };
}
