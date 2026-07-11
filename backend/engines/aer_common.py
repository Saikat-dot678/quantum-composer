"""Shared helpers for the Qiskit Aer-backed engines.

All Qiskit imports are lazy so that importing this module (and therefore the
whole engines package / FastAPI app) never requires Qiskit to be installed.
"""

from __future__ import annotations

from typing import Any

from circuit_builder import QuantumDependencyError, build_circuit
from engines.base import EngineNotAvailableError


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
