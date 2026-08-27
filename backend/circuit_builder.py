from __future__ import annotations

from typing import Any, Sequence

from gate_registry import get_gate_spec
from schemas import CircuitOperation, CircuitRequest
from validators import canonical_operation_order


class QuantumDependencyError(RuntimeError):
    pass


def _load_quantum_circuit():
    try:
        from qiskit import QuantumCircuit
    except ImportError as exc:
        raise QuantumDependencyError(
            "Qiskit is not installed. Run: pip install -r requirements.txt"
        ) from exc
    return QuantumCircuit


def apply_operations(circuit: Any, operations: Sequence[CircuitOperation]) -> None:
    """Appends `operations` (already in the desired execution order) onto an
    existing `QuantumCircuit` in place. Factored out of `build_circuit` so
    callers that need a save instruction *between* two slices of the same
    operation list (see engines/aer_common.py's state-analysis circuit
    construction) can call this twice on one circuit object instead of
    duplicating the gate-dispatch dictionary.
    """
    from qiskit.circuit.library import UnitaryGate

    for operation in operations:
        spec = get_gate_spec(operation.gate)
        q = operation.qubits

        if spec.application == "direct":
            args = [float(operation.params[name]) for name in spec.parameter_names]
            getattr(circuit, spec.qiskit_method)(*args, *q)
        elif spec.application == "measure":
            circuit.measure(q[0], operation.clbits[0])
        elif spec.application == "reset":
            circuit.reset(q[0])
        elif spec.application == "barrier":
            circuit.barrier(*q)
        elif spec.application == "mcx":
            circuit.mcx(q[:-1], q[-1])
        elif spec.application == "mcp":
            circuit.mcp(float(operation.params["theta"]), q[:-1], q[-1])
        elif spec.application == "unitary":
            # q[0] is the least-significant qubit of the matrix's own row/col
            # index -- matches lib/statevector.ts's applyMatrix on the
            # frontend, so the local preview and this backend build agree.
            matrix = [[complex(re, im) for re, im in row] for row in operation.matrix]
            circuit.append(UnitaryGate(matrix, label=operation.label), q)


def build_circuit(request: CircuitRequest) -> Any:
    QuantumCircuit = _load_quantum_circuit()
    circuit = QuantumCircuit(request.num_qubits, request.num_clbits)
    apply_operations(circuit, canonical_operation_order(request.operations))
    return circuit


def empty_circuit(num_qubits: int, num_clbits: int) -> Any:
    """A bare QuantumCircuit with no operations -- the building block
    engines/aer_common.py uses to construct a state-analysis circuit
    operation-by-operation alongside a save instruction."""
    QuantumCircuit = _load_quantum_circuit()
    return QuantumCircuit(num_qubits, num_clbits)


def ordered_operation_list(request: Any) -> list[CircuitOperation]:
    """`request.operations` in the same visual-moment execution order
    `build_circuit` uses, without needing a full CircuitRequest re-validation."""
    return canonical_operation_order(request.operations)
