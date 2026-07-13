// Pure engine-compatibility data model, shared by the Simulator Lab's engine
// strip and scaling chart. Moved out of the old SimulationMethodGuide (now
// replaced by EngineStrip + EngineScalingChart) so both visual surfaces read
// from one honest source of verdicts instead of duplicating the logic.
import { LIMITS } from "./constants";
import { formatEngineName, formatInteger } from "./formatting";
import { engineIsAvailable, preferredStabilizerEngine, resourceRiskForBudget } from "@/components/simulator/simulatorModel";
import type { CircuitAnalysis, EngineId, EnginesResponse, ResourceRisk } from "./labTypes";

export type LaneId = "statevector" | "stabilizer" | "mps" | "density" | "hardware";
export type LaneState = "fit" | "caution" | "blocked" | "external" | "pending";

export interface EngineLane {
  id: LaneId;
  name: string;
  shortName: string;
  engine: EngineId | null;
  scaling: string;
  memory: string;
  ideal: string;
  limitation: string;
  state: LaneState;
  verdict: string;
  reason: string;
  available: boolean | null;
  recommended: boolean;
  selected: boolean;
}

function recommended(analysis: CircuitAnalysis, ...ids: string[]): boolean {
  return ids.some((id) => analysis.recommended_engines.includes(id));
}

function riskVerdict(risk: ResourceRisk): { state: LaneState; verdict: string } {
  if (risk === "safe") return { state: "fit", verdict: "comfortable" };
  if (risk === "heavy") return { state: "caution", verdict: "memory heavy" };
  return { state: "blocked", verdict: risk === "dangerous" ? "over budget" : "infeasible" };
}

export function buildLanes({
  analysis,
  engines,
  selectedEngine,
  maxMemoryMb,
  noiseEnabled,
  allowApproximation,
}: {
  analysis: CircuitAnalysis | null;
  engines: EnginesResponse | null;
  selectedEngine: EngineId;
  maxMemoryMb: number;
  noiseEnabled: boolean;
  allowApproximation: boolean;
}): EngineLane[] {
  const stabilizerEngine = preferredStabilizerEngine(engines);
  const selectedStabilizer = selectedEngine === "aer_stabilizer" || selectedEngine === "stim_stabilizer";

  if (!analysis) {
    const pending = (id: LaneId, name: string, shortName: string, engine: EngineId | null, scaling: string, ideal: string, limitation: string): EngineLane => ({
      id,
      name,
      shortName,
      engine,
      scaling,
      memory: "Awaiting circuit analysis",
      ideal,
      limitation,
      state: engine ? "pending" : "external",
      verdict: engine ? "pending" : "not connected",
      reason: "Compatibility appears when the backend has classified the active circuit.",
      available: engine ? engineIsAvailable(engine, engines, null) : null,
      recommended: false,
      selected: engine ? (id === "stabilizer" ? selectedStabilizer : selectedEngine === engine) : false,
    });
    return [
      pending("statevector", "Statevector", "SV", "aer_statevector", "16 × 2ⁿ bytes", "Small arbitrary circuits and exact amplitudes.", "Exponential memory; hard-capped at 30 qubits."),
      pending("stabilizer", "Stabilizer", "ST", stabilizerEngine, "Polynomial tableau", "Large Clifford-only circuits.", "Rejects T gates and non-Clifford rotations."),
      pending("mps", "Matrix product state", "MPS", "aer_mps", "Depends on bond dimension χ", "Wide circuits whose entanglement remains low.", "Bond dimension can grow exponentially; truncation may approximate."),
      pending("density", "Density matrix", "DM", "aer_density_matrix", "16 × 4ⁿ bytes", "Small noisy or mixed-state workloads.", "More expensive than statevector; hard-capped at 15 qubits."),
      pending("hardware", "Real quantum hardware", "QPU", null, "Physical qubits + samples", "Work beyond useful classical representations.", "No provider, credentials, topology, queue, or job route is configured here."),
    ];
  }

  const statevectorRisk = resourceRiskForBudget(4 + analysis.num_qubits, maxMemoryMb);
  const densityRisk = resourceRiskForBudget(4 + 2 * analysis.num_qubits, maxMemoryMb);
  let statevectorFit = riskVerdict(statevectorRisk);
  let statevectorReason = `A full state needs ${analysis.estimated_statevector_memory_human} against the selected ${formatInteger(maxMemoryMb)} MB budget.`;
  if (analysis.num_qubits > LIMITS.simulation.statevectorHardCapQubits) {
    statevectorFit = { state: "blocked", verdict: "hard-cap rejection" };
    statevectorReason = `${analysis.num_qubits} qubits exceed this application's ${LIMITS.simulation.statevectorHardCapQubits}-qubit exact-engine cap; the full state needs ${analysis.estimated_statevector_memory_human}.`;
  } else if (noiseEnabled) {
    statevectorFit = { state: "blocked", verdict: "noise mismatch" };
    statevectorReason = "The current run requests noise. This backend models noise with density-matrix simulation; selecting statevector turns noise off.";
  }

  let densityFit = riskVerdict(densityRisk);
  let densityReason = `${analysis.estimated_density_matrix_memory_human} against the selected ${formatInteger(maxMemoryMb)} MB budget${noiseEnabled ? "; this is the applicable noisy method" : "; enable noise only when mixed-state modeling is needed"}.`;
  if (analysis.num_qubits > LIMITS.simulation.densityMatrixHardCapQubits) {
    densityFit = { state: "blocked", verdict: "hard-cap rejection" };
    densityReason = `${analysis.num_qubits} qubits exceed the ${LIMITS.simulation.densityMatrixHardCapQubits}-qubit density-matrix cap; 16 × 4ⁿ bytes grows too quickly.`;
  }

  const stabilizerBlocked = !analysis.is_clifford || noiseEnabled;
  const stabilizerAvailable = engineIsAvailable(stabilizerEngine, engines, analysis);
  const stabilizerReason = noiseEnabled
    ? "The current depolarizing-noise option is implemented only by density matrix; selecting stabilizer turns noise off."
    : analysis.is_clifford
      ? `All ${formatInteger(analysis.operation_count)} operations are Clifford-compatible. ${formatEngineName(stabilizerEngine)} can track a polynomial-size stabilizer tableau exactly.`
      : `Non-Clifford evidence (T-count ${analysis.t_count}, rotations ${analysis.rotation_count}) breaks this formalism.`;

  let mpsState: LaneState = "caution";
  let mpsVerdict = "structure dependent";
  let mpsReason = "Static analysis cannot prove low entanglement. Accuracy and cost depend on bond growth across the circuit.";
  if (noiseEnabled) {
    mpsState = "blocked";
    mpsVerdict = "noise mismatch";
    mpsReason = "This backend's MPS path does not implement the selected depolarizing-noise model; selecting MPS turns noise off.";
  } else if (analysis.is_clifford) {
    mpsState = "fit";
    mpsVerdict = "compatible, unnecessary";
    mpsReason = "MPS can represent this workload, but an exact stabilizer engine is a stronger fit for Clifford structure.";
  } else if (statevectorRisk === "safe") {
    mpsState = "fit";
    mpsVerdict = "compatible, unnecessary";
    mpsReason = "Exact statevector already fits comfortably. MPS adds entanglement-dependent complexity without a scaling need.";
  } else if (!allowApproximation && selectedEngine === "auto") {
    mpsVerdict = "opt-in required";
    mpsReason = "Auto will not choose MPS until approximation is explicitly allowed. Directly selecting this lane acknowledges the trade-off.";
  } else if (allowApproximation || selectedEngine === "aer_mps") {
    mpsVerdict = "approximation enabled";
    mpsReason = "The router may use MPS, but no static verdict guarantees a manageable bond dimension or an error bound.";
  }

  const hardwareRecommended = analysis.feasibility_status === "approximation_or_hardware" && !analysis.is_clifford;

  return [
    {
      id: "statevector",
      name: "Statevector",
      shortName: "SV",
      engine: "aer_statevector",
      scaling: "16 × 2ⁿ bytes",
      memory: analysis.estimated_statevector_memory_human,
      ideal: "Small arbitrary circuits; exact amplitudes and phase-rich inspection.",
      limitation: `Exponential storage and a ${LIMITS.simulation.statevectorHardCapQubits}-qubit application cap.`,
      ...statevectorFit,
      reason: statevectorReason,
      available: engineIsAvailable("aer_statevector", engines, analysis),
      recommended: recommended(analysis, "aer_statevector"),
      selected: selectedEngine === "aer_statevector",
    },
    {
      id: "stabilizer",
      name: "Stabilizer",
      shortName: "ST",
      engine: stabilizerEngine,
      scaling: "Polynomial tableau",
      memory: analysis.is_clifford ? "No 2ⁿ amplitude allocation" : "Formalism does not apply",
      ideal: "Large Clifford circuits: H, S, Pauli, CX/CZ/SWAP, measurement.",
      limitation: "Not universal; any T or non-Clifford rotation is a hard rejection.",
      state: stabilizerBlocked ? "blocked" : "fit",
      verdict: stabilizerBlocked ? (noiseEnabled ? "noise mismatch" : "incompatible") : "exact structural fit",
      reason: stabilizerReason,
      available: stabilizerAvailable,
      recommended: recommended(analysis, "aer_stabilizer", "stim_stabilizer"),
      selected: selectedStabilizer,
    },
    {
      id: "mps",
      name: "Matrix product state",
      shortName: "MPS",
      engine: "aer_mps",
      scaling: "O(n · χ²–χ³)",
      memory: "Controlled by bond dimension χ",
      ideal: "Wide, shallow, local, or otherwise low-entanglement workloads.",
      limitation: "χ may grow exponentially; caps or truncation can change the answer.",
      state: mpsState,
      verdict: mpsVerdict,
      reason: mpsReason,
      available: engineIsAvailable("aer_mps", engines, analysis),
      recommended: recommended(analysis, "aer_mps"),
      selected: selectedEngine === "aer_mps",
    },
    {
      id: "density",
      name: "Density matrix",
      shortName: "DM",
      engine: "aer_density_matrix",
      scaling: "16 × 4ⁿ bytes",
      memory: analysis.estimated_density_matrix_memory_human,
      ideal: "Small noisy circuits and mixed-state sampling.",
      limitation: `Quadratic state storage and a ${LIMITS.simulation.densityMatrixHardCapQubits}-qubit application cap.`,
      ...densityFit,
      reason: densityReason,
      available: engineIsAvailable("aer_density_matrix", engines, analysis),
      recommended: recommended(analysis, "aer_density_matrix") || noiseEnabled,
      selected: selectedEngine === "aer_density_matrix",
    },
    {
      id: "hardware",
      name: "Real quantum hardware",
      shortName: "QPU",
      engine: null,
      scaling: "Physical qubits + repeated shots",
      memory: "Returns samples, not a classical 2ⁿ statevector",
      ideal: "Experiments that fit an actual device's qubits, topology, fidelity, and runtime limits.",
      limitation: "External account, transpilation, queueing, calibration, error mitigation, and finite-shot noise all apply.",
      state: "external",
      verdict: hardwareRecommended ? "external candidate" : "not needed for this run",
      reason: hardwareRecommended
        ? "Classical exact methods do not fit this circuit. Hardware is a separate execution target, not a faster simulator, and this repository has no provider route configured."
        : "A classical method can handle this workload. Hardware would produce noisy samples and is not connected to this application.",
      available: null,
      recommended: hardwareRecommended,
      selected: false,
    },
  ];
}
