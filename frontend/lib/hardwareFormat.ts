import type {
  BackendDetail,
  HardwareTargetSource,
  ManualHardwareDefinition,
  TranspiledLayout,
} from "./hardwareTypes";

export interface TopologyPoint { qubit: number; x: number; y: number }

export const DEFAULT_MANUAL_HARDWARE: ManualHardwareDefinition = {
  format: "quantum-composer-hardware",
  version: 1,
  name: "Five-qubit teaching line",
  num_qubits: 5,
  edges: [0, 1, 2, 3].map((control) => ({
    control,
    target: control + 1,
    two_qubit_error: 0.015 + control * 0.003,
    gate_duration_ns: 320 + control * 10,
  })),
  undirected: true,
  basis_gates: ["rz", "sx", "x", "cx"],
  qubit_properties: Array.from({ length: 5 }, (_, qubit) => ({
    readout_error: 0.01 + qubit * 0.002,
    t1_us: 100 - qubit * 3,
    t2_us: 80 - qubit * 2,
  })),
  calibration_timestamp: null,
  notes: "Editable teaching target. Values are illustrative, not a real device calibration.",
};

export function targetKey(target: HardwareTargetSource): string {
  if (target.kind === "manual") return `manual:${target.definition.name}`;
  if (target.kind === "generic") return `generic:${target.topology}:${target.num_qubits}:${target.seed}`;
  return `${target.kind}:${target.name}`;
}

export function topologyPoints(detail: BackendDetail, width = 760, height = 430): TopologyPoint[] {
  const count = detail.summary.num_qubits;
  if (detail.coordinates && detail.coordinates.length === count) {
    const xs = detail.coordinates.map((point) => point[0]);
    const ys = detail.coordinates.map((point) => point[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return detail.coordinates.map((point, qubit) => ({
      qubit,
      x: 42 + ((point[0] - minX) / (maxX - minX || 1)) * (width - 84),
      y: 42 + ((point[1] - minY) / (maxY - minY || 1)) * (height - 84),
    }));
  }

  if (count <= 20) {
    const radius = Math.min(width, height) * 0.34;
    return Array.from({ length: count }, (_, qubit) => {
      const angle = -Math.PI / 2 + (qubit / Math.max(1, count)) * Math.PI * 2;
      return { qubit, x: width / 2 + Math.cos(angle) * radius, y: height / 2 + Math.sin(angle) * radius };
    });
  }
  const columns = Math.ceil(Math.sqrt(count * (width / height)));
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, qubit) => ({
    qubit,
    x: 36 + (qubit % columns) * ((width - 72) / Math.max(1, columns - 1)),
    y: 36 + Math.floor(qubit / columns) * ((height - 72) / Math.max(1, rows - 1)),
  }));
}

export function logicalMappingRows(layout: TranspiledLayout): Array<{ logical: number; initial: number | null; final: number | null }> {
  const count = Math.max(layout.initial?.length ?? 0, layout.final?.length ?? 0);
  return Array.from({ length: count }, (_, logical) => ({
    logical,
    initial: layout.initial?.[logical] ?? null,
    final: layout.final?.[logical] ?? null,
  }));
}

export function formatPercent(value: number | null, digits = 2): string {
  return value === null ? "—" : `${(value * 100).toFixed(digits)}%`;
}

export function formatAge(timestamp: string | null, now = Date.now()): string {
  if (!timestamp) return "not supplied";
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) return "invalid timestamp";
  const hours = Math.max(0, (now - time) / 3_600_000);
  if (hours < 1) return `${Math.round(hours * 60)} min old`;
  if (hours < 48) return `${hours.toFixed(1)} h old`;
  return `${(hours / 24).toFixed(1)} d old`;
}

export function exportManualHardware(definition: ManualHardwareDefinition): string {
  return JSON.stringify({ ...definition, format: "quantum-composer-hardware", version: 1 }, null, 2);
}

export function parseManualHardware(text: string): ManualHardwareDefinition {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Manual hardware JSON must be an object.");
  const value = parsed as Partial<ManualHardwareDefinition>;
  if (value.format && value.format !== "quantum-composer-hardware") throw new Error("Unsupported manual hardware format.");
  if (value.version && value.version !== 1) throw new Error("Unsupported manual hardware version.");
  if (typeof value.name !== "string" || !value.name.trim()) throw new Error("A device name is required.");
  if (!Number.isInteger(value.num_qubits) || (value.num_qubits ?? 0) < 1 || (value.num_qubits ?? 0) > 512) throw new Error("num_qubits must be an integer from 1 to 512.");
  if (!Array.isArray(value.edges)) throw new Error("edges must be an array.");
  if (!Array.isArray(value.basis_gates) || value.basis_gates.length === 0) throw new Error("basis_gates must be a non-empty array.");
  return { ...(value as ManualHardwareDefinition), format: "quantum-composer-hardware", version: 1 };
}
