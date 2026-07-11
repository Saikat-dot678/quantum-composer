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

from engines.base import (
    EngineNotAvailableError,
    EngineResult,
    UnsupportedGateError,
    format_counts_from_bits,
    stim_available,
)
from validators import ordered_operations

ENGINE_ID = "stim_stabilizer"

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

    try:
        sampler = circuit.compile_sampler(seed=options.seed)
    except TypeError:  # pragma: no cover - older stim without seed kwarg
        sampler = circuit.compile_sampler()
    samples = sampler.sample(int(options.shots))

    shots_bits: list[list[int]] = []
    for shot in samples:
        bits = [0] * max(width, 1)
        for record_index, clbit in enumerate(measurement_clbits):
            if clbit < width:
                bits[clbit] = int(shot[record_index])
        shots_bits.append(bits)

    counts = format_counts_from_bits(shots_bits, width)

    return EngineResult(
        counts=counts,
        selected_engine=ENGINE_ID,
        engine_reason=(
            f"Circuit is Clifford-only on {request.num_qubits} qubits; Stim "
            "simulates it exactly and scales to very large qubit counts."
        ),
        warnings=warnings,
        metadata={"method": "stim_stabilizer", "is_clifford": True},
    )
