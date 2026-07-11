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

    return circuit
