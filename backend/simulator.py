from __future__ import annotations

from typing import Any

from circuit_builder import QuantumDependencyError, build_circuit
from schemas import CircuitRequest
from visualization.circuit_renderer import render_circuit_diagram


def _load_aer_simulator():
    try:
        from qiskit_aer import AerSimulator
    except ImportError as exc:
        raise QuantumDependencyError(
            "Qiskit Aer is not installed. Run: pip install -r requirements.txt"
        ) from exc
    return AerSimulator


def simulate(request: CircuitRequest) -> dict[str, Any]:
    AerSimulator = _load_aer_simulator()
    circuit = build_circuit(request)
    simulation_circuit = circuit
    warnings: list[str] = []

    has_measurement = any(op.gate == "measure" for op in request.operations)
    if not has_measurement:
        simulation_circuit = circuit.measure_all(inplace=False)
        warnings.append(
            "No measurement operations were supplied; all qubits were measured automatically for simulation."
        )

    simulator = AerSimulator()
    result = simulator.run(simulation_circuit, shots=request.shots).result()
    raw_counts = result.get_counts(simulation_circuit)
    counts = {str(state): int(count) for state, count in raw_counts.items()}
    rendered = render_circuit_diagram(circuit)
    if rendered.warning:
        warnings.append(rendered.warning)

    return {
        "counts": counts,
        "depth": int(circuit.depth() or 0),
        "gate_counts": {name: int(count) for name, count in circuit.count_ops().items()},
        "diagram": str(circuit.draw(output="text")),
        "circuit_diagram": rendered.payload,
        "warnings": warnings,
    }
