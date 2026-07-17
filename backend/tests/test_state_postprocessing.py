"""Unit tests for analysis/state_postprocessing.py -- pure math, no Aer/Stim
dependency. Reference values (Bloch vectors, concurrence, Schmidt
coefficients) were independently verified by hand/numpy scratch scripts
before being encoded here; see the state-analysis audit section in
audit.md for the verification method.
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from analysis import state_postprocessing as sp

SQRT2 = math.sqrt(2.0)


def ket(*amps: complex) -> np.ndarray:
    return np.array(amps, dtype=complex)


def rho_from_pure(sv: np.ndarray) -> np.ndarray:
    return np.outer(sv, sv.conj())


# ---------------------------------------------------------------------------
# Basis labels / bit ordering
# ---------------------------------------------------------------------------


def test_basis_label_matches_frontend_convention():
    # qubit 0 is the least significant bit -> rightmost character.
    assert sp.basis_label(0, 2) == "00"
    assert sp.basis_label(1, 2) == "01"
    assert sp.basis_label(2, 2) == "10"
    assert sp.basis_label(3, 2) == "11"


# ---------------------------------------------------------------------------
# Reference single-qubit states -> Bloch vectors (exact table from the task)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "sv,expected",
    [
        (ket(1, 0), (0, 0, 1)),
        (ket(0, 1), (0, 0, -1)),
        (ket(1, 1) / SQRT2, (1, 0, 0)),
        (ket(1, -1) / SQRT2, (-1, 0, 0)),
        (ket(1, 1j) / SQRT2, (0, 1, 0)),
        (ket(1, -1j) / SQRT2, (0, -1, 0)),
    ],
)
def test_bloch_vector_reference_states(sv, expected):
    rho = rho_from_pure(sv)
    vector = sp.bloch_vector(rho)
    assert vector == pytest.approx(expected, abs=1e-9)
    assert sp.purity(rho) == pytest.approx(1.0, abs=1e-9)
    assert sp.von_neumann_entropy(rho) == pytest.approx(0.0, abs=1e-9)


def test_maximally_mixed_state():
    rho = np.eye(2, dtype=complex) / 2
    assert sp.bloch_vector(rho) == pytest.approx((0.0, 0.0, 0.0), abs=1e-9)
    assert sp.purity(rho) == pytest.approx(0.5, abs=1e-9)
    assert sp.von_neumann_entropy(rho) == pytest.approx(1.0, abs=1e-9)


def test_arbitrary_rotation_state_is_finite_and_normalized():
    theta, phi = 0.7, 1.3
    sv = ket(math.cos(theta / 2), complex(math.cos(phi), math.sin(phi)) * math.sin(theta / 2))
    rho = rho_from_pure(sv)
    x, y, z = sp.bloch_vector(rho)
    assert x * x + y * y + z * z == pytest.approx(1.0, abs=1e-9)


def test_global_phase_invariance_of_bloch_vector():
    sv = ket(1, 1) / SQRT2
    phased = sv * complex(math.cos(0.9), math.sin(0.9))
    assert sp.bloch_vector(rho_from_pure(sv)) == pytest.approx(sp.bloch_vector(rho_from_pure(phased)), abs=1e-9)


# ---------------------------------------------------------------------------
# Reduced density matrices / partial trace
# ---------------------------------------------------------------------------


def test_bell_state_reduces_to_maximally_mixed_on_each_qubit():
    bell = ket(1, 0, 0, 1) / SQRT2
    for qubit in (0, 1):
        rho1 = sp.reduced_density_matrix_from_statevector(bell, 2, qubit)
        assert sp.purity(rho1) == pytest.approx(0.5, abs=1e-9)
        assert sp.bloch_vector(rho1) == pytest.approx((0.0, 0.0, 0.0), abs=1e-9)


def test_ghz_state_reduces_to_maximally_mixed_on_each_qubit():
    ghz = np.zeros(8, dtype=complex)
    ghz[0] = 1 / SQRT2
    ghz[7] = 1 / SQRT2
    for qubit in range(3):
        rho1 = sp.reduced_density_matrix_from_statevector(ghz, 3, qubit)
        assert sp.purity(rho1) == pytest.approx(0.5, abs=1e-9)


def test_separable_state_reduces_to_pure_components():
    # q1 = 1, q0 = 0 -> flat index 2 (q0 is bit 0)
    sv = np.zeros(4, dtype=complex)
    sv[2] = 1.0
    rho0 = sp.reduced_density_matrix_from_statevector(sv, 2, 0)
    rho1 = sp.reduced_density_matrix_from_statevector(sv, 2, 1)
    assert np.allclose(rho0, [[1, 0], [0, 0]])
    assert np.allclose(rho1, [[0, 0], [0, 1]])


def test_density_matrix_partial_trace_matches_statevector_path():
    bell = ket(1, 0, 0, 1) / SQRT2
    rho_full = rho_from_pure(bell)
    for qubit in (0, 1):
        from_sv = sp.reduced_density_matrix_from_statevector(bell, 2, qubit)
        from_rho = sp.reduced_density_matrix_from_density_matrix(rho_full, 2, qubit)
        assert np.allclose(from_sv, from_rho, atol=1e-9)


# ---------------------------------------------------------------------------
# Concurrence
# ---------------------------------------------------------------------------


def test_concurrence_bell_state_is_one():
    bell = ket(1, 0, 0, 1) / SQRT2
    assert sp.concurrence_pure_two_qubit(bell) == pytest.approx(1.0, abs=1e-9)
    assert sp.concurrence_mixed_two_qubit(rho_from_pure(bell)) == pytest.approx(1.0, abs=1e-9)


def test_concurrence_product_state_is_zero():
    product = ket(1, 0, 0, 0)
    assert sp.concurrence_pure_two_qubit(product) == pytest.approx(0.0, abs=1e-9)
    product_plus = ket(1, 1, 0, 0) / SQRT2  # |0>|+>
    assert sp.concurrence_pure_two_qubit(product_plus) == pytest.approx(0.0, abs=1e-9)


def test_concurrence_werner_states_match_textbook_formula():
    # Werner state rho = p*|Bell><Bell| + (1-p)*I/4 has concurrence
    # max(0, (3p-1)/2), with the well-known disentangling threshold p=1/3.
    bell_rho = rho_from_pure(ket(1, 0, 0, 1) / SQRT2)
    identity_mix = np.eye(4, dtype=complex) / 4
    for p in (1.0, 0.8, 0.5, 1 / 3, 0.1, 0.0):
        rho_w = p * bell_rho + (1 - p) * identity_mix
        expected = max(0.0, (3 * p - 1) / 2)
        assert sp.concurrence_mixed_two_qubit(rho_w) == pytest.approx(expected, abs=1e-6)


# ---------------------------------------------------------------------------
# Schmidt decomposition / entanglement entropy
# ---------------------------------------------------------------------------


def test_schmidt_coefficients_bell_state():
    bell = ket(1, 0, 0, 1) / SQRT2
    coeffs = sp.schmidt_coefficients(bell, 2, [0])
    assert sorted(coeffs, reverse=True) == pytest.approx([1 / SQRT2, 1 / SQRT2], abs=1e-9)
    assert sp.entanglement_entropy_from_schmidt(coeffs) == pytest.approx(1.0, abs=1e-9)


def test_schmidt_coefficients_product_state():
    sv = ket(1, 1, 0, 0) / SQRT2  # |0>|+>
    coeffs = sp.schmidt_coefficients(sv, 2, [0])
    assert sp.entanglement_entropy_from_schmidt(coeffs) == pytest.approx(0.0, abs=1e-9)


def test_schmidt_coefficients_ghz_any_single_cut():
    ghz = np.zeros(8, dtype=complex)
    ghz[0] = 1 / SQRT2
    ghz[7] = 1 / SQRT2
    for partition in ([0], [1], [2], [0, 1]):
        coeffs = sp.schmidt_coefficients(ghz, 3, partition)
        assert sp.entanglement_entropy_from_schmidt(coeffs) == pytest.approx(1.0, abs=1e-9)


# ---------------------------------------------------------------------------
# Finite-value guarding
# ---------------------------------------------------------------------------


def test_assert_finite_array_raises_on_nan():
    bad = np.array([1.0, float("nan")], dtype=complex)
    with pytest.raises(sp.StatePostprocessingError):
        sp.assert_finite_array(bad, "test")


def test_assert_finite_array_raises_on_infinity():
    bad = np.array([1.0, float("inf")], dtype=complex)
    with pytest.raises(sp.StatePostprocessingError):
        sp.assert_finite_array(bad, "test")


def test_assert_finite_array_passes_clean_data():
    sp.assert_finite_array(np.array([1.0, 0.5j], dtype=complex), "test")  # must not raise


def test_complex_to_json_rejects_non_finite():
    with pytest.raises(sp.StatePostprocessingError):
        sp.complex_to_json(complex(float("nan"), 0.0))


# ---------------------------------------------------------------------------
# Top-level statevector_analysis()
# ---------------------------------------------------------------------------


def test_statevector_analysis_bell_state_full_detail():
    bell = ket(1, 0, 0, 1) / SQRT2
    result = sp.statevector_analysis(
        bell, 2, semantic_point="final_state", source_engine="aer_statevector", detail="full",
    )
    assert result["available"] is True
    assert result["representation"] == "statevector"
    assert result["normalized"] is True
    assert result["normalization_error"] < 1e-9
    assert len(result["amplitudes"]) == 4
    assert result["per_qubit"][0]["purity"] == pytest.approx(0.5, abs=1e-9)
    assert result["per_qubit"][1]["purity"] == pytest.approx(0.5, abs=1e-9)
    assert result["per_qubit"][0]["reduced_density_matrix"] == [
        [{"re": pytest.approx(0.5), "im": 0.0}, {"re": 0.0, "im": 0.0}],
        [{"re": 0.0, "im": 0.0}, {"re": pytest.approx(0.5), "im": 0.0}],
    ]
    assert result["entanglement"]["concurrence"] == pytest.approx(1.0, abs=1e-9)
    assert result["global_metrics"]["is_pure"] is True


def test_statevector_analysis_top_states_excludes_near_zero_amplitudes():
    sv = np.zeros(8, dtype=complex)
    sv[0] = 1 / SQRT2
    sv[7] = 1 / SQRT2
    result = sp.statevector_analysis(sv, 3, semantic_point="final_state", source_engine="aer_statevector")
    labels = {entry["basis"] for entry in result["top_states"]}
    assert labels == {"000", "111"}


def test_statevector_analysis_unavailable_above_qubit_limit():
    sv = np.zeros(2, dtype=complex)
    sv[0] = 1.0
    result = sp.statevector_analysis(
        sv, sp.MAX_TOP_AMPLITUDES_QUBITS + 1, semantic_point="final_state", source_engine="aer_statevector",
    )
    assert result["available"] is False
    assert result["unavailable_reason"] is not None


def test_statevector_analysis_omits_full_amplitude_list_above_full_limit_but_keeps_summary():
    n = sp.MAX_FULL_STATEVECTOR_QUBITS + 2
    sv = np.zeros(2 ** n, dtype=complex)
    sv[0] = 1.0
    result = sp.statevector_analysis(sv, n, semantic_point="final_state", source_engine="aer_statevector", detail="full")
    assert result["available"] is True
    assert result["amplitudes"] is None
    assert result["top_states"] is not None
    assert any("omitted" in w for w in result["warnings"])


def test_statevector_analysis_flags_normalization_error():
    sv = ket(1, 0)  # deliberately not renormalized after scaling
    sv = sv * 1.01
    result = sp.statevector_analysis(sv, 1, semantic_point="final_state", source_engine="aer_statevector")
    assert result["normalized"] is False
    assert result["normalization_error"] > 0
    assert any("probability" in w for w in result["warnings"])


# ---------------------------------------------------------------------------
# Top-level density_matrix_analysis()
# ---------------------------------------------------------------------------


def test_density_matrix_analysis_pure_state_reports_purity_one():
    bell = ket(1, 0, 0, 1) / SQRT2
    rho = rho_from_pure(bell)
    result = sp.density_matrix_analysis(
        rho, 2, semantic_point="mixed_final_state", source_engine="aer_density_matrix", include_full_matrix=True,
    )
    assert result["available"] is True
    assert result["global_metrics"]["purity"] == pytest.approx(1.0, abs=1e-9)
    assert result["global_metrics"]["is_pure"] is True
    assert result["global_metrics"]["eigenvalues"][:2] == pytest.approx([1.0, 0.0], abs=1e-9)
    assert result["density_matrix"] is not None
    assert len(result["density_matrix"]) == 4


def test_density_matrix_analysis_noisy_state_reports_mixedness():
    bell = ket(1, 0, 0, 1) / SQRT2
    rho = rho_from_pure(bell)
    noisy = 0.9 * rho + 0.1 * np.eye(4, dtype=complex) / 4
    result = sp.density_matrix_analysis(
        noisy, 2, semantic_point="mixed_final_state", source_engine="aer_density_matrix", include_full_matrix=False,
    )
    assert result["global_metrics"]["purity"] < 1.0
    assert result["global_metrics"]["is_pure"] is False
    assert result["density_matrix"] is None  # not requested


def test_density_matrix_analysis_detects_trace_and_hermiticity_errors():
    broken = np.array([[0.6, 0.1], [0.05, 0.5]], dtype=complex)  # trace=1.1, not Hermitian
    result = sp.density_matrix_analysis(
        broken, 1, semantic_point="mixed_final_state", source_engine="aer_density_matrix", include_full_matrix=False,
    )
    assert result["normalized"] is False
    assert any("trace" in w.lower() for w in result["warnings"])
    assert any("hermitian" in w.lower() for w in result["warnings"])


def test_density_matrix_full_payload_omitted_above_payload_limit_but_metrics_remain():
    n = sp.MAX_DENSITY_MATRIX_PAYLOAD_QUBITS + 1
    dim = 2 ** n
    rho = np.zeros((dim, dim), dtype=complex)
    rho[0, 0] = 1.0
    result = sp.density_matrix_analysis(
        rho, n, semantic_point="mixed_final_state", source_engine="aer_density_matrix", include_full_matrix=True,
    )
    assert result["available"] is True
    assert result["density_matrix"] is None
    assert result["global_metrics"]["purity"] == pytest.approx(1.0, abs=1e-6)
    assert any("omitted" in w for w in result["warnings"])


# ---------------------------------------------------------------------------
# Stabilizer summary
# ---------------------------------------------------------------------------


def test_stabilizer_summary_never_includes_amplitudes():
    result = sp.stabilizer_summary(["+XX", "+ZZ"], 2, source_engine="aer_stabilizer", semantic_point="final_state")
    assert result["available"] is True
    assert result["representation"] == "stabilizer_summary"
    assert result["amplitudes"] is None
    assert result["density_matrix"] is None
    assert result["global_metrics"]["stabilizer_generators"] == ["+XX", "+ZZ"]
    assert any("stabilizer representation" in w for w in result["warnings"])


def test_unavailable_state_analysis_shape():
    result = sp.unavailable_state_analysis("aer_mps", "circuit too large")
    assert result["available"] is False
    assert result["unavailable_reason"] == "circuit too large"
    assert result["amplitudes"] is None
