"""Protocol-level quantum cryptography engine registry.

This is the engines-layer entry point for the cryptography lab. It deliberately
does NOT simulate large physical quantum states -- it dispatches to the
protocol-level simulators in :mod:`crypto`, which model QKD logic (preparation,
basis choice, measurement, sifting, QBER) with reproducible seeded randomness.

Simulating thousands of physical qubits as a quantum state would be infeasible
and is unnecessary to teach these protocols; the security arguments live at the
protocol level.
"""

from __future__ import annotations

from typing import Any, Callable

from crypto import simulate_b92, simulate_bb84, simulate_e91, simulate_qrng

PROTOCOLS: dict[str, dict[str, Any]] = {
    "bb84": {
        "name": "BB84",
        "description": "Prepare-and-measure QKD with conjugate Z/X bases (1984).",
        "runner": simulate_bb84,
    },
    "e91": {
        "name": "E91 (Ekert)",
        "description": "Entanglement-based QKD with a CHSH eavesdropping test (1991).",
        "runner": simulate_e91,
    },
    "b92": {
        "name": "B92",
        "description": "Two-state prepare-and-measure QKD (1992).",
        "runner": simulate_b92,
    },
    "qrng": {
        "name": "QRNG",
        "description": "Hadamard-measurement quantum random number generator (educational).",
        "runner": simulate_qrng,
    },
}


def available_protocols() -> list[dict[str, str]]:
    return [
        {"id": key, "name": val["name"], "description": val["description"]}
        for key, val in PROTOCOLS.items()
    ]


def get_runner(protocol_id: str) -> Callable[..., dict[str, Any]]:
    entry = PROTOCOLS.get(protocol_id)
    if entry is None:
        raise KeyError(protocol_id)
    return entry["runner"]
