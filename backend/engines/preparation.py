"""Engine lowering and a versioned classical-outcome contract."""
from __future__ import annotations

from typing import Any
from validators import canonical_operation_order


def measurement_metadata(request: Any) -> dict[str, Any]:
    writes = [op for op in canonical_operation_order(request.operations) if op.gate == "measure"]
    automatic = not writes
    width = max(request.num_clbits, request.num_qubits) if automatic else request.num_clbits
    mapping = {q: q for q in range(request.num_qubits)} if automatic else {}
    for op in writes:
        mapping[op.clbits[0]] = op.qubits[0]
    return {
        "version": 1,
        "automatic": automatic,
        "num_clbits": width,
        "classical_to_qubit": [mapping.get(c) for c in range(width)],
        "bit_order": "highest_classical_bit_first",
    }


def add_automatic_measurements(circuit: Any) -> None:
    from qiskit.circuit import Clbit
    missing = circuit.num_qubits - circuit.num_clbits
    if missing > 0:
        circuit.add_bits([Clbit() for _ in range(missing)])
    circuit.measure(range(circuit.num_qubits), range(circuit.num_qubits))


def normalized_counts(result: Any, circuit: Any) -> dict[str, int]:
    if not result.success:
        detail = "; ".join(str(experiment.status) for experiment in result.results if not experiment.success)
        raise ValueError(f"Engine execution failed: {detail or result.status}")
    # int_outcomes uses absolute classical-bit indices, independent of Qiskit
    # register separators. This is the same contract used by Stim.
    return {format(key, f"0{circuit.num_clbits}b"): int(value)
            for key, value in result.get_counts(circuit).int_outcomes().items()}


def lower_for_aer(circuit: Any, simulator: Any, *, noisy: bool = False) -> Any:
    from qiskit import transpile
    from qiskit.quantum_info import Clifford, Operator
    if simulator.options.method == "stabilizer":
        lowered = circuit.copy_empty_like()
        for instruction in circuit.data:
            op = instruction.operation
            if op.name in {"measure", "reset", "barrier"} or op.name.startswith("save_"):
                lowered.append(op, instruction.qubits, instruction.clbits)
            else:
                # The analyzer already restricted this path to Clifford gates.
                # Small local Clifford synthesis preserves global phase where
                # relevant and avoids exponential whole-circuit operators.
                if op.num_qubits > 2:
                    raise ValueError(f"No bounded stabilizer lowering for {op.name}.")
                local = Clifford.from_operator(Operator(op)).to_circuit()
                lowered.compose(local, qubits=instruction.qubits, inplace=True)
        circuit = lowered
    if noisy:
        # Noise is defined per lowered u/cx/id operation, including decomposed
        # custom matrices and multi-controlled gates, not per UI gate symbol.
        from qiskit_aer import AerSimulator
        target_backend = AerSimulator(method=simulator.options.method, basis_gates=["u", "cx", "id"])
        return transpile(circuit, target_backend, optimization_level=0, num_processes=1)
    return transpile(circuit, simulator, optimization_level=0, num_processes=1)
