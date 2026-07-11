from __future__ import annotations

import math
from typing import Any, Literal

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
    moment: int | None = Field(default=None, ge=0, le=199)

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
