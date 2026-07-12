// Client-side *instant* feasibility estimation, so the UI can react while the
// user edits without a backend round-trip. It mirrors the backend rules
// (backend/analysis/*): Clifford gate set, 16·2^n / 16·4^n memory in log space,
// and the safe/heavy/dangerous/infeasible bands against a reference budget.
//
// The backend estimator remains authoritative: this module only powers live
// telemetry and never gates or replaces a real /circuit/analyze call.
import { LIMITS } from "./constants";
import { getSimulationPath, type SimulationPath } from "./circuitRouting";
import type { CircuitData } from "./types";
import type { ResourceRisk } from "./labTypes";

const CLIFFORD_GATES = new Set(["x", "y", "z", "h", "s", "cx", "cz", "swap"]);
const STRUCTURAL_GATES = new Set(["measure", "barrier"]);
const ROTATION_GATES = new Set(["rx", "ry", "rz"]);
const ANGLE_TOLERANCE = 1e-9;
const LOG2_MB = 20;
const UNITS = ["bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"] as const;

export interface LocalFeasibility {
  numQubits: number;
  isClifford: boolean;
  tCount: number;
  rotationCount: number;
  twoQubitCount: number;
  measurementCount: number;
  operationCount: number;
  statevectorLog2Bytes: number;
  densityMatrixLog2Bytes: number;
  statevectorHuman: string;
  densityMatrixHuman: string;
  /** Statevector risk against the default 1,024 MB reference budget. */
  risk: ResourceRisk;
  /** Headline matching the backend's feasibility vocabulary. */
  headline: "clifford_scalable" | "exact_feasible" | "exact_borderline" | "approximation_or_hardware";
  route: SimulationPath;
}

function rotationIsClifford(theta: number): boolean {
  const ratio = theta / (Math.PI / 2);
  return Math.abs(ratio - Math.round(ratio)) < ANGLE_TOLERANCE;
}

export function humanBytesFromLog2(log2Bytes: number): string {
  if (log2Bytes < 100) {
    let value = 2 ** log2Bytes;
    let index = 0;
    while (value >= 1024 && index < UNITS.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value.toFixed(value >= 100 ? 0 : 2)} ${UNITS[index]}`;
  }
  // Beyond friendly units: scientific notation via log10, safe at any scale.
  const log10 = log2Bytes * Math.LOG10E * Math.LN2;
  const exponent = Math.floor(log10);
  const mantissa = 10 ** (log10 - exponent);
  return `${mantissa.toFixed(2)}e+${exponent} bytes`;
}

export function riskFromLog2Bytes(log2Bytes: number, budgetMb = LIMITS.simulation.defaultMemoryBudgetMb): ResourceRisk {
  const diff = log2Bytes - (Math.log2(Math.max(budgetMb, 1)) + LOG2_MB);
  if (diff <= -2) return "safe";
  if (diff <= 0) return "heavy";
  if (diff <= 3) return "dangerous";
  return "infeasible";
}

export function analyzeLocally(circuit: CircuitData): LocalFeasibility {
  let tCount = 0;
  let rotationCount = 0;
  let twoQubitCount = 0;
  let measurementCount = 0;
  let nonClifford = false;

  for (const operation of circuit.operations) {
    const gate = operation.gate;
    if (gate === "t") {
      tCount += 1;
      nonClifford = true;
    } else if (ROTATION_GATES.has(gate)) {
      rotationCount += 1;
      const theta = typeof operation.params.theta === "number" ? operation.params.theta : 0;
      if (!rotationIsClifford(theta)) nonClifford = true;
    } else if (!CLIFFORD_GATES.has(gate) && !STRUCTURAL_GATES.has(gate)) {
      nonClifford = true;
    }
    if (operation.qubits.length === 2) twoQubitCount += 1;
    if (gate === "measure") measurementCount += 1;
  }

  const statevectorLog2Bytes = 4 + circuit.num_qubits;
  const densityMatrixLog2Bytes = 4 + 2 * circuit.num_qubits;
  const risk = riskFromLog2Bytes(statevectorLog2Bytes);
  const isClifford = !nonClifford;

  const headline = isClifford
    ? "clifford_scalable"
    : risk === "safe"
      ? "exact_feasible"
      : risk === "heavy"
        ? "exact_feasible"
        : risk === "dangerous"
          ? "exact_borderline"
          : "approximation_or_hardware";

  return {
    numQubits: circuit.num_qubits,
    isClifford,
    tCount,
    rotationCount,
    twoQubitCount,
    measurementCount,
    operationCount: circuit.operations.length,
    statevectorLog2Bytes,
    densityMatrixLog2Bytes,
    statevectorHuman: humanBytesFromLog2(statevectorLog2Bytes),
    densityMatrixHuman: humanBytesFromLog2(densityMatrixLog2Bytes),
    risk,
    headline,
    route: getSimulationPath(circuit),
  };
}
