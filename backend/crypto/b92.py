"""B92 quantum key distribution simulator (Bennett, 1992).

B92 uses just two non-orthogonal states:

* bit 0 -> |0>   (Z-basis "up")
* bit 1 -> |+>   (X-basis "plus")

Bob measures each qubit in a randomly chosen basis (Z or X). Because the two
states are non-orthogonal, some outcomes are *conclusive* and some are
*inconclusive*:

* Bob measures Z and gets 1 (|1>): impossible from |0>, so Alice must have sent
  |+> -> conclusive bit 1.
* Bob measures X and gets 1 (|->): impossible from |+>, so Alice must have sent
  |0> -> conclusive bit 0.
* Any other outcome is inconclusive and discarded.

The conclusive events form the sifted key. Channel noise flips some raw
measurements and creates key errors (QBER).
"""

from __future__ import annotations

import random
from typing import Any


def simulate_b92(
    num_bits: int,
    channel_error_rate: float = 0.0,
    seed: int | None = None,
) -> dict[str, Any]:
    rng = random.Random(seed)

    alice_bits = [rng.randint(0, 1) for _ in range(num_bits)]
    alice_states = ["|0>" if b == 0 else "|+>" for b in alice_bits]
    bob_bases: list[int] = []          # 0 = Z, 1 = X
    bob_raw_results: list[int] = []
    conclusive_flags: list[bool] = []

    sifted_alice: list[int] = []
    sifted_bob: list[int] = []

    for i in range(num_bits):
        bob_basis = rng.randint(0, 1)
        bob_bases.append(bob_basis)

        # Ideal measurement outcome for the prepared state in Bob's basis.
        if alice_bits[i] == 0:  # |0>
            if bob_basis == 0:      # Z basis -> always 0
                result = 0
            else:                    # X basis -> 0/1 with 50/50
                result = rng.randint(0, 1)
        else:  # |+>
            if bob_basis == 1:      # X basis -> always 0
                result = 0
            else:                    # Z basis -> 0/1 with 50/50
                result = rng.randint(0, 1)

        if channel_error_rate > 0.0 and rng.random() < channel_error_rate:
            result ^= 1

        bob_raw_results.append(result)

        # Conclusive detection rule.
        conclusive = False
        bob_key_bit: int | None = None
        if bob_basis == 0 and result == 1:      # Z & 1 -> must be |+> -> bit 1
            conclusive = True
            bob_key_bit = 1
        elif bob_basis == 1 and result == 1:    # X & |-> -> must be |0> -> bit 0
            conclusive = True
            bob_key_bit = 0

        conclusive_flags.append(conclusive)
        if conclusive:
            sifted_alice.append(alice_bits[i])
            sifted_bob.append(bob_key_bit)

    conclusive_count = sum(conclusive_flags)
    errors = sum(1 for a, b in zip(sifted_alice, sifted_bob) if a != b)
    qber = (errors / len(sifted_alice)) if sifted_alice else 0.0

    explanation = (
        "B92 encodes bits in two non-orthogonal states, so only measurements that "
        "are logically impossible for one of the states are conclusive. Here "
        f"{conclusive_count} of {num_bits} measurements were conclusive, forming the "
        f"sifted key with QBER {qber:.3f}. Roughly a quarter of transmissions are "
        "conclusive in the ideal case; channel noise both lowers the conclusive "
        "rate and raises the error rate."
    )

    charts_data = {
        "conclusive_count": conclusive_count,
        "inconclusive_count": num_bits - conclusive_count,
        "sifted_error_count": errors,
        "qber": qber,
        "sifted_key_bit_counts": {
            "0": sum(1 for b in sifted_alice if b == 0),
            "1": sum(1 for b in sifted_alice if b == 1),
        },
    }

    return {
        "num_bits": num_bits,
        "channel_error_rate": channel_error_rate,
        "alice_bits": alice_bits,
        "alice_states": alice_states,
        "bob_bases": ["Z" if b == 0 else "X" for b in bob_bases],
        "bob_measurements": bob_raw_results,
        "conclusive_flags": conclusive_flags,
        "conclusive_count": conclusive_count,
        "inconclusive_count": num_bits - conclusive_count,
        "sifted_key_alice": sifted_alice,
        "sifted_key_bob": sifted_bob,
        "sifted_key_length": len(sifted_alice),
        "qber": qber,
        "explanation": explanation,
        "charts_data": charts_data,
    }
