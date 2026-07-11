# Quantum Composer Lite

Quantum Composer Lite is an educational, Qiskit-based visual quantum circuit builder inspired by the interaction model of IBM Quantum Composer. It is a learning/portfolio utility—not an IBM product, IBM service, or original research project. The browser submits declarative circuit JSON; it never submits executable Python.

## Features

- Visual grid for 1–8 qubits, classical wires, and up to 20 visible time steps
- X, Y, Z, H, S, T, RX/RY/RZ, CX, CZ, SWAP, Measure, and Barrier
- Two-click endpoint placement for two-qubit gates and click-to-remove editing
- Superposition, Bell, GHZ, teleportation skeleton, Deutsch–Jozsa, Grover, and BB84 presets
- Circuit JSON, generated Qiskit code, OpenQASM 2, counts histogram, depth, gate counts, and text diagram
- Strict Pydantic validation and local Qiskit Aer simulation

## Architecture

```text
Next.js visual composer
        │ structured Circuit JSON
        ▼
FastAPI + Pydantic ──► safe QuantumCircuit builder ──► code / OpenQASM
                                      │
                                      └──► AerSimulator ──► counts + metrics
```

The monorepo contains `frontend/` (Next.js/TypeScript/Tailwind), `backend/` (FastAPI/Qiskit), and `docs/`. See [Architecture](docs/ARCHITECTURE.md) for the flow and safety model.

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

The API is at `http://localhost:8000`, with OpenAPI docs at `/docs`. Run tests with `pytest -q` after installing requirements.

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. Copy `.env.example` to `.env.local` only if the API is not at `http://localhost:8000`.

Load **Bell state**, click **Run circuit**, and expect finite-shot counts close to half `00` and half `11`. Grover and BB84 are also available in Teaching presets.

## Example JSON

```json
{
  "num_qubits": 2,
  "num_clbits": 2,
  "shots": 1024,
  "operations": [
    { "gate": "h", "qubits": [0], "clbits": [], "params": {}, "moment": 0 },
    { "gate": "cx", "qubits": [0, 1], "clbits": [], "params": {}, "moment": 1 },
    { "gate": "measure", "qubits": [0], "clbits": [0], "params": {}, "moment": 2 },
    { "gate": "measure", "qubits": [1], "clbits": [1], "params": {}, "moment": 2 }
  ]
}
```

`moment` is optional for direct API clients and preserves visual column order.

## API

- `GET /health`
- `POST /circuit/validate`
- `POST /circuit/qiskit-code`
- `POST /circuit/qasm`
- `POST /circuit/simulate`

## Limits and current scope

- Maximum 8 qubits, 8 classical bits, 200 operations, and 8192 shots
- Rotation angles are finite numeric radians, not expressions
- Measurements map to the same-index classical bit, or the last available bit
- No dynamic conditions, custom gates, noise, statevector UI, or real hardware execution
- Teleportation is a skeleton because conditional corrections are outside v1
- BB84 is a fixed encode/decode demonstration, not a complete QKD protocol simulator
- OpenQASM export depends on the installed Qiskit version

No IBM credentials are requested or stored. `backend/hardware.py` is an interface boundary only; future IBM Runtime work requires server-side credentials, explicit authorization, job polling, quota handling, and backend-aware transpilation. See [Roadmap](docs/ROADMAP.md).

IBM Quantum Composer inspired the educational interaction model. This project is not affiliated with or endorsed by IBM.
