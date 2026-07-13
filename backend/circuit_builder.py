from __future__ import annotations

from typing import Any

from schemas import CircuitRequest
from validators import ordered_operations


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


def build_circuit(request: CircuitRequest) -> Any:
    QuantumCircuit = _load_quantum_circuit()
    from qiskit.circuit.library import UnitaryGate

    circuit = QuantumCircuit(request.num_qubits, request.num_clbits)

    for _, operation in ordered_operations(request):
        gate = operation.gate
        q = operation.qubits

        if gate in {"x", "y", "z", "h", "s", "t"}:
            getattr(circuit, gate)(q[0])
        elif gate in {"rx", "ry", "rz"}:
            getattr(circuit, gate)(float(operation.params["theta"]), q[0])
        elif gate in {"cx", "cz", "swap"}:
            getattr(circuit, gate)(q[0], q[1])
        elif gate == "measure":
            circuit.measure(q[0], operation.clbits[0])
        elif gate == "barrier":
            circuit.barrier(*q)
        elif gate == "unitary":
            # q[0] is the least-significant qubit of the matrix's own row/col
            # index -- matches lib/statevector.ts's applyMatrix on the
            # frontend, so the local preview and this backend build agree.
            matrix = [[complex(re, im) for re, im in row] for row in operation.matrix]
            circuit.append(UnitaryGate(matrix, label=operation.label), q)

    return circuit
