# Beast Mode Roadmap

The evolution of Quantum Composer from a simple visual composer into an
educational **quantum simulation lab + quantum cryptography lab**, and where it
can honestly go next.

## Current features (V1)

- Visual circuit composer for 1–8 qubits (Next.js grid).
- Strict Pydantic-validated circuit JSON — **no user Python is ever executed**.
- Qiskit code generation and OpenQASM 2 export.
- Local Qiskit Aer simulation with counts histogram, depth, gate counts, and a
  text diagram.
- Presets: superposition, Bell, GHZ, teleportation skeleton, Deutsch–Jozsa,
  Grover, BB84 encode/decode.

## V2 completed features

### Multi-engine simulation

- `GET /engines` — engine catalog with runtime availability and honest limits.
- `POST /circuit/analyze` — structure + resource analysis (Clifford test,
  T-count, rotation count, statevector/density memory, feasibility, recommended
  engines).
- `POST /circuit/simulate-v2` — engine-routed simulation with `SimulationOptions`.
- Engines: `aer_statevector`, `aer_mps`, `aer_stabilizer`, `aer_density_matrix`,
  optional `stim_stabilizer`, and an honest `auto` router.
- Log-space resource estimator that never overflows, with safe/heavy/dangerous/
  infeasible risk labels and absolute hard qubit caps for exact engines.
- Rejects infeasible circuits with a clear explanation instead of crashing.

### Quantum cryptography lab

- `POST /crypto/bb84/simulate`, `/crypto/e91/simulate`, `/crypto/b92/simulate`,
  `/crypto/qrng/simulate` — deterministic (seeded) protocol-level simulators.
- QBER, Eve intercept-resend, CHSH indicator (E91), conclusive-measurement stats
  (B92), and Toeplitz-hash privacy amplification.

### Frontend

- **Simulator Lab** tab: engine selector with availability, resource estimates,
  Clifford classification, feasibility badge, large-circuit teaching presets, and
  clear rejection messages.
- **Cryptography Lab** tab: BB84 / E91 / B92 / QRNG with charts and explanations.

## Future (not yet built)

### Execution & realism

- **IBM backend execution** via a reviewed server-side Qiskit Runtime adapter
  (credentials stay server-side; explicit authorization, job polling, quotas).
- **Real backend noise models** imported from device calibration data.
- **Transpiler visualization** and **coupling-map visualization**.

### Viewers (small circuits only)

- **Statevector viewer** and **Bloch sphere** (1-qubit) for exact-simulable
  circuits.
- **Density matrix viewer** for small noisy circuits.

### Cryptography

- **Cascade-style reconciliation** demo (interactive error correction).
- Deeper **privacy amplification** with adjustable security parameters.
- **Toy Grover key-search** demo (√N speedup vs classical brute force).
- **Toy Shor/RSA threat** mode (educational factoring intuition).
- **PQC comparison** panel: ML-KEM, ML-DSA, SLH-DSA vs classical + QKD.

## Guiding principle

Every expansion must **accept declarative data, validate it, and dispatch
explicitly — never execute client-provided Python** — and must stay
**technically honest** about what classical simulation can and cannot do. Larger
qubit counts are supported only where circuit structure allows (Clifford/MPS);
arbitrary large universal circuits are rejected with an explanation, and real
quantum hardware is never conflated with classical statevector simulation.
