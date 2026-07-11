"""Honest classical-memory estimation for quantum circuit simulation.

The fundamental, non-negotiable physics of *exact* classical simulation:

* A full **statevector** stores ``2**n`` complex amplitudes. With complex128
  (16 bytes each) that is ``16 * 2**n`` bytes. This grows exponentially with the
  number of qubits ``n``.
* A **density matrix** stores ``(2**n)**2 == 4**n`` complex entries, i.e.
  ``16 * 4**n`` bytes -- exponentially *worse* than the statevector.

Concrete statevector figures (why "arbitrary 100-qubit simulation" is a myth):

* 30 qubits  -> ~16 GB
* 32 qubits  -> ~64 GB
* 35 qubits  -> ~512 GB
* 40 qubits  -> ~16 TB
* 50 qubits  -> ~16 PB
* 100 qubits -> ~2.0e+16 PB  (physically impossible to store)

Large-qubit simulation is only possible when a circuit has *exploitable
structure* (Clifford/stabilizer, low entanglement / MPS). Real IBM quantum
hardware runs 100+ qubit circuits because the physical chip *is* the quantum
system -- it never stores ``2**100`` classical amplitudes; you only ever get
measurement samples back, not the full statevector.

Because these numbers can exceed the range of a 64-bit float (2**1024 overflows
``float``), all arithmetic here is done in *log2 space*. Numeric ``_mb`` fields
are returned as ``float`` when they fit and ``None`` when they are literally
beyond floating-point range; the human-readable string is always populated and
is the authoritative field for astronomically large circuits.
"""

from __future__ import annotations

import math
from typing import Any

# 16 bytes per complex128 amplitude.
BYTES_PER_AMPLITUDE = 16
LOG2_BYTES_PER_AMPLITUDE = 4.0  # log2(16)
LOG2_MB = 20.0  # log2(1024 * 1024)
LOG10_2 = math.log10(2.0)

# Beyond this power of two a Python float overflows (float max ~ 2**1024).
_FLOAT_LOG2_LIMIT = 1000.0

RESOURCE_NOTES = [
    "Exact statevector simulation needs 16 * 2**n bytes and scales exponentially "
    "with the qubit count n.",
    "Density-matrix (noisy) simulation needs 16 * 4**n bytes and scales even worse "
    "than the statevector.",
    "Large qubit counts are only feasible when the circuit has exploitable "
    "structure: Clifford/stabilizer or low-entanglement (MPS) circuits.",
    "Real quantum hardware runs 100+ qubit circuits because the physical chip is "
    "the quantum system; you receive measurement samples, not a 2**n statevector.",
]

_UNITS = ["bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]


def _human_from_log2(log2_bytes: float) -> str:
    """Format a byte count given only its base-2 logarithm.

    Handles values far beyond float range by working in log10 space and falling
    back to scientific notation once the number is too large for a friendly unit.
    """
    # Comfortable-float path: keeps the familiar "16.00 GB" style output.
    if log2_bytes < 100.0:
        value = 2.0 ** log2_bytes
        index = 0
        while value >= 1024.0 and index < len(_UNITS) - 1:
            value /= 1024.0
            index += 1
        return f"{value:.2f} {_UNITS[index]}"

    log10 = log2_bytes * LOG10_2
    exp10 = math.floor(log10)
    mant = 10.0 ** (log10 - exp10)
    # Also express in yottabytes (1024**8 bytes) for a sense of scale.
    yb_log10 = log10 - math.log10(1024.0 ** 8)
    yb_exp10 = math.floor(yb_log10)
    yb_mant = 10.0 ** (yb_log10 - yb_exp10)
    return f"{mant:.2f}e+{exp10} bytes (~{yb_mant:.2f}e+{yb_exp10} YB)"


def _mb_or_none(log2_bytes: float) -> float | None:
    """Return the size in MB as a float, or ``None`` if it overflows a float."""
    log2_mb = log2_bytes - LOG2_MB
    if log2_mb > _FLOAT_LOG2_LIMIT:
        return None
    if log2_mb < -_FLOAT_LOG2_LIMIT:
        return 0.0
    return 2.0 ** log2_mb


def _bytes_or_none(log2_bytes: float) -> float | None:
    if log2_bytes > _FLOAT_LOG2_LIMIT:
        return None
    return 2.0 ** log2_bytes


def feasibility_from_log2_bytes(log2_bytes: float, max_memory_mb: float) -> str:
    """Classify exact-simulation feasibility against a memory budget.

    Comparison is done in log2 space so it never overflows.

    * ``safe``       : memory is <= 1/4 of the budget (comfortably below)
    * ``heavy``      : memory is high but still within the budget
    * ``dangerous``  : memory is up to ~8x the budget (close to / above limits)
    * ``infeasible`` : memory is far beyond the configured budget
    """
    max_memory_mb = max(float(max_memory_mb), 1.0)
    log2_budget_bytes = math.log2(max_memory_mb) + LOG2_MB
    diff = log2_bytes - log2_budget_bytes  # log2 of (needed / budget)
    if diff <= -2.0:
        return "safe"
    if diff <= 0.0:
        return "heavy"
    if diff <= 3.0:
        return "dangerous"
    return "infeasible"


def statevector_log2_bytes(num_qubits: int) -> float:
    """log2 of the bytes needed for an exact statevector of ``num_qubits``."""
    return LOG2_BYTES_PER_AMPLITUDE + float(num_qubits)


def density_matrix_log2_bytes(num_qubits: int) -> float:
    """log2 of the bytes needed for an exact density matrix of ``num_qubits``."""
    return LOG2_BYTES_PER_AMPLITUDE + 2.0 * float(num_qubits)


def estimate_resources(num_qubits: int, max_memory_mb: float = 1024.0) -> dict[str, Any]:
    """Estimate exact-simulation memory for ``num_qubits``.

    Returns statevector and density-matrix figures in bytes, MB and human form,
    plus a ``risk_label`` and ``feasibility_status`` for the statevector method
    (the yardstick for whether *arbitrary* exact simulation is possible).
    """
    sv_log2 = statevector_log2_bytes(num_qubits)
    dm_log2 = density_matrix_log2_bytes(num_qubits)

    risk = feasibility_from_log2_bytes(sv_log2, max_memory_mb)

    return {
        "num_qubits": num_qubits,
        "max_memory_mb": float(max_memory_mb),
        "statevector_memory_bytes": _bytes_or_none(sv_log2),
        "statevector_memory_mb": _mb_or_none(sv_log2),
        "statevector_memory_human": _human_from_log2(sv_log2),
        "density_matrix_memory_bytes": _bytes_or_none(dm_log2),
        "density_matrix_memory_mb": _mb_or_none(dm_log2),
        "density_matrix_memory_human": _human_from_log2(dm_log2),
        "statevector_log2_bytes": sv_log2,
        "density_matrix_log2_bytes": dm_log2,
        "risk_label": risk,
        "feasibility_status": risk,
        "notes": list(RESOURCE_NOTES),
    }
