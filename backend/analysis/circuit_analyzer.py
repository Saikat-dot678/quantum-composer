"""Structural analysis of a declarative circuit.

This module works directly on the validated operation list and never builds a
Qiskit object or allocates a statevector, so it is safe (and fast) even for
circuits that could never be simulated exactly. It answers the questions the
engine router needs: how many qubits, how deep, is it Clifford, how many T /
rotation gates, and which engines could realistically handle it.
"""

from __future__ import annotations

import math
from typing import Any, Iterable

from analysis.resource_estimator import estimate_resources, feasibility_from_log2_bytes

# Gates that are always Clifford in our gate set.
_CLIFFORD_GATES = {"x", "y", "z", "h", "s", "cx", "cz", "swap"}
# Structural / classical operations that do not affect Clifford-ness.
_STRUCTURAL_GATES = {"measure", "barrier"}
_TWO_QUBIT_GATES = {"cx", "cz", "swap"}
_ROTATION_GATES = {"rx", "ry", "rz"}

# Tolerance for deciding whether a rotation angle is a multiple of pi/2 (which
# would make the rotation a Clifford gate up to global phase).
_ANGLE_TOL = 1e-9


def _rotation_is_clifford(theta: float) -> bool:
    """A rotation is Clifford only for angles that are integer multiples of pi/2."""
    ratio = theta / (math.pi / 2.0)
    return abs(ratio - round(ratio)) < _ANGLE_TOL


def _greedy_depth(operations: Iterable[Any], num_qubits: int) -> int:
    """ASAP-schedule the operations to estimate circuit depth.

    Each operation is placed in the earliest layer after the last layer that
    touched any of its qubits. Barriers span all qubits they list. This is a
    structural estimate and may differ slightly from Qiskit's ``depth()`` for
    edge cases, but it needs no quantum dependency and works at any scale.
    """
    last_layer = [0] * max(num_qubits, 1)
    depth = 0
    for op in operations:
        qubits = list(op.qubits) if op.qubits else []
        if not qubits:
            continue
        start = max(last_layer[q] for q in qubits) + 1
        for q in qubits:
            last_layer[q] = start
        depth = max(depth, start)
    return depth


def analyze_circuit(
    *,
    num_qubits: int,
    num_clbits: int,
    operations: list[Any],
    max_memory_mb: float = 1024.0,
    stim_available: bool = False,
) -> dict[str, Any]:
    """Return a full structural + feasibility analysis of a circuit."""
    gate_counts: dict[str, int] = {}
    two_qubit_gate_count = 0
    measurement_count = 0
    t_count = 0
    rotation_count = 0
    non_clifford_reasons: list[str] = []

    for op in operations:
        gate = op.gate
        gate_counts[gate] = gate_counts.get(gate, 0) + 1

        if gate in _TWO_QUBIT_GATES:
            two_qubit_gate_count += 1
        if gate == "measure":
            measurement_count += 1
        if gate == "t":
            t_count += 1
            non_clifford_reasons.append("T gate")
        if gate in _ROTATION_GATES:
            rotation_count += 1
            theta = float(op.params.get("theta", 0.0))
            if not _rotation_is_clifford(theta):
                non_clifford_reasons.append(f"{gate}({theta:.4f}) is a non-Clifford angle")

    contains_non_clifford = bool(non_clifford_reasons)
    is_clifford = not contains_non_clifford

    depth = _greedy_depth(operations, num_qubits)
    resources = estimate_resources(num_qubits, max_memory_mb=max_memory_mb)
    sv_risk = feasibility_from_log2_bytes(
        resources["statevector_log2_bytes"], max_memory_mb
    )
    dm_risk = feasibility_from_log2_bytes(
        resources["density_matrix_log2_bytes"], max_memory_mb
    )

    recommended: list[str] = []
    warnings: list[str] = []

    if is_clifford:
        if stim_available:
            recommended.append("stim_stabilizer")
        recommended.append("aer_stabilizer")

    if sv_risk in {"safe", "heavy"}:
        recommended.append("aer_statevector")
    if dm_risk in {"safe", "heavy"}:
        recommended.append("aer_density_matrix")

    # MPS is an *approximate* option worth suggesting once exact simulation stops
    # being comfortable, but only ever helps for genuinely low-entanglement
    # circuits -- we cannot detect entanglement statically, hence the caveat.
    if num_qubits >= 12 and sv_risk != "safe":
        recommended.append("aer_mps")

    # De-duplicate while preserving order.
    seen: set[str] = set()
    recommended = [e for e in recommended if not (e in seen or seen.add(e))]

    # Feasibility headline.
    if is_clifford:
        feasibility_status = "clifford_scalable"
    elif sv_risk in {"safe", "heavy"}:
        feasibility_status = "exact_feasible"
    elif sv_risk == "dangerous":
        feasibility_status = "exact_borderline"
    else:
        feasibility_status = "approximation_or_hardware"

    # Warnings.
    if contains_non_clifford and num_qubits > 24:
        warnings.append(
            f"Circuit is non-Clifford on {num_qubits} qubits. Exact statevector "
            f"simulation needs {resources['statevector_memory_human']}, which is "
            "likely infeasible. Consider MPS (if low entanglement), fewer qubits, "
            "a Clifford-compatible circuit, or real quantum hardware."
        )
    if is_clifford and num_qubits > 24:
        warnings.append(
            f"Circuit is Clifford-only on {num_qubits} qubits: use stabilizer "
            "simulation (Stim or Aer 'stabilizer'), which scales polynomially "
            "instead of storing an exponential statevector."
        )
    if rotation_count and any("non-Clifford angle" in r for r in non_clifford_reasons):
        warnings.append(
            "Circuit contains rotation gates at non-Clifford angles; stabilizer "
            "engines cannot run it."
        )
    if measurement_count == 0:
        warnings.append(
            "No measurement operations found; all qubits will be measured "
            "automatically when sampling counts."
        )

    return {
        "num_qubits": num_qubits,
        "num_clbits": num_clbits,
        "operation_count": len(operations),
        "depth": depth,
        "gate_counts": gate_counts,
        "two_qubit_gate_count": two_qubit_gate_count,
        "measurement_count": measurement_count,
        "is_clifford": is_clifford,
        "contains_non_clifford": contains_non_clifford,
        "non_clifford_reasons": non_clifford_reasons[:20],
        "t_count": t_count,
        "rotation_count": rotation_count,
        "estimated_statevector_memory_bytes": resources["statevector_memory_bytes"],
        "estimated_statevector_memory_mb": resources["statevector_memory_mb"],
        "estimated_statevector_memory_human": resources["statevector_memory_human"],
        "estimated_density_matrix_memory_bytes": resources["density_matrix_memory_bytes"],
        "estimated_density_matrix_memory_mb": resources["density_matrix_memory_mb"],
        "estimated_density_matrix_memory_human": resources["density_matrix_memory_human"],
        "statevector_risk": sv_risk,
        "density_matrix_risk": dm_risk,
        "recommended_engines": recommended,
        "warnings": warnings,
        "feasibility_status": feasibility_status,
        "resource_estimate": resources,
    }
