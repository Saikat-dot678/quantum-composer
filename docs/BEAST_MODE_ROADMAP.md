# Advanced Development Roadmap

The evolution of Quantum Composer from a simple visual composer into an
educational **quantum simulation lab + quantum cryptography lab**, and where it
can honestly go next.

## V1 baseline retained

- The original V1 exact request path remains limited to 1–8 qubits. The current
  interactive grid can describe up to 128 qubits, uses a two-stage rendered-cell
  guard (warn, then pause), and sends simulation outside the full V1 envelope to
  V2. Wider structured circuits exist as generated descriptors in Simulator Lab.
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
- Rejects circuits classified as infeasible with a clear explanation before
  engine execution. Deployment-level memory, CPU, concurrency, and timeout
  controls remain necessary.

### Quantum cryptography lab

- `POST /crypto/bb84/simulate`, `/crypto/e91/simulate`, `/crypto/b92/simulate`,
  `/crypto/qrng/simulate` — protocol-level statistical simulators; an explicit
  repeated seed makes a run deterministic.
- QBER, Eve intercept-resend, CHSH indicator (E91), conclusive-measurement stats
  (B92), and Toeplitz-hash privacy amplification.

### Frontend

- Shared scientific app shell with backend health, mode/status rail, responsive
  navigation, and visible structured-large-circuit limits.
- **Composer** workspace with indexed circuit grid, gate details, direct
  feasibility analysis, complete V1/V2 routing, and full-width code/results.
- **Simulator Lab** tab: engine selector with availability, resource estimates,
  method guide, Clifford classification, feasibility badges, large-circuit
  teaching presets, result metadata, and clear rejection messages.
- **Cryptography Lab** tab: BB84 / E91 / B92 / QRNG protocol flows,
  key/correlation views, QBER/CHSH, QRNG bias diagnostics, and educational
  boundaries.

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
