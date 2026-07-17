"""Bounded Qiskit Matplotlib circuit rendering for headless API servers.

The renderer always uses Matplotlib's non-interactive Agg backend, serializes
the resulting figure as base64 SVG, closes every figure, and fails softly so a
diagram problem can never discard an otherwise valid simulation result.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import math
import re
import threading
from collections import OrderedDict
from dataclasses import dataclass
from io import BytesIO
from typing import Any

import matplotlib

# This must run before pyplot is imported. Agg works under Uvicorn on Windows
# and Linux without DISPLAY, Qt, Tk, or another desktop backend.
matplotlib.use("Agg", force=True)
import matplotlib.pyplot as plt  # noqa: E402

from visualization.schemas import CircuitDiagramPayload

logger = logging.getLogger(__name__)

STYLE_VERSION = "qiskit-iqp-svg-v1"
MAX_RENDER_QUBITS = 48
MAX_RENDER_CLBITS = 64
MAX_RENDER_OPERATIONS = 400
MAX_RENDER_DEPTH = 240
MAX_RENDERED_WIRE_ROWS = 260
MAX_SVG_BYTES = 5_500_000
MAX_CACHE_ENTRIES = 24
MAX_FIGURE_PIXELS_PER_AXIS = 8_192

_CACHE: OrderedDict[str, CircuitDiagramPayload] = OrderedDict()
_RENDER_LOCK = threading.RLock()
_VIEWBOX_RE = re.compile(rb"viewBox=\"[-+0-9.eE]+\s+[-+0-9.eE]+\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\"")


@dataclass(frozen=True)
class CircuitDiagramRenderResult:
    payload: CircuitDiagramPayload | None
    warning: str | None = None


def _drawing_fold(circuit: Any) -> tuple[int, bool]:
    depth = int(circuit.depth() or 0)
    operations = int(circuit.size())
    if depth <= 18 and operations <= 32:
        return -1, False
    fold = 32 if depth <= 72 and operations <= 140 else 20
    return fold, depth > fold


def _circuit_digest(circuit: Any, fold: int) -> str:
    """Create a stable cache key without relying on object identity."""
    buffer = BytesIO()
    try:
        from qiskit import qpy

        qpy.dump(circuit, buffer)
        serialized = buffer.getvalue()
    except Exception:
        # QPY supports normal Qiskit circuits, including unitaries. This
        # deterministic structural fallback keeps rendering best-effort for a
        # future instruction QPY cannot serialize.
        serialized = repr(
            (
                circuit.num_qubits,
                circuit.num_clbits,
                circuit.global_phase,
                [(item.operation.name, item.qubits, item.clbits, item.operation.params) for item in circuit.data],
            )
        ).encode("utf-8", errors="replace")
    return hashlib.sha256(serialized + f"|{fold}|{STYLE_VERSION}".encode()).hexdigest()


def _preflight(circuit: Any, fold: int) -> str | None:
    qubits = int(circuit.num_qubits)
    clbits = int(circuit.num_clbits)
    operations = int(circuit.size())
    depth = int(circuit.depth() or 0)
    if qubits > MAX_RENDER_QUBITS:
        return f"Graphical circuit diagram omitted: {qubits} qubits exceeds the safe {MAX_RENDER_QUBITS}-qubit render limit."
    if clbits > MAX_RENDER_CLBITS:
        return f"Graphical circuit diagram omitted: {clbits} classical bits exceeds the safe {MAX_RENDER_CLBITS}-bit render limit."
    if operations > MAX_RENDER_OPERATIONS:
        return f"Graphical circuit diagram omitted: {operations} operations exceeds the safe {MAX_RENDER_OPERATIONS}-operation render limit."
    if depth > MAX_RENDER_DEPTH:
        return f"Graphical circuit diagram omitted: depth {depth} exceeds the safe render depth of {MAX_RENDER_DEPTH}."
    pages = 1 if fold == -1 else max(1, math.ceil(max(depth, 1) / fold))
    if max(1, qubits + clbits) * pages > MAX_RENDERED_WIRE_ROWS:
        return "Graphical circuit diagram omitted because its wrapped wire count exceeds the safe render-size limit."
    return None


def _svg_dimensions(svg: bytes, figure: Any) -> tuple[int, int]:
    match = _VIEWBOX_RE.search(svg)
    if match:
        # Matplotlib's SVG viewBox uses points. Convert to CSS pixels at 96 dpi.
        return (
            max(1, min(MAX_FIGURE_PIXELS_PER_AXIS, math.ceil(float(match.group(1)) * 96 / 72))),
            max(1, min(MAX_FIGURE_PIXELS_PER_AXIS, math.ceil(float(match.group(2)) * 96 / 72))),
        )
    return (
        max(1, min(MAX_FIGURE_PIXELS_PER_AXIS, round(figure.get_figwidth() * figure.dpi))),
        max(1, min(MAX_FIGURE_PIXELS_PER_AXIS, round(figure.get_figheight() * figure.dpi))),
    )


def render_circuit_diagram(circuit: Any) -> CircuitDiagramRenderResult:
    """Render a validated Qiskit circuit as a bounded base64 SVG.

    Identical circuits reuse a small process-local LRU cache. Matplotlib is
    serialized behind a lock because pyplot and parts of its font machinery
    are not thread-safe under Uvicorn's worker thread pool.
    """
    fold, wrapped = _drawing_fold(circuit)
    preflight_warning = _preflight(circuit, fold)
    if preflight_warning:
        return CircuitDiagramRenderResult(payload=None, warning=preflight_warning)

    key = _circuit_digest(circuit, fold)
    with _RENDER_LOCK:
        cached = _CACHE.get(key)
        if cached is not None:
            _CACHE.move_to_end(key)
            return CircuitDiagramRenderResult(payload=cached)

        figure = None
        open_figures_before = set(plt.get_fignums())
        try:
            matplotlib.rcParams["svg.hashsalt"] = STYLE_VERSION
            figure = circuit.draw(
                output="mpl",
                fold=fold,
                idle_wires=False,
                style="iqp",
            )
            figure.patch.set_facecolor("white")
            raw = BytesIO()
            figure.savefig(
                raw,
                format="svg",
                bbox_inches="tight",
                pad_inches=0.15,
                facecolor="white",
                metadata={"Date": None, "Creator": "Quantum Composer / Qiskit Matplotlib"},
            )
            svg = raw.getvalue()
            if b"<svg" not in svg[:1_024]:
                raise ValueError("Matplotlib did not produce an SVG document")
            if len(svg) > MAX_SVG_BYTES:
                return CircuitDiagramRenderResult(
                    payload=None,
                    warning="The circuit simulation completed, but its graphical diagram exceeded the safe SVG payload limit.",
                )
            width, height = _svg_dimensions(svg, figure)
            payload = CircuitDiagramPayload(
                content=base64.b64encode(svg).decode("ascii"),
                width=width,
                height=height,
                fold=fold,
                wrapped=wrapped,
            )
            _CACHE[key] = payload
            _CACHE.move_to_end(key)
            while len(_CACHE) > MAX_CACHE_ENTRIES:
                _CACHE.popitem(last=False)
            return CircuitDiagramRenderResult(payload=payload)
        except Exception as exc:  # Diagram rendering must never fail the run.
            for figure_number in set(plt.get_fignums()) - open_figures_before:
                plt.close(figure_number)
            logger.warning("Qiskit Matplotlib circuit rendering failed: %s", exc, exc_info=True)
            return CircuitDiagramRenderResult(
                payload=None,
                warning="The circuit simulation completed, but the graphical diagram could not be rendered.",
            )
        finally:
            if figure is not None:
                plt.close(figure)


def clear_circuit_diagram_cache() -> None:
    """Test/maintenance hook; production caching remains bounded automatically."""
    with _RENDER_LOCK:
        _CACHE.clear()


def circuit_diagram_cache_size() -> int:
    with _RENDER_LOCK:
        return len(_CACHE)
