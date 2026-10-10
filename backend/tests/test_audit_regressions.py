"""Regressions for the correctness, isolation, and resource-safety audit."""
import math
import subprocess

import numpy as np
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from qiskit import QuantumCircuit
from qiskit.quantum_info import Operator
from qiskit_aer import AerSimulator

from engines.preparation import lower_for_aer, add_automatic_measurements, normalized_counts, measurement_metadata
from engines.limits import enforce_options
from engines.base import InfeasibleCircuitError, stim_available
from schemas import AdvancedCircuitRequest, SimulationOptions


@pytest.mark.parametrize("gate", ["ch", "iswap", "dcx"])
def test_advertised_gates_are_lowered_without_changing_the_unitary(gate):
    circuit = QuantumCircuit(2)
    getattr(circuit, gate)(0, 1)
    lowered = lower_for_aer(circuit, AerSimulator(method="statevector"))
    assert Operator(circuit).equiv(Operator(lowered))
    lowered.measure_all()
    assert sum(normalized_counts(AerSimulator().run(lowered, shots=8).result(), lowered).values()) == 8


@pytest.mark.parametrize("gate", ["rx", "ry", "rz", "p"])
def test_clifford_rotations_lower_to_stabilizer_basis(gate):
    circuit = QuantumCircuit(1)
    getattr(circuit, gate)(math.pi / 2, 0)
    lowered = lower_for_aer(circuit, AerSimulator(method="stabilizer"))
    assert Operator(circuit).equiv(Operator(lowered))
    lowered.measure_all()
    assert AerSimulator(method="stabilizer").run(lowered, shots=8).result().success


@pytest.mark.parametrize("clbits,expected", [(0, "01"), (2, "01"), (4, "0001")])
def test_automatic_counts_use_flat_classical_bit_order(clbits, expected):
    circuit = QuantumCircuit(2, clbits)
    circuit.x(0)
    add_automatic_measurements(circuit)
    result = AerSimulator().run(circuit, shots=8).result()
    assert normalized_counts(result, circuit) == {expected: 8}


def test_explicit_measurement_contract_tracks_permuted_and_unused_bits():
    request = AdvancedCircuitRequest(num_qubits=2, num_clbits=3, operations=[
        {"gate": "measure", "qubits": [0], "clbits": [2], "moment": 0},
        {"gate": "measure", "qubits": [1], "clbits": [0], "moment": 1},
    ])
    assert measurement_metadata(request)["classical_to_qubit"] == [1, None, 0]


def test_client_cannot_raise_server_memory_budget(monkeypatch):
    monkeypatch.setenv("QUANTUM_COMPOSER_MAX_MEMORY_MB", "256")
    circuit = AdvancedCircuitRequest(num_qubits=2, num_clbits=0, operations=[])
    assert enforce_options(circuit, SimulationOptions(max_memory_mb=16384)).max_memory_mb == 128


def test_repeated_measurements_are_included_in_sampling_work():
    circuit = AdvancedCircuitRequest(num_qubits=1, num_clbits=1, operations=[
        {"gate": "measure", "qubits": [0], "clbits": [0], "moment": i} for i in range(200)])
    with pytest.raises(InfeasibleCircuitError, match="bit-record"):
        enforce_options(circuit, SimulationOptions(shots=100_000))


@pytest.mark.skipif(not stim_available(), reason="optional Stim not installed")
def test_stim_tableau_includes_idle_qubits():
    from engines.stim_stabilizer import _stabilizer_generators
    assert _stabilizer_generators([], 3) == ["+IIZ", "+IZI", "+ZII"]


def test_density_analysis_skips_large_global_spectrum(monkeypatch):
    from analysis.state_postprocessing import density_matrix_analysis
    original = np.linalg.eigvalsh
    def bounded(matrix):
        assert matrix.shape[0] <= 256, "unbounded cubic spectrum computation"
        return original(matrix)
    monkeypatch.setattr(np.linalg, "eigvalsh", bounded)
    rho = np.zeros((512, 512), dtype=complex)
    rho[0, 0] = 1
    result = density_matrix_analysis(rho, 9, semantic_point="mixed_final_state", source_engine="aer_density_matrix", include_full_matrix=False)
    assert result["global_metrics"]["purity"] == pytest.approx(1)
    assert result["global_metrics"]["von_neumann_entropy_bits"] is None


def test_bb84_never_emits_key_for_fully_corrupted_channel():
    from crypto.bb84 import simulate_bb84
    from crypto.privacy_amplification import secure_key_length
    assert secure_key_length(256, 1.0) == 0
    result = simulate_bb84(256, channel_error_rate=1, seed=7)
    assert result["protocol_status"] == "aborted"
    assert result["final_key_length"] == 0


def test_account_state_is_session_scoped(monkeypatch):
    from hardware import ibm_service
    monkeypatch.setattr(ibm_service, "_sessions", {})
    a, b = ibm_service.session_state("a" * 64), ibm_service.session_state("b" * 64)
    a.service = object()
    assert b.service is None
    assert ibm_service.session_state("a" * 64).service is a.service
    assert ibm_service.session_state(None).service is None


def test_validation_response_does_not_echo_credentials():
    from main import app
    secret = "not-a-valid-channel-sensitive-secret"
    response = TestClient(app).post("/hardware/connect", headers={"X-Quantum-Session": "c" * 64},
                                    json={"token": "private-token", "channel": secret})
    assert response.status_code == 422
    assert secret not in response.text
    assert "private-token" not in response.text
    assert "input" not in response.text


def test_deadline_kills_worker_and_releases_admission_slot(monkeypatch):
    import execution
    class Process:
        returncode = None
        killed = False
        def communicate(self, *args, **kwargs):
            if not self.killed:
                raise subprocess.TimeoutExpired("worker", 1)
            self.returncode = -9
            return "", ""
        def kill(self): self.killed = True
        def poll(self): return self.returncode
        def wait(self): self.returncode = -9
    process = Process()
    monkeypatch.setattr(execution.subprocess, "Popen", lambda *a, **k: process)
    import threading
    slots = threading.BoundedSemaphore(1)
    monkeypatch.setattr(execution, "_slots", slots)
    with pytest.raises(HTTPException) as error:
        execution.execute("v2", {})
    assert error.value.status_code == 408 and process.killed
    assert slots.acquire(blocking=False)
    slots.release()


def test_full_worker_pool_rejects_without_starting_process(monkeypatch):
    import execution
    import threading
    slots = threading.BoundedSemaphore(1)
    slots.acquire()
    monkeypatch.setattr(execution, "_slots", slots)
    with pytest.raises(HTTPException) as error:
        execution.execute("v2", {})
    assert error.value.status_code == 429

@pytest.mark.parametrize("engine", ["aer_statevector", "aer_mps", "aer_stabilizer", "stim_stabilizer"])
def test_explicit_engines_never_silently_ignore_noise(engine):
    from engines.router import simulate
    circuit = AdvancedCircuitRequest(num_qubits=1, num_clbits=0, operations=[])
    with pytest.raises(InfeasibleCircuitError, match="noise will not be ignored"):
        simulate(circuit, SimulationOptions(engine=engine, noise_enabled=True))


def test_logical_swap_is_not_subtracted_from_actual_routing_overhead():
    from hardware.schemas import GenericTargetSource, TranspileOptions
    from hardware.describe import resolve_target
    from hardware.transpilation import _run_pass_manager
    circuit = QuantumCircuit(3)
    circuit.swap(0, 1)
    circuit.cx(0, 2)
    target, _ = resolve_target(GenericTargetSource(kind="generic", topology="line", num_qubits=3, noise=False))
    _, swaps, _ = _run_pass_manager(circuit, target, TranspileOptions(optimization_level=0, initial_layout=[0, 1, 2], routing_method="basic", seed=1))
    assert len(swaps) == 1


def test_resolved_target_crosses_worker_boundary_without_account_state():
    from execution import execute
    from hardware.schemas import GenericTargetSource
    from hardware.describe import resolve_target
    target, metadata = resolve_target(GenericTargetSource(kind="generic", topology="line", num_qubits=2, noise=False))
    payload = {"circuit": {"kind": "qasm2", "text": "OPENQASM 2.0; include \"qelib1.inc\"; qreg q[2]; h q[0]; cx q[0],q[1];"},
               "target": {"kind": "ibm", "name": "private-test-backend"}, "options": {"optimization_level": 0}}
    result = execute("hardware_transpile", payload, trusted_targets={0: (target, metadata)})
    assert result["transpiled"]["two_qubit_gates"] == 1


def test_qasm_import_rejects_local_filesystem_includes():
    from hardware.schemas import QasmCircuitSource
    from hardware.circuits import circuit_from_source, CircuitImportError
    with pytest.raises(CircuitImportError, match="standard QASM"):
        circuit_from_source(QasmCircuitSource(kind="qasm2", text='OPENQASM 2.0; include "/tmp/private.inc"; qreg q[1];'))


def test_e91_marks_missing_setting_samples_insufficient():
    from crypto.e91 import simulate_e91
    result = simulate_e91(1, seed=1)
    assert result["chsh_status"] == "insufficient_data"
    assert result["chsh_standard_error"] is None
    assert result["chsh_violation"] is False


def test_bb84_disclosed_bits_do_not_enter_the_hash(monkeypatch):
    from crypto import bb84
    from crypto.privacy_amplification import privacy_amplify
    captured = []
    def capture(bits, *args, **kwargs):
        captured.extend(bits)
        return privacy_amplify(bits, *args, **kwargs)
    monkeypatch.setattr(bb84, "privacy_amplify", capture)
    result = bb84.simulate_bb84(256, seed=7)
    positions = set(result["parameter_estimation"]["sample_positions"])
    expected = [bit for index, bit in enumerate(result["sifted_key_alice"]) if index not in positions]
    assert captured == expected
    assert len(captured) < result["sifted_key_length"]


def test_disconnect_does_not_clear_another_http_account_session(monkeypatch):
    from main import app
    from hardware import ibm_service, routes
    import qiskit_ibm_runtime
    from collections import defaultdict, deque
    class Provider:
        def __init__(self, **kwargs): pass
        def backends(self): return []
    monkeypatch.setattr(qiskit_ibm_runtime, "QiskitRuntimeService", Provider)
    monkeypatch.setattr(ibm_service, "_sessions", {})
    monkeypatch.setattr(routes, "_attempts", defaultdict(deque))
    client = TestClient(app)
    a, b = {"X-Quantum-Session": "d" * 64}, {"X-Quantum-Session": "e" * 64}
    for headers in (a, b):
        response = client.post("/hardware/connect", headers=headers, json={"token": "mock-credential", "channel": "ibm_quantum_platform"})
        assert response.status_code == 200, response.text
        assert response.json()["connected"] is True
    assert client.post("/hardware/disconnect", headers=a).json()["connected"] is False
    assert client.get("/hardware/status", headers=b).json()["connected"] is True
    assert client.get("/hardware/status").json()["connected"] is False
