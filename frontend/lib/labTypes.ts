// Types for the Simulator Lab (multi-engine) and Cryptography Lab APIs.
import type { CircuitData } from "./types";

export type EngineId =
  | "auto"
  | "aer_statevector"
  | "aer_mps"
  | "aer_stabilizer"
  | "aer_density_matrix"
  | "stim_stabilizer";

export interface EngineInfo {
  id: EngineId;
  name: string;
  description: string;
  available: boolean;
  scales_to_large_structured_circuits: boolean;
  optional_dependency: string | null;
  best_for: string;
  limitations: string;
  unavailable_reason: string | null;
}

export interface EnginesResponse {
  engines: EngineInfo[];
  stim_available: boolean;
  aer_available: boolean;
  honesty_note: string;
}

export type ResourceRisk = "safe" | "heavy" | "dangerous" | "infeasible";

export type CircuitFeasibilityStatus =
  | "clifford_scalable"
  | "exact_feasible"
  | "exact_borderline"
  | "approximation_or_hardware";

export interface ResourceEstimate {
  num_qubits: number;
  max_memory_mb: number;
  statevector_memory_bytes: number | null;
  statevector_memory_mb: number | null;
  statevector_memory_human: string;
  density_matrix_memory_bytes: number | null;
  density_matrix_memory_mb: number | null;
  density_matrix_memory_human: string;
  statevector_log2_bytes: number;
  density_matrix_log2_bytes: number;
  risk_label: ResourceRisk;
  feasibility_status: ResourceRisk;
  notes: string[];
}

export interface CircuitAnalysis {
  num_qubits: number;
  num_clbits: number;
  operation_count: number;
  depth: number;
  gate_counts: Record<string, number>;
  two_qubit_gate_count: number;
  measurement_count: number;
  is_clifford: boolean;
  contains_non_clifford: boolean;
  non_clifford_reasons: string[];
  t_count: number;
  rotation_count: number;
  estimated_statevector_memory_bytes: number | null;
  estimated_statevector_memory_mb: number | null;
  estimated_statevector_memory_human: string;
  estimated_density_matrix_memory_bytes: number | null;
  estimated_density_matrix_memory_mb: number | null;
  estimated_density_matrix_memory_human: string;
  statevector_risk: ResourceRisk;
  density_matrix_risk: ResourceRisk;
  recommended_engines: string[];
  warnings: string[];
  feasibility_status: CircuitFeasibilityStatus;
  resource_estimate: ResourceEstimate;
}

export interface SimulationOptions {
  engine: EngineId;
  shots: number;
  noise_enabled: boolean;
  noise_model_type: string;
  max_memory_mb: number;
  allow_approximation: boolean;
  mps_max_bond_dimension: number | null;
  mps_truncation_threshold: number | null;
  seed: number | null;
}

export interface SimulationV2Response {
  counts: Record<string, number>;
  depth: number;
  gate_counts: Record<string, number>;
  selected_engine: string;
  engine_reason: string;
  warnings: string[];
  resource_estimate: ResourceEstimate;
  timing_ms: number;
  diagram: string | null;
  metadata: Record<string, unknown>;
}

// --- Large structured circuits -------------------------------------------
//
// Large teaching circuits are never hand-drawn or eagerly materialized: they are
// described by a compact descriptor and generated on demand. This keeps the
// browser responsive (no giant module-load work, no giant DOM) and keeps the
// backend contract explicit — descriptors must stay inside the V2 schema
// ceilings (see LIMITS.largeCircuit).

export type LargeCircuitFamily =
  | "small_universal"
  | "ghz"
  | "clifford_random"
  | "low_entanglement_chain"
  | "high_entanglement_rejection_demo"
  | "non_clifford_rejection_demo"
  | "bb84_protocol"
  | "e91_protocol";

export interface LargeCircuitDescriptor {
  id: string;
  name: string;
  family: LargeCircuitFamily;
  numQubits: number;
  depth?: number;
  operationsEstimate: number;
  recommendedEngine: EngineId | "protocol";
  explanation: string;
}

/** A circuit either comes from the visual editor or from a generated descriptor. */
export type CircuitSource =
  | { kind: "visual"; circuit: CircuitData }
  | { kind: "generated"; descriptor: LargeCircuitDescriptor };

// Large-circuit teaching preset: descriptor metadata + lazy generator.
export interface LabPreset {
  id: string;
  name: string;
  description: string;
  teaches: string;
  descriptor: LargeCircuitDescriptor;
  /** Generates the concrete circuit JSON on demand; cached after the first call. */
  build: () => CircuitData;
  suggestedEngine: EngineId;
  allowApproximation?: boolean;
  expectRejection?: boolean;
}

// --- Cryptography lab response contracts ---

export interface PrivacyAmplificationResult {
  input_length: number;
  output_length: number;
  compression_ratio: number;
  final_key: number[];
  estimated_leaked_fraction: number;
  explanation: string;
}

export interface BB84Result {
  num_bits: number;
  eve_enabled: boolean;
  eve_strategy: "intercept_resend" | null;
  channel_error_rate: number;
  alice_bits: number[];
  alice_bases: string[];
  bob_bases: string[];
  bob_measurements: number[];
  eve_bases: string[];
  sifted_key_alice: number[];
  sifted_key_bob: number[];
  sifted_key_length: number;
  sift_positions: number[];
  qber: number;
  eve_detected: boolean;
  final_key_length: number;
  privacy_amplification: PrivacyAmplificationResult;
  explanation: string;
  charts_data: {
    basis_match_count: number;
    basis_mismatch_count: number;
    sifted_error_count: number;
    qber: number;
    qber_threshold: number;
    sifted_key_bit_counts: Record<string, number>;
    error_positions: number[];
  };
}

export interface E91Result {
  num_pairs: number;
  eve_enabled: boolean;
  channel_error_rate: number;
  alice_angles_deg: number[];
  bob_angles_deg: number[];
  alice_choices: number[];
  bob_choices: number[];
  correlations: Record<string, number>;
  chsh_s: number;
  chsh_violation: boolean;
  qber: number;
  sifted_key_alice: number[];
  sifted_key_bob: number[];
  sifted_key_length: number;
  explanation: string;
  charts_data: {
    chsh_s: number;
    chsh_classical_bound: number;
    chsh_quantum_bound: number;
    qber: number;
    sifted_key_length: number;
    correlations: Record<string, number>;
  };
}

export interface B92Result {
  num_bits: number;
  channel_error_rate: number;
  alice_bits: number[];
  alice_states: string[];
  bob_bases: string[];
  bob_measurements: number[];
  conclusive_flags: boolean[];
  conclusive_count: number;
  inconclusive_count: number;
  sifted_key_alice: number[];
  sifted_key_bob: number[];
  sifted_key_length: number;
  qber: number;
  explanation: string;
  charts_data: {
    conclusive_count: number;
    inconclusive_count: number;
    sifted_error_count: number;
    qber: number;
    sifted_key_bit_counts: Record<string, number>;
  };
}

export interface QRNGResult {
  num_bits: number;
  method: string;
  generated_bits: number[];
  bit_string: string;
  zero_count: number;
  one_count: number;
  frequency_0: number;
  frequency_1: number;
  explanation: string;
  charts_data: {
    zero_count: number;
    one_count: number;
    frequency_0: number;
    frequency_1: number;
    deviation_sigma: number;
  };
}
