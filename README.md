# Quantum Composer

**Quantum Composer is an educational quantum circuit composer, multi-engine
simulator, and quantum cryptography lab.** It is a learning/portfolio project —
not an IBM product, IBM service, or original research. The browser submits
declarative, validated circuit JSON; it **never** submits or executes Python.

Built on a Next.js frontend and a FastAPI + Qiskit backend, it lets you compose
circuits visually, route them to the simulation engine that fits their
structure, and explore protocol-level quantum cryptography — all while being
honest about the hard limits of classical simulation.

## Features

### Composer
- Visual grid for 1–8 qubits with X, Y, Z, H, S, T, RX/RY/RZ, CX, CZ, SWAP,
  Measure, and Barrier.
- Circuit JSON, generated Qiskit code, OpenQASM 2, counts histogram, depth, gate
  counts, and text diagram.
- Presets: superposition, Bell, GHZ, teleportation skeleton, Deutsch–Jozsa,
  Grover, BB84.

### Simulator Lab (multi-engine)
- Engines: `aer_statevector`, `aer_mps` (MPS), `aer_stabilizer`,
  `aer_density_matrix` (noise), optional `stim_stabilizer`, and an honest `auto`
  router.
- Circuit analysis: Clifford classification, T-count / rotation count,
  statevector **and** density-matrix memory estimates, feasibility badge, and
  recommended engines — computed *before* running.
- Large-circuit teaching presets that show what scales (100-qubit GHZ via MPS,
  1000-qubit Clifford via stabilizer) and what does not (arbitrary 100-qubit
  non-Clifford is rejected with an explanation).

### Cryptography Lab
- Protocol-level, seeded-reproducible simulators: **BB84**, **E91** (with a CHSH
  indicator), **B92**, and a **QRNG**.
- QBER reporting, Eve intercept-resend, and Toeplitz-hash privacy amplification.

## Can this simulate 100 qubits?

Short answer: **it depends entirely on the circuit.**

- ✅ **Yes, for some structured circuits.** Clifford/stabilizer circuits (via
  Stim or Aer's `stabilizer` method) and low-entanglement circuits (via MPS)
  can reach 100, 1000, or more qubits.
- ❌ **No, not for arbitrary universal circuits.** A full statevector stores
  `2**n` complex amplitudes = `16 * 2**n` bytes. That is ~16 GB at 30 qubits,
  ~16 PB at 50 qubits, and roughly `2 × 10¹⁶` PB at 100 qubits — physically
  impossible on any classical computer. Density-matrix (noisy) simulation is
  even worse at `16 * 4**n` bytes.
- 🖥️ **Real IBM quantum hardware is different.** A physical quantum processor
  runs 100+ qubit circuits because the **chip itself is the quantum system** —
  it never stores `2**100` classical amplitudes. But you get **measurement
  samples** back, not the full statevector. "IBM runs 100 qubits" and "a laptop
  simulates 100 qubits" are fundamentally different claims.

When a circuit is genuinely infeasible, Quantum Composer **rejects it with an
explanation** rather than freezing or crashing. See
[docs/SIMULATION_ENGINES.md](docs/SIMULATION_ENGINES.md) for the full story.

### What this project does and does not claim

It **does** claim to:
- support larger **structured** circuits through specialized methods such as
  stabilizer and MPS simulation;
- include educational **protocol-level** quantum cryptography simulations;
- **explain feasibility limits** before simulation;
- be optionally extensible toward real IBM Quantum backend execution later.

It does **not** claim to:
- ~~simulate arbitrary large quantum computers~~
- ~~be a full-scale / production quantum computer simulator~~
- ~~be a production quantum cryptography system~~
- ~~be an "IBM-level 100-qubit simulator"~~

## Architecture

```text
Next.js UI ── Composer · Simulator Lab · Cryptography Lab
        │ declarative Circuit JSON  /  protocol parameters
        ▼
FastAPI + Pydantic (strict validation, no user Python)
        │
        ├─ analysis/   circuit_analyzer + resource_estimator (feasibility)
        ├─ engines/    router → statevector | MPS | stabilizer | density | Stim
        └─ crypto/     BB84 | E91 | B92 | QRNG | privacy amplification
```

The monorepo contains `frontend/` (Next.js/TypeScript/Tailwind), `backend/`
(FastAPI/Qiskit), and `docs/`. See [Architecture](docs/ARCHITECTURE.md),
[Simulation Engines](docs/SIMULATION_ENGINES.md),
[Cryptography Lab](docs/CRYPTOGRAPHY_LAB.md), and
[Beast Mode Roadmap](docs/BEAST_MODE_ROADMAP.md).

## Prerequisites

Python 3.11/3.12 and Node.js 20+ are recommended.

## Run the backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn main:app --reload
```

The API is at `http://localhost:8000`, with interactive docs at `/docs`. Run
tests with `pytest -q`.

**Optional:** install `stim` to enable the very fast, large-scale Clifford
engine. Without it, `GET /engines` reports `stim_stabilizer` as unavailable and
`auto` falls back to Aer's `stabilizer` method — nothing crashes.

```bash
pip install stim
```

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. Copy `.env.example` to `.env.local` only if the
API is not at `http://localhost:8000`.

Use the header tabs to switch between **Composer**, **Simulator Lab**, and
**Cryptography Lab**.

## API

**V1 (unchanged):**
- `GET /health`
- `POST /circuit/validate`
- `POST /circuit/qiskit-code`
- `POST /circuit/qasm`
- `POST /circuit/simulate`

**V2 — simulation lab:**
- `GET /engines` — available engines, dependency status, and honest limits.
- `POST /circuit/analyze` — structure + resource-feasibility analysis.
- `POST /circuit/simulate-v2` — engine-routed simulation (`{ circuit, options }`).

**V2 — cryptography lab:**
- `POST /crypto/bb84/simulate`
- `POST /crypto/e91/simulate`
- `POST /crypto/b92/simulate`
- `POST /crypto/qrng/simulate`

### Example: analyze then simulate

```bash
# Analyze a Bell circuit
curl -s localhost:8000/circuit/analyze -H 'content-type: application/json' -d '{
  "num_qubits": 2, "num_clbits": 0, "shots": 1024,
  "operations": [
    {"gate": "h", "qubits": [0], "moment": 0},
    {"gate": "cx", "qubits": [0, 1], "moment": 1}
  ]
}'

# Simulate with auto engine selection
curl -s localhost:8000/circuit/simulate-v2 -H 'content-type: application/json' -d '{
  "circuit": {"num_qubits": 2, "num_clbits": 0, "shots": 1024,
    "operations": [
      {"gate": "h", "qubits": [0], "moment": 0},
      {"gate": "cx", "qubits": [0, 1], "moment": 1}
    ]},
  "options": {"engine": "auto", "shots": 1024, "seed": 42}
}'
```

### Example: BB84 with and without an eavesdropper

```bash
curl -s localhost:8000/crypto/bb84/simulate -H 'content-type: application/json' \
  -d '{"num_bits": 256, "eve_enabled": true, "channel_error_rate": 0.02, "seed": 123}'
```

## Limits and current scope

- The **composer** grid is capped at 8 qubits; the **Simulator Lab** accepts
  larger structured circuits (up to 4096 qubits in the schema), gated by the
  resource estimator and per-engine hard caps.
- Exact statevector is hard-capped at 30 qubits; density matrix at 15 qubits.
- MPS results may be **approximate** for entangled circuits; enable "allow
  approximation".
- Cryptography simulators are **protocol-level** and reproducible via `seed`;
  the QRNG is educational, not a certified hardware generator.
- No dynamic conditions, custom gates, statevector/Bloch viewers, or real
  hardware execution yet — see the [roadmap](docs/BEAST_MODE_ROADMAP.md).

No IBM credentials are requested or stored. `backend/hardware.py` is an interface
boundary only. IBM Quantum Composer inspired the educational interaction model;
this project is not affiliated with or endorsed by IBM.
