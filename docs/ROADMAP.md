# Roadmap

Quantum Composer is an educational quantum circuit composer, multi-engine
simulator, and quantum cryptography lab. This roadmap tracks direction — see
the [Advanced Development Roadmap](BEAST_MODE_ROADMAP.md) for the detailed phase
list. The filename is retained to avoid breaking existing links.

## Done (V2)

- Multi-engine simulation router (`auto`) with estimator-based feasibility
  rejection and explicit reasons.
- Engines: Aer statevector / MPS / stabilizer / density-matrix, optional Stim.
- Circuit analyzer + log-space resource estimator (safe/heavy/dangerous/infeasible).
- Cryptography lab: BB84, E91, B92, QRNG with QBER, Eve, CHSH, privacy amplification.
- Simulator Lab and Cryptography Lab UIs; composer supports larger circuits with
  visual limits separated from simulation feasibility.

## Near term

- Real IBM backend execution via a reviewed server-side Qiskit Runtime adapter
  (credentials stay server-side; explicit authorization, job polling, quotas).
- Real device noise models and ideal/noisy comparison.
- Transpiler and coupling-map visualization.
- Statevector, Bloch-sphere, and density-matrix viewers for small circuits.

## Later

- Cascade-style reconciliation demo and richer privacy-amplification UI.
- Toy Grover key-search and toy Shor/RSA threat demos.
- Post-quantum comparison panel: ML-KEM, ML-DSA, SLH-DSA vs classical + QKD.

## Guiding principle

Any expansion must accept declarative data, validate it, and dispatch
explicitly — **never execute client-provided Python** — and must stay
**technically honest**: larger qubit counts are supported only where circuit
structure allows (Clifford/stabilizer or low-entanglement/MPS); arbitrary large
universal circuits are rejected with an explanation; and real quantum hardware is
never conflated with classical statevector simulation.
