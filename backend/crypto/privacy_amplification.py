"""Privacy amplification via Toeplitz-matrix universal hashing.

After sifting and error estimation, Alice and Bob share a partially-secret key:
an eavesdropper may hold some correlated information. Privacy amplification
compresses the key with a universal hash function so the adversary's residual
information becomes negligible. This module implements a Toeplitz hash (a
standard, efficient choice) and a leftover-hash-lemma-style length estimate.

This is an educational demonstration, not a hardened cryptographic
implementation.
"""

from __future__ import annotations

import math
import random
from typing import Any


def binary_entropy(p: float) -> float:
    """Binary Shannon entropy H(p) in bits."""
    if p <= 0.0 or p >= 1.0:
        return 0.0
    return -p * math.log2(p) - (1.0 - p) * math.log2(1.0 - p)


def toeplitz_hash(key_bits: list[int], output_length: int, seed: int | None = None) -> list[int]:
    """Hash ``key_bits`` down to ``output_length`` bits with a random Toeplitz matrix.

    A Toeplitz matrix is fully described by its first row and column, i.e.
    ``output_length + len(key) - 1`` random bits. The output is ``T @ key`` mod 2.
    """
    n = len(key_bits)
    m = int(output_length)
    if m <= 0 or n == 0:
        return []
    rng = random.Random(seed)
    diagonals = [rng.getrandbits(1) for _ in range(m + n - 1)]
    output: list[int] = []
    for i in range(m):
        acc = 0
        for j in range(n):
            acc ^= diagonals[i - j + (n - 1)] & (key_bits[j] & 1)
        output.append(acc & 1)
    return output


def secure_key_length(sifted_length: int, qber: float, security_parameter: int = 16) -> int:
    """Estimate the secure key length after error correction + privacy amplification.

    Uses a simplified asymptotic secret-key-rate ``1 - 2*H(qber)`` (leakage from
    both error correction and Eve's information), minus a small security margin.
    Returns 0 when the error rate is too high to distil a secure key.
    """
    if sifted_length <= 0:
        return 0
    rate = 1.0 - 2.0 * binary_entropy(qber)
    if rate <= 0.0:
        return 0
    length = int(sifted_length * rate) - security_parameter
    return max(0, length)


def privacy_amplify(
    sifted_key: list[int],
    qber: float,
    seed: int | None = None,
    security_parameter: int = 16,
) -> dict[str, Any]:
    """Run leftover-hash length estimation + Toeplitz hashing on a sifted key."""
    out_len = secure_key_length(len(sifted_key), qber, security_parameter)
    final_key = toeplitz_hash(sifted_key, out_len, seed=seed)
    return {
        "input_length": len(sifted_key),
        "output_length": len(final_key),
        "compression_ratio": (len(final_key) / len(sifted_key)) if sifted_key else 0.0,
        "final_key": final_key,
        "estimated_leaked_fraction": min(1.0, 2.0 * binary_entropy(qber)),
        "explanation": (
            "Privacy amplification shrinks the reconciled key with a universal "
            "(Toeplitz) hash so an eavesdropper's partial information is destroyed. "
            f"About {min(100.0, 200.0 * binary_entropy(qber)):.1f}% of the key length "
            "is sacrificed to account for leakage and error correction."
        ),
    }
