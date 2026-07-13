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

## Post-simulation quantum-state analysis

`/circuit/simulate-v2` can optionally return the **actual backend-computed
quantum state** for the run it just performed, not the Composer's local
browser-side live preview (see below). This is opt-in and additive:
`SimulationOptions.include_state_analysis` defaults to `false`, so an ordinary
request's shape and cost are unchanged; setting it (plus the related
`state_detail`, `include_density_matrix`, `max_returned_amplitudes`,
`top_k_states` options) adds one typed, optional
`SimulationV2Response.state_analysis: StateAnalysisResponse | null` field.

```text
{circuit, options} ─► /circuit/simulate-v2 ─► engines/{aer_*,stim_stabilizer}
                        │                        │
                        │ run_aer_with_state()    │ save_statevector /
                        │ (engines/aer_common.py) │ save_density_matrix /
                        │                          save_stabilizer
                        ▼
                analysis/state_postprocessing.py
                  (pure numpy; no Qiskit/Aer import)
                        │
                        ▼
              StateAnalysisResponse (backend/schemas.py)
                        │
        ┌───────────────┴────────────────────┐
        ▼                                    ▼
components/simulator/state/*        lib/stateAnalysisFormat.ts
  (QuantumStatePanel + 5 sub-views)    (pure display formatting only)
```

**Representations.** `state_analysis.representation` is one of
`"statevector"` (exact, pure — `aer_statevector`, `aer_mps`),
`"density_matrix"` (exact, mixed-capable — `aer_density_matrix`), or
`"stabilizer_summary"` (generator list, never a full amplitude vector —
`aer_stabilizer`, `stim_stabilizer`). A representation is never upgraded or
downgraded to look like a different one — a stabilizer engine's result never
gains fake amplitudes, and a noisy density matrix is never reported as pure.

**Measurement semantics** (`state_analysis.semantic_point`): a circuit with no
measurement gets its actual `"final_state"` (or `"mixed_final_state"` for the
density-matrix engine). A circuit whose measurements are all *terminal*
(verified structurally: no operation touches a qubit after that qubit's own
last measurement) gets `"pre_measurement_state"` — a separate,
measurement-free analysis copy of the same validated circuit, evaluated up to
that point; the circuit that actually produces `counts` is a distinct
execution of the original, still-measured circuit, never altered by this. A
circuit with a genuine *mid-circuit* measurement gets `available: false` and
an explicit `unavailable_reason` — no single deterministic pure state exists
for such a circuit in general, so none is fabricated.

**Extraction** happens through one shared helper,
`engines/aer_common.py`'s `run_aer_with_state()`: it inserts the engine's own
Aer save instruction (`save_statevector` / `save_density_matrix` /
`save_stabilizer`) at the correct point in the circuit, so one Aer execution
yields both the sampled `counts` and the raw state object — a
terminally-measured circuit costs one additional, cheaper (measurement-free)
execution for the analysis copy, never a duplicate of the expensive run.
`aer_mps` reuses the same call (Aer converts its own MPS tensor chain to a
full statevector internally when asked — verified, not assumed), so it is
gated by the same qubit constant the exact statevector path uses, independent
of how large an MPS simulation the engine itself can otherwise handle.
`stim_stabilizer` has no save-instruction equivalent in its batch-sampling
API, so it runs a second, separate, polynomial-time `stim.TableauSimulator`
pass over the same gate sequence for its generator summary.

**Post-processing** (`backend/analysis/state_postprocessing.py`) is a pure
numpy module with no Qiskit/Aer/Stim import — normalization/trace/Hermiticity
checks with configurable tolerance, basis-state labeling (`qiskit_little_
endian_q0_lsb`: qubit 0 is the least-significant bit, the rightmost character
of a label string — the same convention `frontend/lib/statevector.ts`'s local
preview already used), amplitude/probability/phase entries, reduced
single-qubit density matrices via partial trace, per-qubit Bloch vectors/
purity/entropy, Wootters concurrence (pure and mixed forms), and Schmidt
coefficients/entanglement entropy per bipartition. Every top-level function
degrades to `{available: false, unavailable_reason}` on malformed input
rather than ever failing the containing simulation response.

**Frontend flow**: `SimulationResultPanel.tsx` gained a fourth "Quantum
State" tab (alongside Distribution/Diagnostics/Diagram) rendering
`components/simulator/state/QuantumStatePanel.tsx`, which shows only the
sub-views applicable to what came back (Overview always; Probabilities/Phases
when a per-basis list exists; Bloch when per-qubit data exists; Density
Matrix only for that representation; Entanglement only when computed).
`lib/stateAnalysisFormat.ts` contains presentation-only helpers (complex/
phase/probability formatting, a phase-to-color mapping, JSON/CSV export) —
every actual physics computation happens once, server-side; the frontend
never recomputes a Bloch vector, purity, or concurrence itself.

**Size limits** are independent of, and always at most equal to, the
corresponding simulation engine's own qubit cap — "simulation feasibility is
not visualization feasibility": full amplitude payload ≤ 12 qubits, any state
analysis at all ≤ 20 qubits, full density-matrix payload ≤ 8 qubits,
density-matrix metrics ≤ 15 qubits (matching that engine's own existing cap),
entanglement/Schmidt calculations ≤ 12 qubits, stabilizer generator lists ≤
128 qubits (a payload-size guard only, since tracking them stays
polynomial-time at any scale). See
[SIMULATION_ENGINES.md](SIMULATION_ENGINES.md) for the full per-engine table.

**Custom-gate interaction**: state analysis always runs on the fully
*resolved* circuit (the same `"unitary"`-flattened form every other backend
call already requires — see [CUSTOM_GATES.md](CUSTOM_GATES.md)), so a
matrix-defined custom gate's state is analyzed exactly like a built-in
circuit that happens to contain a `UnitaryGate`, with no custom-gate-aware
code anywhere in the engines or post-processing module.

**Composer's local live preview is unrelated and unchanged**:
`frontend/lib/statevector.ts`'s `computeStatePreview()` remains a small,
ideal, browser-only statevector simulator capped at 5 qubits, recomputed on
every edit, and clearly labeled "Live ideal preview — calculated locally in
this browser" wherever it's shown, distinct from a real
`state_analysis` result. It gained two explicit, non-automatic actions —
"Open in Simulator Lab" and "Compare with backend result" — but no change to
what it itself computes.

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
