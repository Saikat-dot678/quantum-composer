"""Stim stabilizer engine -- exact simulation of very large Clifford circuits.

`Stim <https://github.com/quantumlib/Stim>`_ is a dedicated, extremely fast
stabilizer simulator. It can handle Clifford circuits with thousands to millions
of qubits -- but it is emphatically **not** a universal quantum simulator. Any
non-Clifford gate (T, arbitrary-angle rotations) is rejected.

Stim is an *optional* dependency. If it is not installed this module never
crashes the app: the router simply reports it as unavailable and falls back to
the Aer stabilizer engine.
"""

from __future__ import annotations

from typing import Any

from analysis.state_postprocessing import MAX_STABILIZER_SUMMARY_QUBITS
from engines.aer_common import analyze_measurement_structure
from engines.base import (
    EngineNotAvailableError,
    EngineResult,
    InfeasibleCircuitError,
    UnsupportedGateError,
    stim_available,
)
from validators import ordered_operation_items, ordered_operations

ENGINE_ID = "stim_stabilizer"

# Sampling cost depends on both register width and shots. The V2 schema permits
# large values for each independently, so guard their product before asking Stim
# for a potentially enormous sample matrix. This is an engine-specific execution
# guard, not a change to the public request schema.
MAX_SAMPLE_WORK_CELLS = 10_000_000
MAX_SAMPLE_BATCH_CELLS = 1_000_000

# Declarative gate -> Stim instruction name for the supported Clifford subset.
_STIM_GATES = {
    "x": "X",
    "y": "Y",
    "z": "Z",
    "h": "H",
    "s": "S",
    "cx": "CX",
    "cz": "CZ",
    "swap": "SWAP",
}


def _load_stim():
    try:
        import stim
    except ImportError as exc:  # pragma: no cover - exercised when stim absent
        raise EngineNotAvailableError(
            "Stim is not installed. Install the optional dependency with "
            "'pip install stim' to enable large Clifford simulation, or use the "
            "'aer_stabilizer' engine instead."
        ) from exc
    return stim


def _ensure_sampling_work_is_safe(shots: int, width: int) -> int:
    work_cells = int(shots) * max(int(width), 1)
    if work_cells > MAX_SAMPLE_WORK_CELLS:
        raise InfeasibleCircuitError(
            "Stim sampling request is too large for the synchronous API: "
            f"{shots} shots x {width} output bits = {work_cells:,} sampled bit cells, "
            f"above the {MAX_SAMPLE_WORK_CELLS:,} safety limit. Reduce shots or "
            "register width."
        )
    return work_cells


def _stabilizer_generators(operations: Any, num_qubits: int) -> list[str]:
    """A second, separate `stim.TableauSimulator` pass over the same
    (non-measure) gate sequence -- stabilizer tracking is polynomial-time
    even at huge qubit counts, so this duplicate pass is cheap, not a
    "duplicate expensive simulation" concern. Never includes measurement:
    the tableau describes the state at the point state analysis targets
    (final or pre-measurement), which by construction is always before any
    measurement once mid-circuit measurement has been ruled out.
    """
    stim = _load_stim()
    sim = stim.TableauSimulator()
    tableau_circuit = stim.Circuit()
    for _, op in ordered_operation_items(list(operations)):
        if op.gate in _STIM_GATES:
            tableau_circuit.append(_STIM_GATES[op.gate], list(op.qubits))
        # measure/barrier are meaningless to a tableau simulator; skipped.
    sim.do(tableau_circuit)
    tableau = sim.current_inverse_tableau().inverse()
    return [str(tableau.z_output(k)) for k in range(num_qubits)]


def run(request: Any, options: Any, analysis: dict[str, Any]) -> EngineResult:
    if not stim_available():
        raise EngineNotAvailableError(
            "Stim is not installed. Install 'stim' to enable large Clifford "
            "simulation, or use the 'aer_stabilizer' engine."
        )
    if analysis["contains_non_clifford"]:
        reasons = ", ".join(analysis.get("non_clifford_reasons", [])) or "non-Clifford gates"
        raise UnsupportedGateError(
            "Stim only simulates Clifford circuits, but this circuit contains: "
            f"{reasons}. Stim is not a universal simulator. Use the statevector or "
            "MPS engine for non-Clifford circuits."
        )
    if analysis.get("rotation_count", 0):
        raise UnsupportedGateError(
            "Stim's direct gate mapping does not accept RX, RY or RZ instructions, "
            "even when an angle is Clifford-equivalent. Use the Aer stabilizer "
            "engine for Clifford-angle rotations."
        )

    stim = _load_stim()
    circuit = stim.Circuit()

    # Track which classical bit each measurement writes to, in measurement order.
    measurement_clbits: list[int] = []
    has_explicit_measure = any(op.gate == "measure" for op in request.operations)
    warnings: list[str] = []

    for _, op in ordered_operations(request):
        gate = op.gate
        if gate in _STIM_GATES:
            circuit.append(_STIM_GATES[gate], list(op.qubits))
        elif gate == "measure":
            circuit.append("M", [op.qubits[0]])
            measurement_clbits.append(op.clbits[0])
        elif gate == "barrier":
            circuit.append("TICK")
        else:
            # Should have been caught by the Clifford check above.
            raise UnsupportedGateError(
                f"Gate '{gate}' is not supported by the Stim stabilizer engine."
            )

    if not has_explicit_measure:
        num_qubits = request.num_qubits
        for q in range(num_qubits):
            circuit.append("M", [q])
            measurement_clbits.append(q)
        width = num_qubits
        warnings.append(
            "No measurement operations were supplied; all qubits were measured "
            "automatically for sampling."
        )
    else:
        width = request.num_clbits

    if not measurement_clbits:
        raise UnsupportedGateError(
            "Stim engine requires at least one measurement or qubit to sample."
        )

    work_cells = _ensure_sampling_work_is_safe(int(options.shots), width)

    try:
        sampler = circuit.compile_sampler(seed=options.seed)
    except TypeError:  # pragma: no cover - older stim without seed kwarg
        sampler = circuit.compile_sampler()
    # Accumulate counts in bounded batches instead of materializing a Python
    # list for every bit of every shot. Stim's compiled sampler keeps its RNG
    # state across calls, so seeded sampling remains deterministic.
    counts: dict[str, int] = {}
    remaining = int(options.shots)
    records_per_shot = max(len(measurement_clbits), 1)
    batch_limit = max(1, MAX_SAMPLE_BATCH_CELLS // records_per_shot)
    while remaining:
        batch_size = min(remaining, batch_limit)
        samples = sampler.sample(batch_size)
        for shot in samples:
            bits = bytearray(max(width, 1))
            for record_index, clbit in enumerate(measurement_clbits):
                if clbit < width:
                    bits[clbit] = int(shot[record_index])
            key = "".join("1" if bits[c] else "0" for c in range(width - 1, -1, -1))
            counts[key] = counts.get(key, 0) + 1
        remaining -= batch_size

    state_analysis = None
    if options.include_state_analysis:
        from analysis import state_postprocessing as sp

        num_qubits = request.num_qubits
        if num_qubits > MAX_STABILIZER_SUMMARY_QUBITS:
            state_analysis = sp.unavailable_state_analysis(
                ENGINE_ID,
                f"Stabilizer generator summary is only attempted up to {MAX_STABILIZER_SUMMARY_QUBITS} "
                f"qubits (this circuit has {num_qubits}); payload-size guard only -- stabilizer "
                "tracking itself remains polynomial-time at any scale.",
            )
        else:
            structure = analyze_measurement_structure(request.operations)
            if structure["mid_circuit"]:
                state_analysis = sp.unavailable_state_analysis(
                    ENGINE_ID,
                    "A single deterministic pure quantum state is not available because this circuit "
                    "measures a qubit and then continues operating on it -- the state after a "
                    "mid-circuit measurement depends on the (random) measurement outcome.",
                )
            else:
                try:
                    generators = _stabilizer_generators(request.operations, num_qubits)
                    state_analysis = sp.stabilizer_summary(
                        generators,
                        num_qubits,
                        source_engine=ENGINE_ID,
                        semantic_point="final_state" if not has_explicit_measure else "pre_measurement_state",
                    )
                except Exception as exc:  # pragma: no cover - defensive
                    state_analysis = sp.unavailable_state_analysis(ENGINE_ID, f"Stabilizer extraction failed: {exc}")

    return EngineResult(
        counts=counts,
        selected_engine=ENGINE_ID,
        engine_reason=(
            f"Circuit is Clifford-only on {request.num_qubits} qubits; Stim "
            "simulates it exactly and scales to very large qubit counts."
        ),
        warnings=warnings,
        metadata={
            "method": "stim_stabilizer",
            "is_clifford": True,
            "sample_work_cells": work_cells,
        },
        state_analysis=state_analysis,
    )
