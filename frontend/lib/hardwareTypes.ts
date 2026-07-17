import type { CircuitData } from "./types";
import type { CircuitDiagramPayload } from "./circuitDiagram";

export type HardwareSourceKind = "fake" | "generic" | "manual" | "ibm";

export interface ManualEdge {
  control: number;
  target: number;
  two_qubit_error?: number | null;
  gate_duration_ns?: number | null;
}

export interface ManualQubitProperties {
  readout_error?: number | null;
  t1_us?: number | null;
  t2_us?: number | null;
}

export interface ManualCoordinate { x: number; y: number }

export interface ManualHardwareDefinition {
  format?: "quantum-composer-hardware";
  version?: 1;
  name: string;
  num_qubits: number;
  edges: ManualEdge[];
  undirected: boolean;
  basis_gates: string[];
  coordinates?: ManualCoordinate[] | null;
  qubit_properties?: ManualQubitProperties[] | null;
  measurement_duration_ns?: number | null;
  default_gate_duration_ns?: number | null;
  calibration_timestamp?: string | null;
  notes?: string | null;
}

export type HardwareTargetSource =
  | { kind: "fake"; name: string }
  | { kind: "generic"; topology: "line" | "ring" | "grid" | "full"; num_qubits: number; seed: number; noise: boolean }
  | { kind: "manual"; definition: ManualHardwareDefinition }
  | { kind: "ibm"; name: string };

export type HardwareCircuitSource =
  | { kind: "json"; circuit: CircuitData }
  | { kind: "qasm2" | "qasm3"; text: string };

export interface BackendSummary {
  source: HardwareSourceKind;
  name: string;
  num_qubits: number;
  basis_gates: string[];
  simulator: boolean;
  operational: boolean | null;
  pending_jobs: number | null;
  processor_family: string | null;
  processor_version: string | null;
  region: string | null;
  dynamic_circuits: boolean | null;
  calibration_timestamp: string | null;
  description: string | null;
}

export interface QubitCalibration {
  qubit: number;
  t1_us: number | null;
  t2_us: number | null;
  readout_error: number | null;
  frequency_ghz: number | null;
}

export interface EdgeCalibration {
  control: number;
  target: number;
  gate: string | null;
  error: number | null;
  duration_ns: number | null;
}

export interface BackendDetail {
  summary: BackendSummary;
  coupling_edges: number[][];
  coordinates: number[][] | null;
  coordinates_schematic: boolean;
  qubit_calibrations: QubitCalibration[];
  edge_calibrations: EdgeCalibration[];
  supported_instructions: string[];
  dt_ns: number | null;
  notes: string | null;
  warnings: string[];
}

export interface BackendListResponse {
  backends: BackendSummary[];
  source: string;
  warnings: string[];
}

export interface ConnectionStatus {
  ibm_runtime_installed: boolean;
  ibm_runtime_version: string | null;
  fake_provider_available: boolean;
  qasm3_import_available: boolean;
  connection_mode: "none" | "environment" | "saved_account" | "session";
  connected: boolean;
  instance_hint: string | null;
  account_error: string | null;
  execution_enabled: false;
  credential_storage_note: string;
}

export interface CircuitMetrics {
  num_qubits: number;
  depth: number;
  size: number;
  one_qubit_gates: number;
  two_qubit_gates: number;
  measurements: number;
  swap_count: number;
  gate_counts: Record<string, number>;
  used_edges: number[][];
}

export interface TranspiledLayout {
  initial: number[] | null;
  final: number[] | null;
  active_physical_qubits: number[];
  idle_physical_qubits_count: number;
}

export interface RoutingSwap {
  sequence: number;
  physical_a: number;
  physical_b: number;
  explanation: string;
}

export interface HeuristicErrorEstimate {
  success_probability: number | null;
  formula: string;
  assumptions: string;
  gate_error_terms: number;
  readout_error_terms: number;
  missing_calibration_terms: number;
}

export interface TranspileOptions {
  optimization_level: 0 | 1 | 2 | 3;
  seed: number | null;
  initial_layout: number[] | null;
  layout_method: "trivial" | "dense" | "sabre" | null;
  routing_method: "basic" | "lookahead" | "sabre" | null;
}

export interface TranspileResponse {
  target_name: string;
  target_source: HardwareSourceKind;
  original: CircuitMetrics;
  transpiled: CircuitMetrics;
  layout: TranspiledLayout;
  basis_gates: string[];
  optimization_level: number;
  seed: number | null;
  transpile_time_ms: number;
  estimated_duration_us: number | null;
  heuristic_error: HeuristicErrorEstimate | null;
  routing_swaps: RoutingSwap[];
  original_diagram: string | null;
  transpiled_diagram: string | null;
  original_circuit_diagram: CircuitDiagramPayload | null;
  transpiled_circuit_diagram: CircuitDiagramPayload | null;
  warnings: string[];
}

export interface CompareEntry {
  target_name: string;
  target_source: HardwareSourceKind;
  ok: boolean;
  error: string | null;
  num_qubits: number | null;
  transpiled_depth: number | null;
  two_qubit_gates: number | null;
  swap_count: number | null;
  active_qubits: number | null;
  estimated_duration_us: number | null;
  heuristic_success_probability: number | null;
  calibration_timestamp: string | null;
  avg_active_readout_error: number | null;
  avg_used_edge_error: number | null;
  pending_jobs: number | null;
  warnings: string[];
}

export interface CompareResponse {
  entries: CompareEntry[];
  recommendation: string | null;
  recommendation_reason: string | null;
  recommendation_caveat: string;
}

export interface ImportCircuitResponse {
  ok: boolean;
  normalized: Record<string, unknown> | null;
  metrics: CircuitMetrics | null;
  diagram: string | null;
  circuit_diagram: CircuitDiagramPayload | null;
  error: string | null;
  warnings: string[];
}
