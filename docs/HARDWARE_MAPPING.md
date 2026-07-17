# Hardware Mapping

`/hardware` is a mapping and transpilation workbench. It resolves a logical
circuit, loads an IBM account backend, an installed fake snapshot, a seeded
generic target, or a user-defined target, and runs Qiskit's target-aware preset
pass manager. It does **not** submit jobs to a QPU.

## Setup

Generic and manual mapping use the normal backend environment:

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

IBM account discovery, IBM fake snapshots, and OpenQASM 3 import are optional:

```powershell
python -m pip install -r requirements-hardware.txt
```

Start the frontend normally and open `http://localhost:3000/hardware`.
OpenQASM 2, declarative circuit JSON, generic targets, and manual targets remain
available when the optional packages are absent.

## IBM credentials and trust boundary

The preferred modes are process environment variables or a Qiskit account
already saved on the trusted backend host:

```env
IBM_QUANTUM_API_KEY=
IBM_QUANTUM_INSTANCE=
IBM_QUANTUM_CHANNEL=ibm_quantum_platform
```

Copy values into a local process manager or untracked environment. Do not commit
a populated `.env`; `backend/.env.example` contains only empty examples.
`QiskitRuntimeService()` may also use a locally saved account supported by the
installed runtime version.

The optional session form sends its password field only in the JSON body of
`POST /hardware/connect`. The backend holds the initialized service in process
memory and returns a redacted status—never the token. The frontend clears its
input immediately and never places the token in a URL, project, share link, or
`localStorage`. Disconnect clears the in-memory session. This mode requires
HTTPS outside localhost, validates the browser `Origin`, permits five connection
attempts per client per minute, applies an 18-second provider-call timeout, and
redacts provider exceptions. CORS allows the documented local origins plus the
comma-separated `QUANTUM_COMPOSER_CORS_ORIGINS` allowlist. There is no
credential-bearing cookie, so the connection endpoint does not depend on
cookie-based CSRF state.

## Backend discovery

IBM discovery is account-scoped; no real backend name is assumed. A name such
as `ibm_fez` may appear for one account or in a test fixture and be absent for
another. The normalized catalog tolerates missing optional fields and includes,
when the provider supplies them:

- operational state, pending jobs, capacity, processor family/version, region;
- instructions, dynamic-circuit capability, coupling map and target;
- calibration timestamp, per-qubit readout/T1/T2/frequency, gate error and
  duration.

The UI filters by source, minimum qubits, operational state, dynamic-circuit
support, required instruction, processor family, region, and maximum known
pending jobs. Missing queue values are displayed as unavailable rather than
invented. Fake devices are dynamically discovered from the installed
`qiskit-ibm-runtime` package and are labeled static snapshots, not live devices.

## Circuit inputs

- **Current Composer circuit:** preserves the project association and logical
  qubit indices. Composite/decomposition definitions are recursively flattened;
  matrix definitions become validated Qiskit `UnitaryGate` operations. Missing
  definitions, operand mismatches, cycles, or synthesis failures stop mapping.
- **Circuit JSON:** accepts the project's validated declarative circuit shape.
  Export bundles containing referenced custom definitions are imported,
  remapped, validated, then resolved before the backend call.
- **OpenQASM 2:** supported by the installed Qiskit parser.
- **OpenQASM 3:** available only when `qiskit-qasm3-import` and the installed
  Qiskit version support it; the UI reports the parser/dependency error.
- **Python:** always rejected. No pasted source is passed to `eval`, `exec`, a
  dynamic import, or a subprocess.

Input ceilings are 200,000 QASM characters, 512 transpilation qubits, and
20,000 circuit operations. These are validation ceilings, not performance
promises.

## Manual hardware schema

Manual targets import and export this versioned JSON shape:

```json
{
  "format": "quantum-composer-hardware",
  "version": 1,
  "name": "Three-qubit teaching line",
  "num_qubits": 3,
  "edges": [
    { "control": 0, "target": 1, "two_qubit_error": 0.02, "gate_duration_ns": 320 },
    { "control": 1, "target": 2, "two_qubit_error": 0.03, "gate_duration_ns": 340 }
  ],
  "undirected": false,
  "basis_gates": ["rz", "sx", "x", "cx"],
  "coordinates": [{ "x": 0, "y": 0 }, { "x": 1, "y": 0 }, { "x": 2, "y": 0 }],
  "qubit_properties": [
    { "readout_error": 0.01, "t1_us": 100, "t2_us": 80 },
    { "readout_error": 0.02, "t1_us": 95, "t2_us": 75 },
    { "readout_error": 0.03, "t1_us": 90, "t2_us": 70 }
  ],
  "measurement_duration_ns": 700,
  "default_gate_duration_ns": 320,
  "calibration_timestamp": "2026-07-17T00:00:00Z",
  "notes": "Educational values, not a live calibration."
}
```

`undirected: true` mirrors each declared edge. With `false`, direction is
preserved. The backend rejects out-of-range/self/duplicate edges, duplicate or
unsupported basis gates, non-finite/out-of-range calibration values, coordinate
or property counts that differ from `num_qubits`, extra fields, more than 512
qubits, and more than 4,096 edges. Coordinates are optional; without them the UI
labels its generated layout **Schematic topology layout**.

## Transpilation and mapping

Mapping is an explicit action; changing an option does not run a pass manager.
The backend constructs the circuit and selected Qiskit `Target`, then uses
`generate_preset_pass_manager(target=..., optimization_level=...)`. Controls
cover optimization levels 0–3, a reproducible seed, an optional logical-to-
physical initial layout, and supported layout/routing methods.

The response compares original and transpiled depth, size, one-/two-qubit gate
counts, measurements, basis instructions, used physical edges, initial/final
layout, permutation, active/idle qubits, captured routing SWAPs, transpilation
time, and estimated duration when instruction durations exist. Logical and
transpiled circuits use the shared, bounded Qiskit Matplotlib SVG viewer with
zoom, fit, scrolling, fullscreen, and downloads. Legacy text diagram fields
remain API-only for compatibility. A generated generic target clearly warns that its
error/duration values are seeded placeholders.

The optional error product is a ranking heuristic, not fidelity:

```text
success = product(1 - gate_error_i) * product(1 - readout_error_q)
```

It assumes independent error terms and omits crosstalk, idle decoherence,
correlated noise, and missing calibration terms. The UI exposes the formula,
assumptions, contributing counts, and missing-data warning.

## Topology and synchronized interaction

The SVG topology supports pointer/wheel pan and zoom, zoom controls, fit/reset,
physical-qubit search/jump, numeric tooltips, an accessible legend, pattern and
dash cues in addition to color, and SVG export. Overlays cover connectivity,
logical layout, circuit activity, readout error, two-qubit error, T1, T2,
duration, and routing/SWAPs.

Selecting a logical or physical qubit synchronizes the topology and layout
table. Selecting a used edge or routing event highlights the physical edge and
explains whether it is used; selecting a SWAP identifies both physical
endpoints. The routing timeline explains that a SWAP was inserted so a later
two-qubit operation can use a supported edge.

## Backend comparison

Up to six real, fake, generic, or manual targets can be compared for capacity,
compatibility, depth, two-qubit gates, SWAPs, active qubits, duration,
calibration age, used-qubit readout error, used-edge error, pending jobs, and
warnings. Failed/incompatible candidates stay visible with their reason.

The deterministic recommendation score is disclosed:

```text
1000 * SWAPs + depth + 100 * (1 - heuristic_success) + missing-calibration penalty
```

Queue is displayed but never enters the score, and the result is explicitly not
a certified prediction.

## Execution status and limits

Real QPU execution is intentionally deferred. There is no “Run on selected QPU”
control, submission endpoint, job ID, polling loop, history, cancellation, or
result retrieval. Mapping never submits automatically. Real hardware normally
returns finite-shot measurement results rather than arbitrary statevectors, so
future execution must remain separate from Simulator Lab state analysis.

Provider metadata changes over time and may be stale between calibrations.
Generated topology coordinates are schematic unless the target supplies them.
Large targets remain inspectable, but dense graphs and expensive pass-manager
runs are bounded by API validation and deployment timeouts/resources.

## Troubleshooting

- **No IBM account:** configure the environment, save a trusted Qiskit account,
  or create a temporary localhost/HTTPS session; generic/manual mapping still
  works.
- **Runtime or QASM 3 unavailable:** install
  `backend/requirements-hardware.txt`; restart FastAPI so dependency detection
  refreshes.
- **Backend name unavailable:** rediscover the account catalog. Access is never
  inferred from a tutorial or hardcoded device name.
- **Missing calibration:** the provider/definition omitted it. The UI shows an
  em dash and excludes it from the heuristic instead of substituting a value.
- **Transpilation rejected:** check capacity, initial-layout uniqueness/bounds,
  target instructions, directed coupling, and custom-unitary synthesis warnings.
