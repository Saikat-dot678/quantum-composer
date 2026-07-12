# Cryptography Lab

The Cryptography Lab contains **protocol-level** quantum key distribution (QKD)
simulators plus a quantum random number generator. They model the classical +
quantum *logic* of each protocol — state preparation, basis choice, measurement,
sifting, error estimation — using pseudo-random sampling. Supplying the same
explicit seed reproduces a run; omitting the seed (or sending `null`) does not.

> **These are educational protocol simulators, not physical-qubit simulators.**
> Teaching BB84 does not require simulating thousands of physical qubits as a
> quantum state (which would be infeasible). The security arguments live at the
> protocol level, so that is where we simulate.

## Key concepts

### QBER — Quantum Bit Error Rate

The fraction of sifted key positions where Alice and Bob disagree. Low QBER →
low noise / no eavesdropper. High QBER → channel noise or eavesdropping. QKD
security uses the fact that attacks such as intercept-resend disturb unknown
quantum states and raise observable error statistics. A high QBER is an
**insecure-channel alarm**, not proof that a particular eavesdropper caused it;
ordinary channel and detector noise can produce the same signal.

### Eve's intercept-resend attack

Eve measures each qubit in a randomly chosen basis and resends what she saw.
When she guesses the wrong basis she resends a wrong state, injecting errors. For
BB84 this pushes the QBER toward ~25%, far above the ~11% security threshold, so
the model raises its disturbance alarm. The ~11% value is the simplified,
asymptotic one-way threshold used by this educational implementation; production
security depends on protocol assumptions, finite-key analysis, authentication,
error correction, and device behavior.

## Protocols

### BB84 (`POST /crypto/bb84/simulate`)

Prepare-and-measure QKD with conjugate Z/X bases.

- **Input:** `num_bits`, `eve_enabled`, `eve_strategy` (`intercept_resend`),
  `channel_error_rate`, `seed`. `num_bits` is 1–4096 (default 128), channel error
  is 0–1, and the seed is optional.
- **Output:** Alice's bits/bases, Bob's bases/measurements, Eve's bases (if
  enabled), the sifted keys, `sifted_key_length`, `qber`, `eve_detected`,
  `final_key_length` (after privacy amplification), an `explanation`, and
  `charts_data`.
- **Expected behaviour:** no Eve + low channel error → low QBER, not detected;
  Eve enabled → QBER tends toward 25%, triggering the model's alarm. The
  `eve_detected` field is threshold-based and can also be true because of channel
  noise; it is better read as “disturbance detected.”

### E91 (`POST /crypto/e91/simulate`)

Entanglement-based QKD (Ekert). Alice and Bob measure shared singlet pairs at
random angles. Matched angles form the key; the other combinations feed a
**CHSH** test.

- **Input:** `num_pairs`, `eve_enabled`, `channel_error_rate`, `seed`.
  `num_pairs` is 1–4096 (default 128), channel error is 0–1, and the seed is
  optional.
- **Output:** angle choices, per-setting `correlations`, `chsh_s`,
  `chsh_violation`, `qber`, sifted keys, `explanation`.
- **CHSH intuition:** the singlet gives `|S| ≈ 2√2 ≈ 2.83`, violating the
  classical bound `|S| ≤ 2`. An eavesdropper breaks the entanglement, dragging
  `|S|` back toward 2 and raising the QBER — a built-in tamper alarm.

The returned CHSH value is sampled from a statistical software model. It
illustrates the protocol indicator; it does **not** certify that a physical
source produced entanglement or that a real device is secure.

### B92 (`POST /crypto/b92/simulate`)

Two-state prepare-and-measure QKD: bit 0 → `|0⟩`, bit 1 → `|+⟩`. Because these
states are non-orthogonal, only *conclusive* outcomes contribute to the key.

- **Input:** `num_bits`, `channel_error_rate`, `seed`. `num_bits` is 1–4096
  (default 128), channel error is 0–1, and the seed is optional.
- **Output:** Alice's states, Bob's measurements, conclusive/inconclusive
  counts, sifted key, `qber`, `explanation`.

### QRNG (`POST /crypto/qrng/simulate`)

Models "prepare `H|0⟩`, then measure", which yields a uniform bit.

- **Input:** `num_bits`, `method` (`hadamard_measurement`), `seed`. `num_bits` is
  1–8192 (default 128), and the seed is optional.
- **Output:** `generated_bits`, a display-oriented `bit_string`, `zero_count`,
  `one_count`, `frequency_0/1`, `explanation`, and `charts_data`. The chart data
  includes `deviation_sigma`, a simple sample-bias diagnostic rather than a
  randomness certification test.
- **Honesty note:** this is an educational simulator using a PRNG. An explicit
  seed makes it reproducible — the opposite of what a certified hardware QRNG
  must be. A real device-independent QRNG derives and certifies entropy from
  measured quantum processes.

## Privacy amplification

After sifting and error estimation, Alice and Bob share a *partially* secret
key. Privacy amplification (`backend/crypto/privacy_amplification.py`) compresses
it with a universal **Toeplitz hash** to illustrate how residual information can
be reduced. The output length follows a simplified estimate based on
`length · (1 − 2·H(QBER))`, minus a small educational security parameter; when
the QBER is too high, the model returns no final key
(`final_key_length == 0`). This is not a finite-key proof or hardened
cryptographic implementation.

## Quantum vs post-quantum cryptography

These are different things and are frequently confused:

- **Quantum cryptography (QKD)** uses quantum physics (no-cloning, measurement
  disturbance) to *distribute keys* with eavesdropping detection. It needs
  quantum hardware / channels.
- **Post-quantum cryptography (PQC)** is *classical* math (lattices, hashes,
  codes) designed to resist attacks by quantum computers. It runs on ordinary
  computers today. NIST standards include ML-KEM (Kyber), ML-DSA (Dilithium) and
  SLH-DSA (SPHINCS+).

### Why QKD still needs authentication

QKD detects eavesdropping but does **not** by itself stop a
man-in-the-middle who impersonates each party. The classical discussion channel
must be **authenticated** (using pre-shared keys or PQC signatures). QKD provides
*confidentiality with tamper-evidence*, not authentication.

### Why protocol simulation ≠ physical-qubit simulation

Simulating BB84 over 128 bits does not mean simulating 128 entangled physical
qubits as a `2**128`-amplitude state (impossible). Each transmission is an
independent single-qubit event whose statistics we can compute directly. This is
why the lab is fast. It is reproducible only when the same explicit seed is
supplied.
