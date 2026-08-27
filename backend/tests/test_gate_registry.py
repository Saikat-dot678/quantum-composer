import math

import numpy as np
import pytest
from qiskit.quantum_info import Operator

from circuit_builder import build_circuit
from codegen import generate_qasm3, generate_qiskit_code
from gate_registry import GATE_REGISTRY, PUBLIC_GATE_NAMES
from schemas import CircuitOperation, CircuitRequest


def operation_for(gate: str) -> CircuitOperation:
    spec = GATE_REGISTRY[gate]
    qubit_count = 3 if spec.max_qubits is None and gate in {"mcx", "mcp"} else spec.min_qubits
    return CircuitOperation(
        gate=gate,
        qubits=list(range(qubit_count)),
        clbits=[0] if spec.clbits else [],
        params={parameter.name: parameter.default for parameter in spec.parameters},
        moment=0,
    )


@pytest.mark.parametrize("gate", PUBLIC_GATE_NAMES)
def test_every_public_gate_builds_and_generates_code(gate: str) -> None:
    operation = operation_for(gate)
    request = CircuitRequest(
        num_qubits=max(operation.qubits) + 1,
        num_clbits=1 if operation.clbits else 0,
        shots=16,
        operations=[operation],
    )
    circuit = build_circuit(request)
    assert circuit.data[0].operation.name
    assert "circuit." in generate_qiskit_code(request)


@pytest.mark.parametrize("gate", [gate for gate in PUBLIC_GATE_NAMES if GATE_REGISTRY[gate].is_unitary])
def test_every_unitary_registry_gate_is_unitary(gate: str) -> None:
    operation = operation_for(gate)
    request = CircuitRequest(num_qubits=max(operation.qubits) + 1, num_clbits=0, shots=16, operations=[operation])
    matrix = Operator(build_circuit(request)).data
    identity = np.eye(matrix.shape[0], dtype=complex)
    assert np.allclose(matrix.conj().T @ matrix, identity, atol=1e-10)


def test_reset_measurement_and_scoped_barrier_survive_qasm3() -> None:
    request = CircuitRequest(
        num_qubits=3,
        num_clbits=1,
        shots=16,
        operations=[
            CircuitOperation(gate="x", qubits=[0], moment=0),
            CircuitOperation(gate="reset", qubits=[0], moment=1),
            CircuitOperation(gate="barrier", qubits=[0, 2], moment=2),
            CircuitOperation(gate="measure", qubits=[0], clbits=[0], moment=3),
        ],
    )
    qasm = generate_qasm3(build_circuit(request))
    assert "reset" in qasm
    assert "barrier" in qasm
    assert "measure" in qasm


@pytest.mark.parametrize("gate", ["p", "rx", "ry", "rz", "cp", "crx", "cry", "crz", "mcp", "rxx", "ryy", "rzz", "rzx"])
def test_parameterized_gates_reject_nonfinite_angles(gate: str) -> None:
    spec = GATE_REGISTRY[gate]
    count = 3 if gate == "mcp" else spec.min_qubits
    with pytest.raises(ValueError, match="finite"):
        CircuitOperation(gate=gate, qubits=list(range(count)), params={"theta": math.inf}, moment=0)
