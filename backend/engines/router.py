"""Engine router: pick a feasible engine, or explain why none is.

The router's central promise: it will **never** silently launch an exponential
statevector allocation that would exhaust memory. When a circuit cannot be
simulated by any available method it raises :class:`InfeasibleCircuitError` with
an honest explanation and concrete alternatives.
"""

from __future__ import annotations

import time
from typing import Any

from analysis.circuit_analyzer import analyze_circuit
from engines import aer_density, aer_mps, aer_stabilizer, aer_statevector, stim_stabilizer
from engines.base import (
    EngineResult,
    InfeasibleCircuitError,
    aer_available,
    stim_available,
)

# Static description of every engine, used by GET /engines and the UI.
ENGINE_CATALOG: list[dict[str, Any]] = [
    {
        "id": "auto",
        "name": "Auto (recommended)",
        "description": "Analyzes the circuit and chooses the safest feasible engine.",
        "scales_to_large_structured_circuits": True,
        "optional_dependency": None,
        "best_for": "Let the router decide between exact, stabilizer and MPS.",
        "limitations": "Rejects arbitrary large non-Clifford circuits that need exponential memory.",
    },
    {
        "id": "aer_statevector",
        "name": "Aer statevector",
        "description": "Exact simulation of small arbitrary (universal) circuits.",
        "scales_to_large_structured_circuits": False,
        "optional_dependency": "qiskit-aer",
        "best_for": "Any gate set, small qubit counts.",
        "limitations": "Stores 16 * 2**n bytes; infeasible beyond ~30 qubits.",
    },
    {
        "id": "aer_mps",
        "name": "Aer matrix product state",
        "description": "Approximate simulation of large low-entanglement circuits.",
        "scales_to_large_structured_circuits": True,
        "optional_dependency": "qiskit-aer",
        "best_for": "Nearest-neighbour / low-entanglement circuits with many qubits.",
        "limitations": "Bond dimension explodes for highly entangled circuits; results may be approximate.",
    },
    {
        "id": "aer_stabilizer",
        "name": "Aer stabilizer",
        "description": "Exact simulation of large Clifford-only circuits.",
        "scales_to_large_structured_circuits": True,
        "optional_dependency": "qiskit-aer",
        "best_for": "Clifford circuits (X,Y,Z,H,S,CX,CZ,SWAP,measure) at large scale.",
        "limitations": "Rejects T gates and non-Clifford rotations. Not a universal simulator.",
    },
    {
        "id": "aer_density_matrix",
        "name": "Aer density matrix",
        "description": "Exact mixed-state simulation for small noisy circuits.",
        "scales_to_large_structured_circuits": False,
        "optional_dependency": "qiskit-aer",
        "best_for": "Small circuits with a noise model.",
        "limitations": "Stores 16 * 4**n bytes; even more memory-hungry than the statevector.",
    },
    {
        "id": "stim_stabilizer",
        "name": "Stim stabilizer",
        "description": "Very fast exact simulation of very large Clifford circuits.",
        "scales_to_large_structured_circuits": True,
        "optional_dependency": "stim",
        "best_for": "Clifford circuits with hundreds to millions of qubits.",
        "limitations": "Clifford-only. Not a universal simulator. Optional dependency.",
    },
]

_ENGINE_RUNNERS = {
    "aer_statevector": aer_statevector.run,
    "aer_mps": aer_mps.run,
    "aer_stabilizer": aer_stabilizer.run,
    "aer_density_matrix": aer_density.run,
    "stim_stabilizer": stim_stabilizer.run,
}


def available_engines() -> list[dict[str, Any]]:
    """Return the engine catalog annotated with runtime availability."""
    has_aer = aer_available()
    has_stim = stim_available()
    result = []
    for entry in ENGINE_CATALOG:
        dep = entry["optional_dependency"]
        if dep == "stim":
            available = has_stim
        elif dep == "qiskit-aer":
            available = has_aer
        else:  # auto
            available = has_aer
        item = dict(entry)
        item["available"] = available
        item["unavailable_reason"] = (
            None
            if available
            else f"Optional dependency '{dep}' is not installed."
        )
        result.append(item)
    return result


def choose_engine(analysis: dict[str, Any], options: Any) -> tuple[str, str]:
    """Honest auto-selection. May raise :class:`InfeasibleCircuitError`."""
    n = analysis["num_qubits"]
    sv_risk = analysis["statevector_risk"]
    dm_risk = analysis["density_matrix_risk"]
    is_clifford = analysis["is_clifford"]

    # 1. Noise requested -> density matrix (small circuits only).
    if options.noise_enabled:
        if dm_risk in {"safe", "heavy"}:
            return (
                "aer_density_matrix",
                f"Noise is enabled; density-matrix simulation is feasible for "
                f"{n} qubits.",
            )
        raise InfeasibleCircuitError(
            f"Noisy simulation uses a density matrix (16 * 4**n bytes). For "
            f"{n} qubits that is {analysis['estimated_density_matrix_memory_human']}, "
            f"beyond the {options.max_memory_mb} MB budget. Reduce the qubit count "
            "for noisy simulation."
        )

    # 2. Small enough for exact statevector -> richest output, any gate set.
    if sv_risk == "safe":
        return (
            "aer_statevector",
            f"{n} qubits is small enough for exact statevector simulation.",
        )

    # 3. Clifford-only -> stabilizer (scales to very large qubit counts).
    if is_clifford:
        if stim_available():
            return (
                "stim_stabilizer",
                f"Circuit is Clifford-only on {n} qubits; Stim simulates it exactly "
                "at large scale.",
            )
        return (
            "aer_stabilizer",
            f"Circuit is Clifford-only on {n} qubits; Stim is unavailable so the Aer "
            "stabilizer method is used (also polynomial in memory).",
        )

    # 4. Non-Clifford but statevector is still (heavily) feasible.
    if sv_risk == "heavy":
        return (
            "aer_statevector",
            f"Non-Clifford circuit; exact statevector is memory-heavy but feasible "
            f"for {n} qubits.",
        )

    # 5. Too big for exact, non-Clifford -> MPS only with explicit approximation.
    if options.allow_approximation:
        return (
            "aer_mps",
            f"Exact simulation of {n} non-Clifford qubits is infeasible; attempting "
            "approximate MPS simulation (only accurate for low entanglement).",
        )

    # 6. Nothing safe -> reject with an honest explanation.
    raise InfeasibleCircuitError(
        f"This circuit likely requires exponential memory for exact classical "
        f"simulation: {n} non-Clifford qubits need "
        f"{analysis['estimated_statevector_memory_human']} for a full statevector. "
        "Try MPS with approximation (enable 'allow_approximation' for a "
        "low-entanglement circuit), reduce the qubit count or depth, use a "
        "Clifford/stabilizer-compatible circuit, or run on real quantum hardware."
    )


def _maybe_diagram(request: Any, num_qubits: int, operation_count: int) -> str | None:
    """Text circuit diagram, only for circuits small enough to be readable."""
    if num_qubits > 12 or operation_count > 80:
        return None
    try:
        from circuit_builder import build_circuit

        return str(build_circuit(request).draw(output="text"))
    except Exception:  # pragma: no cover - diagram is best-effort
        return None


def simulate(request: Any, options: Any) -> dict[str, Any]:
    """Analyze, route and run a circuit, returning a full v2 response dict."""
    analysis = analyze_circuit(
        num_qubits=request.num_qubits,
        num_clbits=request.num_clbits,
        operations=request.operations,
        max_memory_mb=options.max_memory_mb,
        stim_available=stim_available(),
    )

    requested = options.engine.value if hasattr(options.engine, "value") else str(options.engine)
    auto_reason: str | None = None
    if requested == "auto":
        engine_id, auto_reason = choose_engine(analysis, options)
    else:
        engine_id = requested

    runner = _ENGINE_RUNNERS.get(engine_id)
    if runner is None:
        raise InfeasibleCircuitError(f"Unknown engine '{engine_id}'.")

    start = time.perf_counter()
    result: EngineResult = runner(request, options, analysis)
    timing_ms = round((time.perf_counter() - start) * 1000.0, 3)

    reason = result.engine_reason
    if auto_reason:
        reason = f"{auto_reason} {result.engine_reason}".strip()

    return {
        "counts": result.counts,
        "depth": analysis["depth"],
        "gate_counts": analysis["gate_counts"],
        "selected_engine": result.selected_engine,
        "engine_reason": reason,
        "warnings": result.warnings,
        "resource_estimate": analysis["resource_estimate"],
        "timing_ms": timing_ms,
        "diagram": _maybe_diagram(request, analysis["num_qubits"], analysis["operation_count"]),
        "metadata": {
            **result.metadata,
            "requested_engine": requested,
            "auto_selected": auto_reason is not None,
            "is_clifford": analysis["is_clifford"],
            "feasibility_status": analysis["feasibility_status"],
        },
    }
