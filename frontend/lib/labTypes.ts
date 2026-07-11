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

export interface ResourceEstimate {
  num_qubits: number;
  max_memory_mb: number;
  statevector_memory_mb: number | null;
  statevector_memory_human: string;
  density_matrix_memory_mb: number | null;
  density_matrix_memory_human: string;
  risk_label: string;
  feasibility_status: string;
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
  estimated_statevector_memory_mb: number | null;
  estimated_statevector_memory_human: string;
  estimated_density_matrix_memory_mb: number | null;
  estimated_density_matrix_memory_human: string;
  statevector_risk: string;
  density_matrix_risk: string;
  recommended_engines: string[];
  warnings: string[];
  feasibility_status: string;
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

// Large-circuit teaching preset descriptor.
export interface LabPreset {
  id: string;
  name: string;
  description: string;
  teaches: string;
  circuit: CircuitData;
  suggestedEngine: EngineId;
  allowApproximation?: boolean;
  expectRejection?: boolean;
}

// --- Cryptography lab (loose shapes; only fields we render are typed) ---

export interface BB84Result {
  num_bits: number;
  eve_enabled: boolean;
  channel_error_rate: number;
  alice_bits: number[];
  alice_bases: string[];
  bob_bases: string[];
  bob_measurements: number[];
  eve_bases: string[];
  sifted_key_alice: number[];
  sifted_key_bob: number[];
  sifted_key_length: number;
  qber: number;
  eve_detected: boolean;
  final_key_length: number;
  explanation: string;
  charts_data: {
    basis_match_count: number;
    basis_mismatch_count: number;
    sifted_error_count: number;
    qber: number;
    qber_threshold: number;
    sifted_key_bit_counts: Record<string, number>;
  };
}

export interface E91Result {
  num_pairs: number;
  eve_enabled: boolean;
  chsh_s: number;
  chsh_violation: boolean;
  qber: number;
  sifted_key_length: number;
  correlations: Record<string, number>;
  explanation: string;
  charts_data: {
    chsh_s: number;
    chsh_classical_bound: number;
    chsh_quantum_bound: number;
    qber: number;
  };
}

export interface B92Result {
  num_bits: number;
  conclusive_count: number;
  inconclusive_count: number;
  sifted_key_length: number;
  qber: number;
  explanation: string;
  charts_data: {
    conclusive_count: number;
    inconclusive_count: number;
    sifted_key_bit_counts: Record<string, number>;
  };
}

export interface QRNGResult {
  num_bits: number;
  method: string;
  bit_string: string;
  zero_count: number;
  one_count: number;
  frequency_0: number;
  frequency_1: number;
  explanation: string;
}
