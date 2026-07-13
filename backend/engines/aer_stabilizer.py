"""Aer stabilizer engine -- exact simulation of large Clifford-only circuits.

Clifford circuits (built from X, Y, Z, H, S, CX, CZ, SWAP and measurement) can
be simulated in polynomial time and memory via the stabilizer formalism
(Gottesman-Knill). This means thousands of qubits are feasible -- but *only* for
Clifford circuits. Any T gate or non-Clifford rotation is rejected up front with
a clear message.
"""

from __future__ import annotations

from typing import Any

from analysis.state_postprocessing import MAX_STABILIZER_SUMMARY_QUBITS
from engines.aer_common import build_state_analysis, run_aer_with_state
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

    run_result = run_aer_with_state(
        request,
        method="stabilizer",
        shots=options.shots,
        seed=options.seed,
        noise_model=None,
        want_state=options.include_state_analysis,
        save_instruction="save_stabilizer",
        max_state_qubits=MAX_STABILIZER_SUMMARY_QUBITS,
    )

    state_analysis = build_state_analysis(
        run_result,
        num_qubits=analysis["num_qubits"],
        source_engine=ENGINE_ID,
        kind="stabilizer",
    )

    return EngineResult(
        counts=run_result.counts,
        selected_engine=ENGINE_ID,
        engine_reason=(
            f"Circuit is Clifford-only on {analysis['num_qubits']} qubits; the "
            "stabilizer formalism simulates it exactly in polynomial memory."
        ),
        warnings=run_result.warnings,
        metadata={"method": "stabilizer", "is_clifford": True},
        state_analysis=state_analysis,
    )
