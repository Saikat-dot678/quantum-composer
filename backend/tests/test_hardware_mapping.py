"""Hardware Mapping contract, security, and transpilation regressions.

No test contacts IBM Quantum or requires a saved account.  Provider behavior
is mocked; offline generic/manual targets exercise real Qiskit transpilation.
"""

from __future__ import annotations

import base64
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from hardware import ibm_service
from hardware.schemas import (
    BackendSummary,
    GenericTargetSource,
    ManualEdge,
    ManualHardwareDefinition,
    ManualTargetSource,
)
from hardware.targets import build_manual_target
from main import app


client = TestClient(app)


def circuit_source(operations=None, *, num_qubits=3, num_clbits=0):
    return {
        "kind": "json",
        "circuit": {
            "num_qubits": num_qubits,
            "num_clbits": num_clbits,
            "shots": 256,
            "operations": operations
            or [
                {"gate": "h", "qubits": [0], "clbits": [], "params": {}, "moment": 0},
                {"gate": "cx", "qubits": [0, 2], "clbits": [], "params": {}, "moment": 1},
            ],
        },
    }


def generic_target(qubits=5, topology="line"):
    return {"kind": "generic", "topology": topology, "num_qubits": qubits, "seed": 42, "noise": True}


def test_manual_definition_rejects_duplicate_and_out_of_bounds_edges():
    with pytest.raises(ValidationError, match="duplicate edge"):
        ManualHardwareDefinition(
            name="bad",
            num_qubits=2,
            edges=[ManualEdge(control=0, target=1), ManualEdge(control=0, target=1)],
            basis_gates=["rz", "sx", "cx"],
        )
    with pytest.raises(ValidationError, match="outside"):
        ManualHardwareDefinition(
            name="bad",
            num_qubits=2,
            edges=[ManualEdge(control=0, target=2)],
            basis_gates=["rz", "sx", "cx"],
        )


def test_manual_definition_validates_coordinate_and_property_counts():
    body = {
        "name": "bad coordinates",
        "num_qubits": 2,
        "edges": [{"control": 0, "target": 1}],
        "basis_gates": ["rz", "sx", "cx"],
        "coordinates": [{"x": 0, "y": 0}],
    }
    response = client.post("/hardware/target/describe", json={"target": {"kind": "manual", "definition": body}})
    assert response.status_code == 422
    assert "coordinates" in response.text


def test_directed_manual_coupling_is_not_silently_mirrored():
    definition = ManualHardwareDefinition(
        name="directed",
        num_qubits=3,
        edges=[ManualEdge(control=0, target=1), ManualEdge(control=1, target=2)],
        undirected=False,
        basis_gates=["rz", "sx", "x", "cx"],
    )
    target = build_manual_target(definition)
    assert set(target.build_coupling_map().get_edges()) == {(0, 1), (1, 2)}


def test_manual_target_round_trip_description_preserves_calibration_metadata():
    definition = {
        "format": "quantum-composer-hardware",
        "version": 1,
        "name": "Teaching line",
        "num_qubits": 3,
        "edges": [
            {"control": 0, "target": 1, "two_qubit_error": 0.02, "gate_duration_ns": 320},
            {"control": 1, "target": 2, "two_qubit_error": 0.03, "gate_duration_ns": 340},
        ],
        "undirected": True,
        "basis_gates": ["rz", "sx", "x", "cx"],
        "qubit_properties": [
            {"readout_error": 0.01, "t1_us": 100, "t2_us": 80},
            {"readout_error": 0.02, "t1_us": 90, "t2_us": 75},
            {"readout_error": 0.03, "t1_us": 95, "t2_us": 70},
        ],
        "calibration_timestamp": "2026-07-17T00:00:00Z",
    }
    response = client.post("/hardware/target/describe", json={"target": {"kind": "manual", "definition": definition}})
    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["name"] == "Teaching line"
    assert payload["summary"]["calibration_timestamp"] == "2026-07-17T00:00:00Z"
    assert payload["qubit_calibrations"][1]["readout_error"] == pytest.approx(0.02)
    assert any(edge["error"] == pytest.approx(0.03) for edge in payload["edge_calibrations"])


def test_openqasm_2_import_and_python_rejection():
    qasm = 'OPENQASM 2.0; include "qelib1.inc"; qreg q[2]; h q[0]; cx q[0],q[1];'
    response = client.post("/hardware/circuit/import", json={"source": {"kind": "qasm2", "text": qasm}})
    assert response.status_code == 200
    imported = response.json()
    assert imported["metrics"]["two_qubit_gates"] == 1
    assert b"<svg" in base64.b64decode(imported["circuit_diagram"]["content"])[:1024]

    python_source = "from qiskit import QuantumCircuit\nqc = QuantumCircuit(2)"
    rejected = client.post(
        "/hardware/circuit/import", json={"source": {"kind": "qasm2", "text": python_source}}
    )
    assert rejected.status_code == 422
    assert "never executed" in rejected.json()["detail"]


def test_restrictive_topology_reports_layout_and_inserted_swaps():
    response = client.post(
        "/hardware/transpile",
        json={
            "circuit": circuit_source(),
            "target": generic_target(),
            "options": {
                "optimization_level": 0,
                "seed": 42,
                "initial_layout": [0, 1, 4],
                "routing_method": "sabre",
            },
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["layout"]["initial"] == [0, 1, 4]
    assert payload["layout"]["final"] != payload["layout"]["initial"]
    assert payload["transpiled"]["swap_count"] >= 1
    assert len(payload["routing_swaps"]) == payload["transpiled"]["swap_count"]
    assert payload["transpiled"]["depth"] >= payload["original"]["depth"]
    assert b"<svg" in base64.b64decode(payload["original_circuit_diagram"]["content"])[:1024]
    assert b"<svg" in base64.b64decode(payload["transpiled_circuit_diagram"]["content"])[:1024]


def test_custom_matrix_unitary_is_synthesized_for_target():
    x_matrix = [[[0.0, 0.0], [1.0, 0.0]], [[1.0, 0.0], [0.0, 0.0]]]
    operations = [
        {
            "gate": "unitary",
            "qubits": [0],
            "clbits": [],
            "params": {},
            "moment": 0,
            "matrix": x_matrix,
            "label": "custom-x",
        }
    ]
    response = client.post(
        "/hardware/transpile",
        json={
            "circuit": circuit_source(operations, num_qubits=1),
            "target": generic_target(2),
            "options": {"optimization_level": 1, "seed": 7},
        },
    )
    assert response.status_code == 200, response.text
    assert "unitary" not in response.json()["transpiled"]["gate_counts"]


def test_invalid_initial_layout_and_insufficient_capacity_are_clear():
    duplicate = client.post(
        "/hardware/transpile",
        json={
            "circuit": circuit_source(),
            "target": generic_target(),
            "options": {"initial_layout": [0, 0, 1]},
        },
    )
    assert duplicate.status_code == 422
    assert "same physical" in duplicate.json()["detail"]

    too_small = client.post(
        "/hardware/transpile",
        json={
            "circuit": circuit_source(num_qubits=4),
            "target": generic_target(2),
            "options": {},
        },
    )
    assert too_small.status_code == 422
    assert "needs 4 logical qubits" in too_small.json()["detail"]


def test_backend_comparison_is_transparent_and_does_not_rank_by_queue():
    response = client.post(
        "/hardware/compare",
        json={
            "circuit": circuit_source(),
            "targets": [generic_target(5, "line"), generic_target(5, "full")],
            "options": {"optimization_level": 1, "seed": 42},
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert len(payload["entries"]) == 2
    assert payload["recommendation"]
    assert "1000 x inserted SWAPs" in payload["recommendation_reason"]
    assert "Queue length" in payload["recommendation_reason"]
    assert "not a certified" in payload["recommendation_caveat"]


def _reset_ibm_state(monkeypatch):
    monkeypatch.setattr(ibm_service, "_service", None)
    monkeypatch.setattr(ibm_service, "_connection_mode", "none")
    monkeypatch.setattr(ibm_service, "_instance_hint", None)
    monkeypatch.setattr(ibm_service, "_account_error", None)


def test_no_credentials_returns_redacted_discovery_state(monkeypatch):
    _reset_ibm_state(monkeypatch)
    monkeypatch.delenv("IBM_QUANTUM_API_KEY", raising=False)
    monkeypatch.setattr(ibm_service, "_has_saved_account", lambda: False)
    response = client.get("/hardware/backends?source=ibm")
    assert response.status_code == 503
    assert "No IBM Quantum account" in response.json()["detail"]
    assert "token" not in response.text.lower()


def test_invalid_credential_provider_message_never_leaks_token(monkeypatch, caplog):
    _reset_ibm_state(monkeypatch)
    secret = "very-secret-token-123456789"

    class RejectingService:
        def __init__(self, **kwargs):
            raise RuntimeError(f"provider echoed {kwargs.get('token')}")

    import qiskit_ibm_runtime

    monkeypatch.setattr(qiskit_ibm_runtime, "QiskitRuntimeService", RejectingService)
    response = client.post(
        "/hardware/connect",
        json={"token": secret, "channel": "ibm_quantum_platform"},
        headers={"origin": "http://localhost:3000"},
    )
    assert response.status_code == 401
    assert secret not in response.text
    assert secret not in caplog.text
    assert "redacted" in response.text.lower()


def test_execution_is_explicitly_disabled_in_public_status():
    response = client.get("/hardware/status")
    assert response.status_code == 200
    assert response.json()["execution_enabled"] is False


def test_session_credentials_require_https_outside_localhost():
    external = TestClient(app, base_url="http://hardware.example")
    response = external.post(
        "/hardware/connect",
        json={"token": "not-a-real-token", "channel": "ibm_quantum_platform"},
    )
    assert response.status_code == 400
    assert "require HTTPS" in response.json()["detail"]


def test_mock_ibm_discovery_handles_no_backends_and_missing_optional_metadata(monkeypatch):
    _reset_ibm_state(monkeypatch)

    class EmptyService:
        def backends(self, **kwargs):
            return []

    monkeypatch.setattr(ibm_service, "_service", EmptyService())
    monkeypatch.setattr(ibm_service, "_connection_mode", "session")
    assert ibm_service.list_ibm_backends() == []

    source = GenericTargetSource(kind="generic", topology="line", num_qubits=3, seed=1, noise=False)
    from hardware.describe import resolve_target

    target, _ = resolve_target(source)
    backend = SimpleNamespace(
        name="ibm_mock",
        target=target,
        configuration=lambda: SimpleNamespace(processor_type={"family": "MockFamily"}),
        status=lambda: SimpleNamespace(operational=True, pending_jobs=None),
        properties=lambda: None,
    )

    class OneBackendService:
        def backends(self, **kwargs):
            return [backend]

    monkeypatch.setattr(ibm_service, "_service", OneBackendService())
    summaries = ibm_service.list_ibm_backends()
    assert len(summaries) == 1
    assert summaries[0].name == "ibm_mock"
    assert summaries[0].processor_family == "MockFamily"
    assert summaries[0].calibration_timestamp is None


def test_fake_discovery_endpoint_is_mocked_for_ci(monkeypatch):
    from hardware import routes

    fixture = BackendSummary(
        source="fake",
        name="fake_fez",
        num_qubits=156,
        basis_gates=["cz", "rz", "sx", "x"],
        simulator=True,
        dynamic_circuits=True,
        description="Static test fixture.",
    )
    monkeypatch.setattr(routes, "fake_provider_available", lambda: True)
    monkeypatch.setattr(routes, "list_fake_backends", lambda: [fixture])
    response = client.get("/hardware/backends?source=fake&min_qubits=100&required_instruction=cz")
    assert response.status_code == 200
    assert response.json()["backends"][0]["name"] == "fake_fez"

    fixture.pending_jobs = 12
    filtered = client.get("/hardware/backends?source=fake&max_pending_jobs=10")
    assert filtered.status_code == 200
    assert filtered.json()["backends"] == []


def test_installed_fake_target_description_normalizes_processor_metadata():
    from hardware.availability import fake_provider_available
    from hardware.describe import list_fake_backends

    if not fake_provider_available():
        pytest.skip("Optional qiskit-ibm-runtime fake provider is not installed.")
    candidates = [summary for summary in list_fake_backends() if 2 <= summary.num_qubits <= 10]
    assert candidates
    response = client.post(
        "/hardware/target/describe",
        json={"target": {"kind": "fake", "name": candidates[0].name}},
    )
    assert response.status_code == 200, response.text
    processor_family = response.json()["summary"]["processor_family"]
    assert processor_family is None or isinstance(processor_family, str)


def test_unavailable_requested_fake_backend_is_a_clear_client_error():
    response = client.post(
        "/hardware/target/describe",
        json={"target": {"kind": "fake", "name": "fake_definitely_not_installed"}},
    )
    assert response.status_code == 422
    assert "No fake backend named" in response.json()["detail"]
