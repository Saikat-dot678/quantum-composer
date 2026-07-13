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

## Post-simulation quantum-state analysis

Beyond sampled counts, `/circuit/simulate-v2` can optionally return the
**actual state the engine computed** for that run (`include_state_analysis`
in `SimulationOptions`; see [ARCHITECTURE.md](ARCHITECTURE.md) for the full
pipeline). What comes back — and whether anything can come back at all —
depends entirely on the engine, independent of how large a *simulation* that
engine can otherwise run:

| Engine | State representation | Exact or approximate | Measurement semantics | Extra restriction |
| --- | --- | --- | --- | --- |
| `aer_statevector` | full statevector (amplitudes, phases, Bloch vectors, entanglement) | exact | final / pre-measurement | none beyond the shared qubit caps below |
| `aer_mps` | full statevector, via Aer's own internal MPS→statevector conversion | exact **only if** no truncation was configured; otherwise approximate (flagged in `warnings`) | final / pre-measurement | gated at the *same* qubit cap as `aer_statevector`'s state extraction (not the engine's own much larger simulation limit) — converting a large MPS run's tensors to a full state to display it is exactly the unsafe materialization this limit exists to prevent |
| `aer_density_matrix` | full density matrix (mixed-capable: trace, purity, entropy, Hermiticity, per-qubit reduced states) | exact | final (`mixed_final_state`) / pre-measurement | payload and analysis both capped well below the engine's own qubit ceiling |
| `aer_stabilizer` | stabilizer generator summary only — **never** amplitudes | exact (as a stabilizer description) | final / pre-measurement | amplitudes, phases, and Bloch vectors are structurally unavailable from a stabilizer tableau in this implementation, not merely omitted |
| `stim_stabilizer` | stabilizer generator summary only, via a second, separate `stim.TableauSimulator` pass (Stim's own sampling API has no save-instruction equivalent) | exact (as a stabilizer description) | final / pre-measurement | same as `aer_stabilizer`; the extra pass is polynomial-time even at huge qubit counts, so it is not a "duplicate expensive simulation" |

**Payload and analysis limits** (independent of, and always ≤, the
engine's own simulation qubit cap — "simulation feasibility is not
visualization feasibility"):

| Limit | Qubits | Approximate payload at the cap |
| --- | --- | --- |
| Full amplitude list | ≤ 12 | 4096 amplitudes × 16 B ≈ 64 KiB |
| Any state analysis at all (even a top-k summary) | ≤ 20 | up to ~1,048,576 amplitudes transiently ≈ 16 MiB |
| Full density-matrix JSON payload | ≤ 8 | 256×256 complex entries ≈ 1 MiB |
| Density-matrix metrics (trace/purity/entropy/reduced states, no full matrix) | ≤ 15 | matches `aer_density_matrix`'s own existing engine cap |
| Entanglement / Schmidt-decomposition calculations | ≤ 12 | shares the full-amplitude-list limit (an SVD of comparable size) |
| Stabilizer generator list | ≤ 128 | payload-size guard only — generator tracking itself stays polynomial-time far beyond this |

**MPS-specific restriction, stated plainly:** Aer's public API converts an
MPS tensor chain to a full statevector internally when a state is requested
from it — there is no cheaper native extraction for reduced per-qubit states
directly from the raw tensors implemented here. A large, low-entanglement MPS
circuit therefore keeps simulating (and returning `counts`) far beyond 20
qubits, but its **state analysis** stops at the same qubit count the exact
statevector engine's own state extraction does; above that, the response
says so (`unavailable_reason`) instead of attempting the conversion.

**Visualization limits, separately from either of the above:** even inside a
payload that the backend is willing to return, the frontend never renders an
unbounded amplitude table or an unbounded density-matrix grid. Amplitude/
probability tables cap the number of rendered rows with a "+N more, use the
export" footer; the density-matrix heatmap only renders as a grid up to 16×16
cells (4 qubits) and otherwise points at the JSON/CSV export instead of
building thousands of DOM cells.

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
