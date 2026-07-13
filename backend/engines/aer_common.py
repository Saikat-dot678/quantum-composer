"""Shared helpers for the Qiskit Aer-backed engines.

All Qiskit imports are lazy so that importing this module (and therefore the
whole engines package / FastAPI app) never requires Qiskit to be installed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Sequence

from circuit_builder import QuantumDependencyError, apply_operations, build_circuit, empty_circuit, ordered_operation_list
from engines.base import EngineNotAvailableError

STATE_SAVE_LABEL = "quantum_composer_state"


def load_aer_simulator():
    try:
        from qiskit_aer import AerSimulator
    except ImportError as exc:  # pragma: no cover - exercised when Aer absent
        raise EngineNotAvailableError(
            "Qiskit Aer is not installed. Run: pip install -r requirements.txt"
        ) from exc
    return AerSimulator


def prepare_circuit(request: Any) -> tuple[Any, list[str]]:
    """Build the circuit and ensure it has measurements for sampling.

    Returns ``(circuit_to_run, warnings)``. If the user supplied no measurement
    operations, all qubits are measured automatically (matching v1 behaviour).
    """
    warnings: list[str] = []
    circuit = build_circuit(request)
    has_measurement = any(op.gate == "measure" for op in request.operations)
    if not has_measurement:
        circuit = circuit.measure_all(inplace=False)
        warnings.append(
            "No measurement operations were supplied; all qubits were measured "
            "automatically for sampling."
        )
    return circuit, warnings


# ---------------------------------------------------------------------------
# Post-simulation state extraction
#
# `measure` is the only non-unitary operation this schema supports today, so
# "does this circuit have a single well-defined pre-measurement pure state"
# reduces exactly to "does any non-barrier operation touch a qubit after
# that qubit's own measurement" -- precisely decidable from the operation
# list alone, no simulation needed. If custom gates are ever extended with a
# reset/conditional primitive, this is the function that would need to grow
# a case for it.
# ---------------------------------------------------------------------------


def analyze_measurement_structure(operations: Sequence[Any]) -> dict[str, Any]:
    from validators import ordered_operation_items

    ordered = [operation for _, operation in ordered_operation_items(list(operations))]
    measured_qubits: set[int] = set()
    mid_circuit = False
    for operation in ordered:
        if operation.gate == "barrier":
            continue
        if operation.gate == "measure":
            measured_qubits.add(operation.qubits[0])
            continue
        if any(qubit in measured_qubits for qubit in operation.qubits):
            mid_circuit = True
    return {
        "mid_circuit": mid_circuit,
        "measured_qubits": measured_qubits,
        "has_measurements": bool(measured_qubits),
    }


@dataclass
class StateCapableRun:
    """Result of running a circuit that may also have carried a state-save
    instruction. `raw_state` is a Qiskit `Statevector`/`DensityMatrix`
    object (never serialized here -- analysis/state_postprocessing.py owns
    turning it into JSON) or None if state analysis was not attempted."""

    counts: dict[str, int]
    warnings: list[str] = field(default_factory=list)
    raw_state: Any | None = None
    semantic_point: str | None = None
    state_unavailable_reason: str | None = None


def _build_circuit_with_state_save(request: Any, save_instruction: str, no_measurement_semantic_point: str) -> tuple[Any, str]:
    """One circuit that both runs to completion (counts) and carries a save
    instruction at the correct pre-measurement point, so a single Aer
    execution produces both. Caller must already have confirmed there is no
    mid-circuit measurement (see `analyze_measurement_structure`).

    `no_measurement_semantic_point` is `"final_state"` for a pure-state save
    (statevector/MPS) or `"mixed_final_state"` for a density-matrix save --
    the representation's own kind, not whether this particular run happens
    to be pure or noisy. Once any measurement was stripped for the save, the
    semantic point is always `"pre_measurement_state"` regardless of kind:
    purity/mixedness is already conveyed separately via `representation` and
    `global_metrics`.
    """
    ordered = ordered_operation_list(request)
    measure_ops = [operation for operation in ordered if operation.gate == "measure"]
    non_measure_ops = [operation for operation in ordered if operation.gate != "measure"]

    circuit = empty_circuit(request.num_qubits, request.num_clbits)
    apply_operations(circuit, non_measure_ops)
    getattr(circuit, save_instruction)(label=STATE_SAVE_LABEL)

    if measure_ops:
        apply_operations(circuit, measure_ops)
        semantic_point = "pre_measurement_state"
    else:
        circuit.measure_all(inplace=True)
        semantic_point = no_measurement_semantic_point
    return circuit, semantic_point


def run_aer_with_state(
    request: Any,
    *,
    method: str,
    shots: int,
    seed: int | None = None,
    noise_model: Any | None = None,
    backend_options: dict[str, Any] | None = None,
    want_state: bool,
    save_instruction: str,
    max_state_qubits: int,
    no_measurement_semantic_point: str = "final_state",
) -> StateCapableRun:
    """Like `run_aer`, but optionally inserts a save instruction so the same
    execution also yields a raw state for post-processing.

    `max_state_qubits` is an engine-specific gate on whether to even
    *attempt* materializing a state at all (e.g. MPS must not silently
    convert a huge tensor-network state to a full statevector) -- distinct
    from, and typically stricter than, analysis/state_postprocessing.py's
    own limits, which are re-checked independently there regardless.
    """
    AerSimulator = load_aer_simulator()
    num_qubits = request.num_qubits

    state_unavailable_reason: str | None = None
    semantic_point: str | None = None
    if not want_state:
        state_unavailable_reason = None
    elif num_qubits > max_state_qubits:
        state_unavailable_reason = (
            f"This engine only attempts state extraction up to {max_state_qubits} qubits "
            f"(this circuit has {num_qubits}); simulation feasibility and state-visualization "
            "feasibility are different constraints."
        )
    else:
        structure = analyze_measurement_structure(request.operations)
        if structure["mid_circuit"]:
            state_unavailable_reason = (
                "A single deterministic pure quantum state is not available because this circuit "
                "measures a qubit and then continues operating on it -- the state after a mid-circuit "
                "measurement depends on the (random) measurement outcome, so there is no one state to show."
            )

    try:
        if want_state and state_unavailable_reason is None:
            circuit, semantic_point = _build_circuit_with_state_save(request, save_instruction, no_measurement_semantic_point)
            warnings: list[str] = []
        else:
            circuit, warnings = prepare_circuit(request)
    except QuantumDependencyError as exc:
        raise EngineNotAvailableError(str(exc)) from exc

    options: dict[str, Any] = {"method": method}
    if backend_options:
        options.update(backend_options)
    if noise_model is not None:
        options["noise_model"] = noise_model

    simulator = AerSimulator(**options)
    run_kwargs: dict[str, Any] = {"shots": shots}
    if seed is not None:
        run_kwargs["seed_simulator"] = int(seed)

    result = simulator.run(circuit, **run_kwargs).result()
    raw_counts = result.get_counts(circuit)
    counts = {str(state): int(count) for state, count in raw_counts.items()}

    raw_state = None
    if want_state and state_unavailable_reason is None:
        try:
            raw_state = result.data(0)[STATE_SAVE_LABEL]
        except (KeyError, IndexError) as exc:  # pragma: no cover - defensive
            state_unavailable_reason = f"The engine did not return the requested state ({exc})."

    return StateCapableRun(
        counts=counts,
        warnings=warnings,
        raw_state=raw_state,
        semantic_point=semantic_point,
        state_unavailable_reason=state_unavailable_reason,
    )


def build_state_analysis(
    run: StateCapableRun,
    *,
    num_qubits: int,
    source_engine: str,
    kind: str,
    detail: str = "summary",
    max_amplitudes: int = 64,
    top_k: int = 16,
    include_density_matrix: bool = False,
) -> dict[str, Any] | None:
    """Converts a `StateCapableRun` into a `state_analysis` dict. Returns
    None only when state analysis was never requested at all (so callers can
    leave `EngineResult.state_analysis` unset, matching pre-existing
    behavior for ordinary calls). Never raises -- a post-processing failure
    degrades to an `unavailable` dict with the failure reason instead of
    breaking the containing simulation response.
    """
    from analysis import state_postprocessing as sp

    if run.raw_state is None and run.state_unavailable_reason is None:
        return None
    if run.raw_state is None:
        return sp.unavailable_state_analysis(
            source_engine, run.state_unavailable_reason or "State analysis is unavailable for this circuit."
        )
    try:
        if kind == "stabilizer":
            generators = run.raw_state.clifford.to_labels(mode="S")
            # A stabilizer state's measurement distribution can have up to
            # 2**k nonzero outcomes (k = number of "free" qubits) -- safe to
            # enumerate only for small registers. Skipped above that; the
            # generators themselves (always O(n^2) text) remain the primary,
            # always-safe summary regardless of qubit count.
            deterministic = None
            if num_qubits <= sp.MAX_FULL_STATEVECTOR_QUBITS:
                try:
                    deterministic = run.raw_state.probabilities_dict()
                except Exception:  # pragma: no cover - defensive, summary still useful without it
                    deterministic = None
            return sp.stabilizer_summary(
                generators,
                num_qubits,
                source_engine=source_engine,
                semantic_point=run.semantic_point or "final_state",
                deterministic_outcomes=deterministic,
            )

        import numpy as np

        array = np.asarray(run.raw_state)
        if kind == "statevector":
            return sp.statevector_analysis(
                array,
                num_qubits,
                semantic_point=run.semantic_point or "final_state",
                source_engine=source_engine,
                detail=detail,
                max_amplitudes=max_amplitudes,
                top_k=top_k,
            )
        return sp.density_matrix_analysis(
            array,
            num_qubits,
            semantic_point=run.semantic_point or "mixed_final_state",
            source_engine=source_engine,
            include_full_matrix=include_density_matrix,
        )
    except sp.StatePostprocessingError as exc:
        return sp.unavailable_state_analysis(source_engine, str(exc))
    except Exception as exc:  # pragma: no cover - defensive: never let extraction crash the response
        return sp.unavailable_state_analysis(source_engine, f"State extraction failed: {exc}")


def build_depolarizing_noise_model(
    circuit: Any, one_qubit_p: float, two_qubit_p: float
):
    """A simple, honest depolarizing noise model for teaching noisy circuits."""
    from qiskit_aer.noise import NoiseModel, depolarizing_error

    model = NoiseModel()
    one_qubit_gates = ["id", "x", "y", "z", "h", "s", "sdg", "t", "tdg", "rx", "ry", "rz"]
    two_qubit_gates = ["cx", "cz", "swap"]
    if one_qubit_p > 0:
        err1 = depolarizing_error(min(max(one_qubit_p, 0.0), 1.0), 1)
        model.add_all_qubit_quantum_error(err1, one_qubit_gates)
    if two_qubit_p > 0:
        err2 = depolarizing_error(min(max(two_qubit_p, 0.0), 1.0), 2)
        model.add_all_qubit_quantum_error(err2, two_qubit_gates)
    return model


def run_aer(
    request: Any,
    *,
    method: str,
    shots: int,
    seed: int | None = None,
    noise_model: Any | None = None,
    backend_options: dict[str, Any] | None = None,
) -> tuple[dict[str, int], list[str]]:
    """Run ``request`` on an Aer backend using ``method`` and return counts."""
    AerSimulator = load_aer_simulator()
    try:
        circuit, warnings = prepare_circuit(request)
    except QuantumDependencyError as exc:
        raise EngineNotAvailableError(str(exc)) from exc

    options: dict[str, Any] = {"method": method}
    if backend_options:
        options.update(backend_options)
    if noise_model is not None:
        options["noise_model"] = noise_model

    simulator = AerSimulator(**options)
    run_kwargs: dict[str, Any] = {"shots": shots}
    if seed is not None:
        run_kwargs["seed_simulator"] = int(seed)

    result = simulator.run(circuit, **run_kwargs).result()
    raw_counts = result.get_counts(circuit)
    counts = {str(state): int(count) for state, count in raw_counts.items()}
    return counts, warnings
