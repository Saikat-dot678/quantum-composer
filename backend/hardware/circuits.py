"""Circuit-source handling for hardware mapping: the app's declarative JSON
schema, OpenQASM 2, and OpenQASM 3 -- plus an explicit, hard rejection of
pasted Python.

Security stance (documented in docs/HARDWARE_MAPPING.md): arbitrary Qiskit
Python source cannot be imported safely, so it is not imported at all --
there is no eval/exec/AST-subset execution path in this module or anywhere
else in the backend. OpenQASM is data, parsed by qiskit's own parsers with
size limits; the declarative JSON schema goes through the same
validators/circuit_builder as every simulation request.
"""

from __future__ import annotations

import re
from typing import Any

from qiskit import QuantumCircuit, qasm2

from schemas import AdvancedCircuitRequest
from circuit_builder import build_circuit

from .availability import qasm3_import_available
from .schemas import CircuitSource, MAX_TRANSPILE_OPERATIONS, MAX_TRANSPILE_QUBITS


class CircuitImportError(ValueError):
    """User-fixable import problem; maps to HTTP 422."""


# Patterns that identify pasted Python source (as opposed to OpenQASM). Kept
# deliberately loose: a false positive on genuinely weird QASM is a clearer
# failure than silently feeding Python into a QASM parser and surfacing a
# confusing syntax error.
_PYTHON_SIGNATURES = (
    re.compile(r"^\s*(import|from)\s+\w+", re.MULTILINE),
    re.compile(r"\bQuantumCircuit\s*\("),
    re.compile(r"^\s*def\s+\w+\s*\(", re.MULTILINE),
    re.compile(r"^\s*print\s*\(", re.MULTILINE),
)

PYTHON_REJECTION_MESSAGE = (
    "This looks like Python source code. Pasted Python is never executed or imported "
    "by this application, because no subset of executable code can be accepted safely. "
    "Export your circuit as OpenQASM instead (in Qiskit: qiskit.qasm2.dumps(circuit)), "
    "or open the current Composer circuit directly."
)


def looks_like_python(text: str) -> bool:
    if text.lstrip().upper().startswith("OPENQASM"):
        return False
    return any(pattern.search(text) for pattern in _PYTHON_SIGNATURES)


def _enforce_size(circuit: QuantumCircuit) -> None:
    if circuit.num_qubits > MAX_TRANSPILE_QUBITS:
        raise CircuitImportError(
            f"The circuit declares {circuit.num_qubits} qubits; hardware mapping accepts at most "
            f"{MAX_TRANSPILE_QUBITS}."
        )
    if circuit.size() > MAX_TRANSPILE_OPERATIONS:
        raise CircuitImportError(
            f"The circuit contains {circuit.size()} operations; hardware mapping accepts at most "
            f"{MAX_TRANSPILE_OPERATIONS}."
        )


def circuit_from_source(source: CircuitSource) -> QuantumCircuit:
    """Build a QuantumCircuit from any accepted circuit source. Raises
    CircuitImportError with a user-readable reason on any failure."""
    if source.kind == "json":
        try:
            request = AdvancedCircuitRequest(**source.circuit)
        except Exception as error:  # pydantic ValidationError -> readable text
            raise CircuitImportError(f"The circuit JSON failed schema validation: {error}") from error
        circuit = build_circuit(request)
        _enforce_size(circuit)
        return circuit

    text = source.text
    if looks_like_python(text):
        raise CircuitImportError(PYTHON_REJECTION_MESSAGE)

    if source.kind == "qasm2":
        try:
            circuit = qasm2.loads(text)
        except Exception as error:
            raise CircuitImportError(f"OpenQASM 2 parsing failed: {error}") from error
        _enforce_size(circuit)
        return circuit

    # qasm3
    if not qasm3_import_available():
        raise CircuitImportError(
            "OpenQASM 3 import requires the optional qiskit_qasm3_import package on the server "
            "(pip install -r requirements-hardware.txt). OpenQASM 2 and the app's circuit JSON work without it."
        )
    from qiskit import qasm3

    try:
        circuit = qasm3.loads(text)
    except Exception as error:
        raise CircuitImportError(f"OpenQASM 3 parsing failed: {error}") from error
    _enforce_size(circuit)
    return circuit


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

_TWO_QUBIT_DIRECTIVES = {"barrier"}


def circuit_metrics(circuit: QuantumCircuit) -> dict[str, Any]:
    """Provider-agnostic structural metrics for original/transpiled circuits."""
    gate_counts: dict[str, int] = {}
    one_qubit = 0
    two_qubit = 0
    measurements = 0
    swap_count = 0
    used_edges: set[tuple[int, int]] = set()

    for instruction in circuit.data:
        name = instruction.operation.name
        gate_counts[name] = gate_counts.get(name, 0) + 1
        if name in ("barrier", "delay"):
            continue
        if name == "measure":
            measurements += 1
            continue
        qubits = [circuit.find_bit(qubit).index for qubit in instruction.qubits]
        if len(qubits) == 1:
            one_qubit += 1
        elif len(qubits) == 2:
            two_qubit += 1
            used_edges.add((qubits[0], qubits[1]))
            if name == "swap":
                swap_count += 1

    return {
        "num_qubits": circuit.num_qubits,
        "depth": circuit.depth(),
        "size": circuit.size(),
        "one_qubit_gates": one_qubit,
        "two_qubit_gates": two_qubit,
        "measurements": measurements,
        "swap_count": swap_count,
        "gate_counts": gate_counts,
        "used_edges": [[a, b] for a, b in sorted(used_edges)],
    }


MAX_DIAGRAM_QUBITS = 12
MAX_DIAGRAM_OPERATIONS = 120


def bounded_diagram(circuit: QuantumCircuit) -> str | None:
    """Text diagram for small circuits only -- same honesty rule as the
    simulator's diagram field (omitted at scale rather than truncated into
    something misleading)."""
    if circuit.num_qubits > MAX_DIAGRAM_QUBITS or circuit.size() > MAX_DIAGRAM_OPERATIONS:
        return None
    try:
        return str(circuit.draw(output="text", fold=100))
    except Exception:
        return None
