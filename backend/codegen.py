from __future__ import annotations

from gate_registry import get_gate_spec
from schemas import CircuitRequest
from validators import canonical_operation_order


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
    for operation in canonical_operation_order(request.operations):
        spec = get_gate_spec(operation.gate)
        q = operation.qubits
        if spec.application == "direct":
            args = [_number(operation.params[name]) for name in spec.parameter_names]
            args.extend(map(str, q))
            body.append(f"circuit.{spec.qiskit_method}({', '.join(args)})")
        elif spec.application == "measure":
            has_measurement = True
            body.append(f"circuit.measure({q[0]}, {operation.clbits[0]})")
        elif spec.application == "reset":
            body.append(f"circuit.reset({q[0]})")
        elif spec.application == "barrier":
            body.append(f"circuit.barrier({', '.join(map(str, q))})")
        elif spec.application == "mcx":
            body.append(f"circuit.mcx({q[:-1]!r}, {q[-1]})")
        elif spec.application == "mcp":
            body.append(f"circuit.mcp({_number(operation.params['theta'])}, {q[:-1]!r}, {q[-1]})")
        elif spec.application == "unitary":
            has_unitary = True
            label = operation.label or "U"
            body.append(
                f"circuit.append(UnitaryGate({_matrix_literal(operation.matrix)}, "
                f"label={label!r}), {list(q)})  # custom matrix-defined gate"
            )

    lines = ["from qiskit import QuantumCircuit, transpile", "from qiskit.circuit import Clbit"]
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
                "circuit = transpile(circuit, simulator, optimization_level=0)",
                f"result = simulator.run(circuit, shots={request.shots}).result()",
                'counts = {format(k, f"0{circuit.num_clbits}b"): v for k, v in result.get_counts(circuit).int_outcomes().items()}',
                "print(counts)",
            ]
        )
    else:
        lines.extend(
            [
                "measured_circuit = circuit.copy()",
                "if measured_circuit.num_clbits < measured_circuit.num_qubits:",
                "    measured_circuit.add_bits([Clbit() for _ in range(measured_circuit.num_qubits - measured_circuit.num_clbits)])",
                "measured_circuit.measure(range(circuit.num_qubits), range(circuit.num_qubits))",
                "measured_circuit = transpile(measured_circuit, simulator, optimization_level=0)",
                f"result = simulator.run(measured_circuit, shots={request.shots}).result()",
                'counts = {format(k, f"0{measured_circuit.num_clbits}b"): v for k, v in result.get_counts(measured_circuit).int_outcomes().items()}',
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


def generate_qasm3(circuit) -> str:
    try:
        from qiskit import qasm3

        return qasm3.dumps(circuit)
    except (ImportError, AttributeError) as exc:
        raise RuntimeError(
            "OpenQASM 3 export is unavailable in the installed Qiskit version."
        ) from exc
