# Simulation Engines

Quantum Composer routes each circuit to a simulation engine that suits its
**structure**. This document explains why different circuit classes need
different methods, what each engine can and cannot do, and why "large quantum
simulation" means "large *structured* circuits" — never arbitrary universal
circuits.

## The exponential wall (the honest core)

Exact classical simulation of an `n`-qubit system stores the full quantum state:

| Representation   | Entries stored | Bytes (complex128) | Scaling  |
| ---------------- | -------------- | ------------------ | -------- |
| Statevector      | `2**n`         | `16 * 2**n`        | `O(2^n)` |
| Density matrix   | `4**n`         | `16 * 4**n`        | `O(4^n)` |

Statevector memory, concretely:

| Qubits | Statevector memory |
| ------ | ------------------ |
| 20     | 16 MB              |
| 30     | 16 GB              |
| 32     | 64 GB              |
| 35     | 512 GB             |
| 40     | 16 TB              |
| 50     | 16 PB              |
| 100    | ~2 × 10¹⁶ PB (impossible) |

Density matrices are exponentially *worse* (`4**n`), which is why noisy
simulation is limited to very few qubits.

**Conclusion:** there is no clever data structure that makes an *arbitrary*
100-qubit statevector fit in a normal computer. Anyone claiming a laptop
"simulates arbitrary 100-qubit quantum computers" is wrong. Quantum Composer
refuses to fake this: the estimator and engine guardrails reject circuits they
classify as infeasible instead of knowingly attempting an exponential
allocation. Those checks reduce risk but do not replace operating-system or
container resource limits.

## What *can* scale, and why

Some circuits have exploitable structure that avoids storing all `2**n`
amplitudes:

### Stabilizer / Clifford (Gottesman–Knill)

Circuits built only from Clifford gates — `X, Y, Z, H, S, CX, CZ, SWAP`, and
measurement — can be simulated in **polynomial** time and memory by tracking a
set of stabilizer generators instead of amplitudes. The underlying methods can
scale to thousands of qubits and, in specialized Stim workloads, potentially
much farther. **Quantum Composer itself currently accepts at most 4096 qubits**;
that schema ceiling is not a runtime promise. The catch is that **any**
non-Clifford gate (a `T`, or a rotation at a non-multiple-of-π/2 angle) breaks
the formalism. Clifford circuits alone are *not universal* and cannot, by
themselves, give a quantum advantage.

### Matrix Product States (MPS / tensor networks)

An MPS represents the state as a chain of tensors joined by "bonds". The cost is
governed by the **bond dimension**, which tracks entanglement across each cut.
Low-entanglement circuits (e.g. shallow, nearest-neighbour, or GHZ-like) keep the
bond dimension small, so hundreds of qubits are feasible — sometimes exactly,
sometimes with controlled truncation (approximate). Highly entangled circuits
drive the bond dimension toward `2^(n/2)`, at which point MPS is no better than
exact simulation. MPS is not inherently approximate: it can remain exact while
the required bond dimension is retained. Configured truncation or a restrictive
bond limit makes it approximate. The application therefore labels large MPS
work as potentially approximate and warns about bond growth.

### Real quantum hardware (a different thing entirely)

IBM and others run 100+ qubit circuits because the **physical chip is the
quantum system** — it never stores `2**100` classical amplitudes. But you don't
get the statevector back; you get **measurement samples** (bitstrings), plus
whatever noise the device has. "IBM runs 100 qubits" and "a laptop simulates 100
qubits" are fundamentally different claims. Classical simulation must store or
approximate the state; hardware simply *is* the state.

## The engines

| Engine              | Method                | Good for                         | Hard limit / caveat |
| ------------------- | --------------------- | -------------------------------- | ------------------- |
| `aer_statevector`   | exact statevector     | small arbitrary (universal)      | capped at 30 qubits (16 GB) |
| `aer_mps`           | matrix product state  | large low-entanglement circuits  | potentially approximate; bond dimension can explode |
| `aer_stabilizer`    | stabilizer            | large Clifford-only circuits     | rejects non-Clifford gates |
| `aer_density_matrix`| density matrix        | small **noisy** circuits         | capped at 15 qubits (`16·4^n`) |
| `stim_stabilizer`   | Stim stabilizer       | very large Clifford circuits     | Clifford-only; optional dependency |
| `auto`              | router                | anything                         | picks a route using the configured estimate, or rejects |

`stim_stabilizer` requires the optional `stim` package. If it is not installed,
`GET /engines` reports it as unavailable and `auto` falls back to
`aer_stabilizer`. Engine discovery and routing handle that missing optional
dependency explicitly.

## Auto routing policy

`auto` uses the same analyzer internally as `POST /circuit/analyze` and chooses
according to this policy:

1. **Noise enabled** → `aer_density_matrix` if the density matrix fits the memory
   budget; otherwise reject (noisy simulation is small-only).
2. **Small enough for exact** (statevector risk `safe`) → `aer_statevector`
   (richest output, any gate set).
3. **Clifford-only** → `stim_stabilizer` if Stim is installed, else
   `aer_stabilizer` (scales to very large qubit counts).
4. **Non-Clifford but statevector still feasible** (risk `heavy`) →
   `aer_statevector` with a memory warning.
5. **Too big for exact, non-Clifford, approximation allowed** → `aer_mps`.
   Accuracy and cost depend on entanglement and any truncation/bond settings.
6. **Otherwise** → **reject** with:
   > This circuit likely requires exponential memory for exact classical
   > simulation. Try MPS with approximation, reduce qubits/depth, use a
   > Clifford/stabilizer-compatible circuit, or run on real quantum hardware.

The router does not silently route a circuit that its estimator classifies as a
huge impossible statevector allocation. A caller-declared budget is not a probe
of available host memory, so deployment-level resource enforcement is still
required.

## Resource risk labels

The estimator (`backend/analysis/resource_estimator.py`) works entirely in
log-space (so `2**1024` never overflows) and labels the statevector cost against
the configured memory budget:

- **safe** — comfortably below the budget (≤ ¼).
- **heavy** — high but within the budget.
- **dangerous** — at or above the budget (up to ~8×).
- **infeasible** — far beyond the budget.

`POST /circuit/analyze` uses a 1024 MB reference budget. A V2 simulation uses
the request's `max_memory_mb` value (16–65,536 MB), so the two calls can return
different labels. Neither value certifies that the host currently has that much
free memory. The exact-engine caps still allow allocations around 16 GiB at
30 statevector qubits or 15 density-matrix qubits.

## When to use which engine

- Learning a small algorithm, want the diagram and exact counts → **statevector**
  (or `auto`).
- Error-correction codes, randomized benchmarking, large entangling Clifford
  circuits → **stabilizer** (`stim` for the biggest).
- Long, shallow, low-entanglement or nearest-neighbour circuits with many qubits
  → **MPS**. Enable “allow approximation” to let `auto` choose MPS after exact
  simulation becomes infeasible; explicit truncation/bond limits control whether
  the MPS calculation is approximate.
- Studying decoherence / gate errors on a few qubits → **density matrix** with
  noise.
- Not sure → **auto**, then read `selected_engine` and `engine_reason`.
