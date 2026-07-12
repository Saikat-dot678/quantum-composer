"""Tests for circuit analysis and the honest resource estimator."""

import math

from fastapi.testclient import TestClient

from analysis.circuit_analyzer import analyze_circuit
from analysis.resource_estimator import estimate_resources, feasibility_from_log2_bytes
from main import app
from schemas import CircuitOperation

client = TestClient(app)


def _ops(raw):
    return [CircuitOperation(**op) for op in raw]


def test_resource_estimator_statevector_memory_exact():
    # 30 qubits -> 16 * 2**30 bytes == 16 GiB.
    est = estimate_resources(30)
    assert est["statevector_memory_bytes"] == 16 * 2**30
    assert est["statevector_memory_human"] == "16.00 GB"


def test_resource_estimator_density_matrix_memory_exact():
    # Density matrix stores 16 * 4**n bytes, far worse than the statevector.
    est = estimate_resources(20)
    assert est["density_matrix_memory_bytes"] == 16 * 4**20
    assert est["density_matrix_memory_mb"] == (16 * 4**20) / (1024 * 1024)


def test_resource_estimator_handles_astronomical_sizes():
    # 100 qubits overflows float; mb must be None but the human string is present.
    est = estimate_resources(100)
    assert est["statevector_memory_mb"] is not None  # ~1.9e25 MB still fits a float
    est_dm = estimate_resources(1000)
    assert est_dm["density_matrix_memory_mb"] is None
    assert "e+" in est_dm["density_matrix_memory_human"]


def test_feasibility_labels():
    # 2 qubits vs 1 GB budget -> safe; 100 qubits -> infeasible.
    small = feasibility_from_log2_bytes(4 + 2, 1024)
    huge = feasibility_from_log2_bytes(4 + 100, 1024)
    assert small == "safe"
    assert huge == "infeasible"


def test_analyze_bell_circuit_is_clifford():
    analysis = analyze_circuit(
        num_qubits=2,
        num_clbits=2,
        operations=_ops(
            [
                {"gate": "h", "qubits": [0]},
                {"gate": "cx", "qubits": [0, 1]},
                {"gate": "measure", "qubits": [0], "clbits": [0]},
                {"gate": "measure", "qubits": [1], "clbits": [1]},
            ]
        ),
    )
    assert analysis["is_clifford"] is True
    assert analysis["contains_non_clifford"] is False
    assert analysis["t_count"] == 0
    assert analysis["two_qubit_gate_count"] == 1
    assert "aer_stabilizer" in analysis["recommended_engines"]


def test_analyze_non_clifford_circuit():
    analysis = analyze_circuit(
        num_qubits=2,
        num_clbits=0,
        operations=_ops(
            [
                {"gate": "h", "qubits": [0]},
                {"gate": "t", "qubits": [0]},
                {"gate": "rx", "qubits": [1], "params": {"theta": math.pi / 3}},
            ]
        ),
    )
    assert analysis["is_clifford"] is False
    assert analysis["contains_non_clifford"] is True
    assert analysis["t_count"] == 1
    assert analysis["rotation_count"] == 1


def test_rotation_at_clifford_angle_stays_clifford():
    analysis = analyze_circuit(
        num_qubits=1,
        num_clbits=0,
        operations=_ops([{"gate": "rz", "qubits": [0], "params": {"theta": math.pi / 2}}]),
    )
    # rz(pi/2) is Clifford (equivalent to S up to phase).
    assert analysis["is_clifford"] is True
    assert analysis["rotation_count"] == 1


def test_analyze_endpoint_large_clifford_reports_scalable():
    ops = [{"gate": "h", "qubits": [0], "moment": 0}]
    ops += [{"gate": "cx", "qubits": [i, i + 1], "moment": i + 1} for i in range(199)]
    response = client.post(
        "/circuit/analyze",
        json={"num_qubits": 200, "num_clbits": 0, "shots": 100, "operations": ops},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["is_clifford"] is True
    assert body["feasibility_status"] == "clifford_scalable"
    # 200 qubits is astronomically large: the human string uses scientific notation.
    assert "e+" in body["estimated_statevector_memory_human"]


def test_analyzer_stable_sorts_visual_moments_before_depth():
    # Raw list order deliberately differs from visual/execution order. Without
    # the stable moment sort this sequence greedily reports depth 4 instead of 3.
    operations = _ops(
        [
            {"gate": "x", "qubits": [0], "moment": 0},
            {"gate": "cx", "qubits": [0, 1], "moment": 1},
            {"gate": "x", "qubits": [0], "moment": 2},
            {"gate": "x", "qubits": [1], "moment": 0},
            {"gate": "x", "qubits": [1], "moment": 2},
        ]
    )
    analysis = analyze_circuit(
        num_qubits=2,
        num_clbits=0,
        operations=operations,
    )
    assert analysis["depth"] == 3
