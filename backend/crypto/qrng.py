"""Quantum random number generator simulator.

Models the canonical "Hadamard + measure" QRNG: prepare |0>, apply H to reach an
equal superposition (|0>+|1>)/sqrt(2), then measure to get a uniform random bit.

This is an **educational simulator**. It uses a seeded pseudo-random generator so
runs are reproducible, which is exactly what a certified hardware QRNG must NOT
be. A real device-independent QRNG derives entropy from measured quantum
processes and certifies its unpredictability; this tool only illustrates the
idea and the expected statistics.
"""

from __future__ import annotations

import math
import random
from typing import Any


def simulate_qrng(
    num_bits: int,
    method: str = "hadamard_measurement",
    seed: int | None = None,
) -> dict[str, Any]:
    rng = random.Random(seed)

    # Every supported method reduces to sampling an unbiased bit; the label just
    # documents the conceptual quantum circuit being modelled.
    generated_bits = [1 if rng.random() < 0.5 else 0 for _ in range(num_bits)]

    one_count = sum(generated_bits)
    zero_count = num_bits - one_count
    frequency_1 = (one_count / num_bits) if num_bits else 0.0
    frequency_0 = (zero_count / num_bits) if num_bits else 0.0

    # Simple bias diagnostic: how far the sample deviates from 50/50 in units of
    # the expected standard deviation (0.5*sqrt(n)).
    expected_std = 0.5 * math.sqrt(num_bits) if num_bits else 0.0
    deviation_sigma = (
        abs(one_count - num_bits / 2.0) / expected_std if expected_std > 0 else 0.0
    )

    bit_string = "".join(str(b) for b in generated_bits)

    explanation = (
        "Each bit models measuring H|0> = (|0>+|1>)/sqrt(2), which yields 0 or 1 "
        f"with equal probability. Over {num_bits} samples the observed frequency of "
        f"1 is {frequency_1:.3f} (expected 0.5). This is an educational simulator "
        "using a seeded PRNG for reproducibility -- it is NOT a certified hardware "
        "quantum random number generator."
    )

    charts_data = {
        "zero_count": zero_count,
        "one_count": one_count,
        "frequency_0": frequency_0,
        "frequency_1": frequency_1,
        "deviation_sigma": deviation_sigma,
    }

    return {
        "num_bits": num_bits,
        "method": method,
        "generated_bits": generated_bits,
        "bit_string": bit_string if num_bits <= 1024 else bit_string[:1024] + "...",
        "zero_count": zero_count,
        "one_count": one_count,
        "frequency_0": frequency_0,
        "frequency_1": frequency_1,
        "explanation": explanation,
        "charts_data": charts_data,
    }
