"""Exact statevector engine (small arbitrary circuits only).

Stores 2**n complex amplitudes. Use only when the memory estimate is safe; this
engine refuses to attempt an allocation that would exhaust memory.
"""

from __future__ import annotations

from typing import Any

from analysis.resource_estimator import (
    feasibility_from_log2_bytes,
    statevector_log2_bytes,
)
from engines.aer_common import run_aer
from engines.base import EngineResult, InfeasibleCircuitError

ENGINE_ID = "aer_statevector"

# Absolute safety cap: even if the configured memory budget would permit it,
# refuse exact statevector simulation beyond this many qubits to prevent an
# accidental out-of-memory event. 30 qubits already needs ~16 GB.
HARD_QUBIT_CAP = 30


def run(request: Any, options: Any, analysis: dict[str, Any]) -> EngineResult:
    num_qubits = analysis["num_qubits"]
    log2_bytes = statevector_log2_bytes(num_qubits)
    risk = feasibility_from_log2_bytes(log2_bytes, options.max_memory_mb)

    if num_qubits > HARD_QUBIT_CAP:
        raise InfeasibleCircuitError(
            f"Exact statevector simulation is capped at {HARD_QUBIT_CAP} qubits "
            f"(this circuit has {num_qubits}). A full statevector needs "
            f"{analysis['estimated_statevector_memory_human']}. Use a "
            "Clifford/stabilizer or MPS engine for larger circuits, or run on real "
            "quantum hardware."
        )

    if risk in {"dangerous", "infeasible"}:
        raise InfeasibleCircuitError(
            f"Exact statevector simulation of {num_qubits} qubits needs "
            f"{analysis['estimated_statevector_memory_human']}, which exceeds the "
            f"{options.max_memory_mb} MB budget. Statevector memory grows as "
            "16 * 2**n. Reduce the qubit count, use a Clifford/stabilizer circuit, "
            "try MPS if the circuit is low-entanglement, or run on real hardware."
        )

    warnings: list[str] = []
    if risk == "heavy":
        warnings.append(
            f"Statevector simulation of {num_qubits} qubits is memory-heavy "
            f"(~{analysis['estimated_statevector_memory_human']})."
        )

    counts, run_warnings = run_aer(
        request,
        method="statevector",
        shots=options.shots,
        seed=options.seed,
        noise_model=None,
    )
    warnings.extend(run_warnings)

    return EngineResult(
        counts=counts,
        selected_engine=ENGINE_ID,
        engine_reason=(
            f"Exact statevector simulation is feasible for {num_qubits} qubits "
            f"(needs {analysis['estimated_statevector_memory_human']})."
        ),
        warnings=warnings,
        metadata={"method": "statevector", "memory_risk": risk},
    )
