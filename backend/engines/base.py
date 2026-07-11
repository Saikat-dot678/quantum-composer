"""Shared engine contracts, errors and dependency detection."""

from __future__ import annotations

import importlib.util
from dataclasses import dataclass, field
from typing import Any


class EngineError(RuntimeError):
    """Base class for engine-level failures (mapped to clean HTTP responses)."""


class EngineNotAvailableError(EngineError):
    """A required optional dependency for the chosen engine is not installed."""


class UnsupportedGateError(EngineError):
    """The circuit uses a gate the chosen engine cannot represent."""


class InfeasibleCircuitError(EngineError):
    """The circuit would require infeasible resources for the chosen engine.

    This is raised deliberately instead of letting a huge statevector allocation
    crash the process. The message always explains the honest alternatives.
    """


@dataclass
class EngineResult:
    """Normalized result returned by every engine."""

    counts: dict[str, int]
    selected_engine: str
    engine_reason: str
    warnings: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


def is_module_available(module_name: str) -> bool:
    """True if ``module_name`` can be imported without importing it."""
    try:
        return importlib.util.find_spec(module_name) is not None
    except (ImportError, ValueError):  # pragma: no cover - defensive
        return False


def stim_available() -> bool:
    return is_module_available("stim")


def aer_available() -> bool:
    return is_module_available("qiskit_aer")


def format_counts_from_bits(shots_bits: list[list[int]], num_clbits: int) -> dict[str, int]:
    """Turn per-shot classical bit arrays into Qiskit-style count keys.

    ``shots_bits[s][c]`` is the value of classical bit ``c`` on shot ``s``. Keys
    follow Qiskit convention: the leftmost character is the highest-index bit.
    """
    counts: dict[str, int] = {}
    width = max(num_clbits, 1)
    for bits in shots_bits:
        key = "".join(str(int(bits[c])) for c in range(width - 1, -1, -1))
        counts[key] = counts.get(key, 0) + 1
    return counts
