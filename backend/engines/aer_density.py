"""Density-matrix engine -- small noisy circuits.

A density matrix stores 4**n complex entries (16 * 4**n bytes), so it is even
more memory-hungry than the statevector and is only usable for a small number of
qubits. Its payoff is the ability to represent mixed states, i.e. noise. When
``noise_enabled`` is set, a simple depolarizing noise model is applied.
"""

from __future__ import annotations

from typing import Any

from analysis.resource_estimator import (
    density_matrix_log2_bytes,
    feasibility_from_log2_bytes,
)
from analysis.state_postprocessing import MAX_DENSITY_MATRIX_ANALYSIS_QUBITS
from engines.aer_common import (
    build_depolarizing_noise_model,
    build_state_analysis,
    prepare_circuit,
    run_aer_with_state,
)
from engines.base import EngineResult, InfeasibleCircuitError

ENGINE_ID = "aer_density_matrix"

# Density matrices need 16 * 4**n bytes, so the cap is much tighter than the
# statevector: 15 qubits already needs ~16 GB.
HARD_QUBIT_CAP = 15

# Noise-model type -> (one-qubit depolarizing p, two-qubit depolarizing p).
_NOISE_PRESETS = {
    "depolarizing": (1.0, 2.0),
    "light": (0.25, 0.5),
    "heavy": (2.0, 4.0),
}


def run(request: Any, options: Any, analysis: dict[str, Any]) -> EngineResult:
    num_qubits = analysis["num_qubits"]
    log2_bytes = density_matrix_log2_bytes(num_qubits)
    risk = feasibility_from_log2_bytes(log2_bytes, options.max_memory_mb)

    if num_qubits > HARD_QUBIT_CAP:
        raise InfeasibleCircuitError(
            f"Density-matrix simulation is capped at {HARD_QUBIT_CAP} qubits "
            f"(this circuit has {num_qubits}). A density matrix needs "
            f"{analysis['estimated_density_matrix_memory_human']} (16 * 4**n bytes). "
            "Use fewer qubits for noisy simulation."
        )

    if risk in {"dangerous", "infeasible"}:
        raise InfeasibleCircuitError(
            f"Density-matrix simulation of {num_qubits} qubits needs "
            f"{analysis['estimated_density_matrix_memory_human']} (16 * 4**n bytes), "
            f"exceeding the {options.max_memory_mb} MB budget. Density-matrix memory "
            "scales even worse than the statevector. Use fewer qubits for noisy "
            "simulation."
        )

    noise_model = None
    warnings: list[str] = []
    if options.noise_enabled:
        # Scale a base per-gate rate by the requested preset multiplier.
        base = 0.01
        mult1, mult2 = _NOISE_PRESETS.get(
            (options.noise_model_type or "depolarizing"), _NOISE_PRESETS["depolarizing"]
        )
        try:
            circuit, prep_warnings = prepare_circuit(request)
            warnings.extend(prep_warnings)
            noise_model = build_depolarizing_noise_model(
                circuit, base * mult1, base * mult2
            )
            warnings.append(
                f"Applied depolarizing noise model '{options.noise_model_type}'."
            )
        except Exception as exc:  # pragma: no cover - defensive
            warnings.append(f"Failed to build noise model, running noiseless: {exc}")
            noise_model = None
    else:
        warnings.append(
            "Density-matrix engine selected without noise; results match the ideal "
            "statevector but use 16 * 4**n bytes."
        )

    run_result = run_aer_with_state(
        request,
        method="density_matrix",
        shots=options.shots,
        seed=options.seed,
        noise_model=noise_model,
        want_state=options.include_state_analysis,
        save_instruction="save_density_matrix",
        max_state_qubits=MAX_DENSITY_MATRIX_ANALYSIS_QUBITS,
        no_measurement_semantic_point="mixed_final_state",
    )
    warnings.extend(run_result.warnings)

    state_analysis = build_state_analysis(
        run_result,
        num_qubits=num_qubits,
        source_engine=ENGINE_ID,
        kind="density_matrix",
        include_density_matrix=options.include_density_matrix,
    )

    return EngineResult(
        counts=run_result.counts,
        selected_engine=ENGINE_ID,
        engine_reason=(
            f"Density-matrix simulation of {num_qubits} qubits "
            + ("with a depolarizing noise model." if options.noise_enabled else "(noiseless).")
        ),
        warnings=warnings,
        metadata={
            "method": "density_matrix",
            "noise_enabled": options.noise_enabled,
            "memory_risk": risk,
        },
        state_analysis=state_analysis,
    )
