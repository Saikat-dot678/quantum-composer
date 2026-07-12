"""E91 quantum key distribution simulator (Ekert, 1991).

Alice and Bob share entangled (singlet) pairs and each measure their qubit along
a randomly chosen angle:

* Alice angles: 0, 45, 90 degrees
* Bob angles:   45, 90, 135 degrees

When they happen to pick the same physical angle (45 or 90) their anti-correlated
outcomes form the sifted key. The other angle combinations feed a CHSH test:
the singlet state gives |S| = 2*sqrt(2) ~ 2.83, violating the classical bound
|S| <= 2. An eavesdropper who intercepts and resends breaks the entanglement,
dragging |S| back toward the classical value and raising the key error rate --
so the CHSH value doubles as an eavesdropping alarm.

The measurement statistics use the exact singlet correlation E(a,b) = -cos(a-b);
Eve is modelled as an intercept-resend attack that collapses the entanglement.
"""

from __future__ import annotations

import math
import random
from typing import Any

_ALICE_ANGLES = [0.0, math.pi / 4, math.pi / 2]            # 0, 45, 90 deg
_BOB_ANGLES = [math.pi / 4, math.pi / 2, 3 * math.pi / 4]  # 45, 90, 135 deg
# CHSH settings: Alice {0, 90}, Bob {45, 135}.
_CHSH_A = [0, 2]
_CHSH_B = [0, 2]


def _degrees(theta: float) -> int:
    return int(round(math.degrees(theta)))


def simulate_e91(
    num_pairs: int,
    eve_enabled: bool = False,
    channel_error_rate: float = 0.0,
    seed: int | None = None,
) -> dict[str, Any]:
    rng = random.Random(seed)

    alice_choices: list[int] = []
    bob_choices: list[int] = []
    alice_outcomes: list[int] = []
    bob_outcomes: list[int] = []

    # Correlation accumulators: sum of products and counts per (a,b) setting.
    corr_sum: dict[tuple[int, int], int] = {}
    corr_cnt: dict[tuple[int, int], int] = {}

    sifted_alice: list[int] = []
    sifted_bob: list[int] = []

    for _ in range(num_pairs):
        ai = rng.randint(0, 2)
        bi = rng.randint(0, 2)
        a = _ALICE_ANGLES[ai]
        b = _BOB_ANGLES[bi]

        if eve_enabled:
            # Intercept-resend: Eve measures both halves along a random angle,
            # collapsing the singlet into a product state.
            e_theta = rng.choice(_ALICE_ANGLES + _BOB_ANGLES)
            e = 1 if rng.random() < 0.5 else -1  # Eve's outcome
            s_alice, s_bob = e, -e               # anti-correlated along e_theta
            pa = (1 + s_alice * math.cos(a - e_theta)) / 2
            pb = (1 + s_bob * math.cos(b - e_theta)) / 2
            sa = 1 if rng.random() < pa else -1
            sb = 1 if rng.random() < pb else -1
        else:
            # Ideal singlet: <sa*sb> = -cos(a-b).
            e_val = -math.cos(a - b)
            sa = 1 if rng.random() < 0.5 else -1
            product = 1 if rng.random() < (1 + e_val) / 2 else -1
            sb = sa * product

        if channel_error_rate > 0.0 and rng.random() < channel_error_rate:
            sb = -sb

        alice_choices.append(ai)
        bob_choices.append(bi)
        alice_outcomes.append(0 if sa == 1 else 1)
        bob_outcomes.append(0 if sb == 1 else 1)

        key = (ai, bi)
        corr_sum[key] = corr_sum.get(key, 0) + sa * sb
        corr_cnt[key] = corr_cnt.get(key, 0) + 1

        # Key sifting where physical angles match (45 or 90 degrees).
        matched = (ai == 1 and bi == 0) or (ai == 2 and bi == 1)
        if matched:
            alice_bit = 0 if sa == 1 else 1
            bob_bit = 0 if sb == -1 else 1  # Bob flips to align with anti-correlation
            sifted_alice.append(alice_bit)
            sifted_bob.append(bob_bit)

    def correlation(ai: int, bi: int) -> float:
        c = corr_cnt.get((ai, bi), 0)
        return (corr_sum[(ai, bi)] / c) if c else 0.0

    # CHSH S = E(a0,b0) - E(a0,b2) + E(a2,b0) + E(a2,b2).
    a0, a2 = _CHSH_A
    b0, b2 = _CHSH_B
    chsh_s = (
        correlation(a0, b0)
        - correlation(a0, b2)
        + correlation(a2, b0)
        + correlation(a2, b2)
    )

    errors = sum(1 for a, b in zip(sifted_alice, sifted_bob) if a != b)
    qber = (errors / len(sifted_alice)) if sifted_alice else 0.0

    correlations = {
        f"A{_degrees(_ALICE_ANGLES[ai])}_B{_degrees(_BOB_ANGLES[bi])}": round(
            correlation(ai, bi), 4
        )
        for ai in range(3)
        for bi in range(3)
        if corr_cnt.get((ai, bi))
    }

    explanation = (
        f"The measured CHSH value is |S| = {abs(chsh_s):.3f}. The singlet state "
        "predicts 2*sqrt(2) ~ 2.83, which violates the classical bound of 2 and "
        "would provide evidence of entanglement in a suitably controlled physical "
        "experiment. Here it is a finite-sample software-model indicator, not "
        "device-independent certification. "
    )
    if eve_enabled:
        explanation += (
            "Eve's intercept-resend attack collapses the entanglement, so |S| falls "
            "toward the classical bound and the key error rate rises -- both signal "
            "eavesdropping."
        )
    else:
        explanation += (
            "With no eavesdropper, |S| stays near the quantum maximum and the "
            "matched-angle outcomes form a low-error shared key."
        )

    charts_data = {
        "chsh_s": abs(chsh_s),
        "chsh_classical_bound": 2.0,
        "chsh_quantum_bound": 2.0 * math.sqrt(2.0),
        "qber": qber,
        "sifted_key_length": len(sifted_alice),
        "correlations": correlations,
    }

    return {
        "num_pairs": num_pairs,
        "eve_enabled": eve_enabled,
        "channel_error_rate": channel_error_rate,
        "alice_angles_deg": [_degrees(t) for t in _ALICE_ANGLES],
        "bob_angles_deg": [_degrees(t) for t in _BOB_ANGLES],
        "alice_choices": alice_choices[:512],
        "bob_choices": bob_choices[:512],
        "correlations": correlations,
        "chsh_s": abs(chsh_s),
        "chsh_violation": abs(chsh_s) > 2.0,
        "qber": qber,
        "sifted_key_alice": sifted_alice,
        "sifted_key_bob": sifted_bob,
        "sifted_key_length": len(sifted_alice),
        "explanation": explanation,
        "charts_data": charts_data,
    }
