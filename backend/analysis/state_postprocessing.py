"""Quantum state post-processing: turns an already-computed Statevector,
DensityMatrix, or stabilizer generator list into safe, JSON-serializable
metrics and views.

This module is pure math. It never touches Qiskit's simulator/backend APIs
and never re-runs a circuit -- callers in ``engines/*`` extract a raw state
(via a ``save_statevector``/``save_density_matrix``/``save_stabilizer``
instruction, see ``engines/aer_common.py``) and hand the resulting array to
the functions here. Keeping the numerics separate from the engine adapters
means they can be unit-tested against known reference states without ever
starting Aer.

Every public function that could raise on malformed input (unnormalized
state, non-finite entries, mismatched dimensions) raises
``StatePostprocessingError`` instead of letting a raw exception escape --
callers must treat state analysis as best-effort and degrade to
``{"available": False, "unavailable_reason": ...}`` on failure rather than
ever failing the containing simulation response (counts/etc. must still be
returned even if state post-processing itself breaks).

Bit ordering: basis labels use the same convention as the rest of this
project and the frontend's lib/statevector.ts -- index ``i``'s binary
representation, qubit 0 is the least significant bit (rightmost character
of the label string). ``qubits[0]`` of a multi-qubit gate is bit 0. This
must never silently drift from the frontend; see docs/ARCHITECTURE.md.
"""

from __future__ import annotations

import math
from typing import Any, Sequence

import numpy as np

# ---------------------------------------------------------------------------
# Limits -- named and documented, independent of whatever qubit count the
# *simulation* itself could handle. Visualization feasibility and simulation
# feasibility are different constraints (a circuit can be simulable via MPS
# or the stabilizer formalism at large scale while still being unsafe to
# materialize as a full state for display).
# ---------------------------------------------------------------------------

#: Above this qubit count, a full amplitude-list payload is never returned,
#: even if `state_detail == "full"` was requested. 2**12 == 4096 amplitudes.
MAX_FULL_STATEVECTOR_QUBITS = 12

#: Above this qubit count, no state analysis is attempted at all, even a
#: top-k summary -- materializing *any* full statevector (even transiently,
#: to then discard everything but a few top entries) stops being safe here.
#: 2**20 == ~1M amplitudes transiently in memory (~16 MB), still bounded.
MAX_TOP_AMPLITUDES_QUBITS = 20

#: Above this qubit count, a full density-matrix JSON payload is never
#: returned. 2**8 == 256x256 == 65,536 complex entries.
MAX_DENSITY_MATRIX_PAYLOAD_QUBITS = 8

#: Above this qubit count, density-matrix state analysis (even metrics, not
#: just the full-matrix payload) is skipped entirely. Matches
#: engines/aer_density.py's own HARD_QUBIT_CAP: a 16-qubit density matrix
#: already needs ~64 GB, so in practice the engine itself already rejects
#: anything past this before state analysis would ever run -- this is a
#: defense-in-depth duplicate of that limit, not a tighter one. Verified
#: empirically that per-qubit reduction itself stays fast well past this
#: point (14 qubits: ~7ms/qubit) -- the real constraint is holding the
#: density matrix in memory at all, which the engine cap already governs.
MAX_DENSITY_MATRIX_ANALYSIS_QUBITS = 15

#: Schmidt decomposition / entanglement entropy needs an SVD of a reshaped
#: amplitude vector -- O(2**n) work and memory, same order as the full
#: statevector, so it shares that threshold.
MAX_ENTANGLEMENT_QUBITS = MAX_FULL_STATEVECTOR_QUBITS

#: Stabilizer generator lists are O(n) generators of length O(n) each --
#: polynomial, not exponential -- so this is a payload-size guard, not a
#: computational-feasibility one.
MAX_STABILIZER_SUMMARY_QUBITS = 128

DEFAULT_TOP_K = 16
MAX_TOP_K = 200
DEFAULT_MAX_AMPLITUDES = 64
HARD_MAX_AMPLITUDES = 1 << MAX_FULL_STATEVECTOR_QUBITS  # 4096

#: Amplitudes/probabilities below this are treated as numerically zero for
#: sparse Dirac-notation display (they still exist in the full amplitude
#: list -- this only affects which entries appear in a "top states" summary).
SPARSE_PROBABILITY_THRESHOLD = 1e-10

#: How far a statevector's total probability may deviate from 1, or a
#: density matrix's trace may deviate from 1, before we still show the
#: result but flag it, rather than silently trusting it.
NORMALIZATION_TOLERANCE = 1e-6
TRACE_TOLERANCE = 1e-6
HERMITICITY_TOLERANCE = 1e-6

#: Tiny floating-point overshoot clamps (e.g. a probability of -1e-16 or a
#: purity of 1.0000000000000002) -- distinct from the tolerances above,
#: which gate whether we trust the result at all.
_CLAMP_EPSILON = 1e-9

PAULI_X = np.array([[0, 1], [1, 0]], dtype=complex)
PAULI_Y = np.array([[0, -1j], [1j, 0]], dtype=complex)
PAULI_Z = np.array([[1, 0], [0, -1]], dtype=complex)
_SPIN_FLIP_YY = np.kron(PAULI_Y, PAULI_Y)


class StatePostprocessingError(Exception):
    """Raised for malformed input; callers must catch this and degrade to
    an ``unavailable`` state analysis rather than failing the whole
    simulation response."""


# ---------------------------------------------------------------------------
# Safe JSON primitives
# ---------------------------------------------------------------------------


def _require_finite(value: complex | float, context: str) -> None:
    re = float(value.real) if isinstance(value, complex) else float(value)
    im = float(value.imag) if isinstance(value, complex) else 0.0
    if not (math.isfinite(re) and math.isfinite(im)):
        raise StatePostprocessingError(f"{context} produced a non-finite value (NaN/Infinity).")


def assert_finite_array(array: np.ndarray, context: str) -> None:
    """Raises if `array` contains any NaN/Infinity. Called once, immediately
    after extracting a raw state from Qiskit -- everything downstream may
    then assume finite input and only needs to clamp tiny rounding, never
    hide a real NaN/Infinity."""
    if not np.all(np.isfinite(array)):
        raise StatePostprocessingError(f"{context} contains non-finite (NaN/Infinity) entries.")


def complex_to_json(value: complex) -> dict[str, float]:
    _require_finite(value, "amplitude")
    return {"re": _clamp_tiny(float(value.real)), "im": _clamp_tiny(float(value.imag))}


def _clamp_tiny(value: float) -> float:
    """Snap a value within _CLAMP_EPSILON of an integer to that integer --
    pure display cleanliness for floating-point rounding noise, applied only
    after the finiteness/tolerance checks above have already passed."""
    rounded = round(value)
    return float(rounded) if abs(value - rounded) < _CLAMP_EPSILON else value


def _clamp_probability(value: float) -> float:
    return max(0.0, min(1.0, _clamp_tiny(float(value))))


def basis_label(index: int, num_qubits: int) -> str:
    """Binary label for basis index `index`; qubit 0 is the least
    significant bit (rightmost character) -- matches
    frontend/lib/statevector.ts's `index.toString(2).padStart(n, "0")`."""
    return format(index, f"0{max(num_qubits, 1)}b")


def _amplitude_entry(index: int, num_qubits: int, amplitude: complex) -> dict[str, Any]:
    probability = _clamp_probability(abs(amplitude) ** 2)
    phase_radians = math.atan2(amplitude.imag, amplitude.real) if probability > 1e-12 else 0.0
    return {
        "index": index,
        "basis": basis_label(index, num_qubits),
        "amplitude": complex_to_json(amplitude),
        "probability": probability,
        "phase_radians": _clamp_tiny(phase_radians),
        "phase_degrees": _clamp_tiny(math.degrees(phase_radians)),
    }


# ---------------------------------------------------------------------------
# Partial trace / reduced single-qubit states
#
# Verified against known reference states before being written here (Bell,
# GHZ, and product states; pure-state and density-matrix code paths
# cross-checked against each other) -- see the state-analysis audit section
# in audit.md for the exact verification transcript.
# ---------------------------------------------------------------------------


def _axis_for_qubit(qubit: int, num_qubits: int) -> int:
    """Reshaping a length-2**n statevector into an all-2s tensor with
    default (C) order puts qubit 0 (the least-significant bit of the flat
    index) at the *last* axis and qubit n-1 at the *first* axis."""
    return num_qubits - 1 - qubit


def reduced_density_matrix_from_statevector(sv: np.ndarray, num_qubits: int, qubit: int) -> np.ndarray:
    axis = _axis_for_qubit(qubit, num_qubits)
    tensor = sv.reshape([2] * num_qubits)
    moved = np.moveaxis(tensor, axis, 0)
    flat = moved.reshape(2, -1)
    return flat @ flat.conj().T


def reduced_density_matrix_from_density_matrix(rho: np.ndarray, num_qubits: int, qubit: int) -> np.ndarray:
    tensor = rho.reshape([2] * num_qubits + [2] * num_qubits)
    target_axis = _axis_for_qubit(qubit, num_qubits)
    row_labels = [chr(ord("a") + p) for p in range(num_qubits)]
    col_labels = [chr(ord("A") + p) for p in range(num_qubits)]
    for p in range(num_qubits):
        if p != target_axis:
            col_labels[p] = row_labels[p]  # repeated index -> traced out
    subscript = "".join(row_labels) + "".join(col_labels) + "->" + row_labels[target_axis] + col_labels[target_axis]
    return np.einsum(subscript, tensor)


def schmidt_coefficients(sv: np.ndarray, num_qubits: int, partition_a: Sequence[int]) -> np.ndarray:
    """Singular values of `sv` reshaped as a (dim_A x dim_B) matrix for the
    bipartition `partition_a` vs. its complement."""
    partition_a = sorted(set(partition_a))
    partition_b = [q for q in range(num_qubits) if q not in partition_a]
    tensor = sv.reshape([2] * num_qubits)
    a_axes = [_axis_for_qubit(q, num_qubits) for q in partition_a]
    b_axes = [_axis_for_qubit(q, num_qubits) for q in partition_b]
    permuted = np.transpose(tensor, a_axes + b_axes)
    matrix = permuted.reshape(2 ** len(partition_a), 2 ** max(len(partition_b), 0) or 1)
    return np.linalg.svd(matrix, compute_uv=False)


# ---------------------------------------------------------------------------
# Single-qubit metrics from a 2x2 reduced density matrix
# ---------------------------------------------------------------------------


def bloch_vector(rho1: np.ndarray) -> tuple[float, float, float]:
    x = float(np.real(np.trace(rho1 @ PAULI_X)))
    y = float(np.real(np.trace(rho1 @ PAULI_Y)))
    z = float(np.real(np.trace(rho1 @ PAULI_Z)))
    return (_clamp_tiny(x), _clamp_tiny(y), _clamp_tiny(z))


def purity(rho: np.ndarray) -> float:
    return _clamp_probability(float(np.real(np.trace(rho @ rho))))


def von_neumann_entropy(rho: np.ndarray) -> float:
    """Entropy in bits (log base 2), 0 for a pure state, 1 for a maximally
    mixed single qubit."""
    eigenvalues = np.clip(np.linalg.eigvalsh(rho).real, 0.0, 1.0)
    entropy = 0.0
    for p in eigenvalues:
        if p > 1e-12:
            entropy -= p * math.log2(p)
    return _clamp_tiny(max(0.0, entropy))


def _per_qubit_summary(rho1: np.ndarray, qubit: int) -> dict[str, Any]:
    x, y, z = bloch_vector(rho1)
    magnitude = math.sqrt(x * x + y * y + z * z)
    return {
        "qubit": qubit,
        "bloch_vector": {"x": x, "y": y, "z": z},
        "bloch_magnitude": _clamp_tiny(min(1.0, magnitude)),
        "purity": purity(rho1),
        "von_neumann_entropy_bits": von_neumann_entropy(rho1),
        "expectation_x": x,
        "expectation_y": y,
        "expectation_z": z,
        "probability_0": _clamp_probability(float(np.real(rho1[0, 0]))),
        "probability_1": _clamp_probability(float(np.real(rho1[1, 1]))),
        "is_mixed": magnitude < 1.0 - 1e-6,
        "reduced_density_matrix": [
            [complex_to_json(complex(value)) for value in row]
            for row in rho1
        ],
    }


# ---------------------------------------------------------------------------
# Entanglement
# ---------------------------------------------------------------------------


def concurrence_pure_two_qubit(sv: np.ndarray) -> float:
    """Wootters concurrence for a pure 2-qubit state |psi> = a|00>+b|01>+c|10>+d|11>: C = 2|ad-bc|."""
    a, b, c, d = sv[0], sv[1], sv[2], sv[3]
    return _clamp_probability(2 * abs(a * d - b * c))


def concurrence_mixed_two_qubit(rho: np.ndarray) -> float:
    """Full Wootters formula for a 2-qubit (mixed) density matrix.

    C = max(0, lambda_1 - lambda_2 - lambda_3 - lambda_4), lambda_i the
    square roots of the eigenvalues of rho * rho~ in descending order, where
    rho~ = (Y⊗Y) rho* (Y⊗Y). Verified against the textbook Werner-state
    result C = max(0, (3p-1)/2) (including the well-known p=1/3
    disentangling threshold) before being written here.
    """
    rho_tilde = _SPIN_FLIP_YY @ rho.conj() @ _SPIN_FLIP_YY
    eigenvalues = np.linalg.eigvals(rho @ rho_tilde)
    roots = sorted((math.sqrt(max(float(np.real(v)), 0.0)) for v in eigenvalues), reverse=True)
    return max(0.0, roots[0] - roots[1] - roots[2] - roots[3])


def entanglement_entropy_from_schmidt(coefficients: np.ndarray) -> float:
    probabilities = coefficients.astype(float) ** 2
    probabilities = probabilities[probabilities > 1e-12]
    if probabilities.size == 0:
        return 0.0
    return _clamp_tiny(max(0.0, float(-np.sum(probabilities * np.log2(probabilities)))))


# ---------------------------------------------------------------------------
# Top-level: pure statevector -> full state_analysis payload
# ---------------------------------------------------------------------------


def statevector_analysis(
    sv: np.ndarray,
    num_qubits: int,
    *,
    semantic_point: str,
    source_engine: str,
    detail: str = "summary",
    max_amplitudes: int = DEFAULT_MAX_AMPLITUDES,
    top_k: int = DEFAULT_TOP_K,
    warnings: Sequence[str] | None = None,
) -> dict[str, Any]:
    """Full state_analysis dict for a pure statevector. Raises
    StatePostprocessingError on malformed input -- callers must catch it."""
    if num_qubits > MAX_TOP_AMPLITUDES_QUBITS:
        return _unavailable(
            source_engine,
            f"State analysis is skipped above {MAX_TOP_AMPLITUDES_QUBITS} qubits -- even a bounded "
            "summary requires materializing the full state at least transiently, which stops being "
            "safe at this scale. The simulation's counts are unaffected.",
        )

    assert_finite_array(sv, "statevector")
    total_probability = float(np.real(np.vdot(sv, sv)))
    normalization_error = abs(total_probability - 1.0)
    result_warnings = list(warnings or [])
    if normalization_error > NORMALIZATION_TOLERANCE:
        result_warnings.append(
            f"The returned statevector's total probability was {total_probability:.6f} "
            f"(expected 1.0, deviation {normalization_error:.2e}) -- shown as returned, not renormalized."
        )

    probabilities = np.abs(sv) ** 2
    order = np.argsort(-probabilities)

    top_k = max(1, min(top_k, MAX_TOP_K))
    top_indices = [int(i) for i in order[:top_k] if probabilities[i] > SPARSE_PROBABILITY_THRESHOLD]
    top_states = [_amplitude_entry(i, num_qubits, complex(sv[i])) for i in top_indices]

    amplitudes: list[dict[str, Any]] | None = None
    if detail in ("top_amplitudes", "full") and num_qubits <= MAX_FULL_STATEVECTOR_QUBITS:
        if detail == "full":
            # "full" means the complete state whenever safely possible;
            # max_amplitudes is only a defensive additional cap.
            limit = min(max_amplitudes, HARD_MAX_AMPLITUDES, len(sv))
            indices = range(len(sv)) if limit >= len(sv) else sorted(int(i) for i in order[:limit])
        else:
            # "top_amplitudes" means exactly that: governed by top_k (the
            # same knob that sizes `top_states`), not the separate
            # max_amplitudes cap that only applies to "full" detail.
            limit = min(top_k, max_amplitudes, HARD_MAX_AMPLITUDES, len(sv))
            indices = sorted(int(i) for i in order[:limit])
        amplitudes = [_amplitude_entry(i, num_qubits, complex(sv[i])) for i in indices]
    elif detail in ("top_amplitudes", "full") and num_qubits > MAX_FULL_STATEVECTOR_QUBITS:
        result_warnings.append(
            f"Amplitude list omitted above {MAX_FULL_STATEVECTOR_QUBITS} qubits; a top-{top_k} "
            "summary is included instead."
        )

    per_qubit = [_per_qubit_summary(reduced_density_matrix_from_statevector(sv, num_qubits, q), q) for q in range(num_qubits)]

    marginals = _marginal_probabilities(probabilities, num_qubits)
    for entry, marginal in zip(per_qubit, marginals):
        entry["marginal_probability_1"] = marginal

    entanglement = None
    if num_qubits >= 2 and num_qubits <= MAX_ENTANGLEMENT_QUBITS:
        entanglement = _entanglement_summary(sv, num_qubits, per_qubit)

    global_purity = 1.0  # a normalized pure state is always purity 1 by construction

    return {
        "available": True,
        "representation": "statevector",
        "source_engine": source_engine,
        "semantic_point": semantic_point,
        "qubit_order": "qiskit_little_endian_q0_lsb",
        "num_qubits": num_qubits,
        "normalized": normalization_error <= NORMALIZATION_TOLERANCE,
        "normalization_error": normalization_error,
        "amplitudes": amplitudes,
        "density_matrix": None,
        "basis_probabilities": None,
        "top_states": top_states,
        "per_qubit": per_qubit,
        "entanglement": entanglement,
        "global_metrics": {
            "purity": global_purity,
            "is_pure": True,
            "exact": not any("approximat" in warning.lower() or "truncat" in warning.lower() for warning in result_warnings),
            "payload_truncated": amplitudes is None and detail in ("top_amplitudes", "full"),
            "amplitude_count": len(sv),
            "nonzero_amplitude_count": int(np.sum(probabilities > SPARSE_PROBABILITY_THRESHOLD)),
            "global_phase_note": (
                "A statevector's overall global phase has no physical meaning and is not corrected "
                "or canonicalized here -- two engines (or two equivalent circuits) may report the "
                "same physical state with different global phases."
            ),
        },
        "warnings": result_warnings,
        "unavailable_reason": None,
    }


def _marginal_probabilities(probabilities: np.ndarray, num_qubits: int) -> list[float]:
    marginals = [0.0] * num_qubits
    for index, p in enumerate(probabilities):
        for q in range(num_qubits):
            if (index >> q) & 1:
                marginals[q] += float(p)
    return [_clamp_probability(m) for m in marginals]


def _entanglement_summary(sv: np.ndarray, num_qubits: int, per_qubit: list[dict[str, Any]]) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "concurrence": None,
        "concurrence_note": None,
        "bipartitions": [],
        "global_purity": 1.0,
        "per_qubit_purity": [entry["purity"] for entry in per_qubit],
        "product_state_indicator": all(entry["purity"] > 1.0 - 1e-6 for entry in per_qubit),
        "explanation": (
            "A pure global state is a product (unentangled) state exactly when every qubit's "
            "reduced state is pure (purity 1, Bloch vector on the sphere's surface). Any qubit "
            "with reduced purity below 1 is entangled with the rest of the system."
        ),
    }
    if num_qubits == 2:
        summary["concurrence"] = concurrence_pure_two_qubit(sv)
        summary["concurrence_note"] = "Wootters concurrence for the pure 2-qubit state; 0 = product, 1 = maximally entangled."

    # Bipartitions: every single-qubit-vs-rest cut is cheap and always
    # informative; additionally include the balanced first-half/second-half
    # cut for num_qubits > 2 as one representative "interesting" partition,
    # per the "selected bipartitions where safely bounded" scope.
    seen: set[tuple[int, ...]] = set()
    partitions_to_try: list[list[int]] = [[q] for q in range(num_qubits)]
    if num_qubits > 2:
        half = num_qubits // 2
        partitions_to_try.append(list(range(half)))
    for partition in partitions_to_try:
        key = tuple(sorted(partition))
        if key in seen or not key or len(key) == num_qubits:
            continue
        seen.add(key)
        coeffs = schmidt_coefficients(sv, num_qubits, partition)
        entropy = entanglement_entropy_from_schmidt(coeffs)
        summary["bipartitions"].append({
            "partition_a": list(key),
            "partition_b": [q for q in range(num_qubits) if q not in key],
            "schmidt_coefficients": [_clamp_tiny(float(c)) for c in coeffs if float(c) > 1e-9],
            "schmidt_rank": int(np.sum(coeffs > 1e-9)),
            "entanglement_entropy_bits": entropy,
        })
    return summary


def _unavailable(source_engine: str, reason: str) -> dict[str, Any]:
    return {
        "available": False,
        "representation": None,
        "source_engine": source_engine,
        "semantic_point": None,
        "qubit_order": "qiskit_little_endian_q0_lsb",
        "num_qubits": None,
        "normalized": None,
        "normalization_error": None,
        "amplitudes": None,
        "density_matrix": None,
        "basis_probabilities": None,
        "top_states": None,
        "per_qubit": None,
        "entanglement": None,
        "global_metrics": None,
        "warnings": [],
        "unavailable_reason": reason,
    }


def unavailable_state_analysis(source_engine: str, reason: str) -> dict[str, Any]:
    return _unavailable(source_engine, reason)


# ---------------------------------------------------------------------------
# Top-level: density matrix -> full state_analysis payload
# ---------------------------------------------------------------------------


def density_matrix_analysis(
    rho: np.ndarray,
    num_qubits: int,
    *,
    semantic_point: str,
    source_engine: str,
    include_full_matrix: bool,
    warnings: Sequence[str] | None = None,
) -> dict[str, Any]:
    if num_qubits > MAX_DENSITY_MATRIX_ANALYSIS_QUBITS:
        return _unavailable(
            source_engine,
            f"Density-matrix state analysis is skipped above {MAX_DENSITY_MATRIX_ANALYSIS_QUBITS} qubits.",
        )

    assert_finite_array(rho, "density matrix")
    result_warnings = list(warnings or [])

    trace = complex(np.trace(rho))
    trace_error = abs(trace.real - 1.0) + abs(trace.imag)
    if trace_error > TRACE_TOLERANCE:
        result_warnings.append(f"Density matrix trace was {trace.real:.6f} (expected 1.0, deviation {trace_error:.2e}).")

    hermiticity_error = float(np.max(np.abs(rho - rho.conj().T))) if rho.size else 0.0
    if hermiticity_error > HERMITICITY_TOLERANCE:
        result_warnings.append(f"Density matrix is not Hermitian within tolerance (max deviation {hermiticity_error:.2e}).")

    global_purity = purity(rho)
    eigenvalues = np.clip(np.linalg.eigvalsh(rho).real, 0.0, 1.0)
    global_entropy = 0.0
    for p in eigenvalues:
        if p > 1e-12:
            global_entropy -= p * math.log2(p)

    basis_probabilities = None
    diag = np.real(np.diag(rho))
    if num_qubits <= MAX_FULL_STATEVECTOR_QUBITS:
        basis_probabilities = [
            {
                "index": i,
                "basis": basis_label(i, num_qubits),
                "amplitude": None,
                "probability": _clamp_probability(float(p)),
                "phase_radians": None,
                "phase_degrees": None,
            }
            for i, p in enumerate(diag)
            if p > SPARSE_PROBABILITY_THRESHOLD
        ]
        basis_probabilities.sort(key=lambda entry: -entry["probability"])

    per_qubit = [
        _per_qubit_summary(reduced_density_matrix_from_density_matrix(rho, num_qubits, q), q)
        for q in range(num_qubits)
    ]

    entanglement = None
    if num_qubits == 2:
        entanglement = {
            "concurrence": concurrence_mixed_two_qubit(rho),
            "concurrence_note": "Wootters concurrence for the (possibly mixed) 2-qubit density matrix.",
            "bipartitions": [],
            "global_purity": global_purity,
            "per_qubit_purity": [entry["purity"] for entry in per_qubit],
            "product_state_indicator": None,
            "explanation": (
                "Concurrence quantifies pairwise entanglement even for a mixed 2-qubit state. "
                "Schmidt decomposition and entanglement entropy are only well-defined for a pure "
                "global state, so they are omitted here (global_purity below 1 indicates mixedness)."
            ),
        }

    density_matrix_json = None
    if include_full_matrix and num_qubits <= MAX_DENSITY_MATRIX_PAYLOAD_QUBITS:
        density_matrix_json = [[complex_to_json(complex(v)) for v in row] for row in rho]
    elif include_full_matrix:
        result_warnings.append(
            f"Full density-matrix payload omitted above {MAX_DENSITY_MATRIX_PAYLOAD_QUBITS} qubits; "
            "summary metrics (trace, purity, entropy, reduced states) remain available."
        )

    return {
        "available": True,
        "representation": "density_matrix",
        "source_engine": source_engine,
        "semantic_point": semantic_point,
        "qubit_order": "qiskit_little_endian_q0_lsb",
        "num_qubits": num_qubits,
        "normalized": trace_error <= TRACE_TOLERANCE,
        "normalization_error": trace_error,
        "amplitudes": None,
        "density_matrix": density_matrix_json,
        "basis_probabilities": basis_probabilities,
        "top_states": basis_probabilities[:DEFAULT_TOP_K] if basis_probabilities else None,
        "per_qubit": per_qubit,
        "entanglement": entanglement,
        "global_metrics": {
            "purity": global_purity,
            "is_pure": global_purity > 1.0 - 1e-6,
            "exact": True,
            "payload_truncated": include_full_matrix and density_matrix_json is None,
            "trace": _clamp_tiny(trace.real),
            "hermiticity_error": hermiticity_error,
            "von_neumann_entropy_bits": _clamp_tiny(max(0.0, global_entropy)),
            # Descending spectrum of the density matrix (clamped to [0, 1]).
            # A pure state is one eigenvalue ~1 and the rest ~0; entropy above
            # is computed from exactly this list. Capped to the 64 largest so
            # a 15-qubit matrix (32768 eigenvalues) cannot bloat the payload;
            # the tail beyond any physically meaningful rank is ~0 anyway.
            "eigenvalues": [_clamp_tiny(float(v)) for v in sorted(eigenvalues, reverse=True)[:64]],
            "mixed_state_note": "This is a mixed-state density matrix, not a pure statevector -- purity below 1 reflects genuine noise/decoherence, not measurement error.",
        },
        "warnings": result_warnings,
        "unavailable_reason": None,
    }


# ---------------------------------------------------------------------------
# Top-level: stabilizer generator summary (Aer stabilizer / Stim)
# ---------------------------------------------------------------------------


def stabilizer_summary(
    generators: Sequence[str],
    num_qubits: int,
    *,
    source_engine: str,
    semantic_point: str,
    deterministic_outcomes: dict[str, float] | None = None,
) -> dict[str, Any]:
    """A structured summary for a stabilizer-formalism engine -- explicitly
    not a statevector. `generators` are Pauli-string labels like '+XX'."""
    if num_qubits > MAX_STABILIZER_SUMMARY_QUBITS:
        return _unavailable(
            source_engine,
            f"Stabilizer generator summary omitted above {MAX_STABILIZER_SUMMARY_QUBITS} qubits "
            "(payload-size guard only -- stabilizer tracking itself remains polynomial-time at any scale).",
        )
    return {
        "available": True,
        "representation": "stabilizer_summary",
        "source_engine": source_engine,
        "semantic_point": semantic_point,
        "qubit_order": "qiskit_little_endian_q0_lsb",
        "num_qubits": num_qubits,
        "normalized": True,
        "normalization_error": 0.0,
        "amplitudes": None,
        "density_matrix": None,
        "basis_probabilities": (
            [
                {
                    "index": None,
                    "basis": key,
                    "amplitude": None,
                    "probability": _clamp_probability(value),
                    "phase_radians": None,
                    "phase_degrees": None,
                }
                for key, value in sorted(deterministic_outcomes.items(), key=lambda kv: -kv[1])
            ]
            if deterministic_outcomes
            else None
        ),
        "top_states": None,
        "per_qubit": None,
        "entanglement": None,
        "global_metrics": {
            "stabilizer_generators": list(generators),
            "generator_count": len(generators),
            "exact": True,
            "payload_truncated": False,
        },
        "warnings": [
            "This engine tracks a stabilizer representation, not a full amplitude vector. "
            "Amplitudes, phases, and Bloch spheres are unavailable directly from this summary; "
            "the stabilizer generators fully determine the state, but converting them to "
            "per-qubit Bloch vectors or amplitudes is not implemented."
        ],
        "unavailable_reason": None,
    }
