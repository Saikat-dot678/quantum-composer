# Quantum Composer Codebase Audit

> Audit scope: repository state reviewed and redesigned on 2026-07-11. Findings
> distinguish pre-redesign problems from the implementation completed in this
> change and the limitations that remain. Validation results are recorded only
> where the command or browser flow was actually run. This is a code and product
> audit, not a security certification or a performance benchmark.

## 1. Executive Summary

### What the project currently is

Quantum Composer is a full-stack educational quantum software workbench. Its
Next.js/TypeScript frontend provides three related modes:

1. a visual quantum circuit composer;
2. a multi-engine circuit analysis and simulation lab; and
3. a protocol-level quantum cryptography lab.

The FastAPI backend validates declarative circuit JSON, generates Qiskit and
OpenQASM text for small circuits, analyzes circuit structure and estimated
memory cost, routes supported work to Qiskit Aer or optional Stim engines, and
models BB84, E91, B92, and QRNG protocol statistics. No endpoint accepts or
executes user-submitted Python.

This is not an IBM product, a universal large-qubit simulator, a production QKD
system, or a real-hardware execution service. Its defensible large-circuit claim
is narrower: large Clifford circuits can use stabilizer methods, and some
low-entanglement circuits can use matrix-product-state simulation. Arbitrary
100-qubit universal statevector simulation remains infeasible.

### What works

- The repository has a coherent `frontend/`, `backend/`, and `docs/` split.
- The frontend exposes Composer, Simulator Lab, and Cryptography Lab through a
  semantic shared shell with live backend health, mode status, a structured-only
  simulation policy rail, retry behavior, and an explicit educational footer.
- The composer supports gate placement, rotation parameters, two-qubit
  placement, connectors, measurement wiring, presets, generated JSON/Qiskit/QASM
  views, histogram results, and a large-grid rendering guard.
- The frontend keeps the V1 exact/code/QASM boundary small and now evaluates the
  complete V1 envelope: qubits, classical bits, operation count, and shots.
  Circuits outside any V1 limit use V2 for simulation and keep JSON export.
- The Simulator Lab exposes analysis, engine selection, engine availability,
  resource estimates, Clifford classification, teaching presets, result counts,
  warnings, and engine-selection reasons.
- The Cryptography Lab covers BB84, E91, B92, and QRNG with protocol controls,
  statistical summaries, explanations, QBER, CHSH, key views, and simple
  distributions.
- The backend has strict Pydantic request validation, a closed gate allowlist,
  explicit engine errors, lazy optional dependencies, and tests for analysis,
  routing, APIs, and protocol behavior.
- Continuous integration runs backend tests on Python 3.11/3.12, a separate
  optional-Stim job, and frontend lint/typecheck/build checks.
- The simulation documentation explains `16 * 2^n` statevector and
  `16 * 4^n` density-matrix memory growth accurately.

### What is incomplete

- Frontend unit, component, automated accessibility, visual-regression, and
  committed browser end-to-end tests are still absent. Browser happy paths were
  exercised manually in this audit, but they are not yet repeatable in CI.
- Circuit editing now has workspace-level undo/redo (§14), but still lacks an
  explicit classical-target selector for measurement placement; register
  reductions remain destructive edits (though undoable).
- Request tokens prevent stale UI writes, but long backend simulations are not
  cancelled at the transport/server level and the API has no job queue or
  wall-clock enforcement.
- Crypto response dictionaries still lack FastAPI `response_model` contracts,
  so the complete TypeScript models must be maintained manually.
- Real hardware execution, device-calibration noise imports, statevector/Bloch
  viewers, dynamic conditions, and custom gates are future work only.

### Main risk areas

1. **Resource safety can be overstated.** Estimator budgets and engine caps are
   guardrails, not host-memory enforcement. A permitted exact job can still be
   too large for a particular machine.
2. **Frontend/backend contract drift.** V1 and V2 share a broad frontend circuit
   type but have different backend limits. Crypto responses are frontend-typed
   subsets of unmodeled backend dictionaries.
3. **Regression coverage.** Feature containers are now decomposed, but editor,
   routing, protocol, responsive, and accessibility behavior still lacks
   automated frontend tests.
4. **Accessibility depth.** Live regions, labels, meter semantics, focus styles,
   readable overflow, and text alternatives are implemented; a complete manual
   keyboard/screen-reader review and automated axe coverage remain necessary.
5. **Deployment controls.** The API has validation but no in-process job queue,
   concurrency policy, wall-clock cancellation, or independently enforced
   memory limit.

## 2. Limit Audit

The application deliberately has **no single "max qubits"**. Every limit below
belongs to one of five distinct concerns: interactive visual editing, generated
large-circuit descriptors, guarded V1 exact simulation, advanced V2 simulation,
or protocol simulation. The frontend model lives in `frontend/lib/constants.ts`
(`LIMITS`); the backend sources of truth are `backend/schemas.py` and the engine
modules. The table records the state after the limit-system redesign.

### Frontend limits (`frontend/lib/constants.ts`)

| Constant | Value | Purpose | Verdict |
| --- | --- | --- | --- |
| `LIMITS.composer.minQubits` | 1 | Smallest drawable register | Correct |
| `LIMITS.composer.interactiveMaxQubits` | 128 | Interactive visual-grid bound (was a global 64 cap) | **Changed 64 → 128.** A pure DOM/rendering bound; larger circuits use generated descriptors, never manual drawing |
| `LIMITS.composer.interactiveMaxClbits` | 128 | Classical rows drawable | **Changed 64 → 128** for the same reason |
| `LIMITS.composer.minColumns` / `interactiveMaxColumns` | 4 / 256 | Timeline bounds (was 200) | Correct; backend `moment` accepts up to 1,000,000 so the visual bound is the binding one |
| `LIMITS.composer.softCellLimit` | 4,096 | Rendered cells above which the grid shows a responsiveness warning (was a hard pause at 3,200) | Redesigned into a two-stage guard |
| `LIMITS.composer.hardCellLimit` | 16,384 | Rendered cells above which the grid refuses to draw and directs to Simulator Lab | New; protects the browser while allowing 128-qubit editing at shallow depth |
| `LIMITS.largeCircuit.maxDescriptorQubits` | 4,096 | Generated-descriptor ceiling | Matches the backend V2 schema ceiling exactly; a validation bound, not a feasibility promise |
| `LIMITS.largeCircuit.maxDescriptorOperations` | 200,000 | Descriptor operation ceiling | Matches backend V2 |
| `LIMITS.largeCircuit.recommendedVisualQubits` | 128 | Width at/below which a circuit can still be drawn | Equals the interactive bound by design |
| `LIMITS.simulation.safeV1MaxQubits/Clbits/Operations/Shots` | 8 / 8 / 200 / 8,192 | Complete guarded V1 envelope used by `circuitRouting.ts` | Correct; mirrors backend `CircuitRequest` exactly |
| `LIMITS.simulation.statevectorHardCapQubits` | 30 | Mirror of the backend exact-engine cap (~16 GiB) | Informational mirror; backend enforces |
| `LIMITS.simulation.densityMatrixHardCapQubits` | 15 | Mirror of the backend density-matrix cap (16·4^n) | Informational mirror; backend enforces |
| `LIMITS.simulation.min/max/defaultMemoryBudgetMb` | 16 / 65,536 / 1,024 | simulate-v2 budget bounds | Mirrors backend `SimulationOptions` |
| `LIMITS.crypto.maxKeyProtocolBits` | 4,096 | BB84/E91/B92 input ceiling | Mirrors backend schemas |
| `LIMITS.crypto.maxQrngBits` | 8,192 | QRNG input ceiling | Mirrors backend |
| `LIMITS.shots.v1Max` / `v2Max` | 8,192 / 1,000,000 | Per-path sampling ceilings | Mirrors backend |

### Backend limits

| Location | Limit | Purpose | Verdict |
| --- | --- | --- | --- |
| `schemas.py CircuitRequest` | 1–8 qubits, 0–8 clbits, ≤200 ops, ≤8,192 shots | Keeps the V1 exact path deliberately small and safe | Correct; **intentionally not raised** |
| `schemas.py CircuitOperation.moment` | ≤1,000,000 | Visual ordering only; no resource meaning | Correct |
| `schemas.py AdvancedCircuitRequest` | ≤4,096 qubits, ≤4,096 clbits, ≤200,000 ops, ≤1,000,000 shots | V2 request-validation ceiling | Correct; a schema bound, not a feasibility promise — the estimator/router decide per circuit |
| `schemas.py SimulationOptions.max_memory_mb` | 16–65,536 MB | Declared estimator budget for a run | Correct; documented as not measuring host RAM |
| `engines/aer_statevector.py HARD_QUBIT_CAP` | 30 | Absolute exact-statevector cap regardless of budget (16·2³⁰ ≈ 16 GiB) | Correct honest guardrail |
| `engines/aer_density.py HARD_QUBIT_CAP` | 15 | Absolute density-matrix cap (16·4¹⁵ ≈ 16 GiB) | Correct |
| `engines/router.py` diagram guard | ≤12 qubits, ≤80 ops | Text diagram only for readable circuits | Correct |
| `analysis/resource_estimator.py` risk bands | safe ≤ budget/4; heavy ≤ budget; dangerous ≤ 8× budget; infeasible beyond | Log-space classification that never overflows | Correct |
| `schemas.py` crypto requests | BB84/E91/B92 ≤4,096 bits; QRNG ≤8,192 bits; error rate 0–1 | Protocol-simulator bounds | Correct for educational scale |

### Retired limits

| Old constant | Old value | Disposition |
| --- | --- | --- |
| `COMPOSER_MAX_QUBITS` / `COMPOSER_MAX_CLBITS` | 64 | **Removed.** Was acting as a de-facto global cap; replaced by `LIMITS.composer.interactiveMaxQubits/Clbits` (128) plus the descriptor path for anything larger |
| `GRID_CELL_SOFT_LIMIT` | 3,200 (hard pause) | Replaced by the soft-warn (4,096) / hard-pause (16,384) two-stage guard in `lib/circuitSizing.ts` |
| `COMPOSER_MAX_COLUMNS` | 200 | Raised to 256 as `interactiveMaxColumns` |
| V1 flat constants (`SAFE_V1_*`) | 8/8/200/8,192 | Values unchanged; moved into `LIMITS.simulation.*` |

### Design intent

- **Interactive drawing ≠ simulability.** The 128-qubit grid bound protects the
  DOM; the backend estimator alone decides what can run.
- **Descriptors ≠ guarantees.** 4,096 descriptor qubits mirror the V2 schema; a
  4,096-qubit arbitrary circuit will still be *rejected* unless it is
  Clifford/low-entanglement structured.
- **V1 stays small on purpose.** Raising the 8-qubit V1 envelope would silently
  re-open unguarded exact simulation; all larger work goes through the router.

## 3. Repository Structure

### `frontend/`

The frontend is a Next.js App Router application using TypeScript and Tailwind
CSS.

- `frontend/app/page.tsx` is a client entry point that owns the active mode, the
  composer circuit, and the handoff into Simulator Lab.
- `frontend/app/layout.tsx` defines the application document shell and metadata.
- `frontend/app/globals.css` establishes the dark scientific theme, focus rings,
  background treatment, and scrollbars.
- `frontend/components/shell/` contains `AppShell`, `TopBar`, `ModeTabs`, and the
  segmented `StatusStrip`, including `/health` polling and retry behavior.
- `frontend/components/composer/` contains Composer orchestration, toolbar,
  palette/details, presets, settings, feasibility snapshot, and the indexed
  grid/row/cell workspace.
- `frontend/components/simulator/` separates source/options controls, analysis,
  results, engine availability, and the simulation-method guide.
- `frontend/components/crypto/` contains protocol navigation/flow/controls and
  focused BB84, E91, B92, and QRNG result panels.
- `frontend/components/output/` presents copyable circuit artifacts and
  measurement results below the Composer workspace.
- `frontend/components/ui/` contains lightweight repository-owned actions,
  forms, panels, badges, callouts, feedback states, tooltips, copy behavior,
  histograms, memory estimates, QBER, basis comparison, and bit-string display.
- `frontend/lib/api.ts` is the V1 client; `frontend/lib/labApi.ts` owns health,
  V2, and crypto endpoints; both use `apiClient.ts` for shared transport/errors.
- `frontend/lib/circuitRouting.ts` owns complete V1 eligibility. `types.ts` and
  `labTypes.ts` define frontend contracts; constants, presets, and formatting
  helpers hold limits and teaching content.

### `backend/`

The backend is a FastAPI application using Pydantic, Qiskit, and Qiskit Aer.

- `backend/main.py` declares health, V1 circuit, V2 engine/analyzer/simulator,
  and cryptography routes.
- `backend/schemas.py` owns strict V1/V2 request and response models. V1 circuits
  are capped at 8 qubits; advanced circuits accept up to 4096 as a container
  ceiling.
- `backend/validators.py` and `circuit_builder.py` validate ordering/ranges and
  dispatch a fixed gate allowlist into `QuantumCircuit`.
- `backend/codegen.py` generates Qiskit source text and OpenQASM. Generated text
  is returned, not executed.
- `backend/simulator.py` implements the legacy small exact path.
- `backend/analysis/` classifies circuits and computes log-space resource
  estimates.
- `backend/engines/` contains the router, shared contracts, Aer statevector/MPS/
  stabilizer/density methods, optional Stim support, and common helpers.
- `backend/crypto/` implements the BB84, E91, B92, QRNG, and educational privacy
  amplification models.
- `backend/hardware.py` is an interface boundary only; it does not implement IBM
  or other real-hardware execution.
- `backend/tests/` covers API validation, analysis, engines, and cryptography.

### `docs/`

- `docs/ARCHITECTURE.md` describes state ownership, both API clients, V1/V2
  schemas, execution flow, and trust/deployment boundaries.
- `docs/SIMULATION_ENGINES.md` explains the exponential wall, engine tradeoffs,
  auto routing, MPS semantics, and configured-budget caveats.
- `docs/CRYPTOGRAPHY_LAB.md` documents protocol inputs/outputs, QBER, CHSH,
  optional seed behavior, and the educational/non-certified scope.
- `docs/ROADMAP.md` is the concise roadmap.
- `docs/BEAST_MODE_ROADMAP.md` retains its legacy filename for link stability but
  now uses the professional title “Advanced Development Roadmap.”

The root `README.md` is the operational entry point. The root `audit.md` is this
engineering assessment and should be updated when the redesign and test results
change materially.

## 4. Frontend Audit

The redesign now follows the intended feature boundaries:
`components/shell/`, `components/composer/`, `components/simulator/`,
`components/crypto/`, `components/output/`, and `components/ui/`. The notes below
retain baseline findings for traceability and state how each area changed.

### App structure

The top-level page is appropriately thin. It owns cross-mode state and passes a
snapshot of the composer circuit into Simulator Lab. This is simpler and safer
than introducing a global store prematurely. The limitation is that mode changes
currently reset some lab-local work, and future cross-mode workflow state could
make the page prop contract grow.

The shell establishes a consistent header, navigation, maximum content width,
and educational footer. The redesign adds 30-second `/health` polling, an
online/checking/offline indicator, manual retry, current-mode metadata, a
segmented simulation-policy status rail, a skip link, and a visible
structured-large-circuit-only badge.

### Component structure

Before redesign, the composer grid had focused row/cell components but the three
mode-level components remained the main maintainability bottleneck:

- `ComposerMode.tsx` combines editing rules, API orchestration, output state,
  simulation routing, toolbar actions, and the three-column layout.
- `SimulatorLab.tsx` combines circuit sources, presets, engine discovery,
  simulation settings, analysis, result rendering, and engine availability.
- `CryptographyLab.tsx` combines four protocols, all parameter state, request
  dispatch, reusable local form controls, and every protocol result branch.

This is now resolved at the presentation layer. Composer has dedicated toolbar,
palette/details, settings, indexed grid, workspace, feasibility, preset, output,
and result components. Simulator has source/control, analysis, method guide,
result, and engine-availability panels. Crypto has shared protocol navigation,
flow, controls, brief, distribution, and protocol-specific result panels. The
mode containers still own orchestration state, which is appropriate and avoids
a premature global store.

### State management

React `useState`, `useMemo`, and prop callbacks are sufficient at the present
scale. State is generally colocated with its owning mode. Circuit cloning via
JSON serialization is workable for the current plain-data schema but should be
replaced by `structuredClone` or a typed clone helper if richer values are ever
introduced.

Async state remains local, but shared `StatusNotice`, `Spinner`, `EmptyState`,
and `ErrorState` primitives make its presentation consistent. Composer,
Simulator, and Crypto use monotonic request tokens so a response from a previous
circuit, source, protocol, or option snapshot cannot overwrite current UI state.
The tokens do not cancel backend computation, which remains a server concern.

### API integration

The pre-redesign V1/V2 decision checked only `num_qubits`, which was incomplete:
V1 also caps classical bits, operations, and shots. The shared
`lib/circuitRouting.ts` now checks the full envelope and was browser-smoked with
a 2-qubit/9-classical-bit circuit, which selected and successfully ran V2.
Large-circuit Qiskit/QASM limitations remain explicit rather than calling a V1
endpoint with an invalid advanced request.

`lib/apiClient.ts` centralizes JSON transport, FastAPI validation-detail
normalization, actionable offline errors, and short health/catalog timeouts.
`labApi.health()` drives the shell status. Simulation requests intentionally do
not use a short browser timeout because long MPS work needs a future backend job
and cancellation model rather than an arbitrary client cutoff.

### Circuit Composer UX

Current strengths:

- gate categories and selected state are visible;
- rotation angle input appears only when a rotation gate is selected;
- two-qubit placement uses a clear two-click notice and renders connectors;
- sticky qubit labels and time headers support scrolling;
- the grid is bounded by a rendered-cell guard instead of trying to render every
  requested cell;
- occupied cells can be removed directly;
- full-envelope V1/V2 routing is indicated before execution;
- “Open in Simulator Lab” is prominent;
- JSON, Qiskit, QASM, histogram, metrics, diagram, warnings, and copy behavior
  already exist.

Pre-redesign weaknesses:

- the three-column layout begins at the `lg` breakpoint, where fixed 260 px and
  340 px sidebars can leave the circuit workspace cramped on a 1024–1280 px
  viewport;
- settings, presets, palette, generated output, and actions compete for vertical
  attention in the sidebars;
- generated code/QASM for >8 qubits is a limitation message rather than a V2
  export path, which is correct but should remain visually explicit;
- there is no one-click composer-side feasibility analysis result; the user must
  enter Simulator Lab;
- native `title` hints exist on cells, but the gate library lacks consistent
  educational tooltips and keyboard-placement guidance;
- undo/redo and explicit edit history are absent.

The redesign resolves the layout, output-placement, direct-analysis, tooltip,
and selected-gate-help findings: the three-column layout now begins at `xl`,
settings move below the workspace at intermediate widths, output/results use a
full-width lower workbench, and Analyze feasibility returns a compact snapshot.
Explicit two-qubit cancellation, cell action labels, grid semantics, and
rotation-only angle controls improve editing clarity. Undo/redo, measurement
target selection, and non-destructive resize history remain open.

### Simulator Lab UX

The lab answers many of the right questions: active circuit, structure,
estimated memory, Clifford status, engine recommendations, selection reason,
availability, warnings, counts, timing, and a small-circuit diagram. Large
teaching presets make the structured-circuit limitation concrete.

The redesign separates this workflow into a source/control column, central
analysis/results, and a method/availability reference. Analysis and run state
are independent, active sources auto-analyze, recommendations are cross-checked
against runtime engine availability, and selected-engine reasons, result
metadata, run-budget resources, warnings, and diagram scale limits are visible.
Noise and MPS controls explain when they apply, and the fixed 1,024 MB analyzer
baseline is distinguished from the declared run budget.

### Cryptography Lab UX

The lab contains the required protocols and uses protocol explanations, QBER,
basis comparison, key strings, CHSH, conclusive/inconclusive counts, and QRNG
distribution views. The educational warning is visible.

The main component now orchestrates focused BB84, E91, B92, and QRNG panels.
Every protocol gets a visible signal path and a conservative trust-boundary
brief. BB84 exposes Alice/Bob/Eve sequences, kept/discarded positions, keys,
QBER, and privacy amplification. E91 shows correlations, CHSH and key/QBER
views; B92 shows representative conclusive decisions; QRNG uses the backend
`deviation_sigma` field for a finite-sample bias indicator. Elevated QBER is
phrased as disturbance, never proof that Eve exists.

### Visual design quality

The existing dark slate/cyan theme is already closer to a scientific instrument
than a generic purple dashboard. Panels, monospace metrics, restrained accents,
and risk colors provide a sound base. Violet is used sparingly.

The implemented graphite instrument chassis uses restrained cyan signal lines,
semantic green/amber/red states, limited violet, a technical display stack, and
monospace data. The segmented status/register rail is the signature element.
Essential explanations were raised to readable sizes; 9-10 px text is reserved
for compact identifiers, axes, and secondary instrument labels.

### Responsive behavior

Feature layouts now stack progressively, mode/status rails scroll independently,
histogram rows collapse, code/key regions contain their own overflow, and the
circuit grid remains independently scrollable. The implementation was visually
inspected at a 1440×1000 desktop viewport and an emulated 390×844 viewport; the
mobile document width matched the viewport with no page-level horizontal
overflow. Automated multi-viewport regression coverage remains absent.

### Accessibility

Positive baseline:

- interactive controls are real buttons/inputs/selects;
- mode navigation has an accessible label and active-state metadata;
- inputs have visible labels;
- focus-visible outlines are defined globally;
- color states generally include text labels;
- code and bit strings are scrollable.

Implemented improvements and remaining gaps:

- async notices/errors use live status/alert roles and spinners expose status;
- QBER, CHSH, distributions, and histograms include meter or descriptive
  semantics plus visible numeric equivalents;
- fields are programmatically labeled, output tabs expose tab semantics, copy
  feedback is announced, and the shell includes a skip link;
- the circuit grid is labeled and every cell has an explicit action name, but it
  still creates many tab stops and lacks roving-arrow-key navigation;
- contrast was visually reviewed, but no automated axe or screen-reader suite
  has been added.

### Error, loading, and empty states

The modes now share reusable loading, notice, empty, error, callout, and retry
primitives. Network failures identify the unreachable API URL. Engine discovery
has a distinct loading/error/retry state rather than silently becoming `null`,
and the shell independently reports backend health.

### Readability and maintainability

Strict TypeScript remains intact. Crypto/resource response types now include the
backend fields used by the redesigned views, transport parsing is centralized,
and shared actions/forms/status primitives remove repeated class branches. The
remaining maintainability risks are manually synchronized backend/frontend
contracts, mode-container orchestration size, and absent frontend tests.

## 5. Backend Integration Audit

### API clients

The V1 API module owns composer calls. The lab API module owns health/engine
discovery, V2 analyzer/simulation, and crypto calls. Their feature separation is
clear, and the redesign has introduced a shared base URL/JSON request helper.
Health and engine-catalog requests have bounded timeouts and actionable offline
copy. A typed error taxonomy plus server-side cancellation/job behavior remain
useful next steps for long simulations.

### Endpoint assumptions

The frontend assumes:

- `NEXT_PUBLIC_API_URL` or `http://localhost:8000`;
- JSON FastAPI errors with `detail`;
- V1 code/QASM accepts the same `CircuitData` shape but only within the complete
  8-qubit, 8-classical-bit, 200-operation, 8,192-shot envelope;
- V2 accepts the same operation shape with larger container limits;
- engine identifiers remain a closed string union;
- cryptography dictionaries contain the subset described by `labTypes.ts`.

These assumptions are reasonable but should be contract-tested.

### Error handling

Backend validation, unsupported circuits, and infeasible work normally return
`422`. Missing execution dependencies or unavailable engines return `503`.
Frontend parsing handles string and validation-array details, translates network
failures into an actionable backend-offline message, and reports health/catalog
timeouts. HTTP validation, infeasibility, and dependency errors still share a
general error class rather than a typed category.

### V1 versus V2 simulation path

V1 remains intentionally small: 1–8 qubits, 0–8 classical bits, at most 8192
shots and 200 operations. It powers validation, Qiskit code, QASM, and small
exact simulation.

V2 accepts an advanced container up to 4096 qubits and 200,000 operations, with
up to 1,000,000 shots. Those are schema ceilings, not feasibility promises. The
composer avoids V1 when any V1 limit is exceeded. The code/QASM endpoints remain
V1-only, so advanced composer circuits cannot currently export those forms.

### Large-circuit handling

The analyzer estimates exact statevector and density-matrix memory in log space,
classifies Clifford structure, and recommends engines. The router favors small
exact jobs, stabilizer engines for Clifford circuits, and MPS for otherwise
infeasible non-Clifford work only when approximation is allowed.

Important boundary: `/circuit/analyze` uses a fixed 1024 MB reference budget,
while `/circuit/simulate-v2` reanalyzes using the caller's `max_memory_mb` (16 MB
to 65,536 MB). Risk labels can therefore differ. Neither budget is a measurement
of free host RAM. Hard caps of 30 statevector qubits and 15 density-matrix
qubits still permit allocations around 16 GiB, so the API also needs external
resource enforcement in production.

The underlying Stim method may support workloads much larger than this app, but
the application request schema caps circuits at 4096 qubits. Documentation and
UI must not turn library-scale potential into an application guarantee.

### Cryptography endpoints

The four endpoints accurately model educational protocol statistics:

- `/crypto/bb84/simulate`: bits/bases, intercept-resend, sifting, QBER,
  threshold alarm, and simplified privacy amplification;
- `/crypto/e91/simulate`: correlation sampling, CHSH-style indicator, QBER, and
  sifted key;
- `/crypto/b92/simulate`: conclusive/inconclusive outcomes and QBER;
- `/crypto/qrng/simulate`: PRNG-sampled Hadamard-measurement statistics.

They are not physical-qubit simulations, production key exchange, security
proofs, or certified randomness. An explicit repeated seed is reproducible;
omitted/null seeds vary.

### Contract drift risks

- Crypto routes return dictionaries without Pydantic response models, while the
  frontend manually maintains complete interfaces for fields it renders.
- Risk and feasibility labels now use frontend unions, but backend response
  schemas still declare broad strings/dictionaries in places.
- V1 and V2 share `CircuitData` despite different limits and endpoint support.
- The analyzer's fixed budget differs from simulator options and is not part of
  the request contract.
- Runtime JSON responses are cast rather than schema-validated in the browser.
- There are no generated OpenAPI frontend types or explicit contract snapshot
  tests.

The lowest-cost improvement is to add Pydantic crypto response models and a
small suite of frontend-facing contract fixtures before considering generated
types.

## 6. Documentation Audit

### README accuracy

Before this audit, the README was already unusually honest about large-circuit
simulation and accurately listed all routes. It did contain an internal
contradiction: the feature list described a 1–8-qubit visual grid while the
later limits section and frontend constants disagreed with it. That has been
corrected by separating visual, V1, and V2 limits; after the limit-system
redesign the interactive grid bound is 128 qubits (`LIMITS.composer`) and
larger structured circuits use generated descriptors.

The README now also distinguishes manual browser smoke scenarios from CI,
documents branch-scoped CI triggers, presents runtime/development dependency
installation as alternatives, and records API caps and common errors.

### Documentation completeness

Architecture, engine, crypto, and roadmap documents exist and are linked. This
audit corrected the stale statement that `lib/api.ts` was the sole transport
layer and documented `labApi.ts`. It also added explicit request boundaries,
configured-budget behavior, seed semantics, and deployment caveats.

Remaining documentation needs are maintained screenshot assets, an automated
accessibility/E2E test guide once those tests exist, and possibly a short
contributor guide if the project grows.

### “100-qubit simulation” honesty

The documentation gives the correct formulas:

```text
statevector_bytes    = 16 * 2^n
density_matrix_bytes = 16 * 4^n
```

It clearly rejects arbitrary 100-qubit full-state claims and distinguishes real
hardware measurement from classical state storage. This audit further qualified
library-scale stabilizer claims with the application's 4096-qubit schema ceiling
and removed absolute no-crash/OOM language.

The approved product claim is:

> Quantum Composer supports larger structured-circuit simulation using
> specialized methods such as stabilizer and MPS simulation, while rejecting
> circuits that its configured estimator classifies as requiring infeasible
> exponential memory.

### Setup instructions

The documented commands match the repository structure. `requirements-dev.txt`
already includes runtime requirements, so the README now presents runtime-only
and contributor/test installation as alternatives instead of consecutive steps.
PowerShell, cmd.exe, and POSIX activation commands are distinguished. Frontend
scripts match `package.json`, `.env.example` exists, and the API default matches
both clients.

### Frontend/backend commands

- Backend: create/activate the environment, install one requirement set, run
  `python -m uvicorn main:app --reload`, and optionally run
  `python -m pytest -q` from `backend/`.
- Frontend: run `npm install`, `npm run dev`, `npm run lint`,
  `npm run typecheck`, and `npm run build` from `frontend/`.
- Optional Stim: install `requirements-stim.txt` from `backend/`.

Final validation results are recorded in the implementation checklist below;
no command is marked passed unless it was run in this workspace.

## 7. UI/UX Problems Found

The following findings were recorded against the pre-redesign component
structure. They were rechecked after implementation: cramped breakpoints,
hierarchy, component decomposition, engine/protocol explanations, copy feedback,
tooltips, protocol visualizations, QRNG bias, and responsive overflow were
addressed. Undo/redo, explicit measurement targeting, roving grid navigation,
and automated frontend coverage remain open.

### Cramped layouts

- `ComposerMode.tsx` enables a 260 px / flexible / 340 px three-column layout at
  `lg`, which can compress the circuit at common laptop widths.
- Simulator controls use a long fixed-width left column; many advanced options
  compete before the user sees analysis.
- Protocol controls and results stack acceptably on small screens, but long keys,
  correlation data, and result metrics need deliberate overflow tests.

### Weak or competing hierarchy

- Many panels share the same border, radius, surface, and heading treatment, so
  primary workflow actions and secondary teaching content can feel equivalent.
- Essential state sometimes appears in very small uppercase metadata.
- Composer settings, presets, generated output, and actions are spread across
  multiple vertical zones without a single compact workflow summary.

### Components that are too large

- `ComposerMode.tsx` owns editor behavior, routing, API calls, toolbar, output,
  and results.
- `SimulatorLab.tsx` owns sources, presets, all engine controls, analysis,
  execution, results, and availability.
- `CryptographyLab.tsx` owns four protocol workflows and result presentations.

These should become feature-level containers composed from smaller control and
analysis components, not merely files split by line count.

### Confusing controls

- “Memory budget” can be read as detected available memory, but it is only a
  declared estimator budget.
- “Allow approximation” affects auto-routing eligibility and does not by itself
  explain MPS truncation/bond semantics.
- Noise selection implies density-matrix routing but the UI needs a more explicit
  consequence/limit explanation.
- The BB84 `eve_detected` field can be interpreted as proof of Eve rather than a
  QBER threshold alarm.

### Missing explanation panels

- The engine catalog explains individual engines, but a compact side-by-side
  comparison of exact statevector, stabilizer, MPS, density matrix, and real
  hardware would improve comprehension.
- E91 and B92 need clearer visual protocol flow comparable to the BB84 basis
  table.
- The composer needs stronger selected-gate help and keyboard instructions.

### Result visualization gaps

- Histograms and distribution bars should expose accessible text/table
  equivalents and meaningful labels at small widths.
- QRNG does not currently render the backend's deviation-in-sigma bias
  diagnostic.
- E91 correlation data could be a labeled matrix rather than primarily a CHSH
  position bar.
- B92 could show representative conclusive/inconclusive positions rather than
  totals alone.

### Copy actions

Generated JSON, Qiskit, QASM, and code/diagram blocks already use shared copy
behavior. The redesign should preserve it and consider copy actions for protocol
keys and raw result JSON. Clipboard failure currently has no visible error.

### Tooltips and help text

Gate cells use native `title` attributes and several controls have inline help.
There is no reusable accessible tooltip/help pattern for keyboard and touch
users. Gate definitions, engine tradeoffs, risk labels, and crypto security
terms would benefit from a consistent implementation.

### Responsive handling

The grid scrolls and oversized rendering is guarded. Remaining work is to delay
dense multi-column layouts until enough width exists, keep mode navigation
usable on narrow screens, and validate every code/key/chart overflow path.

## 8. Technical Debt

### Component decomposition

Shell, composer, simulator, crypto, output, and UI presentation are now split
into feature folders. Containers retain request and domain orchestration, which
keeps ownership clear without a global store. `ComposerMode.tsx` and
`SimulatorLab.tsx` are still substantial state coordinators; reducer/hooks may
be justified only when tests expose a concrete need.

### Repeated styling

Tailwind remains appropriate. Shared buttons, inputs, select fields, notices,
toggles, panels, badges, callouts, stats, copy feedback, loading, empty, error,
and tooltip behavior now cover common UI. Domain-specific ranges and circuit
cells remain local where their semantics differ.

### Missing shared layout and form components

The redesign adds lightweight repository-owned `Button`, `FormField`,
`NumberInput`, `SelectField`, `Toggle`, `Tooltip`, `EmptyState`, `ErrorState`,
`StatusNotice`, `Spinner`, `CopyButton`, panel, badge, callout, and stat
primitives. A generic slider/tab abstraction was intentionally not forced onto
domain controls that need different labels and semantics.

### Typed UI models

Core circuit, engine, feasibility/risk, resource, and complete rendered crypto
response shapes are typed. `getSimulationPath` explicitly models V1 eligibility.
Remaining gaps are runtime response validation/generated OpenAPI contracts,
Pydantic crypto response models, and a richer typed API-error class.

### Tests

Backend tests exist across API, analysis, engines, and cryptography. No frontend
unit/component tests or browser end-to-end tests were found. High-value coverage
would include:

- two-qubit placement/removal and measurement mapping;
- >8-qubit composer routing to V2;
- large-grid render guard;
- V1 code/QASM limitation behavior;
- analyzer and infeasible-circuit errors;
- missing Stim and backend-offline states;
- mode navigation and composer-to-simulator handoff;
- BB84 Eve/no-Eve comparison and QRNG display;
- copy actions, keyboard focus, and automated accessibility checks.

### CI

CI exists and is useful. It runs pushes to `main` and pull requests targeting
`main`; it does not run for every branch push. It includes backend tests with and
without optional Stim plus frontend lint/typecheck/build. It does not run browser
smoke, visual regression, or accessibility tests.

### Naming and documentation drift

No “Quantum Composer Lite” naming remains. The package name
`quantum-composer-frontend` is current. The legacy filename
`BEAST_MODE_ROADMAP.md` is informal, but its title and links now use “Advanced
Development Roadmap” while preserving existing URLs. `ROADMAP.md` and the
detailed roadmap overlap and should be kept deliberately concise/detailed to
avoid divergence.

## 9. Frontend Redesign Plan

### App shell

- Keep the sticky scientific shell and three primary modes.
- Add live backend health with accessible status text and retry behavior.
- Show current mode and “Structured large-circuit simulation only” in the header.
- Preserve the non-IBM, educational, arbitrary-100-qubit limitation in a compact
  footer/status strip.

### Composer workspace

- Use a responsive left palette, central circuit workspace, and right settings/
  preset panel only at sufficiently wide breakpoints; stack or use drawers below.
- Separate toolbar, editor orchestration, settings, presets, and output/results
  into focused components.
- Preserve sticky labels, scrolling, connectors, pending two-qubit state, visual
  grid guard, presets, V1/V2 routing, and copyable JSON/Qiskit/QASM.
- Add an explicit feasibility-analysis action or a clearly explained handoff to
  Simulator Lab.

### Simulator Lab

- Split circuit source/presets, engine selector, options, feasibility, resource
  estimates, engine reasoning, results, and availability into independent panels.
- Explain the chosen engine and why alternatives are inappropriate.
- Label memory as an estimate against a declared budget, not host detection.
- Compare statevector, MPS, stabilizer, density matrix, and real hardware in a
  compact educational view.
- Keep the structured-100+-qubit callout prominent without presenting 4096 as a
  performance guarantee.

### Cryptography Lab

- Give each protocol a focused panel/container while sharing parameter and
  result primitives.
- Add a visible Alice → channel/Eve → Bob flow where applicable.
- Preserve basis/key comparisons, QBER, CHSH, conclusive measurement, and QRNG
  distributions.
- Present QBER as a disturbance/insecure-channel signal and CHSH as a simulated
  indicator, not physical certification.
- Expose the QRNG bias diagnostic and copyable key/bit outputs.

### Results and analysis panels

- Use consistent safe/heavy/dangerous/infeasible badges with text and icons.
- Pair charts with accessible values/tables.
- Standardize loading, empty, error, warning, and retry states.
- Keep diagrams and very large results optional and scrollable.

### Code and output panels

- Preserve JSON/Qiskit/QASM tabs and copy actions.
- Clearly disable or explain V1-only code/QASM outside the complete V1 request
  envelope.
- Use monospace, line wrapping/scrolling, and visible copy feedback.

### Responsive layout

- Optimize the dense three-panel workspace for wide desktop first.
- Use later breakpoints, stacked panels, or drawers for laptop/tablet widths.
- Keep the circuit editor horizontally/vertically scrollable.
- Ensure mode tabs, controls, code, keys, and charts remain usable on narrow
  screens.

### Accessibility

- Preserve real semantic controls and visible focus.
- Add live regions for async results and alerts.
- Give charts text/table alternatives and controls explicit help.
- Verify contrast and minimum readable text sizes.
- Test navigation and core circuit editing with keyboard-only interaction.

## 10. Implementation Checklist

### Completed and verified in the audited baseline

- [x] Three-mode application shell exists.
- [x] Visual composer, presets, two-qubit connectors, and large-grid guard exist.
- [x] V1 small-circuit and V2 large-circuit simulation paths are separated.
- [x] Simulator analysis, resource estimates, engine routing/reasons, and
  availability views exist.
- [x] BB84, E91, B92, and QRNG protocol views exist.
- [x] Generated JSON/Qiskit/QASM and shared copy behavior exist.
- [x] Backend tests and CI workflow exist.
- [x] Large-circuit honesty and educational crypto scope are documented.

### Completed by this documentation audit

- [x] Created the mandatory root `audit.md` with evidence-based findings.
- [x] Corrected visual composer versus V1 versus V2 limit documentation.
- [x] Documented both frontend API clients and contract boundaries.
- [x] Distinguished application limits from underlying Stim/library scale.
- [x] Replaced absolute no-crash/OOM claims with accurate guardrail/deployment
  language.
- [x] Corrected MPS exact-versus-approximate semantics.
- [x] Corrected optional-seed reproducibility wording.
- [x] Clarified QBER alarms and simulated CHSH limitations.
- [x] Corrected CI trigger and manual-smoke wording.
- [x] Improved setup commands, API caps/errors, and analysis-budget notes.
- [x] Updated roadmap presentation to a professional title/tone.

### Completed by the frontend redesign and final verification

- [x] Added the semantic shell, live backend health polling/retry, mode status,
  structured-only honesty badge, status rail, skip link, and honest footer.
- [x] Moved shell, Composer, Simulator, Crypto, and output work into feature
  folders with focused presentational components.
- [x] Corrected Composer routing to check V1 qubits, classical bits, operations,
  and shots; kept V1-only Qiskit/QASM limitations explicit.
- [x] Added composer-side feasibility analysis, indexed grid lookup, complete
  grid-size accounting, selected-gate education, and two-qubit cancellation.
- [x] Moved code/output and results into a copyable full-width workbench.
- [x] Added automatic Simulator analysis, method comparison, runtime availability
  retry, cross-checked recommendations, run metadata/resources, and honest
  MPS/noise/budget semantics.
- [x] Added shared protocol flow plus focused BB84, E91, B92, and QRNG panels,
  copyable keys/bits, conservative security wording, and QRNG bias diagnostics.
- [x] Standardized shared form, loading, empty, error, callout, tooltip, retry,
  copy-feedback, live-region, and chart/meter accessibility behavior.
- [x] Visually inspected the production UI at 1440x1000 and an emulated 390x844;
  the narrow document had no page-level horizontal overflow.
- [x] Browser-smoked Composer simulation, 2q/9-classical-bit V2 routing,
  Simulator V2 analysis/execution, BB84, and QRNG against the live backend.
- [x] `npm install` completed (up to date); `npm run lint`,
  `npm run typecheck`, and `npm run build` passed.
- [x] `python -m pytest -q` passed: 34 tests, with one external
  Starlette/httpx deprecation warning.

### Completed by the limit-system redesign

- [x] Replaced the flat 64-qubit composer constants with the structured
  `LIMITS` model in `frontend/lib/constants.ts`, separating interactive-visual,
  generated-descriptor, V1-exact, V2-advanced, crypto, and shot limits.
- [x] Raised the interactive composer bound to 128 qubits / 128 classical bits
  / 256 time steps, with a two-stage rendering guard (warn above 4,096 cells,
  pause above 16,384) implemented in `frontend/lib/circuitSizing.ts`.
- [x] Added `LargeCircuitDescriptor` / `CircuitSource` types and converted the
  Simulator Lab teaching presets to lazily generated, cached descriptors that
  display family, width, and operation estimates.
- [x] Wired the composer settings panel to show live grid-rendering risk and to
  explain that visual limits are separate from simulation feasibility.
- [x] Centralized the V2 shot/memory-budget bounds used by the Simulator Lab
  controls into the same `LIMITS` model (mirroring backend schema values).
- [x] Re-verified after the change: `npm run typecheck`, `npm run lint`,
  `npm run build`, and `python -m pytest -q` (results recorded below).

### Remaining items

- [ ] Add frontend unit/component tests, committed browser E2E tests, automated
  accessibility checks, and visual regression coverage to CI.
- [ ] Perform a dedicated screen-reader and full keyboard-only circuit-editing
  review; consider roving grid focus to reduce tab stops.
- [ ] Add undo/redo, explicit measurement-target selection, and safer confirmation
  or history for destructive register/timeline reductions.
- [ ] Add backend job cancellation, wall-clock/concurrency controls, and
  Pydantic crypto response models.
- [ ] Commit maintained Composer/Simulator/Crypto screenshots if the project
  wants README image assets; temporary audit captures were not added to source.
- [ ] Review two moderate npm advisories in Next's PostCSS dependency when an
  upstream non-breaking fix is available; `npm audit fix --force` was not used.

## 11. Known Limitations

- **Arbitrary large quantum simulation:** a general statevector stores `2^n`
  complex amplitudes. With complex128 it needs `16 * 2^n` bytes. A density
  matrix needs `16 * 4^n` bytes. Arbitrary 100-qubit full-state simulation is
  infeasible.
- **Structured circuits only at large scale:** large Clifford circuits may use
  stabilizer simulation, and some low-entanglement circuits may use MPS. A large
  qubit count alone does not establish feasibility.
- **Visual grid rendering limits:** the interactive composer draws up to 128
  qubits and warns/pauses by rendered-cell count; it cannot and should not
  render thousands of DOM rows. Circuits beyond the interactive bound are
  handled as compact generated descriptors analyzed and run in Simulator Lab.
- **Application ceiling versus capability:** the V2 request schema accepts up to
  4096 qubits, but that is a validation ceiling, not a promise that every
  4096-qubit circuit runs.
- **MPS behavior:** MPS may remain exact when sufficient bond dimension is
  retained. Truncation or restrictive bond limits make it approximate, and high
  entanglement can make it exponentially expensive.
- **Estimator scope:** budgets are configured reference values, not detected free
  memory. Engine caps do not replace container memory, CPU, concurrency, and
  timeout enforcement.
- **Optional Stim:** Stim support is optional. Without it, engine discovery marks
  it unavailable and auto routing can use Aer stabilizer for compatible circuits.
  The app still caps advanced requests at 4096 qubits.
- **V1 exports:** Qiskit code and OpenQASM endpoints currently accept only the
  V1 envelope (8 qubits, 8 classical bits, 200 operations, 8,192 shots).
  Circuits outside it retain JSON and can use V2 analysis/simulation.
- **Educational cryptography:** BB84, E91, B92, privacy amplification, and QRNG
  are protocol/statistical teaching models. They do not provide a physical
  quantum channel, finite-key security proof, authenticated production QKD, or
  certified entropy.
- **Seed semantics:** repeated explicit seeds reproduce protocol/simulation
  sampling. Omitted or null seeds are not deterministic.
- **No real IBM hardware execution:** no IBM credentials are accepted or stored;
  `hardware.py` is an interface boundary only.
- **No full quantum visualization suite:** statevector, Bloch sphere, density
  matrix, device noise, transpiler, and coupling-map views are not implemented.
- **Testing gap:** backend automated coverage exists and frontend browser happy
  paths were manually exercised, but frontend behavior, responsive layout,
  accessibility, and browser workflows are not yet automated in CI.
- **Dependency advisories:** `npm audit --omit=dev` reports two moderate PostCSS
  advisories through Next.js. The suggested forced resolution is breaking, so no
  forced dependency mutation was applied during this redesign.

## 12. Frontend Redesign Applied

This section records the visual "Quantum Control Room" polish pass applied on
top of the structural redesign documented in sections 4 and 9–10.

### What was wrong before

- Typography was non-deterministic: the CSS stacks referenced Windows-local
  faces (`Bahnschrift`, `Aptos`, `Cascadia Code`), so on macOS/Linux/CI the app
  silently fell back to Inter/system fonts and lost its instrument character.
- The page background was a generic square grid — technically pleasant but not
  grounded in the subject.
- The brand mark was a plain "Q" letterform; the active mode tab was only a
  filled pill; the header edge was an ordinary border.

### Design goals

Deterministic, subject-grounded identity with restraint: one signature family
of details drawn from quantum-circuit notation (wires, nodes, ket notation),
executed quietly around the existing semantic color system (cyan = simulation
signal, green/amber/red = feasibility, violet = sparse quantum accent). No new
animation, no component library, no marketing claims.

### Changes applied

- **Self-hosted type system** (`app/fonts/`, ~114 KB latin woff2, loaded via
  `next/font/local` in `app/layout.tsx`): Chakra Petch (squared HUD display
  face for instrument labels, panel titles, and mode headings), Archivo
  (variable, UI body), JetBrains Mono (variable, bitstrings/counts/memory/code).
  Builds remain fully offline-capable; no runtime font requests.
- **Circuit-wire ambiance** (`globals.css`): the body background is now faint
  horizontal qubit "wires" with node dots at gate spacing plus a cyan
  instrument glow and a whisper of violet — replacing the generic square grid.
  The editor's own `lab-grid-bg` remains a true grid because that surface *is*
  a circuit grid.
- **Command-bar finish** (`shell/`): the header now ends in a `coherence-line`
  gradient hairline (cyan → violet signal trace); the brand mark is the ket
  `|ψ⟩` set in mono; the active mode tab carries a qubit-wire underline with a
  glowing gate node (`ModeTabs`).
- **Heading cohesion**: `SectionHeader` panel titles and the Simulator/Crypto
  mode headings now use the display face, tying panels to the shell.

### New UI primitives

None — the pass deliberately reused the existing `ui/` system (Panel, Badge,
Callout, StatTile, CodeBlock, meters). New styling is limited to two global CSS
utilities (`coherence-line`, revised body background) and the tab indicator.

### Verification

`npm run typecheck`, `npm run lint`, and `npm run build` all pass with the
self-hosted fonts; the production page serves with all three font variables on
`<html>`, the ket mark, and the coherence hairline present in SSR output. All
five woff2 assets are emitted to `.next/static/media`.

### Remaining frontend limitations

- Visual quality is still verified by inspection, not by visual-regression or
  screenshot tests in CI.
- The display face is applied to shared headers and shell; a few local headings
  (e.g. composer toolbar microcopy) intentionally remain in the body face.
- Font subsets are latin-only; extending i18n would require additional subsets.
- The npm advisories and missing frontend test automation noted in section 10
  are unchanged by this pass.

## 13. Dynamic Frontend Redesign Applied

### Why the previous UI still felt insufficient

Sections 9–12 decomposed the frontend and gave it a deterministic visual
identity, but the interface remained largely *reactive to clicks, not to
state*: the status rail showed static values, feasibility knowledge lived only
behind an explicit backend Analyze call, the method guide was a static
brochure, the circuit grid created one tab stop per cell, and nothing in the
Composer showed the quantum state the user was building.

### New design direction: Live Telemetry Workbench

Every mode now streams its state into shared instrument surfaces, computed
instantly in the browser and always subordinate to the backend's authoritative
estimator at run time.

### Major structure and interaction changes

- **Client-side instant analyzer** (`lib/feasibility.ts`): mirrors the backend
  rules — Clifford gate set with π/2-rotation tolerance, log-space
  `16·2ⁿ`/`16·4ⁿ` memory, safe/heavy/dangerous/infeasible bands, V1/V2 route —
  so the UI reacts on every edit without a network call. Labeled as an
  estimate; the backend remains authoritative.
- **Live shell telemetry** (`shell/StatusStrip`, `shell/AppShell`,
  `app/page.tsx`): the status rail now shows the active circuit's qubits,
  operation count, Clifford class, V1/V2 route, exact-memory figure, and risk
  tone, updating as the user edits and switching with the mode (crypto mode
  shows no circuit segments).
- **Local statevector preview** (`lib/statevector.ts`,
  `composer/StatePreviewPanel`): for ≤5 qubits the Composer computes the ideal
  pre-measurement state in-browser (measurements/barriers explicitly ignored
  and labeled) and renders basis-state probability bars with phases, plus a
  Bloch-vector X–Z projection with ⟨X⟩⟨Y⟩⟨Z⟩ readouts for the 1-qubit case.
  Above 5 qubits the panel *teaches the exponential wall* instead of rendering.
- **Dynamic engine comparison** (`simulator/SimulationMethodGuide`): the static
  method guide became a compatibility matrix — for the analyzed circuit, each
  method (statevector, stabilizer, MPS, density matrix, real hardware) gets a
  computed verdict (compatible / heavy / structure-dependent / incompatible /
  recommended) with the concrete reason and installed-engine status.
- **Roving arrow-key grid navigation** (`composer/CircuitGrid`, `QubitRow`,
  `GateCell`): one tab stop for the whole grid; Arrow keys, Home, and End move
  a roving focus, click/tab syncs it, dimension changes clamp it, and an
  sr-only usage hint is referenced by `aria-describedby`.
- **Composer empty state** (`composer/CircuitWorkspace`): an invitation-to-act
  strip appears when the circuit has no operations.

### Accessibility improvements

Roving tabindex removes up-to-thousands of grid tab stops; the state preview
bars and Bloch figure expose meter/img semantics with numeric equivalents; the
grid documents its keyboard model; telemetry values remain text, not
color-only.

### Playwright smoke suite

`@playwright/test` added as a dev dependency with `playwright.config.ts`
(production `next start` web server, backend NOT required) and
`e2e/smoke.spec.ts`: shell identity + telemetry, three-mode navigation, roving
arrow-key behavior, and the Bell-state live preview. Run locally with
`npm run test:e2e` after `npx playwright install chromium` — all four tests
passed against the production build in this workspace. A dedicated
`frontend-e2e` CI job installs Chromium and runs the suite on every push/PR.

### Errors fixed / debt paid

- The status rail's static "Execution: Validated circuit JSON" segment was
  replaced by real telemetry.
- The engine guide no longer implies method quality independent of the circuit.
- Grid keyboard navigation no longer requires tabbing cell-by-cell.

### Remaining limitations

- The local analyzer intentionally re-implements a subset of backend rules; if
  backend thresholds change, `lib/feasibility.ts` must follow (documented in
  both files).
- The Bloch view is a 2-D X–Z projection with numeric ⟨Y⟩, not a rotatable
  3-D sphere; a full sphere remains a candidate next step.
- Playwright covers smoke paths only; no visual-regression or axe automation
  yet. The suite runs in CI via the `frontend-e2e` job, but screenshots are not
  compared pixel-wise.

## 14. Workspace Platform Redesign (research-driven)

### Research performed

Product research (July 2026): **IBM Quantum Composer** — drag-and-drop editing
onto qubit wires, a color-categorized operations catalog, live sync between the
visual circuit and an OpenQASM code editor, inline state visualization
(q-sphere/probability), and local file ownership. **Quirk / Quirk-E** —
real-time simulation while editing and, decisively, **bookmarkable/linkable
circuits**: the entire circuit lives in the URL. Frontend-architecture research:
⌘K command-palette patterns (cmdk/kbar as used by Linear/Raycast-class tools) —
the palette as a bridge between discoverable GUI and fast keyboard workflows,
grouped commands, a visible Ctrl-K affordance, shortcut hints taught in-palette;
plus App Router guidance on route-level workspaces and hotkey handling being a
separate concern from the palette itself.

### Conclusions applied

1. Serious circuit tools make circuits *addressable* (Quirk's URLs, IBM's
   files). 2. Multi-surface workspaces belong on real routes, not page-local tab
   state. 3. Keyboard-first workflows need both global shortcuts and a palette.
   4. Editors are expected to have undo/redo and to never lose work.

### Changes implemented

- **Routed workspaces**: `/composer`, `/simulator`, `/crypto` are real
  App-Router routes with per-route code splitting (13.2 / 14.7 / 8.7 kB route
  chunks replace one monolithic page). The root `/` server-redirects to
  `/composer`. Mode tabs push routes, so browser back/forward and deep links
  work; a route-level `app/error.tsx` boundary gives honest recovery copy.
- **Workspace provider** (`components/workspace/WorkspaceProvider.tsx`): owns
  the circuit across routes with a 100-entry undo/redo history (Ctrl+Z /
  Ctrl+Shift+Z / Ctrl+Y, suppressed while typing in fields), localStorage
  autosave with hydration-safe restore, and the explicit composer→Simulator
  handoff (`labCircuit`) that now survives navigation instead of resetting.
- **Shareable circuit links** (`lib/circuitShare.ts`): the whole circuit is
  encoded as base64url JSON in `/composer?c=…` (Quirk's pattern). Decoding
  treats links as untrusted input — gate allowlist, register-range checks, and
  interactive-limit validation — and a shared link takes precedence over the
  local autosave, is consumed once, and is stripped from the URL. Share is
  capped at 400 operations / ~7 KB URLs with an honest refusal beyond that.
- **Command palette** (`components/workspace/CommandPalette.tsx`): a
  dependency-free Ctrl+K dialog with grouped commands (Navigate / Circuit /
  Presets), substring filtering, full listbox semantics
  (combobox + aria-activedescendant, arrow/Enter/Esc, focus restore), and a
  visible "Commands · Ctrl K" affordance in the top bar.
- **Toolbar**: Undo/Redo buttons with disabled states and a Share-link button
  with copied/too-large feedback.

### Testing

`npm run typecheck`, `npm run lint`, `npm run build` (7 static pages, three
route chunks) all pass. The Playwright suite grew from 4 to 8 scenarios — root
redirect + telemetry, route navigation, deep links, `?c=` share decoding + URL
cleanup, undo/redo via keyboard, palette navigation, roving grid keys, live
state preview — all 8 passing against the production build. Backend
`pytest -q`: 34 passed (no backend changes).

### Remaining limitations

- Share links carry no compression; very deep circuits must use JSON export
  (the UI says so explicitly).
- Autosave is single-slot (no named projects or recent-history list yet).
- The palette exposes navigation, presets, and circuit actions; run/analyze
  still live in their modes because they depend on mode-local option state.
- Simulator Lab and Cryptography Lab route state (options, results) resets on
  navigation; only the circuit and handoff persist by design.

# Complete Frontend Rebuild

## Why the previous redesign was insufficient

The routed-workspace pass fixed architecture but left the *interface* reading as
a dashboard: a horizontal tab strip in a header, feature panels stacked as
rectangular cards, and workspace capabilities (projects, share, run) scattered
across page-local toolbars. It also left the tree mid-refactor — `shell/` and
`StatePreviewPanel` were deleted while their importers survived, so `typecheck`
failed outright on the baseline of this pass.

## Research performed

Quantum tooling: **IBM Quantum Composer** (drag onto wires, categorized
operations catalog, circuit↔OpenQASM sync, inline state visualization) and
**Quirk** (edit-time simulation; the entire circuit encoded in the URL).
Frontend patterns: **⌘K palettes** (cmdk/kbar in Linear/Raycast-class tools —
grouped commands, a visible affordance, shortcut hints taught in-palette,
hotkeys as a separate concern) and **App Router** guidance on route workspaces.
The decisive borrowed idea is the **activity rail** familiar from browser IDEs:
persistent mode switching that leaves the whole viewport to the workspace.

## New design direction: Instrument Workbench

A left **activity rail** (icon + micro-label, wire-node active marker) replaces
the header tab strip and becomes a bottom tab bar under `lg`. A slim **console
header** carries only live instruments: circuit telemetry from the client-side
analyzer, autosave/project state, and backend health with retry. Global
capabilities live in global surfaces — a **projects drawer** and the **⌘K
palette** — not in per-page toolbars.

## Faults found and fixed

- **Broken build**: missing `shell/*` and `StatePreviewPanel` modules with live
  imports (`typecheck` failed). Rebuilt as `shell/NavRail`, `shell/ConsoleHeader`,
  `shell/types`, and a new `StatePreviewPanel`.
- **WCAG contrast failures** (found by the new axe suite, not by eye): the
  `lab.faint` token was 4.44:1 on raised surfaces and a `text-lab-faint/70`
  variant was 2.87:1. Recomputed and replaced with `#7d90a4` (≥ 4.5:1 on every
  lab surface, verified numerically); removed the opacity variant.
- **Hydration race in tests**: shortcut presses fired before React attached the
  listener. Fixed with retrying open helpers (`e2e/helpers.ts`) rather than
  sleeps.
- Share links were uncompressed; the toolbar used the legacy encoder.

## Features implemented in this pass

- **Named projects + recents**: a `ProjectRepository` boundary (cloud-swappable)
  with v2 envelope, corruption recovery, save/rename/duplicate/delete/search,
  `lastOpenedAt` recents, JSON import/export, autosave bound to the active
  project, and a drawer UI. Recents also appear in the palette.
- **Compressed share links**: `?c2=` = base64url(deflate-raw(JSON)) via native
  `CompressionStream` — no dependency, with a decompression-bomb guard, strict
  post-decode validation, `?c=` backward compatibility, and an explanatory toast
  on invalid links. Nothing from a URL is ever executed.
- **Registered-actions palette**: views contribute commands while mounted
  (`useRegisterActions`), so Composer's Run / Analyze / Generate appear in ⌘K
  without coupling the palette to any page. Plus projects, presets, share,
  undo/redo, navigation.
- **Interactive Bloch sphere**: orthographic 3-D projection in plain SVG
  (no Three.js), drag- and arrow-key-rotatable, lazy-loaded via `next/dynamic`,
  live from the local statevector. For 2 qubits it computes **concurrence**
  and states honestly that an entangled pair has no single-qubit Bloch
  description. Above 5 qubits it teaches the exponential wall instead.
- **Toasts** (polite live region) for workspace events, and route-fade / drawer
  motion behind `prefers-reduced-motion`.

## Tests added

`e2e/a11y.spec.ts` — axe (WCAG 2 A/AA tags) on `/composer`, `/simulator`,
`/crypto`, the palette, and the projects drawer, failing on serious/critical.
`e2e/visual.spec.ts` — screenshots for three routes × desktop/phone (skipped in
CI: baselines are platform-specific). `e2e/smoke.spec.ts` grew to 12 scenarios
including compressed + legacy + invalid share links, clipboard round-trip,
projects save/recents, and palette-registered actions.

## Results

`typecheck`, `lint` (`--max-warnings 0`), `build` (7 pages, 3 route chunks) pass.
**Playwright 23/23** (12 smoke, 5 a11y, 6 visual). Backend **pytest 47 passed**.

## Remaining limitations

- Visual baselines are Windows-rendered and skipped in CI.
- The Bloch sphere is hand-rolled SVG; a true 3-D lit sphere would need R3F.
- No gate drag-and-drop yet (click placement + roving keyboard only), and no
  circuit minimap or DOM virtualization — the two-stage cell guard still governs
  large grids.
- Simulator/Crypto option state still resets on navigation by design.

# Instrument Canvas Rebuild (2026-07-13)

## Why the previous rebuild still looked similar

`docs/frontend-before/*.png`, captured from the Instrument Workbench pass
immediately before this one, show the exact skeleton diagnosed at the top of
`docs/FRONTEND_REFERENCE_STUDY.md`: dark-navy background, single cyan accent,
an eyebrow-label + title header, a horizontal telemetry strip, and — critically
— **Composer's circuit was still an HTML `<table>`-like grid of `<button>`
cells**, Simulator Lab's engine comparison was **rows in a bordered list**, and
Cryptography Lab's protocol flow was **stage cards in a row**. The activity
rail and console header were new; the actual editing/comparison surfaces were
not. This pass replaces those three surfaces at the DOM/interaction-model
level, not just their color tokens.

## Research performed

Documented in full in `docs/FRONTEND_REFERENCE_STUDY.md`: 11 references
(Linear, Figma, tldraw, Vercel Geist, Excalidraw, Raycast, React Flow, Quirk,
IBM Quantum Composer, Sentry, Framer), each with a specific screen/workflow,
the concrete pattern extracted, what was deliberately not copied, and an
adaptation plan. Selected direction: **"Instrument Canvas"** — a light,
neutral, single-accent design-tool register (Figma/Framer/tldraw's canvas
class of product) instead of a dark "sci-fi lab console."

## Structural before/after

`docs/frontend-before/` and `docs/frontend-after/` hold matched screenshots
for `/composer`, `/simulator`, `/crypto` at 1440×900, 1280×720, and 390×844.
The before set was re-captured from a clean `git worktree` at the pre-rebuild
commit after an unrelated mistake (see Errors below) overwrote the first
capture — it reflects the real prior UI, not a reconstruction.

- **Composer**: DOM grid of `<button>` cells in a 3-column layout →
  pannable/zoomable **SVG canvas** (`CircuitCanvas.tsx`) with a floating
  "island" toolbar, a floating gate dock, a bird's-eye minimap, a contextual
  (empty-until-selected) inspector, and a collapsible bottom code/results dock.
- **Simulator Lab**: a header + always-expanded row-list of five engine cards
  → a **memory-scaling SVG chart** (`EngineScalingChart.tsx`, actual
  16×2ⁿ/16×4ⁿ curves plotted against the run budget and the circuit's qubit
  count) above a **compact five-lane engine strip** (`EngineStrip.tsx`) that
  expands exactly one lane's reasoning at a time.
- **Cryptography Lab**: four "Stage 01–04" cards connected by short lines →
  an **actor/channel diagram** (`ProtocolDiagram.tsx`): Alice→channel→Bob for
  BB84/B92 with Eve as a literal interception node on the wire when enabled;
  Source→Alice/Bob for E91 (its real physical topology, not a linear one); a
  four-stage pipeline with no second party for QRNG (it has no Alice/Bob at
  all). All three redraw live as controls change.
- **Shell**: persistent icon rail + console header → a 56px `TopBar` with a
  segmented mode switch, backend-status pill, and project/save-state readout.

## React/Next.js capabilities used with observable effect

Route-based workspaces (unchanged, reused); `WorkspaceProvider`/`ToastProvider`
context; `next/dynamic` for the Bloch sphere (unchanged, reused); a new
`MotionRoot` (`MotionConfig reducedMotion="user"`) wrapping the whole tree so
every Framer Motion animation in the app — route fades, drawer/sheet
enter/exit, the mobile bottom-sheet transitions — respects
`prefers-reduced-motion` from one place; `ResizeObserver`-driven canvas
virtualization (only the visible window of a circuit's cells is iterated per
render, not all of it); URL-backed share-link state (unchanged, reused);
keyboard event handling for the canvas's single-tab-stop cursor model;
`useRegisterActions` (unchanged, reused) so Composer/Simulator/Crypto actions
stay in the command palette without coupling it to any one page.

## Faults found and fixed

- **Click-to-place silently did nothing.** `CircuitCanvas`'s pointer-down
  handler called `setPointerCapture` unconditionally, which redirects the
  browser's synthesized `click` to the capturing container — so child `<g
  onClick>` gate handlers never fired for an ordinary click, only a drag
  worked. Root-caused via `document.elementFromPoint` + SVG-node counting
  (confirmed the click hit the right element but no gate appeared), fixed by
  acquiring capture lazily, only once real pointer movement is detected.
- **Stale accessibility announcement.** The aria-live region describing the
  keyboard cursor's cell read the pre-update operation index synchronously
  right after calling the placement callback, so it announced "empty"
  immediately after placing a gate. Fixed by driving the announcement from a
  `useEffect` on the actual `operations` data instead of guessing the outcome
  — self-corrects for placement, deletion, undo/redo, and keyboard movement
  alike.
- **Systemic WCAG contrast failures**, caught by axe, not by eye: `.eyebrow`
  and `.instrument-label` are unlayered plain CSS rules, so per CSS cascade
  rules they always beat Tailwind `@layer utilities` classes regardless of
  source order — every `className="eyebrow text-accent-700"`-style override
  across the app was silently a no-op. Fixed by wrapping both in `@layer
  components`. Also fixed: the TopBar's inactive mode-switch text (4.24:1 on
  its pill background), a Cryptography Lab subtitle sitting directly on
  `canvas` instead of `surface` (4.47:1), a ProtocolTabs ordinal badge at 80%
  opacity (3.61:1), and a QRNG diagram whose four pipeline boxes overflowed
  their own SVG viewBox (clipping the last box).
- **Dark-theme leftovers that would render actively broken, not just
  unstyled, on the new light surface**: a hardcoded `bg-[#080d13]` near-black
  bar in Cryptography Lab, a `conic-gradient` QBER donut using a dark-navy
  remainder color, and a systemic pattern of pale pastel text
  (`text-red-100`/`text-emerald-100`/`text-cyan-100`/`text-amber-100`) that
  made sense as light-text-on-dark-tint in the old theme and became
  near-invisible light-text-on-near-white in the new one, across seven files
  including the global `ToastProvider`. Swapped to the semantic `-text`
  tokens (`danger-text`/`safe-text`/`accent-700`/`warn-text`), each verified
  ≥ 4.5:1 numerically before applying.
- **Two dead `boxShadow` utilities** (`shadow-panel`, `shadow-glow`) used
  across 5 files but never defined in the rebuilt `tailwind.config.ts` —
  silently rendered no shadow. Added as compatibility entries rather than
  hunting down every call site.
- **Accidentally clobbered the BEFORE screenshots.** Running the full
  Playwright suite without a file filter re-executed a one-off capture
  utility (`_capture.spec.ts`) with its default output directory, overwriting
  the untracked `docs/frontend-before/*.png` with the new UI. Recovered by
  building the pre-rebuild commit in a disposable `git worktree` (nothing
  from this pass was ever committed, so HEAD still had the exact prior
  source) and re-capturing there; deleted the capture script afterward so a
  future full-suite run can't repeat the mistake.
- **`next build`/`next start` intermittently produced a corrupted
  `.next`** (`Cannot find module './vendor-chunks/next.js'`) twice during this
  session. Both times traced to a stray `next dev` process still listening on
  a nearby port and continuing to write dev-mode artifacts into the same
  `.next` output directory a concurrent production build was writing to.
  Fixed by killing the stray process before rebuilding; worth knowing if this
  recurs — `next dev` and `next build`/`next start` must not run concurrently
  against the same `.next`.

## Features verified (not re-implemented)

Named projects/recents, compressed share links, the registered-actions
command palette, and the Bloch sphere/statevector viewer all predate this
pass (Workspace Platform Redesign, above) and were reused unmodified — this
pass verified each still works against the rebuilt markup via the test suite
below rather than assuming the prior report was accurate. One real gap found
by that verification: the active project name and save state had no home in
the new `TopBar` (the old console header showed it; the slim replacement
dropped it). Added a `Project status` readout wired to
`useWorkspace().activeProjectName`/`saveState`.

## Tests added or rewritten

- `e2e/smoke.spec.ts`: grew from 12 to 17 scenarios. Seven were rewritten
  because they asserted the old shell/grid contract (`role="grid"`, per-cell
  `aria-label`s, an activity rail, a "Circuit Composer" heading) that no
  longer exists; five are new (two-qubit gate placement, reposition via
  select/delete/re-place, mobile gate-dock/settings bottom sheets, mobile
  route switching, an explicit offline-state assertion).
- `e2e/a11y.spec.ts`: unchanged test bodies, all now pass against the rebuilt
  markup (one required a real fix — see Faults above; one was a test timing
  issue, scanning the projects drawer mid-fade-in animation, fixed by
  scanning the settled panel instead of a transition frame).
- `e2e/visual.spec.ts`: baselines regenerated against the new UI (the old
  baselines failing was expected and correct — it's the proof the redesign is
  structurally real, not a false positive to chase).
- `e2e/backend.spec.ts` (new): five FastAPI-dependent workflow tests — run
  the default circuit, analyze and see backend-verified feasibility in the
  inspector, hand off to Simulator Lab, switch engine lanes, and run BB84
  with Eve enabled and see QBER in the result. Each skips itself (not the
  file) when the backend isn't reachable at `localhost:8000`, so the rest of
  the suite stays green without it, matching this project's existing
  backend-independent-by-default convention.
- `e2e/helpers.ts`: added `circuitCellPoint`/`clickCircuitCell` (read the
  canvas's live pan/zoom transform off the DOM and invert it, so a test can
  click cell (q, t) correctly regardless of `zoomToFit()`'s current state)
  and `workspaceStatus`/`projectStatus` locators.

## Results

All commands actually run, from `frontend/` unless noted:

- `npm install` — up to date, 382 packages, 0 vulnerabilities requiring action.
- `npm run typecheck` — clean, exit 0.
- `npm run lint` (`--max-warnings 0`) — clean, exit 0.
- `npm run build` — clean, exit 0; 7 pages, 3 route chunks.
- `npm run test:e2e` (chromium) — **33/33 passed** (5 a11y, 17 smoke, 5
  backend-dependent, 6 visual).
- `pytest -q` from `backend/` — **47/47 passed**, untouched by this pass.

## Remaining limitations

- The compatibility layer (`lab-*` color/shadow tokens, `.instrument-label`,
  `.instrument-panel`, `.lab-grid-bg`) still backs ~40 leaf files (result
  panels, control rails, output panels) that were re-skinned through it
  rather than individually rewritten — a deliberate, disclosed trade-off to
  spend the available time on the three highest-visibility surfaces (canvas
  editor, engine chart, protocol diagram). They render correctly on the new
  light system (verified by screenshot and by axe) but don't yet use the new
  token names directly.
- No drag-to-reposition for an already-placed gate; moving one is
  select → delete → place at the new cell, which works but is not a single
  gesture. Drag-from-dock-to-canvas placement (a new placement, not a move)
  is implemented.
- The circuit minimap and mobile Gates/Settings sheets were the two areas
  found to need iteration after first render (minimap overlapped the mobile
  toggle buttons under 640px; the mobile sheet's own internal `open` check
  would have silently disabled `AnimatePresence` exit transitions) — both
  fixed, but noted since they weren't right on the first pass.
- Visual regression baselines remain Windows-rendered and CI-skipped, per the
  pre-existing convention.
- `e2e/backend.spec.ts` requires a locally running FastAPI backend and is not
  part of the default CI-safe suite; it was run and verified passing in this
  session but is not wired into any CI workflow.

# Circuit Editor and Custom Operation Upgrade (2026-07-13)

## Scope

Building on the completed Instrument Canvas redesign (above) without another
visual pass: (1) drag-to-reposition and a keyboard-equivalent move mode for
placed gates, generalized to atomic multi-qubit movement; (2) a single
shared coordinate/placement-validation system behind every placement
interaction; (3) contextual gate actions (move/copy/duplicate/delete/replace/
swap-endpoints) wired into the Inspector and the command palette; (4) a full
custom gate/operation system — matrix-defined gates, decomposition-defined
gates with named parameters, and composite "macro" operations captured from
the live circuit — with a creation wizard, a management library, safe
declarative persistence, canvas rendering and placement, backend resolution
(including one new backend-known `"unitary"` gate for matrix definitions),
Qiskit/OpenQASM generation, and Clifford/engine-compatibility classification;
(5) self-contained sharing/export/import for circuits that use custom gates.

Full design and behavior are documented in
[docs/CIRCUIT_EDITOR_INTERACTIONS.md](docs/CIRCUIT_EDITOR_INTERACTIONS.md)
and [docs/CUSTOM_GATES.md](docs/CUSTOM_GATES.md); this section covers what
was found, decided, and verified while building it.

## Design decisions

- **Custom gates never reach the backend as "custom."** A resolver
  (`frontend/lib/customGateResolve.ts`) flattens every placed custom
  instance into plain built-in operations (decomposition/composite) or one
  new `"unitary"` operation (matrix), called before every backend request
  and the local state preview. This meant the backend's Pydantic schema,
  Clifford analyzer, and code generator needed almost no new surface area —
  confirmed in practice: the analyzer needed exactly one new line (classify
  `"unitary"` as non-Clifford), the code generator needed one new gate case,
  and both stabilizer engines already rejected non-Clifford circuits
  generically, so they correctly reject a `"unitary"`-bearing circuit with
  **zero** engine-specific changes.
- **One placement validator, reused, not reimplemented per interaction.**
  `frontend/lib/placement.ts` (built in an earlier session for gate movement)
  turned out to already be fully qubit-count-agnostic — extending it to
  custom-gate placement required no changes to the module itself, only a new
  call site. Multi-qubit ghost/snap-guide rendering in `CircuitCanvas.tsx`
  needed generalizing from a hardcoded "exactly 2 qubits" check to "2 or
  more," since a custom operation can span any qubit count.
  Built-in-gate click-placement's own pre-existing "overwrite on conflict"
  behavior was deliberately left as-is rather than migrated to the shared
  validator, to avoid changing long-standing tested behavior beyond what was
  asked — see docs/CIRCUIT_EDITOR_INTERACTIONS.md's "Known limitations".
- **Composite operations capture a live-circuit region, not a freeform
  canvas selection.** The existing canvas selection model is single-cell
  only; building true multi-select/marquee selection was judged out of
  proportion to the time available. A qubit-range × time-range picker inside
  the creation wizard, with a live preview list of exactly which placed
  operations match, is a smaller, fully-functional substitute for "select
  existing placed operations, save as reusable macro" — disclosed as a
  scope simplification, not silently substituted.
- **Expand/collapse is a read-only preview dialog**, not a persistent
  spatial reflow of the canvas grid — reusing the same resolver a real
  backend call would use, so the preview can never drift from actual
  behavior, while the collapsed block stays the single source of truth for
  the operation's logical identity (satisfies the "without losing its
  logical identity" requirement without a much larger canvas-layout
  feature).
- **Custom-gate persistence deliberately mirrors `lib/projects.ts`'s
  shape** (versioned envelope, corrupt-store recovery via a session notice +
  localStorage backup, a narrow repository interface) so a future cloud-sync
  adapter could implement the same interface without touching call sites —
  consistent with the existing project system rather than a new pattern.
- **Sharing/export only bundles what a circuit actually needs**, collected
  transitively through nested `custom:<id>` references
  (`collectReferencedDefinitions`), not the user's whole library — keeps
  share links and exports proportionate to the circuit, not the library
  size.

## Faults found and fixed

- **A composite template silently used the wrong steps.** The creation
  wizard's `applyTemplate()` populated a `steps` state variable for a
  composite template (e.g. "Bell pair"), but the composite candidate
  computation unconditionally derived its steps from the live qubit/moment
  region picker instead, completely ignoring the template's own steps —
  clicking "Bell pair" would silently build whatever the (usually empty)
  default picker range happened to match on the live circuit, not a Bell
  pair. Found by tracing the exact data flow while writing a Playwright test
  for the template flow, before the test was even run. Fixed by adding a
  `lockedComposite` state that a template (or editing an existing composite)
  populates directly, bypassing the live picker entirely until the user
  explicitly asks to "use a live selection instead."
- **Two real interaction bugs already fixed in the drag/keyboard-move system
  earlier in this session** (documented in detail in
  docs/CIRCUIT_EDITOR_INTERACTIONS.md): the invalid-drop status banner was
  originally keyboard-only (a pointer drag onto an occupied cell showed only
  a color-only red outline, a WCAG 1.4.1 concern), and the keyboard-move
  banner didn't appear until the first arrow-key press. Both caught by
  writing and running real Playwright tests against the built app, not by
  code review alone — consistent with this project's established practice.
- **`Distributive Omit` over a discriminated union.** The wizard's template
  type (`DefinitionTemplate = Omit<CustomDefinition, "id" | "createdAt" |
  "updatedAt" | "favorite">`) initially collapsed `CustomDefinition`'s three
  variants down to only their shared fields — `Omit` over a union computes
  `keyof` as an *intersection* of each member's keys, silently discarding
  `matrix`/`steps`/`parameters`. Fixed with a small distributive-conditional
  type alias (`T extends unknown ? Omit<T, K> : never`) that maps over each
  union member first.
- **`qasm2.dumps()` and `UnitaryGate` — verified, not assumed.** Rather than
  writing a QASM-limitation fallback preemptively, ran a direct empirical
  test: Qiskit's `qasm2.dumps()` correctly synthesizes an inline `gate
  unitary q0 { ... }` OPENQASM 2 definition for 1-, 2-, and 3-qubit
  `UnitaryGate` instructions via its own unitary-synthesis passes. No
  fallback was needed; the existing `RuntimeError → HTTP 501` path in
  `/circuit/qasm` remains as the honest catch-all for any case synthesis
  genuinely can't handle.
- **A raw "custom" circuit could have reached the backend from Simulator
  Lab.** `ComposerMode.tsx`'s "Open in Simulator Lab" originally handed off
  the raw (unresolved) circuit; Simulator Lab has no custom-gate concept and
  would have sent a `{gate: "custom", ...}` operation straight to
  `/circuit/analyze`/`/circuit/simulate-v2`, which the backend schema would
  reject (safe, but a confusing user-facing failure with no local
  explanation). Investigated by tracing every place a `CircuitData` crosses
  a component boundary rather than assuming resolution only mattered for
  Composer's own Run/Analyze/Generate buttons. Fixed by handing Simulator
  Lab the already-resolved circuit — also more honest, since Simulator Lab
  can't render a custom-gate block anyway.

## Custom gate schema and validation

Types: `frontend/lib/customGates.ts` (declarative schema, safety-limit
constants, zero logic beyond type guards). Validation:
`frontend/lib/customGateValidation.ts` (matrix unitarity, decomposition step
shape/parameter/cycle/depth/expansion checks — pure functions, never throw,
always return `{ok, reason?}`). Never `eval`, `Function()`, or execute
anything; see docs/CUSTOM_GATES.md's Safety summary for the complete list.

## Persistence, migrations, import/export, share behavior

`frontend/lib/customGateRepository.ts` (versioned envelope, corrupt-recovery,
idempotent re-import via content-equality on id collision, `idMap` returned
from `importMany` for reference remapping). `frontend/lib/circuitShare.ts`
extended: `normalizeOperation` accepts a structurally-valid `"custom"`
operation; a new `validateCircuitBundle` cross-checks a set of embedded
definitions against a circuit's actual references (existence, arity match,
internal validity, no duplicate ids); a new v3 compact share-link format
embeds definitions and is only used when a circuit actually contains a
custom gate (a custom-gate-free circuit still encodes as the pre-existing v2
tuple format, byte-for-byte unchanged — verified by a dedicated backward-
compatibility unit test and by the pre-existing `smoke.spec.ts` share-link
tests still passing unmodified). `ProjectsDrawer.tsx`'s circuit JSON
export/import and `app/composer/page.tsx`'s share-link loader both detect
and handle the bundle format, importing embedded definitions and remapping
`customId` references through the returned `idMap`.

## Qiskit and OpenQASM behavior

Covered in detail in docs/CUSTOM_GATES.md. Summary: decomposition/composite
gates need no backend codegen changes (they arrive already flattened);
matrix gates produce a real Qiskit `UnitaryGate` with a readable label,
generate matching Python source, and export to OpenQASM 2 correctly
(verified empirically for 1-3 qubit matrices, including a random 3-qubit
unitary, not just the identity/Pauli cases).

## Analyzer and engine compatibility

Covered in detail in docs/CUSTOM_GATES.md. Summary: one new line in
`backend/analysis/circuit_analyzer.py` (`"unitary"` always non-Clifford);
zero changes to `engines/stim_stabilizer.py` or `engines/aer_stabilizer.py`
(both already rejected any circuit the analyzer marked non-Clifford, with a
clear message); verified with a direct Python reproduction that a flattened
Bell-pair macro (H then CX, no custom-gate awareness needed) still correctly
classifies as Clifford, and that a `"unitary"`-bearing circuit is correctly
excluded from `recommended_engines` for both stabilizer engines and
correctly routed to `aer_statevector`/`aer_mps` by the auto router.

## Security and validation

Never `eval`, `Function()`, or execution of imported source, on either side.
The backend independently re-validates and re-limits every `"unitary"`
operation (`backend/schemas.py`: matrix shape, finiteness, unitarity within
the same `1e-6` tolerance as the frontend, qubit count capped at 3) rather
than trusting that the frontend's own check already ran — verified directly
with a battery of Pydantic-level rejection tests (non-unitary matrix, wrong
dimensions, too many qubits, non-finite entries, a matrix field on a
non-unitary gate, classical bits or params on a unitary gate).

## Undo/redo integration

Placing, moving, duplicating, replacing, deleting, and editing parameters of
a custom instance all go through `WorkspaceProvider`'s existing
commit-per-`setCircuit`-call semantics (no new history code needed — the
same mechanism already used by every other circuit mutation). Expand/collapse
never touches circuit state (it is a read-only preview dialog), so it has no
undo/redo entry, which is the correct behavior since it changes no persistent
state. Library-level definition deletion does not attempt to touch or
"fix" circuits that reference the deleted id — a placed instance whose
`customId` no longer resolves becomes the graceful "missing definition"
state described above (movable/deletable, not simulatable) rather than being
silently rewritten or the deletion being blocked; this was a deliberate
choice among the four options the standing instructions offered (cancel
deletion / embed-expand referenced instances / remove instances /
duplicate-before-changing) — "leave it recoverable" was judged the least
surprising default, since the other three would each either block a
legitimate deletion or silently rewrite a circuit the user didn't touch.

## Files created

Frontend: `lib/placement.test.ts` (from the movement work, retained),
`lib/customGates.ts`, `lib/customGateValidation.ts`,
`lib/customGateValidation.test.ts`, `lib/customGateRepository.ts`,
`lib/customGateResolve.ts`, `lib/customGateResolve.test.ts`,
`lib/customGateCodePreview.ts`, `lib/customGateTemplates.ts`,
`lib/circuitShare.test.ts`, `components/composer/CustomGateGlyph.tsx`,
`components/composer/CustomGateWizard.tsx`,
`components/composer/CustomGateLibraryDrawer.tsx`,
`components/composer/CustomGateExpandPreview.tsx`, `e2e/custom-gates.spec.ts`
(promoted alongside the pre-existing `e2e/movement.spec.ts`),
`vitest.config.ts`. Backend: `tests/test_unitary_gate.py`. Docs:
`docs/CUSTOM_GATES.md`, `docs/CIRCUIT_EDITOR_INTERACTIONS.md`.

## Files modified

Frontend: `lib/types.ts` (`BuiltinGateName`/widened `GateName`, `customId`/
`matrix`/`label` on `CircuitOperation`), `lib/circuitShare.ts` (custom-gate
structural validation, `validateCircuitBundle`, v3 compact format),
`lib/statevector.ts` (accepts a resolved circuit, general N-qubit matrix
application for `"unitary"`), `lib/feasibility.ts` (unchanged — confirmed
already-safe default, documented), `components/composer/CircuitCanvas.tsx`
(custom-gate rendering: placed glyph, moving-ghost, missing-definition
state, generalized multi-qubit connector/ghost rendering, `customLibrary`/
`selectedCustomId` props, drag-from-dock `customId` payload),
`components/composer/GateDock.tsx` (Custom section: search, chip grid,
create/library buttons, drag-from-dock), `components/composer/
CircuitInspector.tsx` (custom-instance definition display, Edit/Expand
buttons, missing-definition notice), `components/composer/
StatePreviewPanel.tsx` (resolves before previewing, honest blocked-state
message), `components/composer/ComposerMode.tsx` (library state, custom
placement, resolver wiring into generate/run/analyze/Simulator-Lab handoff,
share-link definition bundling, new command palette actions),
`components/workspace/ProjectsDrawer.tsx` (bundle-aware export/import),
`app/composer/page.tsx` (bundle-aware share-link loading). Backend:
`schemas.py` (`"unitary"` gate, `matrix`/`label` fields, matrix/unitarity
validation), `circuit_builder.py` (`UnitaryGate` construction),
`codegen.py` (`UnitaryGate` code generation), `analysis/circuit_analyzer.py`
(non-Clifford classification).

## Tests added

- Unit (Vitest, `frontend/lib/*.test.ts`): 21 placement (pre-existing, kept
  green), 43 custom-gate validation, 15 resolver (matrix expansion,
  decomposition/composite expansion with parameter binding, recursive
  `custom:<id>` expansion, error paths, scheduling collision-freedom,
  referenced-definition collection), 16 circuit-share (custom-operation
  structural validation, bundle cross-validation, v2 backward compatibility,
  v3 round-trip, tampered-payload rejection) — **95 total, all passing.**
- Playwright (`frontend/e2e/custom-gates.spec.ts`, new): create a matrix
  gate from a template and place/select it; reject a non-unitary matrix
  live in the wizard with Save disabled; create a Bell-pair composite from a
  template and place both operations atomically; reject (not silently
  overwrite) a custom-gate placement whose span conflicts with an existing
  operation; expand-preview shows the exact flattened sequence; the library
  drawer lists/favorites/deletes; a share link carrying a custom gate
  round-trips through a simulated fresh session (cleared local custom-gate
  library); exporting and re-importing circuit JSON restores a placed custom
  gate. **8 tests, all passing**, run alongside the full pre-existing
  `movement.spec.ts`/`smoke.spec.ts`/`a11y.spec.ts`/`visual.spec.ts`/
  `backend.spec.ts` suite with zero regressions (47/47 total).
- pytest (`backend/tests/test_unitary_gate.py`, new): schema
  acceptance/rejection (unitary/non-unitary/wrong-dimension/too-many-qubits/
  non-finite/matrix-on-wrong-gate/classical-bits/params), `circuit_builder`
  construction and matrix fidelity (via `qiskit.quantum_info.Operator`),
  codegen (import inclusion, generated code actually executes via `exec`,
  import omitted when unused), QASM export for 1- and 2-qubit matrices,
  analyzer classification (unitary always non-Clifford; a flattened Bell
  macro stays Clifford), and full API round trips (validate/qiskit-code/
  qasm/simulate/analyze/simulate-v2, including explicit-engine stabilizer
  rejection for both Aer and, since the optional dependency happens to be
  installed in this environment, real Stim). **29 tests, all passing**
  alongside the full pre-existing 47-test suite (76/76 total).

## Results

All commands actually run:

- `cd frontend && npm install` — up to date, 419 packages, 0 vulnerabilities
  requiring action (2 pre-existing moderate advisories, unrelated to this
  pass, left untouched).
- `npm run typecheck` — clean, exit 0.
- `npm run lint` (`--max-warnings 0`) — clean, exit 0.
- `npm run build` — clean, exit 0; 7 pages.
- `npm run test:unit` (Vitest) — **95/95 passed.**
- `npm run test:e2e` (Playwright, chromium, backend running) — **47/47
  passed** (9 backend-dependent, 9 a11y, 8 custom-gates, 6 movement, 17
  smoke, 6 visual).
- `cd backend && python -m pytest -q` — **76/76 passed** (47 pre-existing +
  29 new).

## Remaining limitations

- Built-in gate click-placement/drag-from-dock keeps its pre-existing
  overwrite-on-conflict behavior rather than the shared validator's
  reject-on-conflict behavior — disclosed above and in
  docs/CIRCUIT_EDITOR_INTERACTIONS.md, not fixed in this pass.
- Composite "from selection" uses a qubit-range × time-range picker, not
  freeform canvas multi-select.
- Expand/collapse is a read-only preview dialog, not a persistent spatial
  reflow of the canvas.
- Legacy uncompressed (`?c=`) share links do not bundle custom gate
  definitions (the compressed `?c2=` path does, and is what the in-app Share
  button always produces).
- No systematic large-circuit interactive-performance profiling was
  performed for the movement/placement system in this pass — see
  docs/CIRCUIT_EDITOR_INTERACTIONS.md's Performance section for what was and
  was not done, and why the deferred items were judged safe to defer.
- Matrix-defined custom gates are never auto-classified as Clifford, even
  when their matrix happens to equal one.
- Custom gates have no dedicated Playwright screenshot/visual-regression
  coverage (the general `visual.spec.ts` baselines were regenerated and
  pass, but no new custom-gate-specific visual snapshots were added) and no
  dedicated mobile-viewport custom-gate workflow test was written (mobile
  Composer coverage in `smoke.spec.ts` predates this pass and was
  reconfirmed passing, but does not exercise the wizard/library drawer).
- Simulator Lab (the separate generated/large-circuit mode) has no
  custom-gate authoring or rendering of its own by design; only the
  hand-off from Composer was hardened.
- No changes are committed — everything in this section is present in the
  working tree, pending review.

# Backend Quantum-State Analysis and Post-Processing (2026-07-13)

## Audit: what exists before this pass

**What the local live preview calculates.** `frontend/lib/statevector.ts`'s
`computeStatePreview()` is a small hand-rolled statevector simulator that
runs entirely in the browser: it starts at `|0...0>`, applies each
operation's ideal unitary matrix directly to a `Float64Array` pair
(re/im), and returns amplitudes/probabilities/phases plus a 1-qubit Bloch
vector when `num_qubits === 1`. It is capped at `MAX_PREVIEW_QUBITS = 5`
(32 amplitudes), silently *ignores* `measure`/`barrier` operations (shows
the pre-measurement state unconditionally — there is no other kind of
state it could show, since it never touches the backend), and — as of the
custom-gate work above — resolves "custom" operations first via
`resolveCustomOperations()` so it never silently mis-simulates a custom
gate. It is wired into `StatePreviewPanel.tsx`, which is mounted only
inside Composer's `CircuitInspector.tsx`. It updates on every keystroke
(a `useMemo` keyed on the live circuit) and has never made a network call.

**What the backend currently returns.** `SimulationV2Response`
(`backend/schemas.py`) is `counts, depth, gate_counts, selected_engine,
engine_reason, warnings, resource_estimate, timing_ms, diagram, metadata`.
Every engine (`engines/aer_statevector.py`, `aer_mps.py`, `aer_density.py`,
`aer_stabilizer.py`, `engines/stim_stabilizer.py`) calls Qiskit Aer or Stim
purely for **sampled counts** — none of them insert a `save_statevector`
(or equivalent) instruction, none of them ever touch `Statevector`,
`DensityMatrix`, or `StabilizerState` objects, and no code path anywhere in
the backend serializes a complex amplitude to JSON. `diagram` is a
*textual* Qiskit circuit diagram (ASCII gate layout), not a state
visualization. V1's `/circuit/simulate` (`simulator.py`) is the same story:
counts only.

**Why the current Bloch sphere is not a backend result visualization.**
`BlochSphere3D.tsx` is a pure, source-agnostic `{x, y, z} -> SVG`
renderer — it has no opinion about where its vector comes from and already
correctly draws a shortened vector for `|vector| < 1` (verified by reading
its `toScreen()`/`rotate()` math: it scales `x, y, z` directly by `RADIUS`
with no re-normalization step, so a mixed-state vector already lands
*inside* the sphere without any change to this component). The problem is
entirely upstream: its only caller, `StatePreviewPanel.tsx`, only ever
feeds it the local browser-side preview's Bloch vector. There is no code
path from an actual `/circuit/simulate-v2` response to this component at
all — Simulator Lab's `SimulationResultPanel.tsx` has three tabs
(Distribution / Diagnostics / Diagram) and none of them touch
`BlochSphere3D` or any state math. So "the Bloch sphere is only driven by
local preview" is exactly correct: it's not that the backend result is
being mislabeled as a state — the backend result and the Bloch sphere are
simply never connected.

**Which engines can return meaningful state information, and how, verified
empirically (not assumed) before writing any engine code:**

| Engine | Save instruction | Verified result |
| --- | --- | --- |
| `aer_statevector` | `circuit.save_statevector(label=...)` | Exact `Statevector`, confirmed correct for a Bell state (`[0.707, 0, 0, 0.707]`) inserted *before* measurement in the same circuit and shot-sampling run that also produces `counts` — one execution, both outputs. |
| `aer_mps` | `circuit.save_statevector(label=...)` | Works identically (Aer converts the MPS tensor chain to a full statevector internally) — this is exactly the "huge MPS-to-statevector conversion" the standing instructions warn against, so it must be **qubit-gated**, not used unconditionally. `save_matrix_product_state()` also exists and returns the raw tensor chain without conversion, but computing reduced single-qubit states directly from raw MPS tensors (avoiding the O(2^n) conversion) is a nontrivial tensor-network computation of its own; deferred (see Remaining limitations) in favor of the qubit-gated full-statevector path, which the standing instructions explicitly permit ("report that full state visualization is unavailable" above a safe threshold). |
| `aer_density_matrix` | `circuit.save_density_matrix(label=...)` | Exact `DensityMatrix`, confirmed trace ≈ 1 and purity < 1 for a noisy Bell-like circuit (0.951, correctly reflecting the injected depolarizing noise). |
| `aer_stabilizer` | `circuit.save_stabilizer(label=...)` | A `StabilizerState`; `state.clifford.to_labels(mode="S")` gives clean Pauli-string generators (verified: `['+XX', '+ZZ']` for a Bell state) — a textual stabilizer summary, never a full amplitude vector. |
| `stim_stabilizer` | *(no save instruction in Stim's batch-sampling API)* | A **second**, separate `stim.TableauSimulator` pass over the same gate sequence gives the identical generator form (verified: also `['+XX', '+ZZ']`). Stabilizer tracking is polynomial-time even at huge qubit counts, so this second pass is cheap, not a "duplicate expensive simulation" concern. |

**Limitations caused by measurement, noise, and large systems.**
Measurement: today's schema has no reset/conditional/mid-circuit-branching
gate at all — `measure` is the *only* non-unitary operation that exists —
so "does this circuit have a well-defined single pre-measurement pure
state" reduces exactly to "does any non-barrier operation touch a qubit
*after* that qubit's own measurement." That is implementable precisely and
statically from the operation list; anything that fails it must report
unavailability rather than guess. Noise: only `aer_density_matrix` models
noise, and a density matrix is the only honest representation of a mixed
state — converting it to a fake pure statevector was an explicit
non-goal. Large systems: exact full-statevector/density-matrix
materialization is exponential regardless of which engine reports it, so
every extraction path below is qubit-gated by named, documented constants,
independent of whatever the *simulation* itself was able to handle
(a circuit can be simulable via MPS/stabilizer at large scale while still
being unsafe to visualize as a full state).

## State semantics chosen

Three, and only three, states a returned result can be in, each with an
honest label carried in `state_analysis.semantic_point`:

- **`final_state`** — the circuit has no measurement at all; the returned
  state is the actual final state of the actual submitted circuit, exact
  (statevector/density-matrix engines) or a structured summary (stabilizer
  engines). Nothing was stripped or substituted.
- **`pre_measurement_state`** — the circuit's own measurements are all
  *terminal* (structurally verified, see below): a separate, measurement-free
  analysis copy of the same validated circuit is built and evaluated up to
  that point. The circuit that actually produces `counts` is a different
  execution of the *original*, still-measured circuit — the analysis copy
  never replaces or influences the sampled counts.
- **`mixed_final_state`** — density-matrix engine, no measurement present;
  distinguished from `final_state` only to make it explicit at the schema
  level that "final" here already means "this engine's own native mixed-state
  representation," not "a pure state that happens to look mixed."
- **Unavailable** (`available: false`, `unavailable_reason` set) — anything
  that doesn't fit the above, chiefly a circuit with a genuine *mid-circuit*
  measurement (a non-barrier operation touching a qubit after that qubit's
  own most recent measurement). No deterministic single quantum state exists
  for such a circuit in general, so no state is fabricated; the reason string
  names exactly why.

This is a closed classification, not a heuristic: every request either lands
in one of the first three buckets by construction, or is explicitly refused.

## API and schema changes

**Decision: embedded in `/circuit/simulate-v2`, not a dedicated endpoint.**
Rationale: state analysis is only ever meaningful in the context of one
specific simulation run (the same engine, the same resolved circuit, the same
noise/shot configuration) — a separate `/circuit/state-analysis` endpoint
would either have to re-run the simulation itself (duplicating engine
selection/execution, and risking the analysis silently describing a
*different* run than the one whose counts the user is looking at) or require
the client to somehow reference a prior run's server-side state, which this
application has no session/job store for and was not asked to add. Embedding
keeps "one request, one engine execution, one consistent set of outputs" true
exactly as it already was for `counts`/`diagram`/`resource_estimate`.

**Request** (`SimulationOptions`, all new fields optional, default
lightweight): `include_state_analysis: bool = False`, `state_detail:
"summary" | "top_amplitudes" | "full" = "summary"`, `include_density_matrix:
bool = False`, `max_returned_amplitudes: int = 64` (1–4096), `top_k_states:
int = 16` (1–200). An ordinary V2 request that omits all five behaves
identically to before this work — confirmed by
`test_state_analysis_absent_by_default`.

**Response** (`SimulationV2Response.state_analysis: Optional[StateAnalysisResponse]
= None`): a single typed, versioned-by-construction object (adding fields to
it later is additive and backward compatible; nothing about its shape is
inferred from untyped dicts client-side). Top-level fields: `available,
representation, source_engine, semantic_point, qubit_order, num_qubits,
normalized, normalization_error, amplitudes, density_matrix,
basis_probabilities, top_states, per_qubit, entanglement, global_metrics,
warnings, unavailable_reason`. `representation` is one of `"statevector" |
"density_matrix" | "stabilizer_summary"`. Every complex number is `{re: float,
im: float}` JSON — a raw Python/JS complex or tuple is never serialized.
`qubit_order` is always the literal string `"qiskit_little_endian_q0_lsb"`:
qubit 0 is the least-significant bit, i.e. the *rightmost* character of a
basis-label string (`format(index, f"0{n}b")`) — the same convention
`frontend/lib/statevector.ts`'s local preview already used, so the two never
silently disagree about which physical qubit a given bit position means.

TypeScript mirrors (`frontend/lib/labTypes.ts`) are hand-kept in sync
field-for-field with the Pydantic models (`ComplexNumber`, `AmplitudeEntry`,
`BlochVectorXYZ`, `PerQubitState`, `BipartitionEntanglement`,
`EntanglementSummary`, `StateAnalysisResponse`) — there is no shared codegen
between Python and TypeScript in this project, so this is the same
hand-synchronization discipline every other V2 contract already relies on.

## Statevector, density-matrix, MPS, and stabilizer extraction

All four engine adapters (`engines/aer_statevector.py`, `aer_mps.py`,
`aer_density.py`, `aer_stabilizer.py`) share one helper,
`engines/aer_common.py`'s `run_aer_with_state()`: it inserts the engine's own
save instruction (`save_statevector` / `save_density_matrix` /
`save_stabilizer`) at the correct point — before any terminal measurement, or
at the very end for an unmeasured circuit — builds one extra "analysis"
circuit only when needed (terminal measurements present), and always runs the
*original* (possibly measured) circuit for `counts` exactly as before. One
Aer execution produces both counts and the raw state object; a
terminally-measured circuit costs one additional (measurement-free, therefore
cheaper) execution for the analysis copy, never a duplicate of the expensive
run. Mid-circuit measurement is detected up front
(`analyze_measurement_structure()`) and short-circuits straight to
`unavailable_state_analysis()` before any extra circuit is built.

`aer_mps.py` reuses the exact same `save_statevector()` call — verified
empirically that Aer converts the MPS tensor chain to a full statevector
internally when asked, i.e. there is no cheaper native path in Aer's public
API to extract state information from an MPS run without that conversion.
Because that conversion is exactly the "materialize a huge state from a
structured simulation" risk the standing instructions warn about, it is
qubit-gated by the same constant the exact statevector engine itself uses
(`MAX_TOP_AMPLITUDES_QUBITS = 20`), independent of how many qubits the MPS
*simulation* itself could handle — an MPS circuit above that bound still
produces `counts` normally and simply gets
`unavailable_state_analysis(..., "... even a bounded summary requires
materializing the full state at least transiently ...")` instead of a state.
When MPS truncation was configured, `state_analysis.warnings` gets an
explicit "may be approximate" entry — this state is a snapshot of what Aer's
approximated simulation actually produced, not a claim about the true
circuit's state.

`aer_density.py` extracts a real `DensityMatrix` via `save_density_matrix()`,
gated by `MAX_DENSITY_MATRIX_ANALYSIS_QUBITS = 15` (matching the engine's own
pre-existing hard qubit cap — verified empirically that per-qubit reduction
itself stays fast (~7 ms/qubit) well past this point, so the real constraint
is holding the matrix in memory at all, already governed by the existing
engine cap, not a new, stricter one). Trace and Hermiticity are checked
against tolerance and reported; a mixed state is *never* silently reported as
though it were pure.

`aer_stabilizer.py` and `stim_stabilizer.py` return a structured
**stabilizer summary**, not amplitudes: generator strings (`+XX`, `-ZZ`, ...)
via `StabilizerState.clifford.to_labels(mode="S")` (Aer) or a second, cheap
`stim.TableauSimulator` pass (Stim — its batch `compile_sampler()` API used
for counts has no save-instruction equivalent, so this is a deliberate,
separate, polynomial-time pass, not a duplicate of the expensive part of the
simulation). Both explicitly warn that amplitudes/phases/Bloch vectors are
unavailable from this representation — a stabilizer engine never gets
silently upgraded to look like it returned a statevector. Generator lists are
guarded only by a payload-size constant (`MAX_STABILIZER_SUMMARY_QUBITS =
128`), since tracking them is polynomial-time at any qubit count; an optional
`deterministic_outcomes` probability table is included only when the caller
already computed one below `MAX_FULL_STATEVECTOR_QUBITS`, since enumerating
it is exponential in the worst case.

## Post-processing calculations

All physics/linear-algebra lives in one pure module,
`backend/analysis/state_postprocessing.py` (~600 lines, no Qiskit/Aer/Stim
import, unit-testable without starting any simulator): normalization/trace
checks with configurable tolerance (`1e-6`) and explicit tiny-float clamping
(`1e-9`) that never hides a genuine large deviation; basis labeling matching
the frontend's own convention; amplitude entries with magnitude, probability,
and phase in both radians and degrees; top-k / sparse filtering
(`SPARSE_PROBABILITY_THRESHOLD = 1e-10`); reduced single-qubit density
matrices via partial trace (`reduced_density_matrix_from_statevector` for a
pure global state — `reshape` + `moveaxis`; `reduced_density_matrix_from_
density_matrix` for a mixed one — `einsum`), both using the axis convention
`axis_for_qubit(q, n) = n - 1 - q` (reshaping a length-`2**n` array into an
all-2s tensor puts qubit 0 at the *last* tensor axis); per-qubit Bloch
vectors (`x = Tr(rho X), y = Tr(rho Y), z = Tr(rho Z)`), purity (`Tr(rho^2)`),
and von Neumann entropy (bits, eigenvalues clamped to `[0, 1]` before `log2`);
Wootters concurrence for both the pure 2-qubit closed form (`C = 2|ad - bc|`)
and the full mixed-state formula (`C = max(0, lambda_1 - lambda_2 - lambda_3
- lambda_4)` via `rho~ = (Y (x) Y) rho* (Y (x) Y)`), the mixed-state formula
cross-checked against the textbook Werner-state result `C = max(0, (3p-1)/2)`
(including the p = 1/3 disentangling threshold) before being trusted; Schmidt
coefficients for a bipartition via SVD of a reshaped/permuted amplitude
tensor, and entanglement entropy from them. Every top-level entry point
(`statevector_analysis`, `density_matrix_analysis`, `stabilizer_summary`)
degrades to `{available: False, unavailable_reason: ...}` on any
`StatePostprocessingError` rather than ever failing the containing
simulation response — `counts` and everything else always come back even if
state post-processing itself hits a problem.

## Bloch-sphere derivation and multi-qubit behavior

`components/composer/BlochSphere3D.tsx` needed **zero code changes** — it was
already a pure `{x, y, z} -> SVG` renderer with no opinion about where its
vector comes from, and it already draws a shortened vector correctly for
`|vector| < 1` (linear scale by `RADIUS`, no re-normalization). The entire gap
was that nothing backend-derived ever called it. The new
`components/simulator/state/BlochQubitView.tsx` is the first caller that
does: it reads `state_analysis.per_qubit[i].bloch_vector` directly (all
Bloch/purity/entropy math is computed once, server-side) and renders one
sphere for whichever qubit is currently selected via a qubit-selector row —
never one global sphere for a multi-qubit state, since a multi-qubit pure
state does not, in general, live on any single qubit's sphere. Selecting a
different qubit swaps in that qubit's own reduced state, magnitude, purity,
entropy, and expectation values.

**Bell-state regression, verified both numerically and visually:** for
`H(q0); CX(q0, q1)`, `per_qubit[0].bloch_vector` is exactly `(0, 0, 0)`
(purity `0.5`, entropy `1.0` bit) while `entanglement.concurrence` is `1.0`
and each bipartition's Schmidt rank is `2` / entropy `1.0` bit — the global
state is pure and maximally entangled while neither qubit's own reduced state
is. This exact case is asserted in
`backend/tests/test_state_analysis_integration.py`, and was independently
re-confirmed by driving the real backend through the real UI in a browser
(Playwright, `e2e/state-analysis.spec.ts` and the `bell-state-bloch.png`
baseline) — the Bloch dot sits visibly at the sphere's center, not on its
surface.

## Entanglement calculations

`EntanglementSummary`: `concurrence` (2-qubit only — `null` with an
explanatory `concurrence_note` otherwise, never a value that isn't
well-defined), `bipartitions` (Schmidt coefficients/rank/entanglement entropy
for every single-qubit-vs-rest cut plus, for `n > 2`, one representative
balanced first-half/second-half cut — "selected bipartitions where safely
bounded," not every possible cut), `global_purity`, `per_qubit_purity`,
`product_state_indicator` (pure states only — a product state is exactly one
where every qubit's reduced purity is 1), and a fixed `explanation` string.
Every entanglement view (backend `global_metrics`/`entanglement` fields and
the frontend `EntanglementView.tsx`) carries an explicit disclaimer that this
is *not* a complete entanglement classification for arbitrary mixed,
multipartite states — concurrence and the Schmidt/entropy figures characterize
specific two-body or bipartite aspects only, never a general answer to "is
this state entangled."

## Measurement handling

- **No measurement** → `final_state` (statevector/stabilizer) or
  `mixed_final_state` (density matrix): the real, only execution's state.
- **Terminal measurement(s) only** (structurally verified: no operation
  touches a qubit after that qubit's last measurement) → `pre_measurement_
  state`: a second, measurement-free analysis circuit built from the same
  validated operations, run separately from — and without altering — the
  circuit that produces `counts`. The frontend's `PreMeasurementNotice`
  callout states this explicitly wherever the state view is shown.
- **Mid-circuit measurement** (any operation after a qubit's own
  measurement) → `available: false` with a specific `unavailable_reason`;
  never silently dropped, reordered, or ignored.

## Frontend state-result views

A new "Quantum State" tab in `SimulationResultPanel.tsx` (alongside the
existing Distribution/Diagnostics/Diagram tabs), gated on nothing — it always
renders, but shows one of three states itself: not requested (state analysis
toggle was off), unavailable (with the backend's own reason), or the full
`QuantumStatePanel`. That panel owns its own sub-tab row, showing only
applicable views: **Overview** (representation/semantic-point badges,
pre-measurement/mixed-state notices, normalization, Dirac notation, top
states, JSON/CSV export), **Probabilities** (theoretical-vs-sampled-counts
callout, full probability table, per-qubit marginal bars), **Phases** (hidden
entirely when the representation has no per-basis phase, e.g. a
density-matrix diagonal — phase wheel legend plus an exact numeric table,
color always paired with a number, never color-only), **Bloch** (qubit
selector + `BlochSphere3D` + numeric stats + a plain-language explanation of
*why* a reduced state is mixed when it is), **Density Matrix** (only when
`representation === "density_matrix"` — scalar metrics always, a magnitude
heatmap capped at a 16x16-cell grid with a full accessible `<table>`, a
"too large to render, use the export" notice above that, diagonal
probabilities), and **Entanglement** (only when the backend actually computed
one). All amplitude/probability tables share one component
(`components/simulator/state/AmplitudeTable.tsx`) capped at a bounded row
count with a "+N more, use the export" footer — the same bounded-rendering
strategy `HistogramPanel` already used for measurement counts, not a new
pattern.

Composer's local preview (`StatePreviewPanel.tsx`) was relabeled "Live ideal
preview — calculated locally in this browser," with an explicit paragraph
distinguishing it from a real backend result, plus two new, entirely
manual actions: "Open in Simulator Lab" (hands off the resolved circuit and
navigates) and "Compare with backend result" (fetches one exact
`state_analysis` and shows a small local-probability-vs-backend-probability
table). Neither runs automatically on any edit — both are explicit clicks,
per the standing instruction.

## Export

`lib/stateAnalysisFormat.ts`'s `stateAnalysisToJson()` includes a
`schemaVersion`, an `exportedAt` timestamp, and the complete `state_analysis`
object verbatim (representation, qubit order, amplitudes, metrics, warnings
included) — verified end-to-end via a real download in Playwright
(`e2e/state-analysis.spec.ts`'s JSON-export test parses the downloaded file
and asserts its shape). `stateAnalysisToCsv()` returns one row per
basis-state entry (whichever of `amplitudes`/`top_states`/`basis_probabilities`
is populated) or `null` when no per-basis table exists (a stabilizer
summary) — CSV export was not claimed for a representation that has no
per-basis table to export. A NumPy-compatible `.npy`/`.npz` export was not
implemented — it was not tested against real NumPy and is not claimed.

## Performance and safety limits

All qubit-count limits live as named constants in
`state_postprocessing.py`, independent of and generally stricter than the
corresponding simulation engine's own cap: full amplitude payload ≤ 12 qubits
(`MAX_FULL_STATEVECTOR_QUBITS`), any state analysis at all ≤ 20 qubits
(`MAX_TOP_AMPLITUDES_QUBITS` — above this even a bounded top-k summary would
require transiently materializing the full state), full density-matrix
payload ≤ 8 qubits (`MAX_DENSITY_MATRIX_PAYLOAD_QUBITS`), density-matrix
analysis (metrics only) ≤ 15 qubits (`MAX_DENSITY_MATRIX_ANALYSIS_QUBITS`,
matching the engine's own pre-existing cap), entanglement/Schmidt
calculations ≤ 12 qubits (shares the full-statevector limit, since Schmidt
decomposition needs an SVD of comparable size), stabilizer generator lists ≤
128 qubits (a payload-size, not computational-feasibility, guard). Every
numeric request knob (`max_returned_amplitudes`, `top_k_states`) is clamped
server-side by Pydantic `Field(ge=..., le=...)` regardless of what the
client asked for — confirmed by a 422 test for out-of-range values. No NaN or
Infinity is ever serialized — `assert_finite_array()`/`_require_finite()` run
immediately after extracting a raw state and raise rather than silently
producing invalid JSON. On the frontend, every amplitude/probability table
renders a capped number of rows with a "+N more" footer rather than the full
list, regardless of how large the underlying (already-capped) payload is;
the density-matrix heatmap additionally refuses to render a cell grid above
16x16 and points at the JSON export instead. "Simulation feasibility is not
visualization feasibility" is true by construction here: every state-analysis
limit is independent of, and in every case at most equal to, the
corresponding simulation engine's own qubit cap.

## Custom-gate integration

State analysis runs on the fully **resolved** circuit — the same
`"unitary"`-flattened form every other backend call already required — so a
matrix-defined custom gate's state is analyzed exactly like a built-in-gate
circuit that happens to contain a `UnitaryGate`; no engine or post-processing
code needed to know custom gates exist. This was verified directly: hitting
`/circuit/simulate-v2` with a `{"gate": "unitary", "qubits": [1], "matrix":
pauli_x, ...}` operation (mirroring what the resolver actually emits) alongside
an `h`/`cx` pair, requesting `include_state_analysis=True`, is one of the 19
new backend integration tests, and it passes.

**A pre-existing bug was discovered, not introduced, while trying to exercise
this end-to-end through the real Composer UI.** `ComposerMode.tsx`'s
`openSimulatorLab()` correctly resolves a circuit's custom gates before
handoff (directly confirmed: logging `resolved.circuit`'s gate list at the
exact moment of the click showed `["unitary"]`, as expected) and calls
`workspace.setLabCircuit(resolved.circuit)` immediately followed by
`router.push("/simulator")` from the same click handler. By the time
Simulator Lab actually issues its `/circuit/simulate-v2` request, though, the
circuit it holds has reverted to the raw, unresolved `{"gate": "custom", ...}`
operation, which the backend correctly rejects with a 422 (an honest failure,
not a silently wrong result, but also not the intended success path). Two
targeted fixes to `app/simulator/page.tsx`'s one-shot `labCircuit` handoff ref
(deferring `SimulatorLab`'s first render until after a mount effect; and a
lazy re-check-every-render pattern mirroring `SimulatorLab`'s own `bootRef`
idiom) were implemented and tested directly against the running app, and
neither resolved it — both were reverted, leaving `app/simulator/page.tsx`
and `components/composer/ComposerMode.tsx` byte-identical to their state
before this investigation. This points to something in the client-side route
transition itself (Next.js App Router internals) rather than a component-level
timing fix reachable from this pass, and is flagged as a follow-up rather
than fixed here — it is pre-existing Composer/Simulator-Lab handoff behavior,
not something the state-analysis work introduced, and every frontend view in
this pass is otherwise completely gate-provenance-agnostic (they only ever
render `state_analysis` JSON, never anything gate-shape-specific), so the
feature's own correctness does not depend on this bug being fixed.

## UI views (summary table)

| View | Shown when | Key content |
| --- | --- | --- |
| Overview | always (state available) | representation/semantic-point/engine badges, notices, Dirac notation, top states, export |
| Probabilities | a per-basis probability list exists | theoretical-probability table, per-qubit marginals |
| Phases | at least one entry has a defined phase | phase wheel + numeric table, global-phase note |
| Bloch | `per_qubit` is non-empty | qubit selector, sphere, x/y/z, purity, entropy, mixedness explanation |
| Density Matrix | `representation === "density_matrix"` | trace/purity/entropy/Hermiticity, magnitude heatmap (bounded), diagonal probabilities |
| Entanglement | `entanglement` is present | concurrence (2-qubit), bipartitions, per-qubit purity, disclaimer |

## Tests

**Backend** (89 new tests, 130 total, all passing): `test_state_postprocessing.py`
(35 tests) — reference-state Bloch vectors for all six canonical single-qubit
states (`|0>, |1>, |+>, |->, |+i>, |-i>`) against the exact expected vectors,
maximally-mixed state, arbitrary rotation, global-phase invariance, Bell/GHZ
reduction (including the explicit near-origin regression), separable-state
reduction, density-matrix/statevector cross-checks, concurrence (Bell/product/
Werner-state formula match), Schmidt coefficients (Bell/product/GHZ), finite-
value guarding, and full round trips through all three top-level analysis
functions. `test_state_analysis_integration.py` (19 tests, real Aer/Stim, no
mocks) — backward compatibility, final/pre-measurement/mixed-final semantic
points, mid-circuit rejection, the Bell-state regression, GHZ all-qubits-mixed,
single-qubit reference states via the real API, state-detail levels (including
the two real bugs this caught, below), MPS state analysis and its truncation
warning, density-matrix noiseless/noisy/payload-omitted, Aer-stabilizer and
Stim-stabilizer generator summaries, unitary-gate (custom-gate-equivalent)
compatibility, and server-side clamping of out-of-range request values (422).
`test_engines.py`'s one pre-existing MPS metadata test was updated for the
new `run_aer_with_state`/`StateCapableRun` shape it now exercises.

**Frontend unit** (Vitest, pure logic only — `lib/**/*.test.ts`; this project
deliberately keeps component/rendering behavior in Playwright instead, per
`vitest.config.ts`'s own stated scope): `lib/stateAnalysisFormat.test.ts`, 33
tests covering complex/probability/phase formatting, the phase-to-color
mapping, semantic-point/representation/qubit-order labels, Dirac notation
(including truncation and the no-amplitude-data case), the density-matrix
heatmap color transform (lightest at 0, darkest at 1, monotonic, clamped
out-of-range), `displayEntries`'s fallback priority
(`amplitudes > top_states > basis_probabilities`), and both export formats.

**Frontend end-to-end** (Playwright, real backend, `e2e/state-analysis.spec.ts`
+ `e2e/state-analysis-visual.spec.ts`, both skip themselves — not the whole
suite — when `http://localhost:8000` is unreachable, matching
`e2e/backend.spec.ts`'s existing convention): `H|0>` Bloch +X, `X|0>` south
pole, `S.H|0>` +Y, the Bell-state reduced-qubit/entanglement regression, the
exact-vs-sampled-counts distinction, the terminal-measurement pre-measurement
notice, the mid-circuit-measurement unavailable reason, a noisy
density-matrix shortened Bloch vector, a real JSON-export download parsed and
schema-checked, the mobile (390x844) layout, and two axe scans (statevector
Bell state's five views; the noisy density-matrix view) with zero
serious/critical violations — 12 tests, all passing. Six screenshot baselines
(`state-analysis-visual.spec.ts-snapshots/`): one-qubit Bloch, Bell-state
reduced Bloch, amplitude/phase, density-matrix, entanglement, and mobile —
generated and re-verified stable across a second run. A dedicated custom-gate
Playwright scenario was planned but intentionally not included; see "Custom-gate
integration" above for why, and what is covered instead (the backend's
unitary-gate integration test).

## Remaining limitations

- The Composer -> Simulator-Lab handoff race for custom-gate circuits
  (described above) is unresolved; a circuit containing a custom gate,
  handed to Simulator Lab via the "Simulator Lab" toolbar button or the new
  "Open in Simulator Lab" action, may be rejected by the backend (422)
  instead of producing a state analysis. Ordinary (non-custom-gate) circuits
  and every other handoff path are unaffected.
- MPS state extraction reuses the exact-statevector conversion path (Aer
  converts its own tensor chain internally) rather than computing reduced
  states directly from the raw MPS tensors — deferred, not attempted, since
  it is a nontrivial tensor-network computation in its own right; the
  qubit-gated fallback (`unavailable_reason` above 20 qubits) is honest about
  this rather than pretending a cheaper path exists.
- Entanglement bipartitions beyond single-qubit-vs-rest and one representative
  balanced cut are not enumerated (`2**n` possible cuts would be exponential
  to compute or return in general) — "selected bipartitions where safely
  bounded," as specified, not an exhaustive list.
- No NumPy `.npy`/`.npz` export; only JSON and CSV, both verified against a
  real download.
- Global phase is never corrected or canonicalized (documented, not a bug):
  two equivalent circuits or engines may report the same physical state with
  different overall phases, and the statevector view says so explicitly.
- The density-matrix heatmap shows magnitude only (no separate real/
  imaginary/phase heatmap toggle) — the full complex value is available via
  the cell's accessible table representation and the JSON export, but a
  multi-mode heatmap was not built in this pass.

# Post-Processing, Responsive UI, and Hardware Mapping Audit (2026-07-17)

## Initial condition (recorded before implementation)

**Environment.** qiskit 2.5.0, qiskit-aer 0.17.2, stim 1.16.0, fastapi
0.139.0, pydantic 2.13.4. `qiskit-ibm-runtime` was NOT installed at audit
time (installed 0.48.0 during this pass for verification; it will remain an
*optional* dependency with runtime detection, the same pattern as stim).
`qiskit_qasm3_import` was also absent (OpenQASM 3 import raises
MissingOptionalLibraryError without it); installed 0.6.0 alongside. Qiskit
2.5.0 core verified working for everything the hardware workspace needs
without IBM credentials: `GenericBackendV2` (arbitrary size/coupling/seed,
optional noise_info with T1/T2/gate-error/duration synthesis),
`generate_preset_pass_manager` (levels 0-3, layout extraction via
`tqc.layout.initial_index_layout()`/`final_index_layout()`), manual `Target`
construction with `InstructionProperties`, and `qasm2.loads`.
`qiskit-ibm-runtime` 0.48.0 provides `FakeProviderForBackendV2` with 60 fake
snapshots including `fake_fez` (156q, cz/rz/sx/x basis, dynamic-circuit
instructions, per-qubit T1/T2, per-edge errors, `online_date` timestamp).

**hardware.py.** A 7-line Protocol stub ("Future remote-execution boundary;
v1 exposes no hardware route or credentials") with a single `submit()`
signature taking the *V1* `CircuitRequest` — predates V2 entirely. Decision:
replace it wholesale with a real `backend/hardware/` package; nothing
references the old Protocol anywhere (verified by grep), so removal is safe.

**Post-processing display gaps** (backend returns it; UI never shows it):

- `global_metrics.stabilizer_generators` — the *core content* of a
  stabilizer-engine state summary — is returned but NO view renders it. The
  Quantum State tab for a stabilizer run shows only badges/warnings and
  (Stim/small-Aer) deterministic outcome probabilities. Worst offender.
- Amplitude real/imaginary components: returned in every `amplitude` entry,
  displayed only as a pre-formatted complex string; no separate re/im/
  magnitude columns, no phase-in-radians column (degrees only in tables).
- No amplitude search/filter, no zero-probability toggle, no user-facing
  top-k control in the result views themselves, no virtualization (bounded
  slice + "+N more" only; full detail can return 4096 rows of which at most
  ~32 ever render).
- Density matrix: magnitude heatmap only — no real-part, imaginary-part, or
  phase heatmap modes; no numeric matrix table (screen-reader access is via
  per-cell title attributes only); eigenvalues are computed backend-side for
  entropy but discarded, never returned or displayed.
- Bloch view: no recognizable-state labeling (|0>, |1>, |+>, |->, |+i>,
  |-i>) even when the vector matches a canonical state within tolerance.
- Overview: shot count and engine time live only in the dock header, not in
  the state overview; `global_metrics.amplitude_count` /
  `nonzero_amplitude_count` never shown; `is_pure` not surfaced as a badge.
- `SimulationV2Response.gate_counts` appears only inside the raw metadata
  JSON blob in Diagnostics, never as a readable breakdown.
- Distribution tab shows raw sampled counts only — no normalized-frequency
  column and no side-by-side with exact probabilities when state analysis
  is present.

**Responsive problems measured with Playwright (initial condition):**

- Execution dock content area is capped at `max-h-[calc(40vh-5.5rem)]`
  (`SimulationResultPanel.tsx:164`). Measured: at 1366x768 the Bloch view
  gets 219px visible for 524px of content; at 1280x720, 200px for 524px
  (62% hidden behind an inner scrollbar). Screenshot `audit-1280x720-bloch`
  shows the sphere entirely below the fold. This matches the reported
  "content cannot be seen completely." The desktop grid also pins the dock
  to `minmax(14rem,26vh)` (`SimulatorLab.tsx:592`), so even scrolled, the
  dock cannot grow. No expand/maximize affordance exists.
- No *horizontal document* overflow found at 360x800 on /composer,
  /simulator, or /crypto (docWidth == winWidth == 360 on all three) — inner
  scroll containers (protocol diagram min-w-[560px], entanglement table
  min-w-[28rem], amplitude table min-w-[26rem]) all scroll correctly inside
  their own overflow-x-auto wrappers.
- Custom-gate wizard dialog at 768x1024: fits the viewport (bottom == winH,
  bottom-sheet style), no clipping measured.
- Fixed-dimension inventory recorded (grep): CodeBlock max-h-[380px],
  CodePanel max-h-[430px], CommandPalette max-h-[46vh], crypto
  ProtocolDiagram min-w-[520-560px] (scrollable), EngineStrip h-[4.5rem]
  tab strip. These are bounded-scroll patterns, not clipping; kept.

**Grep sweep (TODO/FIXME/placeholder/stub/mock/hardcoded):** no TODO/FIXME/
stub markers in source; all "placeholder" hits are HTML input placeholders.
No hardcoded backend names outside engine ids. One stale-documentation item:
ARCHITECTURE.md's trust-boundary section says "hardware.py is a future
interface boundary only," which this pass replaces. The
`components/simulator/state/*` views were all built in the immediately
preceding pass and are complete but under-detailed per the list above.

**Type-contract check.** `lib/labTypes.ts` mirrors `schemas.py` field-for-
field for state analysis (verified in the prior pass); no drift found. The
crypto protocol responses remain untyped-dict on the backend (documented,
pre-existing).

# Codex Continuation Audit

## Baseline validation (2026-07-17, before broad changes)

The complete dirty working tree was retained as the authoritative starting
point. No files were reset, reverted, stashed, cleaned, or committed.

| Command | Exact baseline result |
| --- | --- |
| `frontend/npm install` | Passed; dependencies were already current. npm reported 419 audited packages, 2 moderate-severity advisories, and 2 install scripts awaiting the local `allowScripts` decision. |
| `frontend/npm run typecheck` | Passed. |
| `frontend/npm run lint` | Passed with zero warnings. |
| `frontend/npm run build` | Passed; Next.js 15.5.20 generated 7 static pages. The build patched missing SWC entries in the lockfile and requested a follow-up `npm install`. |
| `frontend/npm run test:unit` | Passed: 5 files, 129 tests. |
| `frontend/npx playwright test e2e/state-analysis.spec.ts e2e/state-analysis-visual.spec.ts` | Failed: 18/18 timed out in `gotoSimulatorWithCircuit` while waiting for `/composer`. The configured server could not bind port 3130 (`EADDRINUSE`), so this is recorded as a baseline environment/server-lifecycle failure rather than a verified feature failure. |
| `backend/python -m pytest -q` | Passed: 130 tests in 1.08 s; one upstream Starlette `httpx` deprecation warning. |

The implementation and final validation sections below distinguish these
baseline results from post-change results.

# Post-Processing UI, Responsive Audit, and Hardware Mapping

## Final status and preserved work

The complete dirty working tree was preserved. Nothing was reset, reverted,
stashed, cleaned, discarded, or committed. Useful in-progress state-analysis
views, schema additions, tests, and audit artifacts were completed in place.
The old seven-line `backend/hardware.py` protocol stub was the only superseded
implementation: it was replaced by the importable `backend/hardware/` package
and is no longer referenced.

Status after code and runtime verification:

| Area | Initial verified status | Final status |
| --- | --- | --- |
| State post-processing backend | Partially complete; useful global/statevector fields existed, but reduced single-qubit matrices and density eigenvalues were not a complete public contract | Complete for the bounded exact/density/stabilizer outputs described below |
| State post-processing UI | Partial; multiple returned fields were invisible and dense results were clipped or reduced to small slices | Complete for current response contracts, with virtualization and explicit truncation |
| Responsive UI | Partial; no document overflow was found, but the short desktop result dock trapped most content behind a small inner scroller | Complete for the automated viewport/zoom matrix; the desktop dock has an explicit expand control and mobile content is not trapped |
| Hardware Mapping | Missing as a user workspace; only a future execution protocol existed | Complete mapping-only workspace for generic, manual, installed fake, and account-discovered IBM targets |
| Real hardware execution | Intentionally absent | Intentionally deferred and clearly disabled; no submission endpoint or misleading run control exists |

This section supersedes the older historical limitation list immediately above:
the density view now has real/imaginary/magnitude/phase modes, a numeric table,
and eigenvalues; stabilizer generators, amplitude components, phase radians,
canonical Bloch labels, overview metrics, gate counts, and exact-versus-sampled
probabilities are now visible.

## Post-processing field coverage

| Contract area | Final presentation |
| --- | --- |
| Engine/run metadata | Engine, method, exact/approximate state, shots, seed when supplied, simulation time, state type, truncation and warnings |
| Global state metrics | Purity, von Neumann entropy, amplitude/nonzero counts, density eigenvalues, and stabilizer generators |
| Amplitudes | Search, zero filtering, user-selected limits, virtualized rows, basis state, probability, magnitude, phase in degrees/radians, and real/imaginary values |
| Sampled distribution | Counts, normalized frequency, and side-by-side exact probability where exact amplitudes are available |
| Density matrix | Magnitude, real, imaginary, and phase heatmaps; accessible complex numeric table; eigenvalue spectrum; purity/entropy explanation |
| Per-qubit state | Bloch vector and sphere, purity, entropy, recognized canonical state when within tolerance, and the 2x2 reduced density matrix |
| Entanglement | Global entropy/purity, per-qubit entropy, pairwise metrics returned by the bounded analyzer, and safely bounded bipartition summaries |
| Circuit metadata | Human-readable gate-count breakdown plus raw diagnostic metadata/export |

Large amplitude results advertise both payload truncation and UI filtering. The
32-row regression proves the table uses a bounded DOM window rather than
rendering every row. Measurement semantics remain explicit: terminal
measurements describe the pre-measurement state, while unsupported
mid-circuit-collapse analysis returns a reason instead of an invented state.

## Responsive findings and fixes

Initial measurements found no document-level horizontal overflow on the core
routes, but found a 192px-visible/542px-scroll-height result dock at 1366x768
and 1280x720. The dock now exposes an accessible expand/collapse action (192px
to 427px in the 1280x720 regression), while the mobile dock grows with its
content instead of nesting a 40vh scroller. Dense tables and protocol diagrams
retain intentional, local horizontal scrolling.

The custom-gate wizard is constrained to the viewport, uses a localized
overflow boundary, and remains reachable at 768x1024, 430x932, and 360x800.
Hardware controls stack below the topology/mapping workspace on narrow screens;
long backend names truncate accessibly; toolbar controls remain keyboard and
touch reachable. Binary memory labels were normalized to KiB/MiB/GiB/TiB/PiB/
EiB.

Automated coverage found no document overflow for `/composer`, `/simulator`,
`/crypto`, or `/hardware` at 1920x1080, 1440x900, 1366x768, 1280x720,
1024x768, 820x1180, 768x1024, 430x932, 390x844, 360x800, and 844x390. The
workspace-shell audit also passed layout zoom at 80%, 100%, 125%, 150%, and
200%.

## Hardware architecture and data flow

`/hardware` is a fourth App Router workspace under the shared
`WorkspaceProvider`. Composer creates an explicit, resolved snapshot handoff;
the mapping workspace may also reload the live Composer circuit, import the
validated declarative JSON/bundle format, import OpenQASM 2/3, or reject Python
without executing it. Custom decomposition/composite gates are flattened and
matrix gates retain their matrix and label through an idempotent resolver.

The FastAPI router exposes status, connect/disconnect, backend catalog,
target-description, circuit-import, transpile, and comparison operations. A
strict Pydantic schema discriminates generic, manual, installed-fake, and IBM
sources. Generic and manual targets work with base Qiskit; IBM Runtime/fake
snapshots and OpenQASM 3 are optional capabilities detected at runtime.

Target-aware transpilation uses `generate_preset_pass_manager(target=...)`
with optimization levels 0â€“3, deterministic seed, optional validated initial
layout, and supported layout/routing methods. Responses include original and
mapped metrics, initial/final logical-to-physical layout, permutation, active
and idle qubits, basis instructions, used physical edges, captured routing
SWAPs, bounded text diagrams, transpile time, estimated duration where known,
and a clearly qualified independent-error-product heuristic.

The SVG topology provides pointer/wheel pan and zoom, fit/reset, qubit jump,
tooltips, accessible legend/pattern cues, and export. Connectivity, logical
layout, circuit activity, calibration, duration, and routing overlays are
available. Logical/physical row selection, used-edge selection, and SWAP-event
selection synchronize with the graph. Generated coordinates are labeled
schematic; provider/manual coordinates are identified as supplied.

Comparison accepts up to six compatible targets, keeps failures visible, and
shows capacity, mapping overhead, calibration/error/duration coverage, pending
jobs, and warnings. Its disclosed deterministic score weights SWAPs, depth,
the optional heuristic success estimate, and missing calibration; queue is
shown but deliberately excluded.

## IBM credential and security review

Discovery is account-scoped and never assumes `ibm_fez` or another device is
available. Environment variables and a locally saved trusted Qiskit account are
preferred. The optional session token travels only in a JSON POST body, is held
only by the backend process, is cleared from the frontend input immediately,
and is never returned, logged, placed in URLs, project/share data, cookies, or
browser storage. Disconnect clears the in-memory service.

Outside localhost, temporary connection requires HTTPS. The endpoint validates
Origin against documented local origins plus
`QUANTUM_COMPOSER_CORS_ORIGINS`, rate-limits connection attempts to five per
client per minute, bounds provider calls with an 18-second timeout, rejects
extra request fields, and returns redacted provider errors. Tests verify that a
known secret never appears in responses or captured logs. No execution route,
job submission, polling, cancellation, or result retrieval exists.

## Tests and screenshots

Added/expanded backend tests cover state-contract regression, reduced density
matrices, exact/truncated semantics, generic/manual target validation,
installed fake discovery/normalization, an unavailable requested fake,
account discovery filters and optional metadata, no-credential behavior,
credential redaction/rate/origin/HTTPS controls, QASM/Python boundaries,
transpilation/layout/SWAP metrics, comparison, and the execution-disabled
contract.

Frontend unit coverage includes state-analysis formatting, complex/phase
formatting, hardware formatting, backend-name truncation, units, and resolver
idempotency. Playwright covers statevector/density/Bloch/entanglement views,
virtualization, export, custom-gate Simulator and Hardware handoffs,
generic/manual/fake/IBM flows, mapping/edge synchronization, optimization
levels, responsive overflow/zoom, keyboard reachability, axe scans, and visual
regressions.

Hardware baselines were added for backend browsing/topology, mapped circuit,
comparison, and mobile workflow. State-analysis baselines were refreshed for
the amplitude/phase, density-matrix, and mobile result views. Diagnostic audit
captures record short desktop docks, mobile routes, the wizard, expanded dock,
stabilizer output, probability comparison, phase detail, density modes, and
virtualization.

## Final validation

| Command | Exact final result |
| --- | --- |
| `frontend/npm install` | Passed twice around the final build; 419 packages audited, 2 moderate advisories, 160 funding notices, and `sharp`/`unrs-resolver` install scripts awaiting the repository owner's `allowScripts` decision. |
| `frontend/npm run typecheck` | Passed (`tsc --noEmit`). |
| `frontend/npm run lint` | Passed with zero warnings (`--max-warnings 0`). |
| `frontend/npm run build` | Passed; Next.js 15.5.20 generated 8 static pages. `/hardware` is 15.2 kB with 134 kB first-load JS. The build patched Windows SWC lockfile entries; the requested follow-up install passed. |
| `frontend/npm run test:unit` | Passed: 6 files, 136 tests. |
| `frontend/npm run test:e2e -- --reporter=line` | Passed: 101 Chromium tests using 10 workers in 17.4 s. |
| `backend/python -m pytest -q` | Passed: 147 tests in 3.15 s; two upstream warnings (Starlette TestClient/httpx deprecation and FakeNighthawk calibration realism). |
| `git diff --check` | Passed before final documentation edits; only expected Git LF-to-CRLF working-copy notices were printed. Rechecked after documentation below. |

## Remaining limitations and manual review

- Real QPU execution remains intentionally deferred. Mapping is useful and
  independently complete, but there is no job submission/history/cancellation
  surface.
- IBM discovery was validated with installed fake backends and mocked provider
  contracts, not a real account/token. A maintainer with account access should
  perform the documented live credential smoke test in the intended deployment
  environment without recording the token.
- Provider calibration/queue metadata is optional and time-sensitive. Missing
  values remain unavailable and are excluded from the heuristic rather than
  fabricated.
- Topology coordinates are schematic unless supplied by the target. Very dense
  100+ qubit graphs remain inspectable but naturally require zoom/pan.
- MPS-native reduced-density extraction and NumPy `.npy`/`.npz` export remain
  deferred; current exact state-derived detail stays within backend safety
  bounds, and JSON/CSV exports are available.
- The desktop result dock intentionally opens compact at short heights; its
  verified expand action exposes substantially more content, and all remaining
  content is reachable by the explicit panel scroll. Physical-device touch,
  native browser-chrome zoom, Safari/Firefox rendering, screen-reader workflow,
  and a live IBM account remain manual-review items beyond Chromium automation.
- npm reports two moderate dependency advisories and two unapproved package
  install scripts. No forced breaking dependency upgrade or script approval was
  performed without owner review.

No secret value was found in the tracked/untracked source sweep, no commit was
created, and owner approval is still required before committing.

# Graphical Qiskit Circuit Diagrams

## Scope audit

Three user-facing Qiskit text-diagram locations existed:

1. Composer/V1 `ResultsPanel`, where `SimulationResponse.diagram` was rendered
   through `CodeBlock` as a copyable ASCII block.
2. Simulator Lab's Diagram tab, where `SimulationV2Response.diagram` was
   rendered in a `<pre>`.
3. Hardware Mapping's mapped-circuit disclosure, where logical and transpiled
   text diagrams were rendered in two `<pre>` blocks.

The custom-gate wizard and expanded-operation dialog also contain `<pre>`
elements, but those are generated Qiskit source and declarative flattened-step
diagnostics rather than circuit drawings. They were intentionally preserved,
as were Qiskit code, OpenQASM, metadata JSON, and error/log text.

## Shared backend renderer

`backend/visualization/circuit_renderer.py` is now the single rendering helper
for V1, V2, hardware import, and hardware transpilation. It configures
Matplotlib `Agg` before importing `pyplot`, calls Qiskit's Matplotlib drawer
with `output="mpl"`, `idle_wires=False`, the standard `iqp` style, and a
dynamic fold, then saves a tight white-background SVG with 0.15-inch padding.

Matplotlib calls are protected by a process lock. Every successful figure is
closed in `finally`; newly opened figures are also closed if the drawer raises.
Identical circuits/options use a stable QPY-derived hash and a process-local,
24-entry LRU cache. SVG output is capped at 5.5 MB.

Dynamic folding is based on actual circuit depth and size:

- <=18 depth and <=32 operations: no fold;
- <=72 depth and <=140 operations: fold 32;
- larger safe circuits: fold 20.

Preflight declines diagrams above 48 qubits, 64 classical bits, 400 operations,
depth 240, or 260 estimated wrapped wire rows. These are rendering limits only;
simulation/mapping can still succeed and return an explanatory diagram warning.

## Typed transport and compatibility

The optional `CircuitDiagramPayload` contains `format="svg"`,
`encoding="base64"`, content, bounded width/height, selected fold, and a
`wrapped` flag. Simulation/import uses `circuit_diagram`; transpilation uses
`original_circuit_diagram` and `transpiled_circuit_diagram`.

Raw SVG is never inserted with `dangerouslySetInnerHTML`. The frontend validates
the base64 envelope and uses an image data URL. The legacy `diagram`,
`original_diagram`, and `transpiled_diagram` fields remain populated where they
were previously available for older clients, but no normal UI renders them.

## Shared frontend viewer and responsiveness

`frontend/components/results/CircuitDiagram.tsx` is reused in all three result
surfaces. It provides 50%-300% zoom, percentage/reset, fit, internally bounded
horizontal/vertical scrolling, touch panning, a focusable viewport, viewport-
contained fullscreen with focus trapping/Escape close, SVG download, browser-
generated PNG download, loading/unavailable/image-error states, and a wrapped-
circuit explanation.

Fit-to-width has a 50% floor: wide circuits remain readable and scroll instead
of collapsing into thumbnails. The SVG canvas stays white so Qiskit's normal
gate palette is readable in both application themes. Composer gives the diagram
the full width of its existing result card without redesigning the surrounding
dock. Required responsive and zoom tests continue to report no document-level
horizontal overflow; explicit diagram checks pass at 1280x720 and 360x800, and
the existing matrix covers 1920x1080 through 360x800 plus 844x390 and 80%-200%
layout zoom.

## Failure behavior and dependencies

A graphical-render exception never fails simulation or transpilation. The
backend logs the actual exception, returns the scientific result, supplies a
generic diagram warning, and the frontend presents an unavailable state. An API
regression deliberately forces renderer failure and verifies sampled counts
still return. The hidden legacy ASCII string is not exposed as a visual
fallback.

Base runtime dependencies now include `matplotlib>=3.8,<4.0` and
`pylatexenc>=2.10,<3.0`. No Qt or other GUI dependency was added.

## Tests, screenshots, and validation

Backend coverage includes one-qubit, Bell, measured, multiple-register, custom
decomposition, custom unitary, folded large, unsafe-size, SVG validity, cache
bound, failure fallback, figure cleanup, `Agg`, and V1/V2/Hardware response
integration. Frontend unit coverage validates base64 transport and zoom/fit
math. Playwright covers loading/unavailable states, zoom/reset/fit, internal
scrolling, fullscreen, SVG/PNG download, mobile overflow, Simulator Lab reuse,
Hardware logical/transpiled viewers, and the absence of rendered legacy ASCII.

Five Windows Chromium baselines were added: Bell, medium unfolded, folded
large, mobile, and fullscreen. Each was visually inspected; the Composer
diagram was widened within its existing result card after the first critique,
and unrelated transient toasts are excluded from the baselines.

| Command | Exact result |
| --- | --- |
| `backend/python -m pip install -r requirements.txt` | Passed; installed Matplotlib 3.11.0, pylatexenc 2.10, and Matplotlib's non-GUI dependencies. |
| Headless Uvicorn request to `127.0.0.1:8000/circuit/simulate` | Passed: health `ok`; 3-qubit measured circuit returned a 489x301 base64 SVG (22,596 characters) and 64 shots without Qt/display errors. The already-running reload worker had loaded the new code; a duplicate process correctly failed to bind the occupied port. |
| `frontend/npm install` | Passed; 419 packages audited, 2 moderate advisories, and 2 package install scripts still awaiting the owner's `allowScripts` decision. |
| `frontend/npm run typecheck` | Passed (`tsc --noEmit`). |
| `frontend/npm run lint` | Passed with zero warnings. |
| `frontend/npm run build` | Passed; Next.js 15.5.20 generated 8 static pages. Final build: Composer 35.3 kB/201 kB first load, Hardware 17.4 kB/137 kB, Simulator 33.5 kB/154 kB. |
| `frontend/npm run test:unit` | Passed: 7 files, 140 tests. |
| `frontend/npm run test:e2e -- --reporter=line` | Passed: 112 Chromium tests using 10 workers in 21.5 seconds. Two earlier full runs honestly exposed and led to removal of an unnecessary 20px Hardware disclosure change and hardening of a pre-existing hydration readiness race. |
| `backend/python -m pytest -q` | Passed: 160 tests in 5.25 seconds; two upstream warnings (Starlette TestClient/httpx deprecation and FakeNighthawk calibration realism). |

## Remaining limitations

- Diagram safety bounds can omit a diagram for a circuit that still simulates.
- The PNG action converts the SVG in the browser and caps its longest output
  axis at 4096 pixels; SVG remains the fidelity-preserving download.
- The LRU cache is per process, not shared across multiple Uvicorn workers.
- Visual baselines are Windows/Chromium-specific. Safari, Firefox, physical
  touch hardware, and screen-reader workflow remain manual review items.

No unrelated simulation, API routing, state analysis, hardware execution,
project, or circuit logic was changed. No commit was created.

# Canonical Circuit Operation Ordering

## Root cause

`frontend/lib/customGateResolve.ts` sorted the editable circuit by visual
`moment`, flattened it, then discarded every parent moment and greedily assigned
new moments from per-wire availability. For the four-qubit reproduction, q1 and
q2 became free after their CX gates, so their later-listed measurements received
synthetic moments before the q0â†’q3 CX. Backend code generation, simulation, and
Matplotlib rendering then correctly sorted and consumed those incorrect
synthetic moments. Separate frontend moment sorts also existed at several
consumer boundaries, and the backend schema allowed a missing moment and would
coerce numeric strings.

## Affected paths

The bad resolver output fed V1 code/QASM/simulation, V2 analysis and all engine
routes, local state preview, graphical/text diagrams, Simulator Lab handoff, and
hardware mapping. Direct backend requests already had partial stable sorting,
but it was duplicated through tuple-returning helpers and tolerated missing
moments. Project/share/JSON decoding validated numeric moments but did not
canonicalize the returned array or detect same-moment classical-bit conflicts.

## Fix

- `backend/validators.py` now exposes one non-mutating
  `canonical_operation_order()`: numeric moment first and stable input position
  only for same-moment ties. Builders, generators, analyzer, Aer state analysis,
  Stim, diagrams, V1/V2 execution, and hardware JSON input converge on it.
- `frontend/lib/circuitOrdering.ts` is the corresponding frontend authority.
  Composer output, Simulator Lab, local preview, API clients, share/project/JSON
  boundaries, generated custom previews, and hardware JSON calls use it.
- Backend `moment` is required and strict. Frontend decoders already rejected
  missing/string values and now return canonical arrays. Both schemas reject
  same-moment qubit and classical-bit conflicts while preserving independent
  parallel operations.
- Custom expansion now orders by `(parent moment, nested local timeline)`.
  Parent blocks cannot cross. Stable input order is retained within identical
  timelines; gate name and operand number are never tie-breakers. Matrix gates
  retain their placed moment whenever no preceding expansion forces a later
  synthetic slot.

## Tests added

Backend regressions cover numeric/stable/non-mutating ordering, strict moment
validation, same-moment legality/conflicts, the exact four-qubit circuit,
scrambled arrays, moved/stale array position semantics, terminal measurements,
barriers, generated Python, OpenQASM, Qiskit building/diagram input, API codegen,
and hardware JSON input. Frontend regressions cover the canonical utility,
resolver chronology, strict import validation, classical conflicts, and share
round trips. Playwright covers a scrambled four-qubit import through run,
generated Qiskit, OpenQASM, graphical diagram availability, project save, reload,
and regeneration.

## Migration and limitations

No stored-project migration converts malformed moments. Existing valid numeric
moments load unchanged and are normalized to canonical array order; malformed or
legacy operations without moments are rejected at trust boundaries. Synthetic
custom-expansion moments preserve chronology and legal parallel local steps but
need not equal editable canvas columns after a multi-step expansion spills into
later integer slots. Array position remains the tie-breaker only for operations
that legally share the exact same moment/timeline and have no explicit stable ID.

## Validation results

| Command | Result |
| --- | --- |
| `frontend/npm install` | Passed; 419 packages audited. npm reported 2 moderate advisories and 2 install scripts awaiting the existing `allowScripts` policy. |
| `frontend/npm run typecheck` | Passed (`tsc --noEmit`). |
| `frontend/npm run lint` | Passed with zero warnings. |
| `frontend/npm run build` | Passed; Next.js 15.5.20 generated all 8 static pages. |
| `frontend/npm run test:unit` | Passed: 8 files, 147 tests. |
| `frontend/npm run test:e2e -- --reporter=line` | A full parallel run passed 113 Chromium tests in 22.0 seconds. Later parallel reruns exposed one unrelated 1% Hardware snapshot race (112 passed); that test passed in isolation. |
| `frontend/npm run test:e2e -- --workers=1 --reporter=line` | Final serialized run passed all 113 Chromium tests in 189.6 seconds, including the strengthened move-and-return ordering workflow and every visual baseline. |
| `backend/python -m pytest -q` | Passed: 174 tests in 6.62 seconds; only the existing Starlette/httpx deprecation and FakeNighthawk calibration warnings. |

The ordering Playwright workflow loaded the exact four-qubit circuit from a
deliberately scrambled array, ran it, verified the generated Python and OpenQASM
sequences, displayed the graphical Qiskit SVG, saved the project, reloaded it,
and regenerated the same sequence. No commit was created.
