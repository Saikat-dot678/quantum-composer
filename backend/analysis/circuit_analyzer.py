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
from gate_registry import get_gate_spec
from validators import canonical_operation_order

# Tolerance for deciding whether a parameter lies on a Clifford-compatible
# angle.  Pauli rotations (RX/RY/RZ/P and RXX/RYY/RZZ/RZX) are Clifford at
# multiples of pi/2; controlled rotations are Clifford only at multiples of pi.
_ANGLE_TOL = 1e-9


def _angle_is_multiple(theta: float, period: float) -> bool:
    ratio = theta / period
    return abs(ratio - round(ratio)) < _ANGLE_TOL


def _operation_is_clifford(operation: Any) -> bool:
    spec = get_gate_spec(operation.gate)
    if spec.clifford_rule == "always":
        return True
    if spec.clifford_rule == "pauli_rotation":
        return _angle_is_multiple(float(operation.params["theta"]), math.pi / 2.0)
    if spec.clifford_rule == "controlled_rotation":
        return _angle_is_multiple(float(operation.params["theta"]), math.pi)
    if spec.clifford_rule == "mcx":
        return len(operation.qubits) == 2
    return False


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
    stim_compatible = True

    for op in operations:
        gate = op.gate
        spec = get_gate_spec(gate)
        gate_counts[gate] = gate_counts.get(gate, 0) + 1

        if spec.is_unitary and len(op.qubits) == 2:
            two_qubit_gate_count += 1
        if gate == "measure":
            measurement_count += 1
        if gate in {"t", "tdg"}:
            t_count += 1
        if spec.is_parameterized:
            rotation_count += 1
        if not _operation_is_clifford(op):
            if gate == "unitary":
                reason = "custom matrix-defined (unitary) gate"
            elif spec.is_parameterized:
                rendered = ", ".join(f"{name}={float(op.params[name]):.4f}" for name in spec.parameter_names)
                reason = f"{gate}({rendered}) is not structurally recognized as Clifford"
            else:
                reason = f"{spec.display_name} gate"
            non_clifford_reasons.append(reason)
        if spec.stim_instruction is None:
            stim_compatible = False

    contains_non_clifford = bool(non_clifford_reasons)
    is_clifford = not contains_non_clifford

    # Execution and code generation stable-sort by visual ``moment``. Analyze the
    # same semantic order so an imported/out-of-order operation list cannot
    # report a depth for a different circuit than the one the engines execute.
    ordered = canonical_operation_order(operations)
    depth = _greedy_depth(ordered, num_qubits)
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
        if stim_available and stim_compatible:
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
    if rotation_count and contains_non_clifford:
        warnings.append(
            "Circuit contains parameterized gates at non-Clifford angles; stabilizer "
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
        # Internal routing hint. The public Pydantic response intentionally
        # omits this implementation detail.
        "stim_compatible": stim_compatible,
    }
