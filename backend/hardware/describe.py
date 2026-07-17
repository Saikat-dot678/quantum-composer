"""Normalize any backend/Target into the provider-agnostic response models.

Handles missing properties everywhere: a fake snapshot without T2, a manual
target without calibration, an IBM backend that omits pending-job counts --
every absent value becomes null, never a crash or a fabricated number.
Calibration values are always accompanied by their timestamp when one
exists, so stale data is never presented as live measurement.
"""

from __future__ import annotations

import math
from typing import Any

from qiskit.transpiler import Target

from .schemas import (
    BackendDetail,
    BackendSummary,
    EdgeCalibration,
    ManualHardwareDefinition,
    QubitCalibration,
    TargetSource,
)
from .targets import TargetBuildError, build_fake_backend, build_generic_backend, build_manual_target

_TWO_QUBIT_NAMES = {
    "cx", "cz", "cy", "ch", "swap", "iswap", "ecr", "rzz", "rxx", "ryy", "rzx", "cp", "crx", "cry", "crz",
}
_NON_GATE_NAMES = {"measure", "reset", "delay", "barrier", "id", "if_else", "for_loop", "while_loop", "switch_case"}


def _finite(value: Any) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _dynamic_circuits(operation_names: list[str]) -> bool:
    return any(name in operation_names for name in ("if_else", "for_loop", "while_loop", "switch_case"))


def _processor_parts(processor: Any) -> tuple[str | None, str | None]:
    if isinstance(processor, dict):
        family = processor.get("family") or processor.get("type")
        version = processor.get("revision") or processor.get("version")
        return (str(family) if family is not None else None, str(version) if version is not None else None)
    return (str(processor) if processor else None, None)


def resolve_target(source: TargetSource) -> tuple[Target, dict[str, Any]]:
    """Target plus normalized metadata for any non-IBM source. IBM sources
    are resolved in ibm_service.resolve_ibm_target (needs an account)."""
    if source.kind == "generic":
        backend = build_generic_backend(source)
        meta = {
            "name": f"generic_{source.topology}_{source.num_qubits}q",
            "source": "generic",
            "simulator": True,
            "description": (
                f"Synthetic {source.topology} topology built with qiskit GenericBackendV2 (seed {source.seed}). "
                "Its error/duration values are randomly generated placeholders, not any real device's calibration."
            ),
            "calibration_timestamp": None,
        }
        return backend.target, meta
    if source.kind == "fake":
        backend = build_fake_backend(source.name)
        online = getattr(backend, "online_date", None)
        processor_family, processor_version = _processor_parts(getattr(backend, "processor_type", None))
        meta = {
            "name": backend.name,
            "source": "fake",
            "simulator": True,
            "description": (
                "Static snapshot of a real IBM device's advertised topology and calibration, shipped with "
                "qiskit-ibm-runtime. It approximates the device class; it does not reproduce the live device."
            ),
            "calibration_timestamp": online.isoformat() if online is not None else None,
            "processor_family": processor_family,
            "processor_version": processor_version,
        }
        return backend.target, meta
    if source.kind == "manual":
        target = build_manual_target(source.definition)
        meta = {
            "name": source.definition.name,
            "source": "manual",
            "simulator": True,
            "description": source.definition.notes or "User-defined hardware target.",
            "calibration_timestamp": source.definition.calibration_timestamp,
            "manual_definition": source.definition,
        }
        return target, meta
    raise TargetBuildError("IBM targets require an active IBM Quantum connection; see /hardware/status.")


def summarize_target(target: Target, meta: dict[str, Any]) -> BackendSummary:
    operation_names = sorted(target.operation_names)
    basis = [name for name in operation_names if name not in _NON_GATE_NAMES]
    return BackendSummary(
        source=meta["source"],
        name=meta["name"],
        num_qubits=target.num_qubits or 0,
        basis_gates=basis,
        simulator=bool(meta.get("simulator", True)),
        operational=meta.get("operational"),
        pending_jobs=meta.get("pending_jobs"),
        processor_family=meta.get("processor_family"),
        processor_version=meta.get("processor_version"),
        region=meta.get("region"),
        dynamic_circuits=_dynamic_circuits(operation_names),
        calibration_timestamp=meta.get("calibration_timestamp"),
        description=meta.get("description"),
    )


def _qubit_calibrations(target: Target) -> list[QubitCalibration]:
    calibrations: list[QubitCalibration] = []
    qubit_properties = target.qubit_properties
    measure_props = target.get("measure", None) if "measure" in target.operation_names else None
    for qubit in range(target.num_qubits or 0):
        t1 = t2 = frequency = None
        if qubit_properties is not None and qubit < len(qubit_properties) and qubit_properties[qubit] is not None:
            props = qubit_properties[qubit]
            t1 = _finite(getattr(props, "t1", None))
            t2 = _finite(getattr(props, "t2", None))
            frequency = _finite(getattr(props, "frequency", None))
        readout = None
        if measure_props is not None:
            instruction_props = measure_props.get((qubit,))
            if instruction_props is not None:
                readout = _finite(getattr(instruction_props, "error", None))
        calibrations.append(
            QubitCalibration(
                qubit=qubit,
                t1_us=t1 * 1e6 if t1 is not None else None,
                t2_us=t2 * 1e6 if t2 is not None else None,
                readout_error=readout,
                frequency_ghz=frequency / 1e9 if frequency is not None else None,
            )
        )
    return calibrations


def _edge_calibrations(target: Target) -> list[EdgeCalibration]:
    calibrations: list[EdgeCalibration] = []
    for name in sorted(target.operation_names):
        if name not in _TWO_QUBIT_NAMES:
            continue
        for qargs, props in target[name].items():
            if qargs is None or len(qargs) != 2:
                continue
            calibrations.append(
                EdgeCalibration(
                    control=qargs[0],
                    target=qargs[1],
                    gate=name,
                    error=_finite(getattr(props, "error", None)) if props is not None else None,
                    duration_ns=(_finite(getattr(props, "duration", None)) or 0) * 1e9 if props is not None and _finite(getattr(props, "duration", None)) is not None else None,
                )
            )
    return calibrations


def describe_target(target: Target, meta: dict[str, Any]) -> BackendDetail:
    summary = summarize_target(target, meta)
    coupling = target.build_coupling_map()
    edges = [[int(a), int(b)] for a, b in coupling.get_edges()] if coupling is not None else []

    coordinates = None
    coordinates_schematic = True
    definition = meta.get("manual_definition")
    if isinstance(definition, ManualHardwareDefinition) and definition.coordinates:
        coordinates = [[point.x, point.y] for point in definition.coordinates]
        coordinates_schematic = False

    warnings: list[str] = []
    if summary.source == "generic":
        warnings.append("Generic targets carry synthetic placeholder calibration values, not real measurements.")
    if summary.source == "fake":
        warnings.append(
            "Fake-backend calibration is a static snapshot from the qiskit-ibm-runtime release, not live device data."
        )
    if summary.source == "ibm":
        warnings.append(
            "Calibration and queue metadata are time-sensitive. Refresh discovery before making a deployment decision."
        )
    if coordinates is None:
        warnings.append("No physical coordinates available; the topology view uses a schematic layout.")

    return BackendDetail(
        summary=summary,
        coupling_edges=edges,
        coordinates=coordinates,
        coordinates_schematic=coordinates is None or coordinates_schematic,
        qubit_calibrations=_qubit_calibrations(target),
        edge_calibrations=_edge_calibrations(target),
        supported_instructions=sorted(target.operation_names),
        dt_ns=(target.dt * 1e9) if target.dt is not None else None,
        notes=(definition.notes if isinstance(definition, ManualHardwareDefinition) else None),
        warnings=warnings,
    )


def list_fake_backends() -> list[BackendSummary]:
    from qiskit_ibm_runtime.fake_provider import FakeProviderForBackendV2

    summaries: list[BackendSummary] = []
    provider = FakeProviderForBackendV2()
    for backend in provider.backends():
        try:
            online = getattr(backend, "online_date", None)
            operation_names = sorted(backend.target.operation_names)
            processor_family, processor_version = _processor_parts(getattr(backend, "processor_type", None))
            summaries.append(
                BackendSummary(
                    source="fake",
                    name=backend.name,
                    num_qubits=backend.num_qubits,
                    basis_gates=[name for name in operation_names if name not in _NON_GATE_NAMES],
                    simulator=True,
                    processor_family=processor_family,
                    processor_version=processor_version,
                    dynamic_circuits=_dynamic_circuits(operation_names),
                    calibration_timestamp=online.isoformat() if online is not None else None,
                    description="Static device snapshot shipped with qiskit-ibm-runtime.",
                )
            )
        except Exception:
            # One broken snapshot must not take down the whole catalog.
            continue
    summaries.sort(key=lambda summary: (-summary.num_qubits, summary.name))
    return summaries
