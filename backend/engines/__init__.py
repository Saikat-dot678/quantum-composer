"""Multi-engine simulation backend.

Each engine knows how to run a *class* of circuits and is honest about its
limits. The :mod:`engines.router` picks a feasible engine (or explains why none
is feasible) rather than blindly attempting an exponential statevector.

Engines:

* ``aer_statevector``   -- exact, small arbitrary circuits only
* ``aer_mps``           -- approximate, large *low-entanglement* circuits
* ``aer_stabilizer``    -- exact, large *Clifford-only* circuits
* ``aer_density_matrix``-- exact + noise, small circuits (16 * 4**n bytes)
* ``stim_stabilizer``   -- exact, very large Clifford circuits (optional dep)

Protocol-level quantum cryptography lives in :mod:`crypto` and is surfaced
through :mod:`engines.crypto_protocols`; it is deliberately *not* a large
quantum-state simulator.
"""

from engines.base import (
    EngineError,
    EngineNotAvailableError,
    EngineResult,
    InfeasibleCircuitError,
    UnsupportedGateError,
)

__all__ = [
    "EngineError",
    "EngineNotAvailableError",
    "EngineResult",
    "InfeasibleCircuitError",
    "UnsupportedGateError",
]
