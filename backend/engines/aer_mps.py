"""Matrix Product State (MPS) engine -- low-entanglement tensor networks.

MPS represents the state as a chain of tensors linked by "bonds". For circuits
with low entanglement the bond dimension stays small and simulation is cheap
even for hundreds of qubits. For highly entangled circuits the bond dimension
grows exponentially and MPS becomes as expensive as (or worse than) exact
simulation, or must truncate and return an approximate answer. MPS can remain
exact when the required bond dimension is retained; method selection alone does
not prove whether a particular completed run discarded information.
"""

from __future__ import annotations

from typing import Any

from engines.aer_common import run_aer
from engines.base import EngineResult

ENGINE_ID = "aer_mps"


def run(request: Any, options: Any, analysis: dict[str, Any]) -> EngineResult:
    num_qubits = analysis["num_qubits"]
    backend_options: dict[str, Any] = {}
    if options.mps_max_bond_dimension is not None:
        backend_options["matrix_product_state_max_bond_dimension"] = int(
            options.mps_max_bond_dimension
        )
    if options.mps_truncation_threshold is not None:
        backend_options["matrix_product_state_truncation_threshold"] = float(
            options.mps_truncation_threshold
        )

    truncation_configured = (
        options.mps_max_bond_dimension is not None
        or options.mps_truncation_threshold is not None
    )
    warnings = [
        "MPS can remain exact when it retains the required bond dimension. For "
        "highly entangled circuits that dimension can grow exponentially; "
        "truncation or a restrictive bond cap can make results approximate."
    ]
    if truncation_configured:
        warnings.append(
            "An MPS bond limit or truncation threshold is configured. This may "
            "discard information, so exactness is not guaranteed."
        )
    if analysis["two_qubit_gate_count"] and num_qubits >= 20:
        warnings.append(
            f"Circuit has {analysis['two_qubit_gate_count']} two-qubit gates on "
            f"{num_qubits} qubits; watch for bond-dimension growth."
        )

    counts, run_warnings = run_aer(
        request,
        method="matrix_product_state",
        shots=options.shots,
        seed=options.seed,
        noise_model=None,
        backend_options=backend_options,
    )
    warnings.extend(run_warnings)

    reason = (
        f"Matrix Product State simulation chosen for {num_qubits} qubits "
        "(scales well when entanglement stays low)."
    )
    return EngineResult(
        counts=counts,
        selected_engine=ENGINE_ID,
        engine_reason=reason,
        warnings=warnings,
        metadata={
            "method": "matrix_product_state",
            # Backward-compatible UI hint: true means the caller configured a
            # truncation/bond constraint, not that discarded weight was measured.
            "approximate": truncation_configured,
            "approximation_possible": True,
            "truncation_configured": truncation_configured,
            "exactness_note": (
                "Exactness depends on retaining the required bond dimension; "
                "this API does not report discarded weight."
            ),
            "mps_max_bond_dimension": options.mps_max_bond_dimension,
            "mps_truncation_threshold": options.mps_truncation_threshold,
        },
    )
