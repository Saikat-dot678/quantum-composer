"""Matrix Product State (MPS) engine -- approximate, low-entanglement circuits.

MPS represents the state as a chain of tensors linked by "bonds". For circuits
with low entanglement the bond dimension stays small and simulation is cheap
even for hundreds of qubits. For highly entangled circuits the bond dimension
grows exponentially and MPS becomes as expensive as (or worse than) exact
simulation, or must truncate and return an approximate answer. This engine is
therefore honest about being approximate.
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

    warnings = [
        "MPS simulation is exact only for low-entanglement circuits. For highly "
        "entangled circuits the bond dimension can blow up (slow) or truncation "
        "makes results approximate.",
    ]
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
            "approximate": True,
            "mps_max_bond_dimension": options.mps_max_bond_dimension,
            "mps_truncation_threshold": options.mps_truncation_threshold,
        },
    )
