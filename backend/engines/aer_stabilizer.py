"""Aer stabilizer engine -- exact simulation of large Clifford-only circuits.

Clifford circuits (built from X, Y, Z, H, S, CX, CZ, SWAP and measurement) can
be simulated in polynomial time and memory via the stabilizer formalism
(Gottesman-Knill). This means thousands of qubits are feasible -- but *only* for
Clifford circuits. Any T gate or non-Clifford rotation is rejected up front with
a clear message.
"""

from __future__ import annotations

from typing import Any

from engines.aer_common import run_aer
from engines.base import EngineResult, UnsupportedGateError

ENGINE_ID = "aer_stabilizer"


def run(request: Any, options: Any, analysis: dict[str, Any]) -> EngineResult:
    if analysis["contains_non_clifford"]:
        reasons = ", ".join(analysis.get("non_clifford_reasons", [])) or "non-Clifford gates"
        raise UnsupportedGateError(
            "Stabilizer simulation only supports Clifford circuits, but this "
            f"circuit contains: {reasons}. Remove T gates and non-Clifford-angle "
            "rotations, or use the statevector/MPS engine instead."
        )

    counts, warnings = run_aer(
        request,
        method="stabilizer",
        shots=options.shots,
        seed=options.seed,
        noise_model=None,
    )

    return EngineResult(
        counts=counts,
        selected_engine=ENGINE_ID,
        engine_reason=(
            f"Circuit is Clifford-only on {analysis['num_qubits']} qubits; the "
            "stabilizer formalism simulates it exactly in polynomial memory."
        ),
        warnings=warnings,
        metadata={"method": "stabilizer", "is_clifford": True},
    )
