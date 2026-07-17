"""Backend-aware transpilation, layout extraction, and target comparison."""

from __future__ import annotations

import math
import time
from typing import Any

from qiskit import QuantumCircuit
from qiskit.transpiler.preset_passmanagers import generate_preset_pass_manager
from visualization.circuit_renderer import render_circuit_diagram

from .circuits import bounded_diagram, circuit_from_source, circuit_metrics
from .describe import describe_target, resolve_target
from .ibm_service import resolve_ibm_target
from .schemas import (
    CompareEntry,
    CompareRequest,
    CompareResponse,
    HeuristicErrorEstimate,
    ImportCircuitRequest,
    ImportCircuitResponse,
    RoutingSwap,
    TargetSource,
    TranspileOptions,
    TranspileRequest,
    TranspileResponse,
    TranspiledLayout,
)
from .targets import TargetBuildError


class TranspilationError(ValueError):
    """A user-fixable mapping/transpilation failure; maps to HTTP 422."""


def resolve_any_target(source: TargetSource) -> tuple[Any, dict[str, Any]]:
    if source.kind == "ibm":
        return resolve_ibm_target(source.name)
    return resolve_target(source)


def _validate_layout(circuit: QuantumCircuit, target: Any, options: TranspileOptions) -> None:
    if (target.num_qubits or 0) < circuit.num_qubits:
        raise TranspilationError(
            f"The circuit needs {circuit.num_qubits} logical qubits but the selected target has "
            f"{target.num_qubits or 0}."
        )
    if options.initial_layout is None:
        return
    if len(options.initial_layout) != circuit.num_qubits:
        raise TranspilationError(
            f"initial_layout must contain one physical qubit for each of the circuit's "
            f"{circuit.num_qubits} logical qubits."
        )
    if len(set(options.initial_layout)) != len(options.initial_layout):
        raise TranspilationError("initial_layout cannot map two logical qubits to the same physical qubit.")
    invalid = [value for value in options.initial_layout if value < 0 or value >= (target.num_qubits or 0)]
    if invalid:
        raise TranspilationError(
            f"initial_layout references physical qubits outside 0..{(target.num_qubits or 1) - 1}: "
            + ", ".join(str(value) for value in invalid)
        )


def _physical_index(dag: Any, qubit: Any) -> int:
    try:
        return int(dag.find_bit(qubit).index)
    except Exception:
        return int(getattr(qubit, "_index", 0))


def _run_pass_manager(
    circuit: QuantumCircuit,
    target: Any,
    options: TranspileOptions,
) -> tuple[QuantumCircuit, list[RoutingSwap], float]:
    _validate_layout(circuit, target, options)
    pass_manager = generate_preset_pass_manager(
        optimization_level=options.optimization_level,
        target=target,
        initial_layout=options.initial_layout,
        layout_method=options.layout_method,
        routing_method=options.routing_method,
        seed_transpiler=options.seed,
    )

    original_swaps = circuit.count_ops().get("swap", 0)
    captured_pairs: list[tuple[int, int]] = []

    def callback(**kwargs: Any) -> None:
        nonlocal captured_pairs
        dag = kwargs.get("dag")
        if dag is None:
            return
        try:
            swap_nodes = [node for node in dag.topological_op_nodes() if node.name == "swap"]
        except Exception:
            return
        if len(swap_nodes) <= len(captured_pairs):
            return
        captured_pairs = [
            (_physical_index(dag, node.qargs[0]), _physical_index(dag, node.qargs[1]))
            for node in swap_nodes
            if len(node.qargs) == 2
        ]

    started = time.perf_counter()
    try:
        transpiled = pass_manager.run(circuit, callback=callback)
    except Exception as error:
        raise TranspilationError(f"Qiskit could not map this circuit to the selected target: {error}") from error
    elapsed_ms = (time.perf_counter() - started) * 1000.0

    inserted_pairs = captured_pairs[min(original_swaps, len(captured_pairs)) :]
    swaps = [
        RoutingSwap(sequence=index + 1, physical_a=pair[0], physical_b=pair[1])
        for index, pair in enumerate(inserted_pairs)
    ]
    return transpiled, swaps, elapsed_ms


def _layout(transpiled: QuantumCircuit, logical_qubits: int, target_qubits: int) -> TranspiledLayout:
    initial: list[int] | None = None
    final: list[int] | None = None
    layout = getattr(transpiled, "layout", None)
    if layout is not None:
        try:
            initial = [int(value) for value in layout.initial_index_layout(filter_ancillas=True)]
        except Exception:
            initial = None
        try:
            final = [int(value) for value in layout.final_index_layout(filter_ancillas=True)]
        except Exception:
            final = None
    if initial is None:
        initial = list(range(logical_qubits))
    if final is None:
        final = list(initial)

    active: set[int] = set()
    for instruction in transpiled.data:
        if instruction.operation.name in ("barrier", "delay"):
            continue
        for qubit in instruction.qubits:
            active.add(int(transpiled.find_bit(qubit).index))
    return TranspiledLayout(
        initial=initial,
        final=final,
        active_physical_qubits=sorted(active),
        idle_physical_qubits_count=max(0, target_qubits - len(active)),
    )


def _instruction_properties(target: Any, name: str, qargs: tuple[int, ...]) -> Any | None:
    try:
        if name not in target.operation_names:
            return None
        return target[name].get(qargs)
    except Exception:
        return None


def _heuristic_error(transpiled: QuantumCircuit, target: Any) -> HeuristicErrorEstimate:
    log_success = 0.0
    gate_terms = 0
    readout_terms = 0
    missing = 0
    for instruction in transpiled.data:
        name = instruction.operation.name
        if name in ("barrier", "delay"):
            continue
        qargs = tuple(int(transpiled.find_bit(qubit).index) for qubit in instruction.qubits)
        properties = _instruction_properties(target, name, qargs)
        error = getattr(properties, "error", None) if properties is not None else None
        if error is None:
            missing += 1
            continue
        try:
            error_value = float(error)
        except (TypeError, ValueError):
            missing += 1
            continue
        if not math.isfinite(error_value) or error_value < 0 or error_value > 1:
            missing += 1
            continue
        if name == "measure":
            readout_terms += 1
        else:
            gate_terms += 1
        if error_value >= 1:
            log_success = float("-inf")
        elif math.isfinite(log_success):
            log_success += math.log1p(-error_value)
    success = math.exp(log_success) if gate_terms + readout_terms else None
    return HeuristicErrorEstimate(
        success_probability=success,
        gate_error_terms=gate_terms,
        readout_error_terms=readout_terms,
        missing_calibration_terms=missing,
    )


def _duration_us(transpiled: QuantumCircuit, target: Any) -> float | None:
    try:
        value = float(transpiled.estimate_duration(target, unit="u"))
        return value if math.isfinite(value) and value >= 0 else None
    except Exception:
        return None


def transpile_circuit(
    circuit: QuantumCircuit,
    target: Any,
    meta: dict[str, Any],
    options: TranspileOptions,
) -> TranspileResponse:
    transpiled, routing_swaps, elapsed_ms = _run_pass_manager(circuit, target, options)
    original_metrics = circuit_metrics(circuit)
    transpiled_metrics = circuit_metrics(transpiled)
    transpiled_metrics["swap_count"] = len(routing_swaps)
    layout = _layout(transpiled, circuit.num_qubits, target.num_qubits or transpiled.num_qubits)
    heuristic = _heuristic_error(transpiled, target)
    original_render = render_circuit_diagram(circuit)
    transpiled_render = render_circuit_diagram(transpiled)
    warnings: list[str] = []
    if heuristic.missing_calibration_terms:
        warnings.append(
            f"The heuristic error product omitted {heuristic.missing_calibration_terms} operation(s) "
            "whose target calibration was absent."
        )
    if original_render.warning:
        warnings.append(f"Logical circuit: {original_render.warning}")
    if transpiled_render.warning:
        warnings.append(f"Transpiled circuit: {transpiled_render.warning}")
    if meta.get("source") == "generic":
        warnings.append("Generic-target duration and error values are seeded synthetic placeholders.")
    if meta.get("source") == "fake":
        warnings.append("Fake-backend calibration is a static package snapshot, not live device data.")

    return TranspileResponse(
        target_name=str(meta.get("name", "target")),
        target_source=str(meta.get("source", "manual")),
        original=original_metrics,
        transpiled=transpiled_metrics,
        layout=layout,
        basis_gates=[name for name in sorted(target.operation_names) if name not in ("measure", "reset", "delay")],
        optimization_level=options.optimization_level,
        seed=options.seed,
        transpile_time_ms=elapsed_ms,
        estimated_duration_us=_duration_us(transpiled, target),
        heuristic_error=heuristic,
        routing_swaps=routing_swaps,
        original_diagram=bounded_diagram(circuit),
        transpiled_diagram=bounded_diagram(transpiled),
        original_circuit_diagram=original_render.payload,
        transpiled_circuit_diagram=transpiled_render.payload,
        warnings=warnings,
    )


def transpile_request(request: TranspileRequest) -> TranspileResponse:
    circuit = circuit_from_source(request.circuit)
    target, meta = resolve_any_target(request.target)
    return transpile_circuit(circuit, target, meta, request.options)


def _calibration_averages(response: TranspileResponse, target: Any, meta: dict[str, Any]) -> tuple[float | None, float | None]:
    detail = describe_target(target, meta)
    active = set(response.layout.active_physical_qubits)
    readout = [
        item.readout_error
        for item in detail.qubit_calibrations
        if item.qubit in active and item.readout_error is not None
    ]
    used = {tuple(edge) for edge in response.transpiled.used_edges}
    edge_errors = [
        item.error
        for item in detail.edge_calibrations
        if (item.control, item.target) in used and item.error is not None
    ]
    return (
        sum(readout) / len(readout) if readout else None,
        sum(edge_errors) / len(edge_errors) if edge_errors else None,
    )


def compare_request(request: CompareRequest) -> CompareResponse:
    circuit = circuit_from_source(request.circuit)
    entries: list[CompareEntry] = []
    successful: list[tuple[CompareEntry, float]] = []

    for source in request.targets:
        source_name = getattr(source, "name", None) or getattr(source, "topology", None) or source.kind
        try:
            target, meta = resolve_any_target(source)
            result = transpile_circuit(circuit, target, meta, request.options)
            avg_readout, avg_edge = _calibration_averages(result, target, meta)
            entry = CompareEntry(
                target_name=result.target_name,
                target_source=result.target_source,
                ok=True,
                num_qubits=target.num_qubits,
                transpiled_depth=result.transpiled.depth,
                two_qubit_gates=result.transpiled.two_qubit_gates,
                swap_count=result.transpiled.swap_count,
                active_qubits=len(result.layout.active_physical_qubits),
                estimated_duration_us=result.estimated_duration_us,
                heuristic_success_probability=(
                    result.heuristic_error.success_probability if result.heuristic_error else None
                ),
                calibration_timestamp=meta.get("calibration_timestamp"),
                avg_active_readout_error=avg_readout,
                avg_used_edge_error=avg_edge,
                pending_jobs=meta.get("pending_jobs"),
                warnings=result.warnings,
            )
            # Transparent deterministic ranking: routing first, then depth;
            # heuristic calibration product is a bounded tie-breaker. Queue is
            # intentionally absent from this score.
            heuristic_penalty = (
                (1.0 - entry.heuristic_success_probability) * 100.0
                if entry.heuristic_success_probability is not None
                else 50.0
            )
            score = (entry.swap_count or 0) * 1000.0 + (entry.transpiled_depth or 0) + heuristic_penalty
            successful.append((entry, score))
            entries.append(entry)
        except Exception as error:
            if isinstance(error, (TranspilationError, TargetBuildError)):
                message = str(error)
            else:
                message = "This target could not be compared; provider details were redacted."
            entries.append(
                CompareEntry(
                    target_name=str(source_name),
                    target_source=source.kind,
                    ok=False,
                    error=message,
                )
            )

    recommendation = None
    reason = None
    if successful:
        winner, _ = min(successful, key=lambda item: item[1])
        recommendation = winner.target_name
        reason = (
            "Lowest deterministic comparison score: 1000 x inserted SWAPs + transpiled depth + "
            "100 x (1 - heuristic error-product success), using a 50-point calibration penalty when "
            "error data is absent. Queue length is displayed but never enters the score."
        )
    return CompareResponse(entries=entries, recommendation=recommendation, recommendation_reason=reason)


def _normalized_circuit(circuit: QuantumCircuit) -> dict[str, Any]:
    operations: list[dict[str, Any]] = []
    for moment, instruction in enumerate(circuit.data):
        params: list[float | str] = []
        for parameter in instruction.operation.params:
            try:
                params.append(float(parameter))
            except (TypeError, ValueError):
                params.append(str(parameter))
        operations.append(
            {
                "gate": instruction.operation.name,
                "qubits": [int(circuit.find_bit(qubit).index) for qubit in instruction.qubits],
                "clbits": [int(circuit.find_bit(clbit).index) for clbit in instruction.clbits],
                "params": params,
                "sequence": moment,
            }
        )
    return {
        "num_qubits": circuit.num_qubits,
        "num_clbits": circuit.num_clbits,
        "operations": operations,
    }


def import_circuit(request: ImportCircuitRequest) -> ImportCircuitResponse:
    circuit = circuit_from_source(request.source)
    rendered = render_circuit_diagram(circuit)
    return ImportCircuitResponse(
        ok=True,
        normalized=_normalized_circuit(circuit),
        metrics=circuit_metrics(circuit),
        diagram=bounded_diagram(circuit),
        circuit_diagram=rendered.payload,
        warnings=[rendered.warning] if rendered.warning else [],
    )
