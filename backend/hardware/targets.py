"""Build a qiskit BackendV2 / Target from any supported target source.

Every function here is pure construction -- no network access, no
credentials. IBM live backends are resolved separately in ibm_service.py;
this module covers everything that works offline: fake snapshots, generic
synthetic topologies, and validated user-defined ("manual") targets.
"""

from __future__ import annotations

from typing import Any

from qiskit.circuit import Parameter
from qiskit.circuit.library import (
    CHGate,
    CPhaseGate,
    CRXGate,
    CRYGate,
    CRZGate,
    CXGate,
    CYGate,
    CZGate,
    ECRGate,
    HGate,
    IGate,
    PhaseGate,
    RXGate,
    RXXGate,
    RYGate,
    RYYGate,
    RZGate,
    RZXGate,
    RZZGate,
    SdgGate,
    SGate,
    SwapGate,
    SXdgGate,
    SXGate,
    TdgGate,
    TGate,
    UGate,
    XGate,
    YGate,
    ZGate,
    iSwapGate,
)
from qiskit.circuit import Delay, Measure, Reset
from qiskit.providers.fake_provider import GenericBackendV2
from qiskit.transpiler import CouplingMap, InstructionProperties, Target

from .availability import fake_provider_available
from .schemas import GenericTargetSource, ManualHardwareDefinition

_THETA = Parameter("theta")
_PHI = Parameter("phi")
_LAM = Parameter("lam")

# Gate factories for manual-target basis gates. Parameterized gates get free
# parameters so the Target accepts any angle during transpilation.
_GATE_FACTORIES: dict[str, Any] = {
    "id": lambda: IGate(),
    "x": lambda: XGate(),
    "y": lambda: YGate(),
    "z": lambda: ZGate(),
    "h": lambda: HGate(),
    "s": lambda: SGate(),
    "sdg": lambda: SdgGate(),
    "t": lambda: TGate(),
    "tdg": lambda: TdgGate(),
    "sx": lambda: SXGate(),
    "sxdg": lambda: SXdgGate(),
    "rx": lambda: RXGate(_THETA),
    "ry": lambda: RYGate(_THETA),
    "rz": lambda: RZGate(_THETA),
    "p": lambda: PhaseGate(_THETA),
    "u": lambda: UGate(_THETA, _PHI, _LAM),
    "cx": lambda: CXGate(),
    "cz": lambda: CZGate(),
    "cy": lambda: CYGate(),
    "ch": lambda: CHGate(),
    "swap": lambda: SwapGate(),
    "iswap": lambda: iSwapGate(),
    "ecr": lambda: ECRGate(),
    "rzz": lambda: RZZGate(_THETA),
    "rxx": lambda: RXXGate(_THETA),
    "ryy": lambda: RYYGate(_THETA),
    "rzx": lambda: RZXGate(_THETA),
    "cp": lambda: CPhaseGate(_THETA),
    "crx": lambda: CRXGate(_THETA),
    "cry": lambda: CRYGate(_THETA),
    "crz": lambda: CRZGate(_THETA),
}

_TWO_QUBIT_GATES = {
    "cx", "cz", "cy", "ch", "swap", "iswap", "ecr", "rzz", "rxx", "ryy", "rzx", "cp", "crx", "cry", "crz",
}


class TargetBuildError(ValueError):
    """Raised for a structurally invalid target source; maps to HTTP 422."""


def generic_coupling(topology: str, num_qubits: int) -> CouplingMap:
    if topology == "line":
        return CouplingMap.from_line(num_qubits)
    if topology == "ring":
        return CouplingMap.from_ring(num_qubits)
    if topology == "full":
        if num_qubits > 64:
            raise TargetBuildError("Fully connected generic topologies are limited to 64 qubits.")
        return CouplingMap.from_full(num_qubits)
    if topology == "grid":
        # Nearest square-ish grid that fits num_qubits.
        import math

        rows = max(1, int(math.floor(math.sqrt(num_qubits))))
        cols = int(math.ceil(num_qubits / rows))
        full = CouplingMap.from_grid(rows, cols)
        if rows * cols == num_qubits:
            return full
        reduced = [edge for edge in full.get_edges() if edge[0] < num_qubits and edge[1] < num_qubits]
        return CouplingMap(couplinglist=reduced)
    raise TargetBuildError(f"Unknown generic topology '{topology}'.")


def build_generic_backend(source: GenericTargetSource) -> GenericBackendV2:
    coupling = generic_coupling(source.topology, source.num_qubits)
    return GenericBackendV2(
        num_qubits=source.num_qubits,
        coupling_map=coupling,
        seed=source.seed,
        noise_info=source.noise,
    )


def build_fake_backend(name: str) -> Any:
    if not fake_provider_available():
        raise TargetBuildError(
            "Fake IBM backend snapshots require the optional qiskit-ibm-runtime package "
            "(pip install -r requirements-hardware.txt). Generic and manual targets work without it."
        )
    from qiskit_ibm_runtime.fake_provider import FakeProviderForBackendV2

    provider = FakeProviderForBackendV2()
    for backend in provider.backends():
        if backend.name == name:
            return backend
    raise TargetBuildError(f"No fake backend named '{name}'. Use GET /hardware/backends?source=fake for the list.")


def _validated_edges(definition: ManualHardwareDefinition) -> list[tuple[int, int]]:
    seen: set[tuple[int, int]] = set()
    edges: list[tuple[int, int]] = []
    for edge in definition.edges:
        if edge.control >= definition.num_qubits or edge.target >= definition.num_qubits:
            raise TargetBuildError(
                f"Edge ({edge.control}, {edge.target}) references a qubit outside 0..{definition.num_qubits - 1}."
            )
        if edge.control == edge.target:
            raise TargetBuildError(f"Edge ({edge.control}, {edge.target}) connects a qubit to itself.")
        pair = (edge.control, edge.target)
        if pair in seen:
            raise TargetBuildError(f"Duplicate edge ({edge.control}, {edge.target}).")
        seen.add(pair)
        edges.append(pair)
    if definition.undirected:
        for control, target in list(seen):
            mirrored = (target, control)
            if mirrored not in seen:
                seen.add(mirrored)
                edges.append(mirrored)
    return edges


def build_manual_target(definition: ManualHardwareDefinition) -> Target:
    """Validated user definition -> qiskit Target (BackendV2-compatible)."""
    if definition.coordinates is not None and len(definition.coordinates) != definition.num_qubits:
        raise TargetBuildError(
            f"coordinates has {len(definition.coordinates)} entries but the device declares "
            f"{definition.num_qubits} qubits."
        )
    if definition.qubit_properties is not None and len(definition.qubit_properties) != definition.num_qubits:
        raise TargetBuildError(
            f"qubit_properties has {len(definition.qubit_properties)} entries but the device declares "
            f"{definition.num_qubits} qubits."
        )

    edges = _validated_edges(definition)
    if not edges and definition.num_qubits > 1:
        raise TargetBuildError("A multi-qubit device needs at least one coupling edge.")

    # Reachability sanity: warn-level issues are handled by the caller; a
    # completely disconnected multi-qubit device is still a valid Target, so
    # no hard failure here beyond the empty-edge case above.

    qubit_properties = None
    if definition.qubit_properties is not None:
        from qiskit.providers.backend import QubitProperties as QiskitQubitProperties

        qubit_properties = [
            QiskitQubitProperties(
                t1=(props.t1_us * 1e-6) if props.t1_us is not None else None,
                t2=(props.t2_us * 1e-6) if props.t2_us is not None else None,
            )
            for props in definition.qubit_properties
        ]

    target = Target(
        num_qubits=definition.num_qubits,
        description=f"manual:{definition.name}",
        dt=None,
        qubit_properties=qubit_properties,
    )

    default_duration = (
        definition.default_gate_duration_ns * 1e-9 if definition.default_gate_duration_ns is not None else None
    )

    edge_props: dict[tuple[int, int], InstructionProperties] = {}
    for edge in definition.edges:
        props = InstructionProperties(
            error=edge.two_qubit_error,
            duration=(edge.gate_duration_ns * 1e-9) if edge.gate_duration_ns is not None else default_duration,
        )
        edge_props[(edge.control, edge.target)] = props
        if definition.undirected and (edge.target, edge.control) not in edge_props:
            edge_props[(edge.target, edge.control)] = InstructionProperties(
                error=edge.two_qubit_error,
                duration=(edge.gate_duration_ns * 1e-9) if edge.gate_duration_ns is not None else default_duration,
            )

    all_qubits = {(qubit,): InstructionProperties(duration=default_duration) for qubit in range(definition.num_qubits)}

    for gate_name in definition.basis_gates:
        factory = _GATE_FACTORIES.get(gate_name)
        if factory is None:
            raise TargetBuildError(f"Unsupported basis gate '{gate_name}'.")
        instruction = factory()
        if gate_name in _TWO_QUBIT_GATES:
            if edge_props:
                target.add_instruction(instruction, dict(edge_props))
        else:
            target.add_instruction(instruction, dict(all_qubits))

    measure_props = {
        (qubit,): InstructionProperties(
            error=(definition.qubit_properties[qubit].readout_error if definition.qubit_properties else None),
            duration=(definition.measurement_duration_ns * 1e-9) if definition.measurement_duration_ns is not None else None,
        )
        for qubit in range(definition.num_qubits)
    }
    target.add_instruction(Measure(), measure_props)
    target.add_instruction(Reset(), dict(all_qubits))
    target.add_instruction(Delay(Parameter("t")), dict(all_qubits))

    return target
