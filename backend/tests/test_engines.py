"""Tests for the engine router and individual simulation engines."""

import math

import pytest

from fastapi.testclient import TestClient

from analysis.circuit_analyzer import analyze_circuit
from engines import aer_mps, router
from engines.aer_common import StateCapableRun
from engines.base import InfeasibleCircuitError, stim_available
from engines.stim_stabilizer import _ensure_sampling_work_is_safe
from main import app
from schemas import CircuitOperation, SimulationOptions

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
    assert body["metadata"]["approximate"] is False
    assert body["metadata"]["approximation_possible"] is True
    assert "bond dimension" in body["metadata"]["exactness_note"]


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


def test_auto_avoids_stim_for_clifford_angle_rotation(monkeypatch):
    analysis = analyze_circuit(
        num_qubits=50,
        num_clbits=0,
        operations=[
            CircuitOperation(gate="rz", qubits=[0], params={"theta": math.pi / 2})
        ],
        max_memory_mb=1024,
        stim_available=True,
    )
    monkeypatch.setattr(router, "stim_available", lambda: True)
    engine, reason = router.choose_engine(analysis, SimulationOptions())
    assert engine == "aer_stabilizer"
    assert "rotations" in reason


def test_aer_stabilizer_runs_clifford_angle_rotation():
    circuit = {
        "num_qubits": 2,
        "num_clbits": 0,
        "shots": 32,
        "operations": [
            {"gate": "rz", "qubits": [0], "params": {"theta": math.pi / 2}, "moment": 0}
        ],
    }
    response = _simulate(circuit, engine="aer_stabilizer", shots=32, seed=7)
    assert response.status_code == 200
    assert response.json()["selected_engine"] == "aer_stabilizer"


def test_auto_uses_mps_past_statevector_hard_cap_when_allowed():
    analysis = analyze_circuit(
        num_qubits=31,
        num_clbits=0,
        operations=[CircuitOperation(gate="t", qubits=[0])],
        max_memory_mb=65_536,
    )
    options = SimulationOptions(max_memory_mb=65_536, allow_approximation=True)
    engine, _ = router.choose_engine(analysis, options)
    assert analysis["statevector_risk"] == "heavy"
    assert engine == "aer_mps"


def test_auto_honors_density_matrix_hard_cap():
    analysis = analyze_circuit(
        num_qubits=16,
        num_clbits=0,
        operations=[],
        max_memory_mb=65_536,
    )
    options = SimulationOptions(max_memory_mb=65_536, noise_enabled=True)
    with pytest.raises(InfeasibleCircuitError, match="capped at 15 qubits"):
        router.choose_engine(analysis, options)


def test_noise_model_type_is_a_closed_contract():
    response = _simulate(
        _ghz(2),
        engine="auto",
        noise_enabled=True,
        noise_model_type="typo-model",
    )
    assert response.status_code == 422


def test_mps_metadata_marks_configured_truncation_without_claiming_measured_loss(monkeypatch):
    monkeypatch.setattr(aer_mps, "run_aer_with_state", lambda *args, **kwargs: StateCapableRun(counts={"0": 8}))
    options = SimulationOptions(
        engine="aer_mps",
        shots=8,
        mps_max_bond_dimension=4,
    )
    result = aer_mps.run(
        request=object(),
        options=options,
        analysis={"num_qubits": 4, "two_qubit_gate_count": 2},
    )
    assert result.metadata["approximate"] is True
    assert result.metadata["truncation_configured"] is True
    assert "does not report discarded weight" in result.metadata["exactness_note"]


def test_engine_catalog_has_actionable_auto_dependency_copy(monkeypatch):
    monkeypatch.setattr(router, "aer_available", lambda: False)
    monkeypatch.setattr(router, "stim_available", lambda: False)
    catalog = {entry["id"]: entry for entry in router.available_engines()}
    assert catalog["auto"]["available"] is False
    assert "Qiskit Aer" in catalog["auto"]["unavailable_reason"]
    assert "'None'" not in catalog["auto"]["unavailable_reason"]


def test_stim_sampling_work_guard_rejects_pathological_product():
    assert _ensure_sampling_work_is_safe(1024, 4096) == 4_194_304
    with pytest.raises(InfeasibleCircuitError, match="sampled bit cells"):
        _ensure_sampling_work_is_safe(1_000_000, 4096)
