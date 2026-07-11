from fastapi.testclient import TestClient

from main import app


client = TestClient(app)

BELL_CIRCUIT = {
    "num_qubits": 2,
    "num_clbits": 2,
    "shots": 512,
    "operations": [
        {"gate": "h", "qubits": [0], "moment": 0},
        {"gate": "cx", "qubits": [0, 1], "moment": 1},
        {"gate": "measure", "qubits": [0], "clbits": [0], "moment": 2},
        {"gate": "measure", "qubits": [1], "clbits": [1], "moment": 2},
    ],
}


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_validate_bell_circuit() -> None:
    response = client.post("/circuit/validate", json=BELL_CIRCUIT)
    assert response.status_code == 200
    assert response.json()["valid"] is True


def test_rejects_out_of_range_qubit() -> None:
    invalid = {**BELL_CIRCUIT, "operations": [{"gate": "x", "qubits": [2]}]}
    response = client.post("/circuit/validate", json=invalid)
    assert response.status_code == 422


def test_rejects_bad_rotation_parameter() -> None:
    invalid = {
        **BELL_CIRCUIT,
        "operations": [{"gate": "rx", "qubits": [0], "params": {"theta": "pi"}}],
    }
    response = client.post("/circuit/validate", json=invalid)
    assert response.status_code == 422


def test_codegen_contains_bell_operations() -> None:
    response = client.post("/circuit/qiskit-code", json=BELL_CIRCUIT)
    assert response.status_code == 200
    code = response.json()["code"]
    assert "circuit.h(0)" in code
    assert "circuit.cx(0, 1)" in code


def test_simulates_bell_state() -> None:
    response = client.post("/circuit/simulate", json=BELL_CIRCUIT)
    assert response.status_code == 200
    payload = response.json()
    assert set(payload["counts"]).issubset({"00", "11"})
    assert sum(payload["counts"].values()) == 512
