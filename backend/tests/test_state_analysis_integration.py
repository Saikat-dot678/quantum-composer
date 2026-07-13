"""End-to-end integration tests for post-simulation state analysis --
exercises the real engines (Aer, and Stim when installed) through the actual
`/circuit/simulate-v2` API, not just the pure-math module. Complements
test_state_postprocessing.py (pure math, no Aer) and test_unitary_gate.py
(schema-level unitary gate coverage).
"""

from __future__ import annotations

import math

import pytest
from fastapi.testclient import TestClient

from engines.base import stim_available
from main import app

client = TestClient(app)

SQRT2 = math.sqrt(2.0)

BELL_OPS = [
    {"gate": "h", "qubits": [0], "moment": 0},
    {"gate": "cx", "qubits": [0, 1], "moment": 1},
]
BELL_MEASURED_OPS = BELL_OPS + [
    {"gate": "measure", "qubits": [0], "clbits": [0], "moment": 2},
    {"gate": "measure", "qubits": [1], "clbits": [1], "moment": 2},
]


def _simulate(num_qubits, num_clbits, operations, **option_overrides):
    options = {"engine": "auto", "shots": 256, "seed": 7, **option_overrides}
    return client.post(
        "/circuit/simulate-v2",
        json={"circuit": {"num_qubits": num_qubits, "num_clbits": num_clbits, "operations": operations}, "options": options},
    )


# ---------------------------------------------------------------------------
# Backward compatibility: default behavior is unaffected
# ---------------------------------------------------------------------------


def test_state_analysis_absent_by_default():
    response = _simulate(2, 2, BELL_MEASURED_OPS)
    assert response.status_code == 200
    payload = response.json()
    assert payload["state_analysis"] is None
    assert set(payload["counts"]).issubset({"00", "01", "10", "11"})


def test_old_response_fields_unaffected_when_state_analysis_requested():
    response = _simulate(2, 2, BELL_MEASURED_OPS, include_state_analysis=True)
    assert response.status_code == 200
    payload = response.json()
    assert "counts" in payload and "depth" in payload and "selected_engine" in payload
    assert set(payload["counts"]).issubset({"00", "01", "10", "11"})


# ---------------------------------------------------------------------------
# aer_statevector: final_state vs. pre_measurement_state semantics
# ---------------------------------------------------------------------------


def test_statevector_final_state_no_measurements():
    response = _simulate(2, 0, BELL_OPS, engine="aer_statevector", include_state_analysis=True, state_detail="full")
    assert response.status_code == 200
    state = response.json()["state_analysis"]
    assert state["available"] is True
    assert state["representation"] == "statevector"
    assert state["semantic_point"] == "final_state"
    assert state["source_engine"] == "aer_statevector"
    amplitudes = {a["basis"]: a["probability"] for a in state["amplitudes"]}
    assert amplitudes["00"] == pytest.approx(0.5, abs=1e-6)
    assert amplitudes["11"] == pytest.approx(0.5, abs=1e-6)


def test_statevector_pre_measurement_state_with_terminal_measurements():
    response = _simulate(2, 2, BELL_MEASURED_OPS, engine="aer_statevector", include_state_analysis=True, state_detail="full")
    assert response.status_code == 200
    payload = response.json()
    state = payload["state_analysis"]
    assert state["available"] is True
    assert state["semantic_point"] == "pre_measurement_state"
    # Counts still reflect the real measured circuit, unaffected by state extraction.
    assert set(payload["counts"]).issubset({"00", "11"})
    amplitudes = {a["basis"]: a["probability"] for a in state["amplitudes"]}
    assert amplitudes["00"] == pytest.approx(0.5, abs=1e-6)
    assert amplitudes["11"] == pytest.approx(0.5, abs=1e-6)


def test_mid_circuit_measurement_reports_unavailable_but_counts_still_succeed():
    ops = [
        {"gate": "h", "qubits": [0], "moment": 0},
        {"gate": "measure", "qubits": [0], "clbits": [0], "moment": 1},
        {"gate": "x", "qubits": [0], "moment": 2},  # operates on q0 AFTER its own measurement
        {"gate": "measure", "qubits": [0], "clbits": [0], "moment": 3},
    ]
    response = _simulate(1, 1, ops, engine="aer_statevector", include_state_analysis=True)
    assert response.status_code == 200
    payload = response.json()
    state = payload["state_analysis"]
    assert state["available"] is False
    assert "mid-circuit" in state["unavailable_reason"] or "measurement" in state["unavailable_reason"]
    # The simulation itself is unaffected -- counts are still returned.
    assert payload["counts"]


def test_bell_state_reduced_qubits_are_maximally_mixed_regression():
    """Explicit regression test requested by the standing instructions: a
    Bell state's individual qubits must appear maximally mixed even though
    the global state is pure and entangled."""
    response = _simulate(2, 0, BELL_OPS, engine="aer_statevector", include_state_analysis=True)
    assert response.status_code == 200
    state = response.json()["state_analysis"]
    assert state["global_metrics"]["is_pure"] is True
    for entry in state["per_qubit"]:
        assert entry["purity"] == pytest.approx(0.5, abs=1e-6)
        assert entry["bloch_vector"]["x"] == pytest.approx(0.0, abs=1e-6)
        assert entry["bloch_vector"]["y"] == pytest.approx(0.0, abs=1e-6)
        assert entry["bloch_vector"]["z"] == pytest.approx(0.0, abs=1e-6)
        assert entry["is_mixed"] is True
    assert state["entanglement"]["concurrence"] == pytest.approx(1.0, abs=1e-6)


def test_ghz_state_all_qubits_maximally_mixed():
    ops = [
        {"gate": "h", "qubits": [0], "moment": 0},
        {"gate": "cx", "qubits": [0, 1], "moment": 1},
        {"gate": "cx", "qubits": [0, 2], "moment": 2},
    ]
    response = _simulate(3, 0, ops, engine="aer_statevector", include_state_analysis=True)
    assert response.status_code == 200
    state = response.json()["state_analysis"]
    assert len(state["per_qubit"]) == 3
    for entry in state["per_qubit"]:
        assert entry["purity"] == pytest.approx(0.5, abs=1e-6)


def test_single_qubit_reference_states_bloch_vectors():
    # |+> = H|0>
    response = _simulate(1, 0, [{"gate": "h", "qubits": [0], "moment": 0}], engine="aer_statevector", include_state_analysis=True)
    entry = response.json()["state_analysis"]["per_qubit"][0]
    assert (entry["bloch_vector"]["x"], entry["bloch_vector"]["y"], entry["bloch_vector"]["z"]) == pytest.approx((1.0, 0.0, 0.0), abs=1e-6)

    # |1> = X|0>
    response = _simulate(1, 0, [{"gate": "x", "qubits": [0], "moment": 0}], engine="aer_statevector", include_state_analysis=True)
    entry = response.json()["state_analysis"]["per_qubit"][0]
    assert (entry["bloch_vector"]["x"], entry["bloch_vector"]["y"], entry["bloch_vector"]["z"]) == pytest.approx((0.0, 0.0, -1.0), abs=1e-6)


def test_state_detail_levels():
    summary = _simulate(2, 0, BELL_OPS, engine="aer_statevector", include_state_analysis=True, state_detail="summary").json()["state_analysis"]
    assert summary["amplitudes"] is None
    assert summary["top_states"] is not None

    top = _simulate(2, 0, BELL_OPS, engine="aer_statevector", include_state_analysis=True, state_detail="top_amplitudes", top_k_states=1).json()["state_analysis"]
    assert top["amplitudes"] is not None
    assert len(top["amplitudes"]) <= 1

    full = _simulate(2, 0, BELL_OPS, engine="aer_statevector", include_state_analysis=True, state_detail="full").json()["state_analysis"]
    assert len(full["amplitudes"]) == 4


# ---------------------------------------------------------------------------
# aer_mps
# ---------------------------------------------------------------------------


def test_mps_state_analysis_matches_exact_for_small_circuit():
    response = _simulate(2, 0, BELL_OPS, engine="aer_mps", include_state_analysis=True)
    assert response.status_code == 200
    state = response.json()["state_analysis"]
    assert state["available"] is True
    assert state["source_engine"] == "aer_mps"
    assert state["entanglement"]["concurrence"] == pytest.approx(1.0, abs=1e-6)


def test_mps_state_analysis_flags_configured_truncation():
    response = _simulate(2, 0, BELL_OPS, engine="aer_mps", include_state_analysis=True, mps_max_bond_dimension=2, allow_approximation=True)
    assert response.status_code == 200
    state = response.json()["state_analysis"]
    assert state["available"] is True
    assert any("approximate" in w.lower() for w in state["warnings"])


# ---------------------------------------------------------------------------
# aer_density_matrix
# ---------------------------------------------------------------------------


def test_density_matrix_state_analysis_noiseless_is_pure():
    response = _simulate(2, 0, BELL_OPS, engine="aer_density_matrix", include_state_analysis=True, include_density_matrix=True)
    assert response.status_code == 200
    state = response.json()["state_analysis"]
    assert state["available"] is True
    assert state["representation"] == "density_matrix"
    assert state["global_metrics"]["is_pure"] is True
    assert state["density_matrix"] is not None
    assert len(state["density_matrix"]) == 4


def test_density_matrix_state_analysis_noisy_is_mixed():
    response = _simulate(2, 0, BELL_OPS, engine="aer_density_matrix", include_state_analysis=True, noise_enabled=True)
    assert response.status_code == 200
    state = response.json()["state_analysis"]
    assert state["available"] is True
    assert state["global_metrics"]["purity"] < 1.0
    assert state["global_metrics"]["is_pure"] is False
    assert state["semantic_point"] == "mixed_final_state"


def test_density_matrix_payload_omitted_without_explicit_request():
    response = _simulate(2, 0, BELL_OPS, engine="aer_density_matrix", include_state_analysis=True, include_density_matrix=False)
    state = response.json()["state_analysis"]
    assert state["available"] is True
    assert state["density_matrix"] is None
    # Metrics remain available even without the raw payload.
    assert state["global_metrics"]["purity"] == pytest.approx(1.0, abs=1e-6)


# ---------------------------------------------------------------------------
# Stabilizer engines: structured summary, never a full statevector
# ---------------------------------------------------------------------------


def test_aer_stabilizer_state_analysis_is_generator_summary_not_statevector():
    response = _simulate(2, 0, BELL_OPS, engine="aer_stabilizer", include_state_analysis=True)
    assert response.status_code == 200
    state = response.json()["state_analysis"]
    assert state["available"] is True
    assert state["representation"] == "stabilizer_summary"
    assert state["amplitudes"] is None
    generators = state["global_metrics"]["stabilizer_generators"]
    assert len(generators) == 2
    assert any("XX" in g for g in generators)
    assert any("ZZ" in g for g in generators)


@pytest.mark.skipif(not stim_available(), reason="stim is not installed in this environment")
def test_stim_stabilizer_state_analysis_matches_aer_stabilizer():
    response = _simulate(2, 0, BELL_OPS, engine="stim_stabilizer", include_state_analysis=True)
    assert response.status_code == 200
    state = response.json()["state_analysis"]
    assert state["available"] is True
    assert state["representation"] == "stabilizer_summary"
    generators = state["global_metrics"]["stabilizer_generators"]
    assert len(generators) == 2
    assert any("XX" in g for g in generators)
    assert any("ZZ" in g for g in generators)


# ---------------------------------------------------------------------------
# Custom (matrix / "unitary") gate compatibility
# ---------------------------------------------------------------------------


def test_state_analysis_works_with_a_unitary_gate():
    pauli_x = [[[0, 0], [1, 0]], [[1, 0], [0, 0]]]
    ops = [
        {"gate": "h", "qubits": [0], "moment": 0},
        {"gate": "unitary", "qubits": [1], "moment": 0, "matrix": pauli_x, "label": "PX"},
        {"gate": "cx", "qubits": [0, 1], "moment": 1},
    ]
    response = _simulate(2, 0, ops, engine="aer_statevector", include_state_analysis=True)
    assert response.status_code == 200
    state = response.json()["state_analysis"]
    assert state["available"] is True
    assert state["normalized"] is True


# ---------------------------------------------------------------------------
# Response-size limits are enforced server-side regardless of request
# ---------------------------------------------------------------------------


def test_max_returned_amplitudes_is_clamped_server_side():
    response = _simulate(2, 0, BELL_OPS, engine="aer_statevector", include_state_analysis=True, state_detail="full", max_returned_amplitudes=999_999_999)
    assert response.status_code == 422  # rejected by Pydantic's own Field(le=4096)


def test_top_k_states_is_clamped_server_side():
    response = _simulate(2, 0, BELL_OPS, engine="aer_statevector", include_state_analysis=True, top_k_states=999_999)
    assert response.status_code == 422  # rejected by Pydantic's own Field(le=200)
