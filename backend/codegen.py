from __future__ import annotations

from schemas import CircuitRequest
from validators import ordered_operations


def _number(value: float | int) -> str:
    return repr(float(value))


def _matrix_literal(matrix: list[list[list[float]]]) -> str:
    """Readable Python literal for a unitary's matrix, e.g. [[complex(1.0, 0.0), ...], ...]."""
    rows = (
        "[" + ", ".join(f"complex({_number(re)}, {_number(im)})" for re, im in row) + "]"
        for row in matrix
    )
    return "[" + ", ".join(rows) + "]"


def generate_qiskit_code(request: CircuitRequest) -> str:
    body: list[str] = []
    has_measurement = False
    has_unitary = False
    for _, operation in ordered_operations(request):
        gate = operation.gate
        q = operation.qubits
        if gate in {"x", "y", "z", "h", "s", "t"}:
            body.append(f"circuit.{gate}({q[0]})")
        elif gate in {"rx", "ry", "rz"}:
            body.append(
                f"circuit.{gate}({_number(operation.params['theta'])}, {q[0]})"
            )
        elif gate in {"cx", "cz", "swap"}:
            body.append(f"circuit.{gate}({q[0]}, {q[1]})")
        elif gate == "measure":
            has_measurement = True
            body.append(f"circuit.measure({q[0]}, {operation.clbits[0]})")
        elif gate == "barrier":
            body.append(f"circuit.barrier({', '.join(map(str, q))})")
        elif gate == "unitary":
            has_unitary = True
            label = operation.label or "U"
            body.append(
                f"circuit.append(UnitaryGate({_matrix_literal(operation.matrix)}, "
                f"label={label!r}), {list(q)})  # custom matrix-defined gate"
            )

    lines = ["from qiskit import QuantumCircuit"]
    if has_unitary:
        lines.append("from qiskit.circuit.library import UnitaryGate")
    lines.append("from qiskit_aer import AerSimulator")
    lines.append("")
    lines.append(f"circuit = QuantumCircuit({request.num_qubits}, {request.num_clbits})")
    lines.extend(body)

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
