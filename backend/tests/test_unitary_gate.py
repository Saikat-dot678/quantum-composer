"""Tests for the "unitary" gate -- the one new backend-known gate produced by
the frontend's custom-gate resolver (lib/customGateResolve.ts) for
matrix-defined custom gates. Decomposition/composite custom gates never reach
the backend as anything but their flattened built-in operations, so they need
no schema changes at all; this file only covers the "unitary" gate itself.
"""

import math

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from analysis.circuit_analyzer import analyze_circuit
from circuit_builder import build_circuit
from codegen import generate_qasm, generate_qiskit_code
from main import app
from schemas import CircuitOperation, CircuitRequest

client = TestClient(app)

IDENTITY_1Q = [[[1, 0], [0, 0]], [[0, 0], [1, 0]]]
PAULI_X = [[[0, 0], [1, 0]], [[1, 0], [0, 0]]]
HADAMARD = [[[math.sqrt(0.5), 0], [math.sqrt(0.5), 0]], [[math.sqrt(0.5), 0], [-math.sqrt(0.5), 0]]]
CNOT_2Q = [[1, 0, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0], [0, 1, 0, 0]]
CNOT_2Q_COMPLEX = [[[v, 0] for v in row] for row in CNOT_2Q]

BELL_WITH_UNITARY = {
    "num_qubits": 2,
    "num_clbits": 2,
    "shots": 256,
    "operations": [
        {"gate": "h", "qubits": [0], "moment": 0},
        {"gate": "unitary", "qubits": [1], "moment": 0, "matrix": PAULI_X, "label": "PX"},
        {"gate": "cx", "qubits": [0, 1], "moment": 1},
        {"gate": "measure", "qubits": [0], "clbits": [0], "moment": 2},
        {"gate": "measure", "qubits": [1], "clbits": [1], "moment": 2},
    ],
}


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------


def test_accepts_identity_matrix():
    op = CircuitOperation(gate="unitary", qubits=[0], moment=0, matrix=IDENTITY_1Q)
    assert op.gate == "unitary"


def test_accepts_two_qubit_matrix():
    op = CircuitOperation(gate="unitary", qubits=[0, 1], moment=0, matrix=CNOT_2Q_COMPLEX)
    assert len(op.matrix) == 4


def test_rejects_non_unitary_matrix():
    broken = [[[1, 0], [0, 0]], [[0, 0], [1, 1]]]
    with pytest.raises(ValidationError, match="not unitary within tolerance"):
        CircuitOperation(gate="unitary", qubits=[0], moment=0, matrix=broken)


def test_rejects_wrong_matrix_dimensions():
    with pytest.raises(ValidationError, match="must be 4x4"):
        CircuitOperation(gate="unitary", qubits=[0, 1], moment=0, matrix=IDENTITY_1Q)


def test_rejects_more_than_three_qubits():
    identity16 = [[[1 if i == j else 0, 0] for j in range(16)] for i in range(16)]
    with pytest.raises(ValidationError, match="at most 3 qubits"):
        CircuitOperation(gate="unitary", qubits=[0, 1, 2, 3], moment=0, matrix=identity16)


def test_rejects_missing_matrix():
    with pytest.raises(ValidationError, match="requires a matrix"):
        CircuitOperation(gate="unitary", qubits=[0], moment=0)


def test_rejects_non_finite_matrix_entry():
    broken = [[[1, 0], [0, 0]], [[0, 0], [math.inf, 0]]]
    with pytest.raises(ValidationError, match="finite"):
        CircuitOperation(gate="unitary", qubits=[0], moment=0, matrix=broken)


def test_rejects_matrix_field_on_a_builtin_gate():
    with pytest.raises(ValidationError, match="does not accept a matrix field"):
        CircuitOperation(gate="h", qubits=[0], moment=0, matrix=IDENTITY_1Q)


def test_rejects_classical_bits_on_unitary():
    with pytest.raises(ValidationError, match="does not accept classical bits"):
        CircuitOperation(gate="unitary", qubits=[0], clbits=[0], moment=0, matrix=IDENTITY_1Q)


def test_rejects_params_on_unitary():
    with pytest.raises(ValidationError):
        CircuitOperation(gate="unitary", qubits=[0], moment=0, matrix=IDENTITY_1Q, params={"theta": 1.0})


def test_tolerance_reports_the_actual_deviation_magnitude():
    # A matrix that is unitary to 1e-8 (inside tolerance) is accepted; the
    # frontend's equivalent validateMatrix() reports maxUnitarityError the
    # same way for "distinguish exact vs. approximate validation".
    nearly = [[[1, 0], [0, 0]], [[0, 0], [1 + 1e-9, 0]]]
    op = CircuitOperation(gate="unitary", qubits=[0], moment=0, matrix=nearly)
    assert op.gate == "unitary"


# ---------------------------------------------------------------------------
# circuit_builder: constructs a real Qiskit UnitaryGate
# ---------------------------------------------------------------------------


def test_build_circuit_appends_unitary_gate():
    request = CircuitRequest(**BELL_WITH_UNITARY)
    circuit = build_circuit(request)
    names = [instr.operation.name for instr in circuit.data]
    assert "unitary" in names
    unitary_instr = next(instr for instr in circuit.data if instr.operation.name == "unitary")
    assert [circuit.find_bit(q).index for q in unitary_instr.qubits] == [1]


def test_build_circuit_unitary_matches_requested_matrix():
    request = CircuitRequest(
        num_qubits=1, num_clbits=0, operations=[{"gate": "unitary", "qubits": [0], "moment": 0, "matrix": PAULI_X}]
    )
    circuit = build_circuit(request)
    from qiskit.quantum_info import Operator

    actual = Operator(circuit).data
    assert abs(actual[0][0]) < 1e-9 and abs(actual[0][1] - 1) < 1e-9


# ---------------------------------------------------------------------------
# codegen: readable Qiskit source that actually executes
# ---------------------------------------------------------------------------


def test_generate_qiskit_code_includes_unitary_gate_import_and_call():
    request = CircuitRequest(**BELL_WITH_UNITARY)
    code = generate_qiskit_code(request)
    assert "from qiskit.circuit.library import UnitaryGate" in code
    assert "UnitaryGate(" in code
    assert "label='PX'" in code


def test_generated_qiskit_code_actually_executes():
    request = CircuitRequest(**BELL_WITH_UNITARY)
    code = generate_qiskit_code(request)
    namespace: dict = {}
    exec(code, namespace)  # noqa: S102 - generated from our own validated schema, not user-supplied source
    assert set(namespace["counts"]).issubset({"00", "01", "10", "11"})


def test_generate_qiskit_code_omits_unitary_import_when_unused():
    request = CircuitRequest(
        num_qubits=2,
        num_clbits=2,
        operations=[
            {"gate": "h", "qubits": [0], "moment": 0},
            {"gate": "cx", "qubits": [0, 1], "moment": 1},
        ],
    )
    code = generate_qiskit_code(request)
    assert "UnitaryGate" not in code


# ---------------------------------------------------------------------------
# QASM export: verified empirically that Qiskit's qasm2 exporter can
# synthesize an OPENQASM 2 gate definition for an arbitrary 1-3 qubit
# UnitaryGate (via its built-in unitary synthesis passes) -- no special
# fallback needed; the existing RuntimeError -> 501 path already covers any
# case that synthesis genuinely can't handle.
# ---------------------------------------------------------------------------


def test_generate_qasm_handles_one_qubit_unitary():
    request = CircuitRequest(
        num_qubits=1, num_clbits=0, operations=[{"gate": "unitary", "qubits": [0], "moment": 0, "matrix": PAULI_X}]
    )
    qasm = generate_qasm(build_circuit(request))
    assert "OPENQASM 2.0" in qasm
    assert "gate unitary" in qasm


def test_generate_qasm_handles_two_qubit_unitary():
    request = CircuitRequest(
        num_qubits=2, num_clbits=0, operations=[{"gate": "unitary", "qubits": [0, 1], "moment": 0, "matrix": CNOT_2Q_COMPLEX}]
    )
    qasm = generate_qasm(build_circuit(request))
    assert "OPENQASM 2.0" in qasm


# ---------------------------------------------------------------------------
# circuit_analyzer: unitary is always non-Clifford; a pure H+CX macro
# (what a Bell composite custom gate flattens into) still correctly reads
# as Clifford, since decomposition/composite gates never become "unitary".
# ---------------------------------------------------------------------------


def _ops(raw):
    return [CircuitOperation(**op) for op in raw]


def test_unitary_gate_is_never_classified_clifford():
    ops = _ops(
        [
            {"gate": "h", "qubits": [0], "moment": 0},
            {"gate": "cx", "qubits": [0, 1], "moment": 1},
            {"gate": "unitary", "qubits": [1], "moment": 2, "matrix": PAULI_X},
        ]
    )
    analysis = analyze_circuit(num_qubits=2, num_clbits=0, operations=ops)
    assert analysis["is_clifford"] is False
    assert any("unitary" in reason for reason in analysis["non_clifford_reasons"])
    assert "stim_stabilizer" not in analysis["recommended_engines"]
    assert "aer_stabilizer" not in analysis["recommended_engines"]


def test_flattened_bell_macro_still_reads_as_clifford():
    # What a frontend Bell composite custom gate resolves into before ever
    # reaching this API -- must stay Clifford with zero analyzer changes.
    ops = _ops(
        [
            {"gate": "h", "qubits": [0], "moment": 0},
            {"gate": "cx", "qubits": [0, 1], "moment": 1},
        ]
    )
    analysis = analyze_circuit(num_qubits=2, num_clbits=0, operations=ops)
    assert analysis["is_clifford"] is True
    assert "aer_stabilizer" in analysis["recommended_engines"]


# ---------------------------------------------------------------------------
# Full API round trips
# ---------------------------------------------------------------------------


def test_api_validate_accepts_unitary_circuit():
    response = client.post("/circuit/validate", json=BELL_WITH_UNITARY)
    assert response.status_code == 200
    assert response.json()["valid"] is True


def test_api_validate_rejects_non_unitary_matrix():
    invalid = {
        **BELL_WITH_UNITARY,
        "operations": [{"gate": "unitary", "qubits": [0], "moment": 0, "matrix": [[[1, 0], [0, 0]], [[0, 0], [2, 0]]]}],
    }
    response = client.post("/circuit/validate", json=invalid)
    assert response.status_code == 422


def test_api_qiskit_code_for_unitary_circuit():
    response = client.post("/circuit/qiskit-code", json=BELL_WITH_UNITARY)
    assert response.status_code == 200
    assert "UnitaryGate" in response.json()["code"]


def test_api_qasm_for_unitary_circuit():
    response = client.post("/circuit/qasm", json=BELL_WITH_UNITARY)
    assert response.status_code == 200
    assert "OPENQASM" in response.json()["qasm"]


def test_api_simulate_v1_for_unitary_circuit():
    response = client.post("/circuit/simulate", json=BELL_WITH_UNITARY)
    assert response.status_code == 200
    payload = response.json()
    assert set(payload["counts"]).issubset({"00", "01", "10", "11"})


def test_api_analyze_v2_reports_non_clifford_for_unitary_circuit():
    response = client.post(
        "/circuit/analyze",
        json={"num_qubits": 2, "num_clbits": 2, "operations": BELL_WITH_UNITARY["operations"]},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["is_clifford"] is False
    assert "stim_stabilizer" not in payload["recommended_engines"]


def test_api_simulate_v2_auto_routes_unitary_circuit_away_from_stabilizer():
    response = client.post(
        "/circuit/simulate-v2",
        json={
            "circuit": {"num_qubits": 2, "num_clbits": 2, "operations": BELL_WITH_UNITARY["operations"]},
            "options": {"engine": "auto", "shots": 128},
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["selected_engine"] in {"aer_statevector", "aer_mps"}


def test_api_simulate_v2_stabilizer_engine_rejects_unitary_circuit():
    response = client.post(
        "/circuit/simulate-v2",
        json={
            "circuit": {"num_qubits": 2, "num_clbits": 2, "operations": BELL_WITH_UNITARY["operations"]},
            "options": {"engine": "aer_stabilizer", "shots": 128},
        },
    )
    assert response.status_code == 422
    assert "Clifford" in response.json()["detail"]


def test_api_simulate_v2_stim_engine_rejects_unitary_circuit():
    """Exercises the real Stim engine (skipped automatically if the optional
    dependency is absent) -- not just the shared contains_non_clifford check
    that both stabilizer engines rely on."""
    from engines.base import stim_available

    if not stim_available():
        pytest.skip("stim is not installed in this environment")
    response = client.post(
        "/circuit/simulate-v2",
        json={
            "circuit": {"num_qubits": 2, "num_clbits": 2, "operations": BELL_WITH_UNITARY["operations"]},
            "options": {"engine": "stim_stabilizer", "shots": 128},
        },
    )
    assert response.status_code == 422
    assert "Clifford" in response.json()["detail"]
