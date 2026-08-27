"""Central operation registry for the declarative circuit schema.

The registry is deliberately data-only: request validation, Qiskit circuit
construction, code generation, structural analysis, and optional Stim routing
all consume the same metadata.  Adding a built-in operation should require one
entry here plus focused tests, not another set of unrelated conditionals.

Qubit operands use the Qiskit convention throughout the project.  For a
controlled operation the controls come first and targets follow; for variadic
``mcx``/``mcp`` operations every qubit except the final one is a control.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


OperationKind = Literal["unitary", "measurement", "reset", "barrier", "matrix"]
ApplicationKind = Literal["direct", "measure", "reset", "barrier", "mcx", "mcp", "unitary"]
CliffordRule = Literal["always", "never", "pauli_rotation", "controlled_rotation", "mcx"]


@dataclass(frozen=True)
class ParameterSpec:
    name: str
    default: float


@dataclass(frozen=True)
class GateSpec:
    id: str
    display_name: str
    symbol: str
    category: str
    min_qubits: int
    max_qubits: int | None
    clbits: int
    parameters: tuple[ParameterSpec, ...] = ()
    operation_kind: OperationKind = "unitary"
    application: ApplicationKind = "direct"
    qiskit_method: str | None = None
    control_count: int | Literal["all_but_last"] = 0
    target_count: int | Literal["remaining"] = 1
    reversible: bool = True
    inverse: str | None = None
    clifford_rule: CliffordRule = "never"
    # Stim supports only a strict subset of the Clifford registry.  ``None``
    # means the auto router must prefer Aer stabilizer for this operation.
    stim_instruction: str | None = None

    @property
    def parameter_names(self) -> tuple[str, ...]:
        return tuple(parameter.name for parameter in self.parameters)

    @property
    def is_parameterized(self) -> bool:
        return bool(self.parameters)

    @property
    def is_unitary(self) -> bool:
        return self.operation_kind in {"unitary", "matrix"}

    def accepts_qubit_count(self, count: int) -> bool:
        return count >= self.min_qubits and (self.max_qubits is None or count <= self.max_qubits)


def _fixed(
    gate: str,
    name: str,
    symbol: str,
    category: str,
    qubits: int,
    *,
    params: tuple[ParameterSpec, ...] = (),
    method: str | None = None,
    controls: int = 0,
    targets: int = 1,
    inverse: str | None = None,
    clifford: CliffordRule = "never",
    stim: str | None = None,
) -> GateSpec:
    return GateSpec(
        id=gate,
        display_name=name,
        symbol=symbol,
        category=category,
        min_qubits=qubits,
        max_qubits=qubits,
        clbits=0,
        parameters=params,
        qiskit_method=method or gate,
        control_count=controls,
        target_count=targets,
        inverse=inverse,
        clifford_rule=clifford,
        stim_instruction=stim,
    )


THETA = (ParameterSpec("theta", 1.5707963267948966),)
U_PARAMS = (
    ParameterSpec("theta", 1.5707963267948966),
    ParameterSpec("phi", 0.0),
    ParameterSpec("lam", 3.141592653589793),
)


_SPECS = [
    # Basic and phase gates.
    _fixed("id", "Identity", "I", "Basic", 1, inverse="id", clifford="always", stim="I"),
    _fixed("x", "Pauli X", "X", "Basic", 1, inverse="x", clifford="always", stim="X"),
    _fixed("y", "Pauli Y", "Y", "Basic", 1, inverse="y", clifford="always", stim="Y"),
    _fixed("z", "Pauli Z", "Z", "Basic", 1, inverse="z", clifford="always", stim="Z"),
    _fixed("h", "Hadamard", "H", "Basic", 1, inverse="h", clifford="always", stim="H"),
    _fixed("sx", "Square-root X", "√X", "Basic", 1, inverse="sxdg", clifford="always", stim="SQRT_X"),
    _fixed("sxdg", "Inverse square-root X", "√X†", "Basic", 1, inverse="sx", clifford="always", stim="SQRT_X_DAG"),
    _fixed("s", "S phase", "S", "Phase", 1, inverse="sdg", clifford="always", stim="S"),
    _fixed("sdg", "S dagger", "S†", "Phase", 1, inverse="s", clifford="always", stim="S_DAG"),
    _fixed("t", "T phase", "T", "Phase", 1, inverse="tdg", clifford="never"),
    _fixed("tdg", "T dagger", "T†", "Phase", 1, inverse="t", clifford="never"),
    _fixed("p", "Phase", "P", "Phase", 1, params=THETA, inverse="p", clifford="pauli_rotation"),
    # Rotations and universal single-qubit gate.
    _fixed("rx", "X rotation", "RX", "Rotation", 1, params=THETA, inverse="rx", clifford="pauli_rotation"),
    _fixed("ry", "Y rotation", "RY", "Rotation", 1, params=THETA, inverse="ry", clifford="pauli_rotation"),
    _fixed("rz", "Z rotation", "RZ", "Rotation", 1, params=THETA, inverse="rz", clifford="pauli_rotation"),
    _fixed("u", "Universal U", "U", "Universal", 1, params=U_PARAMS, inverse="u", clifford="never"),
    # Controlled gates. Controls are always listed before targets.
    _fixed("cx", "Controlled X", "CX", "Controlled", 2, controls=1, inverse="cx", clifford="always", stim="CX"),
    _fixed("cy", "Controlled Y", "CY", "Controlled", 2, controls=1, inverse="cy", clifford="always", stim="CY"),
    _fixed("cz", "Controlled Z", "CZ", "Controlled", 2, controls=1, inverse="cz", clifford="always", stim="CZ"),
    _fixed("ch", "Controlled H", "CH", "Controlled", 2, controls=1, inverse="ch", clifford="never"),
    _fixed("cp", "Controlled phase", "CP", "Controlled", 2, params=THETA, controls=1, inverse="cp", clifford="controlled_rotation"),
    _fixed("crx", "Controlled RX", "CRX", "Controlled", 2, params=THETA, controls=1, inverse="crx", clifford="controlled_rotation"),
    _fixed("cry", "Controlled RY", "CRY", "Controlled", 2, params=THETA, controls=1, inverse="cry", clifford="controlled_rotation"),
    _fixed("crz", "Controlled RZ", "CRZ", "Controlled", 2, params=THETA, controls=1, inverse="crz", clifford="controlled_rotation"),
    # Fixed and variadic multi-qubit gates.
    _fixed("swap", "Swap", "SWAP", "Multi-qubit", 2, targets=2, inverse="swap", clifford="always", stim="SWAP"),
    _fixed("iswap", "iSwap", "iSWAP", "Multi-qubit", 2, targets=2, inverse=None, clifford="always", stim="ISWAP"),
    _fixed("dcx", "Double CNOT", "DCX", "Multi-qubit", 2, targets=2, inverse=None, clifford="always"),
    _fixed("ecr", "Echoed cross-resonance", "ECR", "Multi-qubit", 2, targets=2, inverse="ecr", clifford="always"),
    _fixed("ccx", "Toffoli", "CCX", "Multi-qubit", 3, controls=2, inverse="ccx", clifford="never"),
    _fixed("cswap", "Fredkin", "CSWAP", "Multi-qubit", 3, controls=1, targets=2, inverse="cswap", clifford="never"),
    GateSpec(
        id="mcx", display_name="Multi-controlled X", symbol="MCX", category="Multi-qubit",
        min_qubits=2, max_qubits=None, clbits=0, application="mcx", qiskit_method="mcx",
        control_count="all_but_last", target_count=1, inverse="mcx", clifford_rule="mcx",
    ),
    GateSpec(
        id="mcp", display_name="Multi-controlled phase", symbol="MCP", category="Multi-qubit",
        min_qubits=2, max_qubits=None, clbits=0, parameters=THETA, application="mcp", qiskit_method="mcp",
        control_count="all_but_last", target_count=1, inverse="mcp", clifford_rule="never",
    ),
    # Pauli interaction rotations.
    _fixed("rxx", "XX interaction", "RXX", "Interaction", 2, params=THETA, targets=2, inverse="rxx", clifford="pauli_rotation"),
    _fixed("ryy", "YY interaction", "RYY", "Interaction", 2, params=THETA, targets=2, inverse="ryy", clifford="pauli_rotation"),
    _fixed("rzz", "ZZ interaction", "RZZ", "Interaction", 2, params=THETA, targets=2, inverse="rzz", clifford="pauli_rotation"),
    _fixed("rzx", "ZX interaction", "RZX", "Interaction", 2, params=THETA, targets=2, inverse="rzx", clifford="pauli_rotation"),
    # Non-unitary operations and compiler directive.
    GateSpec(
        id="measure", display_name="Measurement", symbol="M", category="Circuit operations",
        min_qubits=1, max_qubits=1, clbits=1, operation_kind="measurement", application="measure",
        qiskit_method="measure", reversible=False, clifford_rule="always", stim_instruction="M",
    ),
    GateSpec(
        id="reset", display_name="Reset", symbol="|0⟩", category="Circuit operations",
        min_qubits=1, max_qubits=1, clbits=0, operation_kind="reset", application="reset",
        qiskit_method="reset", reversible=False, clifford_rule="always", stim_instruction="R",
    ),
    GateSpec(
        id="barrier", display_name="Barrier", symbol="‖", category="Circuit operations",
        min_qubits=1, max_qubits=None, clbits=0, operation_kind="barrier", application="barrier",
        qiskit_method="barrier", control_count=0, target_count="remaining", reversible=False,
        clifford_rule="always", stim_instruction="TICK",
    ),
    # Resolver-only custom matrix operation.
    GateSpec(
        id="unitary", display_name="Custom unitary", symbol="U", category="Custom",
        min_qubits=1, max_qubits=3, clbits=0, operation_kind="matrix", application="unitary",
        reversible=True, clifford_rule="never",
    ),
]


GATE_REGISTRY: dict[str, GateSpec] = {spec.id: spec for spec in _SPECS}
GATE_NAMES: frozenset[str] = frozenset(GATE_REGISTRY)
PUBLIC_GATE_NAMES: tuple[str, ...] = tuple(spec.id for spec in _SPECS if spec.id != "unitary")


def get_gate_spec(gate: str) -> GateSpec:
    try:
        return GATE_REGISTRY[gate]
    except KeyError as exc:
        raise ValueError(f"unsupported gate '{gate}'") from exc
