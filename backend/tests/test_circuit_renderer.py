"""Headless, bounded graphical Qiskit circuit rendering regressions."""

from __future__ import annotations

import base64

import matplotlib
import matplotlib.pyplot as plt
import pytest
from qiskit import ClassicalRegister, QuantumCircuit, QuantumRegister
from qiskit.circuit.library import UnitaryGate

from visualization.circuit_renderer import (
    MAX_CACHE_ENTRIES,
    circuit_diagram_cache_size,
    clear_circuit_diagram_cache,
    render_circuit_diagram,
)


def assert_svg(circuit: QuantumCircuit):
    result = render_circuit_diagram(circuit)
    assert result.warning is None
    assert result.payload is not None
    svg = base64.b64decode(result.payload.content)
    assert b"<svg" in svg[:1024]
    assert result.payload.format == "svg"
    assert result.payload.encoding == "base64"
    assert result.payload.width > 0
    assert result.payload.height > 0
    return result.payload


@pytest.mark.parametrize(
    "circuit",
    [
        pytest.param(QuantumCircuit(1), id="one-qubit"),
        pytest.param(QuantumCircuit(2), id="bell-shell"),
    ],
)
def test_basic_circuits_render_valid_svg(circuit):
    circuit.h(0)
    if circuit.num_qubits == 2:
        circuit.cx(0, 1)
    assert_svg(circuit)


def test_measured_circuit_renders_classical_wires():
    circuit = QuantumCircuit(2, 2)
    circuit.h(0)
    circuit.cx(0, 1)
    circuit.measure([0, 1], [0, 1])
    assert_svg(circuit)


def test_multiple_registers_render_without_reordering():
    left = QuantumRegister(1, "left")
    right = QuantumRegister(2, "right")
    readout = ClassicalRegister(2, "readout")
    circuit = QuantumCircuit(left, right, readout)
    circuit.h(left[0])
    circuit.cx(left[0], right[1])
    circuit.measure(right, readout)
    assert_svg(circuit)


def test_custom_decomposition_instruction_renders():
    definition = QuantumCircuit(2, name="Bell macro")
    definition.h(0)
    definition.cx(0, 1)
    circuit = QuantumCircuit(2)
    circuit.append(definition.to_instruction(), [0, 1])
    assert_svg(circuit)


def test_custom_unitary_instruction_renders():
    circuit = QuantumCircuit(1)
    circuit.append(UnitaryGate([[0, 1], [1, 0]], label="PX"), [0])
    assert_svg(circuit)


def test_larger_circuit_is_folded_into_bounded_rows():
    circuit = QuantumCircuit(4)
    for index in range(48):
        circuit.h(index % 4)
        circuit.cx(index % 4, (index + 1) % 4)
    payload = assert_svg(circuit)
    assert payload.wrapped is True
    assert payload.fold in {20, 32}
    assert payload.width <= 8192
    assert payload.height <= 8192


def test_render_failure_returns_fallback_and_closes_figure(monkeypatch):
    clear_circuit_diagram_cache()
    circuit = QuantumCircuit(1)
    circuit.x(0)

    def fail_draw(*_args, **_kwargs):
        plt.figure()
        raise RuntimeError("synthetic drawer failure")

    monkeypatch.setattr(circuit, "draw", fail_draw)
    result = render_circuit_diagram(circuit)
    assert result.payload is None
    assert "could not be rendered" in (result.warning or "")
    assert plt.get_fignums() == []


def test_successful_render_always_closes_figure():
    clear_circuit_diagram_cache()
    circuit = QuantumCircuit(1)
    circuit.y(0)
    assert_svg(circuit)
    assert plt.get_fignums() == []


def test_renderer_uses_headless_agg_backend():
    assert matplotlib.get_backend().lower() == "agg"


def test_identical_circuits_use_bounded_cache():
    clear_circuit_diagram_cache()
    for index in range(MAX_CACHE_ENTRIES + 5):
        circuit = QuantumCircuit(1)
        circuit.rx(index / 10, 0)
        assert_svg(circuit)
    assert circuit_diagram_cache_size() == MAX_CACHE_ENTRIES


def test_unsafe_render_size_returns_an_explanation():
    result = render_circuit_diagram(QuantumCircuit(49))
    assert result.payload is None
    assert "48-qubit render limit" in (result.warning or "")
