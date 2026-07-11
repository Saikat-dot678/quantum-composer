"""Protocol-level quantum cryptography simulators.

These are *educational protocol simulators*. They model the classical + quantum
logic of QKD protocols (state preparation, basis choice, measurement, sifting,
error estimation) using seeded pseudo-randomness for reproducibility. They do
**not** simulate thousands of physical qubits as quantum states -- that would be
infeasible and is unnecessary to teach the protocols. Each simulator is
deterministic given its ``seed``.
"""

from crypto.b92 import simulate_b92
from crypto.bb84 import simulate_bb84
from crypto.e91 import simulate_e91
from crypto.privacy_amplification import binary_entropy, privacy_amplify, toeplitz_hash
from crypto.qrng import simulate_qrng

__all__ = [
    "simulate_bb84",
    "simulate_e91",
    "simulate_b92",
    "simulate_qrng",
    "privacy_amplify",
    "toeplitz_hash",
    "binary_entropy",
]
