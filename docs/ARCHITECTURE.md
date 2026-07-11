# Architecture

## Flow

The browser owns editing state; the backend owns trust and execution.

1. React edits typed `CircuitData`; `moment` records a visual column.
2. `lib/api.ts` sends JSON, never Python source.
3. FastAPI parses Pydantic models before an endpoint runs.
4. `circuit_builder.py` dispatches a fixed allowlist into `QuantumCircuit`.
5. `codegen.py` returns Python text or serializes the built circuit as QASM.
6. `simulator.py` runs local `AerSimulator` and returns counts and metrics.

```text
Palette / Presets / Grid → CircuitData JSON → Pydantic validation
                                                │
                                      explicit gate dispatch
                                                │
                         QuantumCircuit → AerSimulator → results
                                └───────────────→ code / QASM
```

## Schema and mapping

| Field | Constraint |
| --- | --- |
| `num_qubits` | integer, 1–8 |
| `num_clbits` | integer, 0–8 |
| `shots` | integer, 1–8192 |
| `operations` | array, at most 200 |

Operations have `gate`, `qubits`, `clbits`, `params`, and optional `moment`. Extra fields are rejected. Indices must be unique, non-negative, and within declared registers.

| Gate | Shape | Qiskit mapping |
| --- | --- | --- |
| `x y z h s t` | one qubit | `circuit.<gate>(q)` |
| `rx ry rz` | one qubit + numeric theta | `circuit.<gate>(theta, q)` |
| `cx cz swap` | two distinct qubits | `circuit.<gate>(q0, q1)` |
| `measure` | one qubit + one clbit | `circuit.measure(q, c)` |
| `barrier` | one or more qubits | `circuit.barrier(*qubits)` |

Operations are stable-sorted by `moment`; list position breaks ties. Qiskit detects parallel depth for disjoint operations in one moment.

## Simulation and safety

If no measurement exists, simulation uses a copied circuit with `measure_all` and returns a warning. Reported depth/counts describe the user circuit. Results include `counts`, `depth`, `gate_counts`, `diagram`, and `warnings`.

- No API accepts, imports, evaluates, or executes client Python.
- Unsupported gates, extra fields, bad arity, invalid indices, non-finite angles, and oversized requests are rejected.
- Dispatch is closed and explicit; there is no `eval`, `exec`, or dynamic import.
- CORS permits documented local frontend origins.
- Production should also enforce request size, concurrency, CPU, memory, and wall-clock limits outside the process.
- No IBM token is requested, stored, or transmitted. `hardware.py` is only a future boundary.

Frontend boundaries: `GatePalette`; `CircuitGrid`/`QubitRow`/`GateCell`; `CircuitSettings`; `PresetCircuits`; `CodePanel`; and `ResultsPanel`/`Histogram`. `lib/api.ts` is the sole transport layer.

## V2 architecture: multi-engine simulation + cryptography

V2 adds capabilities without changing any V1 endpoint or behaviour.

```text
CircuitData JSON ──► /circuit/analyze ──► analysis/circuit_analyzer
                                            + analysis/resource_estimator
                                            (Clifford test, memory, feasibility)

{circuit, options} ─► /circuit/simulate-v2 ─► engines/router
                                                │  (honest auto policy)
                                                ├─ aer_statevector   (exact, ≤30q)
                                                ├─ aer_mps           (approx, low-ent)
                                                ├─ aer_stabilizer    (Clifford, large)
                                                ├─ aer_density_matrix(noise, ≤15q)
                                                └─ stim_stabilizer   (Clifford, optional)

protocol params ──► /crypto/{bb84,e91,b92,qrng} ─► crypto/* (seeded, protocol-level)
```

Key modules:

- `analysis/resource_estimator.py` — computes `16*2**n` / `16*4**n` memory in
  **log space** (never overflows), with safe/heavy/dangerous/infeasible labels.
- `engines/router.py` — chooses a feasible engine or raises
  `InfeasibleCircuitError`; it never silently attempts an exponential allocation.
- `engines/base.py` — engine contracts, typed errors, and optional-dependency
  detection (`stim_available`, `aer_available`).
- Optional dependencies (`stim`) are detected at runtime; absence yields a clean
  availability status, never a crash.

Additional V2 safety:

- Exact engines enforce **absolute hard qubit caps** (statevector 30, density 15)
  independent of the configured memory budget, preventing accidental OOM.
- All Qiskit/Aer imports are lazy, so the app imports and serves `/engines` even
  if Aer is not installed.
- The advanced request schema relaxes container limits (up to 4096 qubits) but
  reuses the identical per-operation validation; feasibility is enforced by the
  estimator and router, not by an arbitrary cap.
