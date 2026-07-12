# Architecture

## System flow

The browser owns editing and presentation state; the backend owns validation,
analysis, and execution. The browser sends declarative JSON only. No API accepts
or runs user-submitted Python.

```text
Next.js application shell
├─ Composer ───────────── CircuitData JSON ──┬─ V1 validate/code/QASM/simulate
│                                            └─ V2 analyze/simulate-v2
├─ Simulator Lab ───────── circuit + options ─── V2 analyzer/router
└─ Cryptography Lab ───── protocol parameters ── protocol simulators
                                                    │
FastAPI + Pydantic validation                       │
├─ fixed gate dispatch → QuantumCircuit → Aer/Stim ┘
├─ resource estimator + engine router
└─ BB84 / E91 / B92 / QRNG protocol models
```

For circuit execution, `moment` records a visual time-step column. Operations
are stable-sorted by `moment`, with list position breaking ties. The backend then
dispatches a fixed gate allowlist into a `QuantumCircuit`; it never evaluates a
gate or module name supplied by the client.

## Frontend ownership and transport

- `app/page.tsx` owns the active mode and the shared composer circuit. Mode-local
  controls, loading state, notices, and results remain inside their feature.
- The V1 composer API module owns validation, Qiskit code, QASM, and small exact
  simulation calls. The V2/lab API module owns health and engine discovery,
  circuit analysis, engine-routed simulation, and the four cryptography
  protocols. Both use a shared JSON transport/error helper so offline and
  FastAPI error handling stay consistent.
- The application shell and mode navigation frame the three feature areas.
  Composer components own the palette, settings, presets, grid, generated output,
  and measurement results. Simulator and cryptography components own their lab
  controls and analysis views. Reusable visual primitives live under
  `components/ui/`.

This split is intentionally lightweight: there is no global state library. It
also means the TypeScript response types must be kept synchronized with the
Pydantic schemas and protocol dictionaries.

## Circuit schemas and visual limits

The V1 and V2 APIs deliberately use different request containers.

### V1 `CircuitRequest`

| Field | Constraint |
| --- | --- |
| `num_qubits` | integer, 1–8 |
| `num_clbits` | integer, 0–8 |
| `shots` | integer, 1–8192 |
| `operations` | array, at most 200 |

V1 backs validation, code/QASM generation, and the small exact simulation path.

### V2 `AdvancedCircuitRequest`

| Field | Constraint |
| --- | --- |
| `num_qubits` | integer, 1–4096 |
| `num_clbits` | integer, 0–4096 |
| `shots` | integer, 1–1,000,000 |
| `operations` | array, at most 200,000 |

These are request-validation ceilings, not simulation guarantees. The visual
composer has a separate interactive limit (128 qubits, `LIMITS.composer` in
`frontend/lib/constants.ts`) and a two-stage rendered-cell guard; circuits wider
than the interactive grid exist only as compact generated descriptors
(`LargeCircuitDescriptor`) built on demand for Simulator Lab. Composer circuits
outside any V1 container limit can be analyzed or simulated through V2, but the
current V1 code/QASM endpoints cannot export them.

Both request types reuse the same operation model. Extra fields are rejected;
indices must be unique, non-negative, and within the declared registers.

| Gate | Shape | Qiskit mapping |
| --- | --- | --- |
| `x y z h s t` | one qubit | `circuit.<gate>(q)` |
| `rx ry rz` | one qubit + numeric theta | `circuit.<gate>(theta, q)` |
| `cx cz swap` | two distinct qubits | `circuit.<gate>(q0, q1)` |
| `measure` | one qubit + one clbit | `circuit.measure(q, c)` |
| `barrier` | one or more qubits | `circuit.barrier(*qubits)` |

## V1 simulation and code generation

If no measurement exists, V1 simulation copies the circuit, measures all
qubits, and returns a warning. Reported depth and counts describe the submitted
user circuit. The normalized response includes `counts`, `depth`,
`gate_counts`, `diagram`, and `warnings`. `codegen.py` returns Qiskit Python as
text or serializes the validated circuit as OpenQASM; generated Python is never
executed by the API.

## V2 multi-engine simulation

V2 adds analysis and routing without changing the V1 endpoints.

```text
CircuitData JSON ──► /circuit/analyze ──► circuit_analyzer
                                            + resource_estimator

{circuit, options} ─► /circuit/simulate-v2 ─► engines/router
                                                ├─ aer_statevector    exact, ≤30q
                                                ├─ aer_mps            low-entanglement
                                                ├─ aer_stabilizer     Clifford-only
                                                ├─ aer_density_matrix noisy, ≤15q
                                                └─ stim_stabilizer    Clifford, optional
```

Key modules:

- `analysis/resource_estimator.py` computes `16*2**n` and `16*4**n` memory in
  log space and assigns safe/heavy/dangerous/infeasible labels.
- `engines/router.py` applies the auto-selection policy and raises a typed
  infeasibility error when no allowed route is appropriate.
- `engines/base.py` defines engine results/errors and detects optional Aer/Stim
  dependencies without importing them.
- Qiskit/Aer imports are lazy, so engine discovery still works when an optional
  runtime is absent.

`POST /circuit/analyze` uses a fixed 1024 MB reference budget. The simulator
reanalyzes internally using `options.max_memory_mb`, which may be declared from
16 to 65,536 MB. Consequently, analysis and execution can show different risk
labels when the budgets differ.

The exact-engine caps (30 statevector qubits and 15 density-matrix qubits) and
declared memory budget are guardrails, not proof that an allocation is safe on
the current host. A 30-qubit complex128 statevector is already about 16 GiB.
Production deployments must enforce process/container memory, CPU, concurrency,
request-size, and wall-clock limits independently.

Stabilizer libraries can scale far beyond full-state methods, but this
application currently accepts no more than 4096 qubits. MPS can be exact while
the retained bond dimension is sufficient; truncation or a restrictive bond
limit makes it approximate, and highly entangled circuits can still become
exponentially expensive.

## Cryptography simulation

```text
protocol parameters ──► /crypto/{bb84,e91,b92,qrng}/simulate
                     ──► seeded statistical protocol models
```

These endpoints model protocol statistics, not a physical quantum channel or a
production QKD system. Supplying the same explicit seed makes a run reproducible;
omitting the seed does not. Their dictionaries are typed on the frontend but do
not currently use Pydantic response models, so contract tests or response models
would reduce drift risk.

## Trust and deployment boundaries

- Unsupported gates, extra fields, invalid arity/indices, non-finite angles, and
  oversized request containers are rejected.
- Dispatch is closed and explicit; there is no `eval`, `exec`, or client-directed
  dynamic import.
- CORS allows the documented local frontend origins only.
- A `422` generally represents validation, unsupported, or infeasible work; a
  `503` represents an unavailable execution dependency or engine.
- No IBM token is requested, stored, or transmitted. `hardware.py` is a future
  interface boundary only; real hardware execution is not implemented.
