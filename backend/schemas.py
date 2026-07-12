from __future__ import annotations

import math
from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


GateName = Literal[
    "x",
    "y",
    "z",
    "h",
    "s",
    "t",
    "rx",
    "ry",
    "rz",
    "cx",
    "cz",
    "swap",
    "measure",
    "barrier",
]


class CircuitOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    gate: GateName
    qubits: list[int] = Field(default_factory=list)
    clbits: list[int] = Field(default_factory=list)
    params: dict[str, Any] = Field(default_factory=dict)
    # Visual time-step order. Small for the v1 composer; large structured
    # circuits (deep Clifford/MPS presets) legitimately use many time steps, so
    # the cap is generous. It only affects operation ordering, never resources.
    moment: int | None = Field(default=None, ge=0, le=1_000_000)

    @field_validator("qubits", "clbits")
    @classmethod
    def indices_must_be_non_negative(cls, value: list[int]) -> list[int]:
        if any(index < 0 for index in value):
            raise ValueError("bit indices must be non-negative")
        if len(set(value)) != len(value):
            raise ValueError("bit indices within an operation must be unique")
        return value

    @model_validator(mode="after")
    def validate_gate_shape(self) -> "CircuitOperation":
        single_qubit = {"x", "y", "z", "h", "s", "t"}
        rotations = {"rx", "ry", "rz"}
        two_qubit = {"cx", "cz", "swap"}

        if self.gate in single_qubit:
            self._expect_shape(1, 0)
            self._expect_no_params()
        elif self.gate in rotations:
            self._expect_shape(1, 0)
            if set(self.params) != {"theta"}:
                raise ValueError(f"{self.gate} requires exactly one 'theta' parameter")
            theta = self.params["theta"]
            if isinstance(theta, bool) or not isinstance(theta, (int, float)):
                raise ValueError("theta must be a number in radians")
            if not math.isfinite(float(theta)):
                raise ValueError("theta must be finite")
        elif self.gate in two_qubit:
            self._expect_shape(2, 0)
            self._expect_no_params()
        elif self.gate == "measure":
            self._expect_shape(1, 1)
            self._expect_no_params()
        elif self.gate == "barrier":
            if not self.qubits:
                raise ValueError("barrier requires at least one qubit")
            if self.clbits:
                raise ValueError("barrier does not accept classical bits")
            self._expect_no_params()
        return self

    def _expect_shape(self, qubits: int, clbits: int) -> None:
        if len(self.qubits) != qubits or len(self.clbits) != clbits:
            raise ValueError(
                f"{self.gate} requires {qubits} qubit(s) and {clbits} classical bit(s)"
            )
        if self.gate in {"cx", "cz", "swap"} and self.qubits[0] == self.qubits[1]:
            raise ValueError(f"{self.gate} requires two different qubits")

    def _expect_no_params(self) -> None:
        if self.params:
            raise ValueError(f"{self.gate} does not accept parameters")


class CircuitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    num_qubits: int = Field(ge=1, le=8)
    num_clbits: int = Field(ge=0, le=8)
    shots: int = Field(default=1024, ge=1, le=8192)
    operations: list[CircuitOperation] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def validate_bit_ranges(self) -> "CircuitRequest":
        for position, operation in enumerate(self.operations):
            for qubit in operation.qubits:
                if qubit >= self.num_qubits:
                    raise ValueError(
                        f"operation {position}: qubit {qubit} is outside 0..{self.num_qubits - 1}"
                    )
            for clbit in operation.clbits:
                if clbit >= self.num_clbits:
                    upper = self.num_clbits - 1
                    raise ValueError(
                        f"operation {position}: classical bit {clbit} is outside 0..{upper}"
                    )
        return self


class ValidationResponse(BaseModel):
    valid: bool
    message: str
    operation_count: int


class CodeResponse(BaseModel):
    code: str


class QasmResponse(BaseModel):
    qasm: str


class SimulationResponse(BaseModel):
    counts: dict[str, int]
    depth: int
    gate_counts: dict[str, int]
    diagram: str
    warnings: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# V2: multi-engine simulation + analysis
# ---------------------------------------------------------------------------
#
# The v1 CircuitRequest deliberately caps qubits at 8 for the visual composer.
# The advanced endpoints support larger *structured* circuits (Clifford /
# low-entanglement), so they use a request type with relaxed container limits.
# Per-operation validation (gate shapes, angles) is identical -- CircuitOperation
# is reused unchanged -- and feasibility is gated by the resource estimator and
# engine router, not by an arbitrary qubit cap.


class SimulationEngine(str, Enum):
    AUTO = "auto"
    AER_STATEVECTOR = "aer_statevector"
    AER_MPS = "aer_mps"
    AER_STABILIZER = "aer_stabilizer"
    AER_DENSITY_MATRIX = "aer_density_matrix"
    STIM_STABILIZER = "stim_stabilizer"


class SimulationOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    engine: SimulationEngine = SimulationEngine.AUTO
    shots: int = Field(default=1024, ge=1, le=1_000_000)
    noise_enabled: bool = False
    noise_model_type: Literal["depolarizing", "light", "heavy"] = "depolarizing"
    # Memory budget the router/estimator use to judge feasibility. Capped at 64 GB
    # so a stray large value cannot invite an out-of-memory statevector attempt;
    # engines also enforce absolute hard qubit caps for exact methods.
    max_memory_mb: int = Field(default=1024, ge=16, le=65_536)
    allow_approximation: bool = False
    mps_max_bond_dimension: Optional[int] = Field(default=None, ge=1, le=100_000)
    mps_truncation_threshold: Optional[float] = Field(default=None, gt=0.0, le=1.0)
    seed: Optional[int] = Field(default=None, ge=0, le=2**63 - 1)


class AdvancedCircuitRequest(BaseModel):
    """Circuit request with relaxed container limits for structured circuits."""

    model_config = ConfigDict(extra="forbid")

    num_qubits: int = Field(ge=1, le=4096)
    num_clbits: int = Field(ge=0, le=4096)
    shots: int = Field(default=1024, ge=1, le=1_000_000)
    operations: list[CircuitOperation] = Field(default_factory=list, max_length=200_000)

    @model_validator(mode="after")
    def validate_bit_ranges(self) -> "AdvancedCircuitRequest":
        for position, operation in enumerate(self.operations):
            for qubit in operation.qubits:
                if qubit >= self.num_qubits:
                    raise ValueError(
                        f"operation {position}: qubit {qubit} is outside "
                        f"0..{self.num_qubits - 1}"
                    )
            for clbit in operation.clbits:
                if clbit >= self.num_clbits:
                    upper = self.num_clbits - 1
                    raise ValueError(
                        f"operation {position}: classical bit {clbit} is outside "
                        f"0..{upper}"
                    )
        return self


class SimulateV2Request(BaseModel):
    model_config = ConfigDict(extra="forbid")

    circuit: AdvancedCircuitRequest
    options: SimulationOptions = Field(default_factory=SimulationOptions)


class EngineInfo(BaseModel):
    id: str
    name: str
    description: str
    available: bool
    scales_to_large_structured_circuits: bool
    optional_dependency: Optional[str] = None
    best_for: str
    limitations: str
    unavailable_reason: Optional[str] = None


class EnginesResponse(BaseModel):
    engines: list[EngineInfo]
    stim_available: bool
    aer_available: bool
    honesty_note: str


class CircuitAnalysisResponse(BaseModel):
    num_qubits: int
    num_clbits: int
    operation_count: int
    depth: int
    gate_counts: dict[str, int]
    two_qubit_gate_count: int
    measurement_count: int
    is_clifford: bool
    contains_non_clifford: bool
    non_clifford_reasons: list[str]
    t_count: int
    rotation_count: int
    estimated_statevector_memory_bytes: Optional[float]
    estimated_statevector_memory_mb: Optional[float]
    estimated_statevector_memory_human: str
    estimated_density_matrix_memory_bytes: Optional[float]
    estimated_density_matrix_memory_mb: Optional[float]
    estimated_density_matrix_memory_human: str
    statevector_risk: str
    density_matrix_risk: str
    recommended_engines: list[str]
    warnings: list[str]
    feasibility_status: str
    resource_estimate: dict[str, Any]


class SimulationV2Response(BaseModel):
    counts: dict[str, int]
    depth: int
    gate_counts: dict[str, int]
    selected_engine: str
    engine_reason: str
    warnings: list[str] = Field(default_factory=list)
    resource_estimate: dict[str, Any]
    timing_ms: float
    diagram: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Cryptography lab requests
# ---------------------------------------------------------------------------


class BB84Request(BaseModel):
    model_config = ConfigDict(extra="forbid")

    num_bits: int = Field(default=128, ge=1, le=4096)
    eve_enabled: bool = False
    eve_strategy: Literal["intercept_resend"] = "intercept_resend"
    channel_error_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    seed: Optional[int] = Field(default=None, ge=0, le=2**63 - 1)


class E91Request(BaseModel):
    model_config = ConfigDict(extra="forbid")

    num_pairs: int = Field(default=128, ge=1, le=4096)
    eve_enabled: bool = False
    channel_error_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    seed: Optional[int] = Field(default=None, ge=0, le=2**63 - 1)


class B92Request(BaseModel):
    model_config = ConfigDict(extra="forbid")

    num_bits: int = Field(default=128, ge=1, le=4096)
    channel_error_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    seed: Optional[int] = Field(default=None, ge=0, le=2**63 - 1)


class QRNGRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    num_bits: int = Field(default=128, ge=1, le=8192)
    method: Literal["hadamard_measurement"] = "hadamard_measurement"
    seed: Optional[int] = Field(default=None, ge=0, le=2**63 - 1)
