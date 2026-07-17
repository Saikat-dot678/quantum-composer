# Quantum Composer

**Quantum Composer is an educational quantum circuit composer, multi-engine
simulator, hardware-mapping workbench, and quantum cryptography lab.** It is a learning/portfolio project —
not an IBM product, IBM service, or original research. The browser submits
declarative, validated circuit JSON; it **never** submits or executes Python.

Built on a Next.js frontend and a FastAPI + Qiskit backend, it lets you compose
circuits visually, route them to the simulation engine that fits their
structure, and explore protocol-level quantum cryptography — all while being
honest about the hard limits of classical simulation.

## Features

### Composer
- A real spatial circuit editor: a pannable/zoomable SVG canvas (not a DOM
  grid) with X, Y, Z, H, S, T, RX/RY/RZ, CX, CZ, SWAP, Measure, and Barrier,
  a floating searchable gate dock, drag-from-dock-to-wire placement (click
  placement remains the accessible baseline — dragging is never the only way
  to place a gate), a bird's-eye minimap for large circuits, and a contextual
  inspector that stays empty until a placed gate is selected. Viewport-based
  virtualization (only the visible cells are iterated per render) is what
  makes a 128-qubit × 256-moment circuit navigable at all.
- **Reposition placed gates** by dragging (with a live ghost preview, snap
  guides, and valid/invalid drop feedback) or, as a fully keyboard-equivalent
  path, by selecting a gate and pressing `M` to enter move mode (arrow keys
  slide a preview, `Enter` confirms, `Escape` cancels). Multi-qubit gates
  (built-in or custom) move as one atomic unit — control/target and operand
  order are always preserved — and every move is a single undo/redo step.
  One shared coordinate/placement-validation module
  (`frontend/lib/placement.ts`) backs click placement, dragging, keyboard
  movement, and custom-gate placement alike, so they can never disagree about
  what is a legal drop.
- **Custom gates and operations:** define a gate from a literal unitary
  matrix (1–3 qubits, validated for unitarity within tolerance), from a
  decomposition of existing gates (with named, reusable parameters), or
  capture a region of the live circuit as a reusable composite "macro" —
  all through a progressive-disclosure creation wizard with a live Qiskit
  code preview. A dedicated library (search, qubit-count/kind filters,
  favorites, recently used, JSON import/export) manages what you save.
  Everything is declarative JSON validated client-side — nothing is ever
  `eval`'d or executed. Placed custom instances are fully backend-aware:
  decomposition/composite gates are transparently flattened into built-in
  gates before any backend call (so a Bell-pair macro still analyzes as
  Clifford), and matrix gates become a Qiskit `UnitaryGate`. Shared links and
  exported/imported circuit JSON embed the custom definitions they reference,
  so they round-trip to a browser that has never seen them before.
- Circuit JSON, generated Qiskit code, OpenQASM 2, counts histogram, depth, gate
  counts, and a zoomable Qiskit Matplotlib SVG circuit diagram, docked in a collapsible bottom sheet that
  auto-expands after a run. The V1 code/QASM/exact path remains limited to
  8 qubits, 8 classical bits, 200 operations, and 8,192 shots; circuits outside
  that envelope use the V2 simulator path and retain JSON output.
- **Live instruments:** the floating toolbar shows the active circuit's
  qubit/op count and route as you edit; for circuits up to 5 qubits the
  inspector renders a local ideal-state preview (basis probabilities, phases,
  and a 1-qubit Bloch projection), transparently resolving any custom gates
  first — above the qubit cap, or when a custom gate can't be resolved, it
  explains why instead of showing a silently wrong result. It is explicitly
  labeled "Live ideal preview — calculated locally in this browser," never
  presented as a simulation result, with two one-click actions next to it:
  **Open in Simulator Lab** (hand off and run for the actual backend state)
  and **Compare with backend result** (a small local-vs-backend probability
  table for the same circuit). The canvas has one tab stop; arrow keys move a
  keyboard cursor and an aria-live region announces its cell, since a
  zoomable spatial canvas can't expose one focusable DOM node per cell at
  scale.
- Presets: superposition, Bell, GHZ, teleportation skeleton, Deutsch–Jozsa,
  Grover, BB84.

### Simulator Lab (multi-engine)
- Engines: `aer_statevector`, `aer_mps` (MPS), `aer_stabilizer`,
  `aer_density_matrix` (noise), optional `stim_stabilizer`, and an honest `auto`
  router.
- A memory-scaling chart plots the actual 16×2ⁿ / 16×4ⁿ curves against the run
  budget and the active circuit's qubit count, above a compact five-lane
  engine strip that expands exactly one lane's reasoning (scaling, ideal use,
  limitation) at a time.
- Circuit analysis: Clifford classification, T-count / rotation count,
  statevector **and** density-matrix memory estimates, feasibility badge, and
  recommended engines — computed *before* running.
- **Post-simulation quantum state analysis** (opt-in, off by default so an
  ordinary run stays lightweight): a "Quantum State" result tab shows the
  *actual backend-returned* state, not a re-labeled local preview — exact
  amplitudes/probabilities/phases (Dirac notation, a sortable table, a phase
  wheel with an always-paired numeric readout), per-qubit reduced Bloch
  spheres (a qubit selector, never one sphere for a multi-qubit state, with a
  plain-language note on *why* a reduced state is mixed when entangled),
  density-matrix diagnostics (trace, purity, entropy, Hermiticity, a bounded
  magnitude heatmap with an accessible table fallback) for the noise-capable
  engine, and entanglement metrics (two-qubit concurrence, Schmidt
  coefficients/entropy per bipartition) — with an explicit disclaimer that
  this is not a complete entanglement classification for arbitrary mixed,
  multipartite states. A terminally-measured circuit gets a clearly labeled
  pre-measurement analysis copy; a genuinely mid-circuit-measured one gets an
  honest "unavailable" reason instead of a fabricated state. JSON (full
  schema, metrics, warnings) and CSV (amplitude/probability table) export.
  Every size limit here (full-amplitude/density-matrix payload qubit caps,
  top-k truncation, bounded table/heatmap rendering) is independent of, and
  never larger than, the engine's own simulation qubit cap — see
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
  [docs/SIMULATION_ENGINES.md](docs/SIMULATION_ENGINES.md).
- Large-circuit teaching presets that show what scales (100-qubit GHZ via MPS,
  1000-qubit Clifford via stabilizer) and what does not (arbitrary 100-qubit
  non-Clifford is rejected with an explanation).

### Hardware Mapping

- `/hardware` accepts the current resolved Composer circuit, validated circuit
  JSON, OpenQASM 2, and optional OpenQASM 3. Arbitrary pasted Python is rejected
  and never executed.
- Targets can be seeded generic topologies, imported/exported manual hardware
  JSON, dynamically discovered installed IBM fake snapshots, or real IBM
  backends available to the authenticated account. Generic/manual mapping works
  without IBM credentials; no real backend name is hardcoded as guaranteed.
- The interactive topology synchronizes logical/physical qubit selection, used
  edges, and routing SWAPs with the layout table and routing timeline. It offers
  zoom/pan/fit, search, SVG export, calibration tooltips, and connectivity,
  activity, error, T1/T2, duration, and routing overlays. Generated positions
  are explicitly labeled schematic.
- Target-aware Qiskit preset pass managers expose initial/final layout, active
  and idle physical qubits, original/transpiled metrics, inserted SWAPs,
  duration where available, and a fully disclosed error-product heuristic.
  Up to six targets can be compared; queue is displayed but never solely drives
  the recommendation.
- IBM credentials remain backend-side. Environment/saved accounts are
  preferred; an optional temporary session is memory-only, clearable,
  HTTPS/origin/rate/timeout protected, and provider errors are redacted. Real
  QPU job submission is intentionally not implemented—mapping never runs a job.
  See [docs/HARDWARE_MAPPING.md](docs/HARDWARE_MAPPING.md).

### Cryptography Lab
- Protocol-level, optionally seeded simulators: **BB84**, **E91** (with a CHSH
  indicator), **B92**, and a **QRNG**. Reusing an explicit seed reproduces a
  run; an omitted seed does not.
- Each protocol's live signal path is drawn as an actual actor/channel
  diagram, not a status list: Alice → channel → Bob for BB84/B92 with Eve
  rendered as a literal interception node on the wire when enabled; a shared
  Source emitting to independent Alice/Bob analyzers for E91 (its real
  topology); a single Prepare → Hadamard → Measure → Bits pipeline for QRNG,
  which has no second party. The diagram redraws live as controls change.
- QBER reporting, Eve intercept-resend, and Toeplitz-hash privacy amplification.

## Can this simulate 100 qubits?

Short answer: **it depends entirely on the circuit.**

- ✅ **Yes, for some structured circuits.** Clifford/stabilizer circuits (via
  Stim or Aer's `stabilizer` method) and low-entanglement circuits (via MPS)
  can reach 100, 1000, or more qubits in suitable environments. This API
  currently accepts at most 4096 qubits, and practical runtime still depends on
  circuit depth, entanglement, operations, shots, and host resources.
- ❌ **No, not for arbitrary universal circuits.** A full statevector stores
  `2**n` complex amplitudes = `16 * 2**n` bytes. That is ~16 GiB at 30 qubits,
  ~16 PiB at 50 qubits, and roughly `2 × 10¹⁶` PiB at 100 qubits — physically
  impossible on any classical computer. Density-matrix (noisy) simulation is
  even worse at `16 * 4**n` bytes.
- 🖥️ **Real IBM quantum hardware is different.** A physical quantum processor
  runs 100+ qubit circuits because the **chip itself is the quantum system** —
  it never stores `2**100` classical amplitudes. But you get **measurement
  samples** back, not the full statevector. "IBM runs 100 qubits" and "a laptop
  simulates 100 qubits" are fundamentally different claims.

When the configured estimator and engine guardrails classify a circuit as
infeasible, Quantum Composer **rejects it with an explanation** before launching
that engine. These checks reduce risk; they are not an operating-system resource
sandbox, so production deployments still need memory, CPU, concurrency, and
wall-clock limits. See
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
Next.js UI ── Composer · Simulator Lab · Hardware Mapping · Cryptography Lab
        │ declarative circuit/target JSON  /  protocol parameters
        ▼
FastAPI + Pydantic (strict validation, no user Python)
        │
        ├─ analysis/   circuit_analyzer + resource_estimator (feasibility)
        ├─ engines/    router → statevector | MPS | stabilizer | density | Stim
        ├─ hardware/   discovery → Target → preset pass manager → mapping
        └─ crypto/     BB84 | E91 | B92 | QRNG | privacy amplification
```

The monorepo contains `frontend/` (Next.js/TypeScript/Tailwind), `backend/`
(FastAPI/Qiskit), and `docs/`. See [Architecture](docs/ARCHITECTURE.md),
[Simulation Engines](docs/SIMULATION_ENGINES.md),
[Graphical Circuit Diagrams](docs/CIRCUIT_DIAGRAMS.md),
[Cryptography Lab](docs/CRYPTOGRAPHY_LAB.md), and the
[Advanced Development Roadmap](docs/BEAST_MODE_ROADMAP.md).

## Prerequisites

Python 3.11/3.12 and Node.js 20+ are recommended.

## Run the backend

```bash
cd backend
python -m venv .venv
# Windows PowerShell: .\.venv\Scripts\Activate.ps1
# Windows cmd.exe: .venv\Scripts\activate.bat
# macOS/Linux: source .venv/bin/activate

# Choose one dependency set:
python -m pip install -r requirements.txt      # runtime only
# python -m pip install -r requirements-dev.txt  # runtime + pytest/httpx

python -m uvicorn main:app --reload
```

The API is at `http://localhost:8000`, with interactive docs at `/docs`. If the
development requirements are installed, run tests from `backend/` with
`python -m pytest -q`.

The base runtime installs Matplotlib and `pylatexenc` for Qiskit's graphical
circuit drawer. Rendering uses the headless `Agg` backend and does not install
or require Qt or another desktop GUI toolkit.

**Optional Stim engine** — the very fast, large-scale Clifford simulator. Without
it, `GET /engines` reports `stim_stabilizer` as unavailable and `auto` falls back
to Aer's `stabilizer` method. Engine discovery handles the missing dependency,
and the test suite covers this fallback.

```bash
python -m pip install -r requirements-stim.txt
```

**Optional Hardware Mapping integrations** — IBM fake snapshots,
account-scoped backend discovery, and OpenQASM 3 import. Generic/manual targets
and OpenQASM 2 work with the base requirements.

```bash
python -m pip install -r requirements-hardware.txt
```

## Run the frontend

```bash
cd frontend
npm install
npm run dev        # dev server
npm run lint       # eslint (--max-warnings 0)
npm run typecheck  # tsc --noEmit
npm run build      # production build
npm run test:unit  # Vitest unit/contract helpers
npm run test:e2e   # Playwright: smoke + accessibility + visual
                   # first run: npx playwright install chromium
```

`e2e/smoke.spec.ts`, `e2e/a11y.spec.ts`, and `e2e/visual.spec.ts` start their
own production server on port 3130 and do **not** require the backend — they
assert the workbench renders honestly when the API is unreachable:

- `e2e/smoke.spec.ts` — routing, deep links, compressed/legacy/invalid share
  links, clipboard round-trip, undo/redo, placing single- and two-qubit gates,
  repositioning a gate (select/delete/re-place), the command palette
  (including actions registered by the Composer), the projects drawer, mobile
  bottom sheets and route switching, canvas arrow-key cursor navigation, the
  live state preview, and an explicit offline-state assertion.
- `e2e/a11y.spec.ts` — **axe** (WCAG 2 A/AA) on the core routes plus the
  palette and projects drawer; fails on serious/critical violations.
- `e2e/visual.spec.ts` — screenshots at desktop and phone widths. Baselines are
  platform-specific, so this suite is skipped in CI; refresh locally with
  `npx playwright test e2e/visual.spec.ts --update-snapshots`.

`e2e/backend.spec.ts` is separate and **does** require a locally running
FastAPI backend (`cd backend && python -m uvicorn main:app --port 8000`): it
runs the default circuit, analyzes it and checks the backend-verified
feasibility surfaces in the inspector, hands the circuit off to Simulator Lab,
switches engine lanes, and runs BB84 with Eve enabled. Each test in it skips
itself if the backend isn't reachable, so `npm run test:e2e` stays green
without it running.

`e2e/state-analysis.spec.ts` and `e2e/state-analysis-visual.spec.ts` are the
same backend-dependent, self-skipping convention, exercising the
post-simulation quantum-state pipeline against the real backend: reference-
state Bloch vectors (`H|0>`, `X|0>`, `S.H|0>`), the Bell-state reduced-qubit
regression, terminal- and mid-circuit-measurement semantics, a noisy
density-matrix result, a real JSON-export download, the mobile layout, axe
scans of every new state view, and six screenshot baselines (the latter file
is additionally skipped in CI, like `visual.spec.ts`, since baselines are
platform-specific — refresh locally with
`npx playwright test e2e/state-analysis-visual.spec.ts --update-snapshots`).

`e2e/hardware.spec.ts` and `e2e/hardware-visual.spec.ts` cover current-circuit
and custom-gate handoff, generic/manual/fake targets, mocked account-scoped IBM
discovery, OpenQASM import, Python rejection, optimization levels, synchronized
layout/edge selection, accessibility, narrow viewports, and four visual
baselines. `e2e/responsive-audit.spec.ts` checks all four workspaces at the
document-overflow viewport matrix, 80â€“200% layout zoom, and the custom-gate
wizard at tablet and phone sizes. Backend-dependent cases skip honestly when
FastAPI is not reachable; no real IBM credential is required.

### Workspace model

The app is an **Instrument Canvas**: a slim 56px top bar (product mark, a
segmented control switching the four real routes, backend/project status,
palette and projects triggers) sits above **`/composer`**, **`/simulator`**,
**`/hardware`**, or **`/crypto`** (deep-linkable, back/forward-aware, and
code-split). Circuit telemetry lives as a contextual on-canvas chip in Composer
rather than as global chrome repeated on every route. The circuit lives in a
workspace provider shared across routes:

- **Undo/redo** — every edit is history-tracked (`Ctrl+Z` / `Ctrl+Shift+Z` /
  `Ctrl+Y`, plus toolbar buttons).
- **Named projects & recents** — save, rename, duplicate, delete, search, and
  JSON import/export from the Projects drawer. Edits autosave to the active
  project (or to an anonymous slot); recents are reopenable from the palette.
  Storage is local to the browser and corruption-tolerant.
- **Share links** — copies `/composer?c2=…`, the whole circuit
  deflate-compressed into the URL (Quirk-style). Links are untrusted input:
  they are strictly validated on load, never executed, and legacy `?c=` links
  still decode.
- **Command palette** — `Ctrl+K` opens a grouped palette (navigate, Composer
  run/analyze/generate, circuit actions, projects, presets). Views register
  their own actions, so the palette is never coupled to a page.
- **Live state preview** — for ≤5 qubits the Composer computes the ideal state
  locally: basis probabilities with phases, an interactive **Bloch sphere**
  (drag or arrow keys) for one qubit, and a concurrence-based entanglement
  readout for two. Above that it explains the exponential wall instead. It is
  explicitly labeled as a local, ideal preview, with one-click actions to open
  the same circuit in Simulator Lab or compare it against a real backend
  result (see "Simulator Lab" above).

Open `http://localhost:3000`. Copy `.env.example` to `.env.local` only if the
API is not at `http://localhost:8000`.

The UI is a light, neutral "Instrument Canvas" system: a pure-neutral gray
ramp (no warm/cool tint), an off-white canvas background, and a single indigo
accent reserved for primary actions and selection — semantic color (emerald
for safe, amber for heavy, rose for infeasible) stays reserved for
feasibility state, never decorative. Self-hosted type system: Archivo for UI
text and headings, JetBrains Mono for bitstrings, counts, and code (latin
subsets committed under `frontend/app/fonts/`, so builds need no font network
access). Text colors are verified against WCAG AA by the axe suite and by
numeric contrast checks during development.

### Interface captures

`docs/frontend-before/` and `docs/frontend-after/` hold matched screenshots of
Composer, Simulator Lab, and Cryptography Lab at 1440×900, 1280×720, and
390×844, captured with Playwright. `docs/FRONTEND_REFERENCE_STUDY.md` records
the product research behind the current design direction and what changed
structurally, not just cosmetically.

### Frontend structure

The app entry point stays thin; components are organized by feature boundary
rather than one monolithic page. The exact filenames may evolve, but the
intended ownership is stable:

- `components/shell/` — `TopBar` (mode switch, backend/project status), and
  the persistent honesty note;
- `components/composer/` — `CircuitCanvas` + `lib/canvasGeometry.ts` (the SVG
  editor and its pure geometry), `CanvasMinimap`, `CanvasToolbar`, `GateDock`,
  `CircuitInspector`, `OutputDock`, and composer orchestration;
- `components/simulator/` — `EngineScalingChart`, `EngineStrip` +
  `lib/engineLanes.ts` (the engine-compatibility data model), circuit
  analysis, results, sources/options controls, engine availability, and
  `state/` (the Quantum State result tab's Overview/Probabilities/Phases/
  Bloch/Density Matrix/Entanglement sub-views, plus the shared
  `AmplitudeTable`);
- `components/crypto/` — `ProtocolDiagram` (the actor/channel visualization),
  shared protocol navigation, plus BB84, E91, B92, and QRNG result panels;
- `components/hardware/` — circuit/target controls, interactive topology,
  synchronized mapping results, routing timeline, and target comparison;
- `components/output/` — generated code, measurement results, and histograms;
- `components/ui/` — lightweight repository-owned form, feedback, display, and
  accessibility primitives;
- `lib/` — V1/V2 API clients, shared transport/error handling, typed contracts,
  presets, limits, routing rules, and formatting helpers.

Visual composer limits remain separate from simulation feasibility limits.

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main` and pull requests targeting
`main`:

- **backend** — `pytest` on Python 3.11 and 3.12 (Stim intentionally absent, to
  prove clean degradation).
- **backend-stim** — the same tests with the optional Stim engine installed.
- **frontend** — `npm ci`, `npm run lint`, `npm run typecheck`,
  `npm run build`.

The workflow does not currently run browser-level UI, accessibility, or
end-to-end tests. Those checks are automated in the local Playwright suite but
remain a CI integration gap.

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
  `options.include_state_analysis` (default `false`) additionally returns the
  actual backend-computed quantum state — see
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**V2 — cryptography lab:**
- `POST /crypto/bb84/simulate`
- `POST /crypto/e91/simulate`
- `POST /crypto/b92/simulate`
- `POST /crypto/qrng/simulate`

**Hardware Mapping:**

- `GET /hardware/status`; `POST /hardware/connect`; `POST /hardware/disconnect`
- `GET /hardware/backends` — normalized generic/fake/account catalog + filters.
- `POST /hardware/target/describe`; `POST /hardware/circuit/import`
- `POST /hardware/transpile`; `POST /hardware/compare`

There is intentionally no hardware job-submission endpoint.

### Request boundaries and errors

| API path | Request boundary | Intended use |
| --- | --- | --- |
| V1 `/circuit/*` | 1–8 qubits, 0–8 classical bits, 1–8192 shots, at most 200 operations | Validation, code/QASM export, and small exact simulation |
| V2 `/circuit/analyze` | 1–4096 qubits, 0–4096 classical bits, 1–1,000,000 shots, at most 200,000 operations | Structural analysis and a resource estimate against a fixed 1,024 MiB reference budget |
| V2 `/circuit/simulate-v2` | Same advanced circuit container; options allow a declared 16–65,536 MiB budget | Engine-routed execution; structure and actual resources still determine feasibility |

Invalid or infeasible requests normally return HTTP `422`; a requested engine
or quantum dependency that is unavailable returns `503`. The limits above are
validation ceilings, not performance promises. In particular, the analyzer's
1,024 MiB reference estimate and the simulator's caller-declared
`max_memory_mb` can produce different risk labels.

Every operation must include `moment` as a non-negative integer. Numeric strings,
missing/fractional/NaN values, and same-moment qubit or classical-bit conflicts
are rejected. Numeric `moment` defines execution chronology; JSON array order is
only the stable tie-breaker for legal independent operations in one moment.

### Example: analyze then simulate

```bash
# POSIX shell examples
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

### Example: BB84 with an eavesdropper

```bash
curl -s localhost:8000/crypto/bb84/simulate -H 'content-type: application/json' \
  -d '{"num_bits": 256, "eve_enabled": true, "channel_error_rate": 0.02, "seed": 123}'
```

## Smoke tests / acceptance

With the backend on `:8000` and the frontend on `:3000`:

1. **Bell circuit** — Composer → *Bell state* preset → **Run circuit** → ~50/50 over `00`/`11`.
2. **> 8-qubit composer** — set Qubits to 12 in Circuit settings (a helper note
   appears). **Run circuit** routes to `/circuit/simulate-v2`; the result panel
   shows the auto-selected engine. The old V1 `/circuit/simulate` is *never* sent
   a > 8-qubit circuit.
3. **Circuit analyzer** — Simulator Lab → load a preset → **Analyze circuit** →
   memory estimates, Clifford classification, feasibility badge.
4. **simulate-v2** — Simulator Lab → **Run simulation**. Try *1000-qubit Clifford*
   (routes to stabilizer/Stim) and *Arbitrary 100-qubit non-Clifford* (rejected
   with an explanation).
5. **BB84** — Cryptography Lab → BB84 → run with Eve **off** (QBER typically
   below this model's threshold) then **on** (intercept-resend usually raises
   QBER toward 25%; treat it as a disturbance alarm, not proof of Eve).
6. **QRNG** — Cryptography Lab → QRNG → run → ~50/50 bit distribution.
7. **Optional Stim** — `GET /engines` shows `stim_stabilizer` available only if
   `stim` is installed; the UI and router behave correctly either way.

Backend contract equivalents run headless via `python -m pytest -q` (160 tests
in the current suite). The frontend currently has 140 Vitest tests and 112
Playwright tests. CI runs backend tests plus frontend lint/typecheck/build
checks; it does not yet run the browser suite.

## Limits and current scope

- **Visual composer limits are separate from simulation feasibility limits.** The
  interactive canvas draws up to 128 qubits (`LIMITS.composer` in
  `frontend/lib/constants.ts`); the guarded V1 `/circuit/simulate` path keeps
  its full small-request envelope, and circuits exceeding any V1 limit are routed
  to `/circuit/simulate-v2` (or opened in Simulator Lab). Circuits wider than the
  interactive canvas exist only as generated descriptors — the 100-qubit GHZ and
  1000-qubit Clifford teaching presets are built on demand and never hand-drawn
  in the editor.
- The Simulator Lab accepts larger structured circuits (up to 4096 qubits in the
  schema), gated by the resource estimator and per-engine hard caps. The 4096
  value is a request-schema ceiling, not a claim that every such circuit runs.
- Exact statevector is hard-capped at 30 qubits; density matrix at 15 qubits.
- MPS can be exact while its retained bond dimension is sufficient; configured
  truncation or bond limits make it approximate. “Allow approximation” permits
  the auto router to try MPS when exact simulation is infeasible.
- Cryptography simulators are **protocol-level**. Runs are reproducible when the
  same explicit `seed` is supplied; the QRNG is educational, not a certified
  hardware generator.
- Custom gates exist (matrix, decomposition, and composite/macro
  definitions — see [docs/CUSTOM_GATES.md](docs/CUSTOM_GATES.md)), but no
  dynamic (mid-circuit classical-condition) gates or real hardware execution
  yet — see the [roadmap](docs/BEAST_MODE_ROADMAP.md). Composer's own
  statevector/Bloch preview is a local, ideal-state approximation for ≤5
  qubits, not a general viewer for arbitrary circuit sizes or a simulation
  result — Simulator Lab's opt-in "Quantum State" tab is the actual
  backend-computed state. Custom gates are never automatically classified as
  Clifford-compatible from a matrix alone — only decomposition/composite
  gates that flatten entirely into Clifford built-ins are recognized as such.
- Post-simulation quantum-state analysis is opt-in and has its own qubit
  ceilings, independent of (and never larger than) each engine's own
  simulation cap: a full amplitude list stops at 12 qubits, any state
  analysis at all stops at 20, a full density-matrix payload stops at 8, and
  density-matrix metrics stop at 15 — see
  [docs/SIMULATION_ENGINES.md](docs/SIMULATION_ENGINES.md) for the complete
  table. A stabilizer-engine result is a generator summary, never amplitudes.
- Estimator budgets and qubit caps reduce accidental resource use but do not
  replace process/container memory limits, concurrency control, or timeouts.

IBM credentials are accepted only by the backend credential boundary described
in [docs/HARDWARE_MAPPING.md](docs/HARDWARE_MAPPING.md): they are never stored in
projects, URLs, browser storage, logs, or responses. IBM Quantum Composer
inspired the educational interaction model; this project is not affiliated with
or endorsed by IBM.
