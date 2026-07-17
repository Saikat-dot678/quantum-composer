"""Pydantic models for the Hardware Mapping API.

Kept separate from the main ``schemas.py`` on purpose: these models are
hardware-workspace-specific, and the main file already carries the whole
V1/V2 simulation contract. Complex values never appear here; every field
is plain JSON. Credential material never appears in ANY response model --
the connect endpoint accepts a token and returns only a redacted status.
"""

from __future__ import annotations

from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from visualization.schemas import CircuitDiagramPayload

# ---------------------------------------------------------------------------
# Limits (request-validation ceilings, not performance promises)
# ---------------------------------------------------------------------------

MAX_MANUAL_QUBITS = 512
MAX_MANUAL_EDGES = 4096
MAX_QASM_CHARS = 200_000
MAX_TRANSPILE_QUBITS = 512
MAX_TRANSPILE_OPERATIONS = 20_000
MAX_COMPARE_TARGETS = 6

SUPPORTED_MANUAL_BASIS_GATES = (
    # 1q
    "id", "x", "y", "z", "h", "s", "sdg", "t", "tdg", "sx", "sxdg", "rx", "ry", "rz", "p", "u",
    # 2q
    "cx", "cz", "cy", "ch", "swap", "iswap", "ecr", "rzz", "rxx", "ryy", "rzx", "cp", "crx", "cry", "crz",
    # non-gate instructions
    "measure", "reset", "delay",
)


# ---------------------------------------------------------------------------
# Target sources
# ---------------------------------------------------------------------------


class ManualEdge(BaseModel):
    """One coupling edge of a user-defined device."""

    model_config = ConfigDict(extra="forbid")

    control: int = Field(ge=0, lt=MAX_MANUAL_QUBITS)
    target: int = Field(ge=0, lt=MAX_MANUAL_QUBITS)
    # Optional calibration-style properties; all finite-checked.
    two_qubit_error: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    gate_duration_ns: Optional[float] = Field(default=None, ge=0.0, le=1e9)


class ManualQubitProperties(BaseModel):
    model_config = ConfigDict(extra="forbid")

    readout_error: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    t1_us: Optional[float] = Field(default=None, ge=0.0, le=1e9)
    t2_us: Optional[float] = Field(default=None, ge=0.0, le=1e9)


class ManualCoordinate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: float = Field(ge=-1e6, le=1e6)
    y: float = Field(ge=-1e6, le=1e6)


class ManualHardwareDefinition(BaseModel):
    """Declarative, validated JSON schema for a user-defined hardware target.

    Importable/exportable as a standalone file: {"format":
    "quantum-composer-hardware", "version": 1, ...fields below}. The format
    and version fields are accepted and ignored on input so an exported file
    round-trips unchanged.
    """

    model_config = ConfigDict(extra="forbid")

    format: Optional[str] = Field(default=None, max_length=64)
    version: Optional[int] = Field(default=None, ge=1, le=1)
    name: str = Field(min_length=1, max_length=80)
    num_qubits: int = Field(ge=1, le=MAX_MANUAL_QUBITS)
    # Directed coupling: an edge (a, b) allows a 2q gate with control a,
    # target b. Set `undirected` true to mirror every edge automatically.
    edges: list[ManualEdge] = Field(max_length=MAX_MANUAL_EDGES)
    undirected: bool = True
    basis_gates: list[str] = Field(default_factory=lambda: ["rz", "sx", "x", "cx"], max_length=32)
    coordinates: Optional[list[ManualCoordinate]] = None
    qubit_properties: Optional[list[ManualQubitProperties]] = None
    measurement_duration_ns: Optional[float] = Field(default=None, ge=0.0, le=1e9)
    default_gate_duration_ns: Optional[float] = Field(default=None, ge=0.0, le=1e9)
    calibration_timestamp: Optional[str] = Field(default=None, max_length=64)
    notes: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("basis_gates")
    @classmethod
    def _check_basis(cls, value: list[str]) -> list[str]:
        unknown = [gate for gate in value if gate not in SUPPORTED_MANUAL_BASIS_GATES]
        if unknown:
            raise ValueError(
                f"Unsupported basis gate(s): {', '.join(sorted(set(unknown)))}. "
                f"Supported: {', '.join(SUPPORTED_MANUAL_BASIS_GATES)}."
            )
        if not any(gate in value for gate in ("cx", "cz", "cy", "ch", "swap", "iswap", "ecr", "rzz", "rxx", "ryy", "rzx", "cp", "crx", "cry", "crz")):
            raise ValueError("At least one two-qubit basis gate is required (e.g. cx or cz).")
        if len(value) != len(set(value)):
            raise ValueError("basis_gates cannot contain duplicates.")
        return value

    @model_validator(mode="after")
    def _validate_shape(self) -> "ManualHardwareDefinition":
        if self.format not in (None, "quantum-composer-hardware"):
            raise ValueError("format must be 'quantum-composer-hardware' when provided.")
        if self.coordinates is not None and len(self.coordinates) != self.num_qubits:
            raise ValueError(
                f"coordinates has {len(self.coordinates)} entries but num_qubits is {self.num_qubits}."
            )
        if self.qubit_properties is not None and len(self.qubit_properties) != self.num_qubits:
            raise ValueError(
                f"qubit_properties has {len(self.qubit_properties)} entries but num_qubits is {self.num_qubits}."
            )
        seen: set[tuple[int, int]] = set()
        for edge in self.edges:
            pair = (edge.control, edge.target)
            if edge.control >= self.num_qubits or edge.target >= self.num_qubits:
                raise ValueError(
                    f"edge {pair} references a qubit outside 0..{self.num_qubits - 1}."
                )
            if edge.control == edge.target:
                raise ValueError(f"edge {pair} connects a qubit to itself.")
            if pair in seen:
                raise ValueError(f"duplicate edge {pair}.")
            seen.add(pair)
        if self.num_qubits > 1 and not self.edges:
            raise ValueError("a multi-qubit device needs at least one coupling edge.")
        return self


class FakeTargetSource(BaseModel):
    kind: Literal["fake"]
    name: str = Field(min_length=1, max_length=80)


class GenericTargetSource(BaseModel):
    """Synthetic topology built with qiskit's GenericBackendV2."""

    kind: Literal["generic"]
    topology: Literal["line", "ring", "grid", "full"]
    num_qubits: int = Field(ge=2, le=MAX_MANUAL_QUBITS)
    seed: int = Field(default=42, ge=0, le=2**31 - 1)
    noise: bool = True


class ManualTargetSource(BaseModel):
    kind: Literal["manual"]
    definition: ManualHardwareDefinition


class IBMTargetSource(BaseModel):
    kind: Literal["ibm"]
    name: str = Field(min_length=1, max_length=80)


TargetSource = Union[FakeTargetSource, GenericTargetSource, ManualTargetSource, IBMTargetSource]


# ---------------------------------------------------------------------------
# Circuit sources
# ---------------------------------------------------------------------------


class JsonCircuitSource(BaseModel):
    """The app's own declarative circuit schema (already resolved: no
    "custom" ops -- the frontend flattens custom gates exactly as it does
    for every simulation call)."""

    kind: Literal["json"]
    circuit: dict[str, Any]


class QasmCircuitSource(BaseModel):
    kind: Literal["qasm2", "qasm3"]
    text: str = Field(min_length=1, max_length=MAX_QASM_CHARS)


CircuitSource = Union[JsonCircuitSource, QasmCircuitSource]


# ---------------------------------------------------------------------------
# Requests
# ---------------------------------------------------------------------------


class DescribeTargetRequest(BaseModel):
    target: TargetSource = Field(discriminator="kind")


class TranspileOptions(BaseModel):
    optimization_level: int = Field(default=1, ge=0, le=3)
    seed: Optional[int] = Field(default=None, ge=0, le=2**31 - 1)
    # Explicit initial layout: logical qubit i -> physical qubit layout[i].
    initial_layout: Optional[list[int]] = Field(default=None, max_length=MAX_TRANSPILE_QUBITS)
    layout_method: Optional[Literal["trivial", "dense", "sabre"]] = None
    routing_method: Optional[Literal["basic", "lookahead", "sabre"]] = None


class TranspileRequest(BaseModel):
    circuit: CircuitSource = Field(discriminator="kind")
    target: TargetSource = Field(discriminator="kind")
    options: TranspileOptions = Field(default_factory=TranspileOptions)


class CompareRequest(BaseModel):
    circuit: CircuitSource = Field(discriminator="kind")
    targets: list[TargetSource] = Field(min_length=1, max_length=MAX_COMPARE_TARGETS)
    options: TranspileOptions = Field(default_factory=TranspileOptions)


class ImportCircuitRequest(BaseModel):
    source: CircuitSource = Field(discriminator="kind")


class ConnectRequest(BaseModel):
    """Session-only IBM credential entry. The token is used to initialize the
    runtime service server-side, held in process memory only, and never
    returned, logged, or persisted anywhere."""

    token: str = Field(min_length=8, max_length=512)
    instance: Optional[str] = Field(default=None, max_length=256)
    channel: Literal["ibm_quantum_platform", "ibm_cloud"] = "ibm_quantum_platform"


# ---------------------------------------------------------------------------
# Responses (normalized, provider-agnostic)
# ---------------------------------------------------------------------------


class QubitCalibration(BaseModel):
    qubit: int
    t1_us: Optional[float] = None
    t2_us: Optional[float] = None
    readout_error: Optional[float] = None
    frequency_ghz: Optional[float] = None


class EdgeCalibration(BaseModel):
    control: int
    target: int
    gate: Optional[str] = None
    error: Optional[float] = None
    duration_ns: Optional[float] = None


class BackendSummary(BaseModel):
    source: Literal["fake", "generic", "manual", "ibm"]
    name: str
    num_qubits: int
    basis_gates: list[str]
    simulator: bool
    operational: Optional[bool] = None
    pending_jobs: Optional[int] = None
    processor_family: Optional[str] = None
    processor_version: Optional[str] = None
    region: Optional[str] = None
    dynamic_circuits: Optional[bool] = None
    calibration_timestamp: Optional[str] = None
    description: Optional[str] = None


class BackendDetail(BaseModel):
    summary: BackendSummary
    # Directed physical edges as [control, target] pairs.
    coupling_edges: list[list[int]]
    coordinates: Optional[list[list[float]]] = None
    coordinates_schematic: bool = True
    qubit_calibrations: list[QubitCalibration]
    edge_calibrations: list[EdgeCalibration]
    supported_instructions: list[str]
    dt_ns: Optional[float] = None
    notes: Optional[str] = None
    warnings: list[str] = Field(default_factory=list)


class BackendListResponse(BaseModel):
    backends: list[BackendSummary]
    source: str
    warnings: list[str] = Field(default_factory=list)


class CircuitMetrics(BaseModel):
    num_qubits: int
    depth: int
    size: int
    one_qubit_gates: int
    two_qubit_gates: int
    measurements: int
    swap_count: int = 0
    gate_counts: dict[str, int]
    # Logical (original) or physical (transpiled) 2q connectivity actually used.
    used_edges: list[list[int]] = Field(default_factory=list)


class HeuristicErrorEstimate(BaseModel):
    """Product-of-fidelities heuristic. Explicitly NOT a certified fidelity:
    assumes every gate/readout error is independent and Markovian, ignores
    crosstalk, idling decoherence, and correlated noise. Shown with its
    formula so users can judge it."""

    success_probability: Optional[float] = None
    formula: str = "prod(1 - gate_error_i) * prod(1 - readout_error_q)"
    assumptions: str = (
        "Treats every gate and readout error as independent; ignores crosstalk, "
        "idle decoherence, and correlated noise. A rough ranking heuristic, not a "
        "certified fidelity."
    )
    gate_error_terms: int = 0
    readout_error_terms: int = 0
    missing_calibration_terms: int = 0


class TranspiledLayout(BaseModel):
    initial: Optional[list[int]] = None
    final: Optional[list[int]] = None
    active_physical_qubits: list[int] = Field(default_factory=list)
    idle_physical_qubits_count: int = 0


class RoutingSwap(BaseModel):
    sequence: int
    physical_a: int
    physical_b: int
    explanation: str = (
        "Inserted by the routing pass so a later two-qubit operation can use an edge supported by the target."
    )


class TranspileResponse(BaseModel):
    target_name: str
    target_source: str
    original: CircuitMetrics
    transpiled: CircuitMetrics
    layout: TranspiledLayout
    basis_gates: list[str]
    optimization_level: int
    seed: Optional[int]
    transpile_time_ms: float
    estimated_duration_us: Optional[float] = None
    heuristic_error: Optional[HeuristicErrorEstimate] = None
    routing_swaps: list[RoutingSwap] = Field(default_factory=list)
    original_diagram: Optional[str] = None
    transpiled_diagram: Optional[str] = None
    original_circuit_diagram: Optional[CircuitDiagramPayload] = None
    transpiled_circuit_diagram: Optional[CircuitDiagramPayload] = None
    warnings: list[str] = Field(default_factory=list)


class CompareEntry(BaseModel):
    target_name: str
    target_source: str
    ok: bool
    error: Optional[str] = None
    num_qubits: Optional[int] = None
    transpiled_depth: Optional[int] = None
    two_qubit_gates: Optional[int] = None
    swap_count: Optional[int] = None
    active_qubits: Optional[int] = None
    estimated_duration_us: Optional[float] = None
    heuristic_success_probability: Optional[float] = None
    calibration_timestamp: Optional[str] = None
    avg_active_readout_error: Optional[float] = None
    avg_used_edge_error: Optional[float] = None
    pending_jobs: Optional[int] = None
    warnings: list[str] = Field(default_factory=list)


class CompareResponse(BaseModel):
    entries: list[CompareEntry]
    recommendation: Optional[str] = None
    recommendation_reason: Optional[str] = None
    recommendation_caveat: str = (
        "This recommendation ranks candidates by the transparent metrics above "
        "(SWAP overhead, depth, heuristic error product). It is not a certified "
        "prediction; queue length alone never decides it, and stale calibration "
        "data can change the real ordering."
    )


class ImportCircuitResponse(BaseModel):
    ok: bool
    normalized: Optional[dict[str, Any]] = None
    metrics: Optional[CircuitMetrics] = None
    diagram: Optional[str] = None
    circuit_diagram: Optional[CircuitDiagramPayload] = None
    error: Optional[str] = None
    warnings: list[str] = Field(default_factory=list)


class ConnectionStatus(BaseModel):
    ibm_runtime_installed: bool
    ibm_runtime_version: Optional[str] = None
    fake_provider_available: bool
    qasm3_import_available: bool
    connection_mode: Literal["none", "environment", "saved_account", "session"]
    connected: bool
    # Redacted hints only -- never the credential itself.
    instance_hint: Optional[str] = None
    account_error: Optional[str] = None
    execution_enabled: bool = False
    credential_storage_note: str = (
        "Credentials stay in the FastAPI process. Session credentials are never persisted and are cleared on disconnect."
    )
