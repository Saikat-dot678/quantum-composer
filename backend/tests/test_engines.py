"""Tests for the engine router and individual simulation engines."""

from fastapi.testclient import TestClient

from engines.base import stim_available
from main import app

client = TestClient(app)


def _ghz(n, clifford=True):
    ops = [{"gate": "h", "qubits": [0], "moment": 0}]
    ops += [{"gate": "cx", "qubits": [i, i + 1], "moment": i + 1} for i in range(n - 1)]
    if not clifford:
        ops.append({"gate": "t", "qubits": [0], "moment": n})
    return {"num_qubits": n, "num_clbits": 0, "shots": 128, "operations": ops}


def _simulate(circuit, **options):
    return client.post(
        "/circuit/simulate-v2", json={"circuit": circuit, "options": options}
    )


def test_engines_endpoint_lists_availability():
    response = client.get("/engines")
    assert response.status_code == 200
    body = response.json()
    ids = {e["id"]: e for e in body["engines"]}
    assert "aer_statevector" in ids
    assert "stim_stabilizer" in ids
    # Stim availability is reported honestly (installed or not) and never crashes.
    assert ids["stim_stabilizer"]["available"] == stim_available()
    assert body["stim_available"] == stim_available()


def test_auto_selects_stabilizer_for_large_clifford():
    response = _simulate(_ghz(50), engine="auto", shots=100, seed=1)
    assert response.status_code == 200
    body = response.json()
    assert body["selected_engine"] in {"aer_stabilizer", "stim_stabilizer"}
    # GHZ collapses to just |00..0> and |11..1>.
    assert set(body["counts"]).issubset({"0" * 50, "1" * 50})


def test_auto_selects_statevector_for_small_non_clifford():
    circuit = {
        "num_qubits": 2,
        "num_clbits": 0,
        "shots": 200,
        "operations": [
            {"gate": "h", "qubits": [0], "moment": 0},
            {"gate": "t", "qubits": [0], "moment": 1},
        ],
    }
    response = _simulate(circuit, engine="auto", shots=200, seed=2)
    assert response.status_code == 200
    assert response.json()["selected_engine"] == "aer_statevector"


def test_large_arbitrary_non_clifford_is_rejected_safely():
    response = _simulate(_ghz(40, clifford=False), engine="auto")
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "exponential memory" in detail
    assert "hardware" in detail  # honest alternatives are suggested


def test_large_clifford_routes_to_stabilizer_family():
    # Whether or not Stim is installed, a large Clifford circuit must run.
    response = _simulate(_ghz(120), engine="auto", shots=64, seed=3)
    assert response.status_code == 200
    engine = response.json()["selected_engine"]
    if stim_available():
        assert engine == "stim_stabilizer"
    else:
        assert engine == "aer_stabilizer"


def test_mps_route_runs_for_chain_circuit():
    ops = [{"gate": "h", "qubits": [0], "moment": 0}]
    ops += [{"gate": "cx", "qubits": [i, i + 1], "moment": i + 1} for i in range(15)]
    circuit = {"num_qubits": 16, "num_clbits": 0, "shots": 128, "operations": ops}
    response = _simulate(circuit, engine="aer_mps", shots=128, seed=4)
    assert response.status_code == 200
    body = response.json()
    assert body["selected_engine"] == "aer_mps"
    assert body["metadata"]["approximate"] is True


def test_stabilizer_engine_rejects_non_clifford_gate():
    circuit = {
        "num_qubits": 2,
        "num_clbits": 0,
        "shots": 100,
        "operations": [
            {"gate": "h", "qubits": [0], "moment": 0},
            {"gate": "t", "qubits": [1], "moment": 0},
        ],
    }
    response = _simulate(circuit, engine="aer_stabilizer")
    assert response.status_code == 422
    assert "Clifford" in response.json()["detail"]


def test_statevector_engine_hard_caps_qubits():
    response = _simulate(_ghz(35), engine="aer_statevector")
    assert response.status_code == 422
    assert "capped" in response.json()["detail"]


def test_stim_engine_reports_cleanly_when_missing():
    response = _simulate(_ghz(10), engine="stim_stabilizer", shots=64, seed=5)
    if stim_available():
        assert response.status_code == 200
        assert response.json()["selected_engine"] == "stim_stabilizer"
    else:
        # Missing optional dependency -> clean 503, not a crash.
        assert response.status_code == 503
        assert "stim" in response.json()["detail"].lower()


def test_noise_routes_to_density_matrix():
    circuit = {
        "num_qubits": 2,
        "num_clbits": 0,
        "shots": 400,
        "operations": [
            {"gate": "h", "qubits": [0], "moment": 0},
            {"gate": "cx", "qubits": [0, 1], "moment": 1},
        ],
    }
    response = _simulate(circuit, engine="auto", noise_enabled=True, shots=400, seed=6)
    assert response.status_code == 200
    assert response.json()["selected_engine"] == "aer_density_matrix"


def test_seed_makes_simulation_reproducible():
    circuit = {
        "num_qubits": 3,
        "num_clbits": 0,
        "shots": 256,
        "operations": [
            {"gate": "h", "qubits": [0], "moment": 0},
            {"gate": "h", "qubits": [1], "moment": 0},
            {"gate": "h", "qubits": [2], "moment": 0},
        ],
    }
    a = _simulate(circuit, engine="aer_statevector", shots=256, seed=99).json()
    b = _simulate(circuit, engine="aer_statevector", shots=256, seed=99).json()
    assert a["counts"] == b["counts"]
