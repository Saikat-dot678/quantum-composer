"""BB84 quantum key distribution simulator (Bennett & Brassard, 1984).

Protocol:

1. Alice picks a random bit and a random basis (Z=rectilinear, X=diagonal) for
   each qubit, and prepares the qubit accordingly.
2. (Optionally) Eve intercepts, measures in a random basis, and resends what she
   measured -- this is the intercept-resend attack.
3. Bob measures each qubit in a random basis.
4. Alice and Bob publicly compare bases and keep bits where the bases matched
   (sifting). They compare a subset to estimate the Quantum Bit Error Rate
   (QBER).

Key physics: measuring in the wrong basis randomizes the outcome. Eve cannot
know Alice's basis, so intercept-resend introduces a ~25% error on sifted bits
that Alice and Bob detect as an elevated QBER.
"""

from __future__ import annotations

import random
from typing import Any

from crypto.privacy_amplification import privacy_amplify

# QBER above this fraction is treated as evidence of eavesdropping / an insecure
# channel (classic BB84 intercept-resend gives ~25%; the ~11% figure is the
# well-known one-way security threshold).
QBER_SECURITY_THRESHOLD = 0.11

_BASIS_NAMES = {0: "Z", 1: "X"}


def simulate_bb84(
    num_bits: int,
    eve_enabled: bool = False,
    eve_strategy: str = "intercept_resend",
    channel_error_rate: float = 0.0,
    seed: int | None = None,
) -> dict[str, Any]:
    rng = random.Random(seed)

    alice_bits = [rng.randint(0, 1) for _ in range(num_bits)]
    alice_bases = [rng.randint(0, 1) for _ in range(num_bits)]
    bob_bases = [rng.randint(0, 1) for _ in range(num_bits)]

    eve_bases: list[int] = []
    eve_bits: list[int] = []
    bob_measurements: list[int] = []

    for i in range(num_bits):
        carrier_bit = alice_bits[i]
        carrier_basis = alice_bases[i]

        if eve_enabled and eve_strategy == "intercept_resend":
            eve_basis = rng.randint(0, 1)
            eve_bases.append(eve_basis)
            if eve_basis == carrier_basis:
                eve_result = carrier_bit
            else:
                eve_result = rng.randint(0, 1)  # wrong basis -> random outcome
            eve_bits.append(eve_result)
            # Eve resends the qubit she prepared from her (possibly wrong) result.
            carrier_bit = eve_result
            carrier_basis = eve_basis

        if bob_bases[i] == carrier_basis:
            bob_result = carrier_bit
        else:
            bob_result = rng.randint(0, 1)  # basis mismatch -> random outcome

        if channel_error_rate > 0.0 and rng.random() < channel_error_rate:
            bob_result ^= 1  # channel / detector noise

        bob_measurements.append(bob_result)

    # Sifting: keep positions where Alice and Bob used the same basis.
    sifted_alice: list[int] = []
    sifted_bob: list[int] = []
    sift_positions: list[int] = []
    for i in range(num_bits):
        if alice_bases[i] == bob_bases[i]:
            sifted_alice.append(alice_bits[i])
            sifted_bob.append(bob_measurements[i])
            sift_positions.append(i)

    errors = sum(1 for a, b in zip(sifted_alice, sifted_bob) if a != b)
    sifted_len = len(sifted_alice)
    qber = (errors / sifted_len) if sifted_len else 0.0
    eve_detected = qber > QBER_SECURITY_THRESHOLD

    amplified = privacy_amplify(sifted_alice, qber, seed=seed)

    explanation = (
        "Alice and Bob keep only the bits where their random bases matched "
        f"({sifted_len} of {num_bits}). The QBER is {qber:.3f}. "
    )
    if eve_enabled:
        explanation += (
            "Eve's intercept-resend attack forces her to guess Alice's basis; when "
            "she guesses wrong she resends the wrong state, injecting errors. This "
            "pushes the QBER toward ~25%, well above the security threshold, so "
            "eavesdropping is detectable."
        )
    else:
        explanation += (
            "With no eavesdropper the only errors come from channel noise, so the "
            "QBER usually stays low. The sifted strings still require authenticated "
            "error reconciliation, which this simulator does not implement. The "
            "privacy-amplification output below is an Alice-side educational "
            "illustration, not a proven shared final key."
        )

    charts_data = {
        "basis_match_count": sifted_len,
        "basis_mismatch_count": num_bits - sifted_len,
        "sifted_error_count": errors,
        "qber": qber,
        "qber_threshold": QBER_SECURITY_THRESHOLD,
        "sifted_key_bit_counts": {
            "0": sum(1 for b in sifted_alice if b == 0),
            "1": sum(1 for b in sifted_alice if b == 1),
        },
        "error_positions": [
            idx for idx, (a, b) in enumerate(zip(sifted_alice, sifted_bob)) if a != b
        ][:256],
    }

    return {
        "num_bits": num_bits,
        "eve_enabled": eve_enabled,
        "eve_strategy": eve_strategy if eve_enabled else None,
        "channel_error_rate": channel_error_rate,
        "alice_bits": alice_bits,
        "alice_bases": [_BASIS_NAMES[b] for b in alice_bases],
        "bob_bases": [_BASIS_NAMES[b] for b in bob_bases],
        "bob_measurements": bob_measurements,
        "eve_bases": [_BASIS_NAMES[b] for b in eve_bases] if eve_enabled else [],
        "sifted_key_alice": sifted_alice,
        "sifted_key_bob": sifted_bob,
        "sifted_key_length": sifted_len,
        "sift_positions": sift_positions[:512],
        "qber": qber,
        "eve_detected": eve_detected,
        "final_key_length": amplified["output_length"],
        "privacy_amplification": amplified,
        "explanation": explanation,
        "charts_data": charts_data,
    }
