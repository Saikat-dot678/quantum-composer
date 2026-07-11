from __future__ import annotations

from schemas import CircuitRequest
from validators import ordered_operations


def _number(value: float | int) -> str:
    return repr(float(value))


def generate_qiskit_code(request: CircuitRequest) -> str:
    lines = [
        "from qiskit import QuantumCircuit",
        "from qiskit_aer import AerSimulator",
        "",
        f"circuit = QuantumCircuit({request.num_qubits}, {request.num_clbits})",
    ]

    has_measurement = False
    for _, operation in ordered_operations(request):
        gate = operation.gate
        q = operation.qubits
        if gate in {"x", "y", "z", "h", "s", "t"}:
            lines.append(f"circuit.{gate}({q[0]})")
        elif gate in {"rx", "ry", "rz"}:
            lines.append(
                f"circuit.{gate}({_number(operation.params['theta'])}, {q[0]})"
            )
        elif gate in {"cx", "cz", "swap"}:
            lines.append(f"circuit.{gate}({q[0]}, {q[1]})")
        elif gate == "measure":
            has_measurement = True
            lines.append(f"circuit.measure({q[0]}, {operation.clbits[0]})")
        elif gate == "barrier":
            lines.append(f"circuit.barrier({', '.join(map(str, q))})")

    lines.extend(["", "simulator = AerSimulator()"])
    if has_measurement:
        lines.extend(
            [
                f"result = simulator.run(circuit, shots={request.shots}).result()",
                "counts = result.get_counts(circuit)",
                "print(counts)",
            ]
        )
    else:
        lines.extend(
            [
                "measured_circuit = circuit.measure_all(inplace=False)",
                f"result = simulator.run(measured_circuit, shots={request.shots}).result()",
                "counts = result.get_counts(measured_circuit)",
                "print(counts)",
            ]
        )
    return "\n".join(lines)


def generate_qasm(circuit) -> str:
    try:
        from qiskit import qasm2

        return qasm2.dumps(circuit)
    except (ImportError, AttributeError) as exc:
        raise RuntimeError(
            "OpenQASM 2 export is unavailable in the installed Qiskit version."
        ) from exc
