import base64

from fastapi.testclient import TestClient

from main import app, configured_cors_origins
import simulator as simulator_module
from visualization.circuit_renderer import CircuitDiagramRenderResult


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
    diagram = payload["circuit_diagram"]
    assert diagram["format"] == "svg"
    assert diagram["encoding"] == "base64"
    assert b"<svg" in base64.b64decode(diagram["content"])[:1024]
    # Retained for backward compatibility; the frontend no longer displays it.
    assert isinstance(payload["diagram"], str)


def test_simulation_succeeds_when_graphical_rendering_fails(monkeypatch) -> None:
    monkeypatch.setattr(
        simulator_module,
        "render_circuit_diagram",
        lambda _circuit: CircuitDiagramRenderResult(
            payload=None,
            warning="The circuit simulation completed, but the graphical diagram could not be rendered.",
        ),
    )
    response = client.post("/circuit/simulate", json=BELL_CIRCUIT)
    assert response.status_code == 200
    payload = response.json()
    assert payload["circuit_diagram"] is None
    assert sum(payload["counts"].values()) == 512
    assert any("could not be rendered" in warning for warning in payload["warnings"])


def test_cors_allows_playwright_production_server_origin() -> None:
    response = client.options(
        "/health",
        headers={
            "Origin": "http://127.0.0.1:3130",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:3130"


def test_cors_configuration_appends_and_normalizes_origins() -> None:
    origins = configured_cors_origins(
        "https://composer.example, https://composer.example/,http://localhost:3000"
    )
    assert "http://localhost:3000" in origins
    assert "http://127.0.0.1:3130" in origins
    assert origins.count("https://composer.example") == 1
