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
- Circuit editing still has no undo/redo history or explicit classical-target
  selector for measurement placement; register reductions are destructive.
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
