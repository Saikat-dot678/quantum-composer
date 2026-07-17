from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from circuit_builder import build_circuit
from codegen import generate_qasm, generate_qiskit_code
from engines.base import EngineResult
from engines import router as router_module
from hardware.circuits import circuit_from_source
from hardware.schemas import JsonCircuitSource
from main import app
from schemas import AdvancedCircuitRequest, CircuitOperation, CircuitRequest, SimulationOptions
import simulator as simulator_module
from visualization.circuit_renderer import CircuitDiagramRenderResult
from validators import canonical_operation_order


client = TestClient(app)

SCRAMBLED_OPERATIONS = [
    {"gate": "measure", "qubits": [1], "clbits": [1], "moment": 5},
    {"gate": "cx", "qubits": [0, 3], "moment": 3},
    {"gate": "h", "qubits": [0], "moment": 0},
    {"gate": "measure", "qubits": [0], "clbits": [0], "moment": 4},
    {"gate": "cx", "qubits": [0, 1], "moment": 1},
    {"gate": "measure", "qubits": [3], "clbits": [3], "moment": 7},
    {"gate": "cx", "qubits": [0, 2], "moment": 2},
    {"gate": "measure", "qubits": [2], "clbits": [2], "moment": 6},
]

EXPECTED_NAMES = ["h", "cx", "cx", "cx", "measure", "measure", "measure", "measure"]
EXPECTED_PYTHON = [
    "circuit.h(0)",
    "circuit.cx(0, 1)",
    "circuit.cx(0, 2)",
    "circuit.cx(0, 3)",
    "circuit.measure(0, 0)",
    "circuit.measure(1, 1)",
    "circuit.measure(2, 2)",
    "circuit.measure(3, 3)",
]


def request(operations=SCRAMBLED_OPERATIONS) -> CircuitRequest:
    return CircuitRequest(num_qubits=4, num_clbits=4, shots=128, operations=operations)


def instruction_names(circuit) -> list[str]:
    return [instruction.operation.name for instruction in circuit.data]


def test_canonical_order_is_numeric_stable_and_non_mutating() -> None:
    operations = [
        CircuitOperation(gate="x", qubits=[0], moment=10),
        CircuitOperation(gate="h", qubits=[1], moment=2),
        CircuitOperation(gate="z", qubits=[2], moment=2),
    ]
    ordered = canonical_operation_order(operations)
    assert [operation.gate for operation in ordered] == ["h", "z", "x"]
    assert [operation.gate for operation in operations] == ["x", "h", "z"]
    assert ordered is not operations


@pytest.mark.parametrize("moment", [None, "3", 1.5, -1, float("nan")])
def test_schema_rejects_invalid_moments(moment) -> None:
    operation = {"gate": "h", "qubits": [0]}
    if moment is not None:
        operation["moment"] = moment
    with pytest.raises(ValidationError):
        CircuitRequest(num_qubits=1, num_clbits=0, operations=[operation])


def test_schema_allows_parallel_independent_operations_but_rejects_conflicts() -> None:
    valid = CircuitRequest(
        num_qubits=2,
        num_clbits=2,
        operations=[
            {"gate": "h", "qubits": [0], "moment": 0},
            {"gate": "x", "qubits": [1], "moment": 0},
        ],
    )
    assert [operation.gate for operation in canonical_operation_order(valid.operations)] == ["h", "x"]
    with pytest.raises(ValidationError, match="already has an operation"):
        CircuitRequest(
            num_qubits=1,
            num_clbits=0,
            operations=[
                {"gate": "h", "qubits": [0], "moment": 0},
                {"gate": "barrier", "qubits": [0], "moment": 0},
            ],
        )
    with pytest.raises(ValidationError, match="classical bit 0 already"):
        CircuitRequest(
            num_qubits=2,
            num_clbits=1,
            operations=[
                {"gate": "measure", "qubits": [0], "clbits": [0], "moment": 1},
                {"gate": "measure", "qubits": [1], "clbits": [0], "moment": 1},
            ],
        )


def test_scrambled_screenshot_circuit_builds_in_visual_order() -> None:
    circuit = build_circuit(request())
    assert instruction_names(circuit) == EXPECTED_NAMES


def test_generated_python_and_openqasm_use_identical_visual_order() -> None:
    circuit_request = request()
    code = generate_qiskit_code(circuit_request)
    offsets = [code.index(line) for line in EXPECTED_PYTHON]
    assert offsets == sorted(offsets)

    qasm = generate_qasm(build_circuit(circuit_request))
    qasm_lines = [line.strip() for line in qasm.splitlines()]
    expected_qasm = [
        "h q[0];", "cx q[0],q[1];", "cx q[0],q[2];", "cx q[0],q[3];",
        "measure q[0] -> c[0];", "measure q[1] -> c[1];",
        "measure q[2] -> c[2];", "measure q[3] -> c[3];",
    ]
    assert [qasm_lines.index(line) for line in expected_qasm] == sorted(qasm_lines.index(line) for line in expected_qasm)


def test_barrier_and_terminal_measurements_follow_moments() -> None:
    circuit_request = request([
        {"gate": "measure", "qubits": [0], "clbits": [0], "moment": 3},
        {"gate": "barrier", "qubits": [0, 1], "moment": 2},
        {"gate": "cx", "qubits": [0, 1], "moment": 1},
        {"gate": "h", "qubits": [0], "moment": 0},
        {"gate": "measure", "qubits": [1], "clbits": [1], "moment": 3},
    ])
    assert instruction_names(build_circuit(circuit_request)) == ["h", "cx", "barrier", "measure", "measure"]


def test_hardware_json_input_uses_the_same_builder_order() -> None:
    source = JsonCircuitSource(kind="json", circuit=AdvancedCircuitRequest(
        num_qubits=4, num_clbits=4, shots=128, operations=SCRAMBLED_OPERATIONS,
    ).model_dump())
    assert instruction_names(circuit_from_source(source)) == EXPECTED_NAMES


def test_codegen_endpoint_ignores_scrambled_array_position() -> None:
    response = client.post("/circuit/qiskit-code", json=request().model_dump())
    assert response.status_code == 200
    code = response.json()["code"]
    assert [code.index(line) for line in EXPECTED_PYTHON] == sorted(code.index(line) for line in EXPECTED_PYTHON)


def test_v1_simulation_and_graphical_renderer_receive_canonical_circuit(monkeypatch) -> None:
    rendered_names: list[str] = []

    def capture(circuit):
        rendered_names.extend(instruction_names(circuit))
        return CircuitDiagramRenderResult(payload=None)

    monkeypatch.setattr(simulator_module, "render_circuit_diagram", capture)
    result = simulator_module.simulate(request())
    assert rendered_names == EXPECTED_NAMES
    assert sum(result["counts"].values()) == 128


def test_v2_engine_route_receives_request_whose_shared_builder_is_canonical(monkeypatch) -> None:
    executed_names: list[str] = []

    def fake_runner(circuit_request, _options, _analysis):
        executed_names.extend(instruction_names(build_circuit(circuit_request)))
        return EngineResult(counts={"0000": 128}, selected_engine="aer_statevector", engine_reason="ordering test")

    monkeypatch.setitem(router_module._ENGINE_RUNNERS, "aer_statevector", fake_runner)
    advanced = AdvancedCircuitRequest(num_qubits=4, num_clbits=4, shots=128, operations=SCRAMBLED_OPERATIONS)
    result = router_module.simulate(advanced, SimulationOptions(engine="aer_statevector", shots=128))
    assert executed_names == EXPECTED_NAMES
    assert result["selected_engine"] == "aer_statevector"
