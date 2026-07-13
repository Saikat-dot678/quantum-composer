# Custom Gates and Operations

Quantum Composer lets you define your own gates and reusable multi-gate
operations, save them to a personal library, place them on the canvas exactly
like a built-in gate, and share circuits that use them. This document
explains the data model, the safety boundary, how a custom operation reaches
the backend, and what is and is not classified automatically.

## Two concepts, one placed-instance shape

There are two kinds of "custom" thing you can build, both stored as
`CustomDefinition` (`frontend/lib/customGates.ts`) in the same local library:

- **A custom primitive gate** — either a literal unitary **matrix** (1-3
  qubits), or a **decomposition** into existing gates (built-in or other
  custom definitions, with optional named parameters).
- **A custom composite operation** — a **macro** captured from a region of
  the live circuit: a fixed sequence of already-placed operations, saved and
  reusable, with no exposed parameters (its steps already have concrete
  values, because they came from a real circuit).

On the canvas, a placed instance of either kind is a completely ordinary
`CircuitOperation` with `gate: "custom"` and a `customId` pointing at the
library definition:

```ts
{ gate: "custom", customId: "3f2a...", qubits: [2, 3], clbits: [], params: {}, moment: 4 }
```

`GateName` is `BuiltinGateName | "custom" | "unitary"` (`frontend/lib/types.ts`)
— `"custom"` is the only new gate kind a user ever places or a saved/shared
circuit ever stores. `"unitary"` is a **resolver-output-only** gate explained
below; it never appears in an editable circuit.

## Definition schema (declarative only, never code)

```ts
type CustomDefinition = MatrixGateDefinition | DecompositionGateDefinition | CompositeOperationDefinition;
```

All three share `id, name, label, description, category, icon, tags,
favorite, createdAt, updatedAt`. `label` is capped at 8 characters (it has to
fit on a canvas cell).

- **`MatrixGateDefinition`**: `numQubits: 1 | 2 | 3`, `matrix: ComplexPair[][]`
  (row-major, `2^numQubits` square, each entry a `[re, im]` pair),
  `unitarityError` (the worst `|U·U† − I|` entry observed at save time, kept
  for display — "validated to 3.2e-9").
- **`DecompositionGateDefinition`**: `numQubits`, `numClbits`, `parameters:
  CustomParameterSpec[]` (name/label/default/min/max), `steps:
  DecompositionStep[]`.
- **`CompositeOperationDefinition`**: same as decomposition minus
  `parameters` — a macro's steps already have concrete values.

A `DecompositionStep` is `{ gate, qubits, clbits, params, moment }` where
`qubits`/`clbits` are **local** indices (`0..numQubits-1` of the definition,
not the circuit it will eventually be placed into), `gate` is either a
built-in name or `custom:<id>` referencing another definition, and `params`
values are either a literal number or `param:<name>` referencing one of the
definition's own exposed parameters.

**Nothing here is ever `eval`'d, `Function()`'d, or executed.** A definition
is validated JSON: numeric matrices, structured gate references, numeric
parameter bindings. Every field is checked; unknown gate references, cycles,
and malformed matrices are rejected with an explanation, never silently
accepted or run.

## Validation (`frontend/lib/customGateValidation.ts`)

`validateDefinition(def, library)` runs before every save, import, and
share-link load:

- **Matrix**: dimensions must be exactly `2^numQubits` square; every entry
  must be a finite `[re, im]` pair; unitarity is checked as
  `max|U·U† − I|` against a tolerance (`1e-6` by default) and the actual
  deviation is always reported, so a near-miss and a wildly wrong matrix get
  different, honest feedback.
- **Decomposition/composite steps**: every operand index must be in range,
  gate shapes must match known arities (a `cx` step needs exactly 2 qubits,
  etc.), every `custom:<id>` reference must resolve to a definition that
  **does not, directly or transitively, reference this definition again**
  (cycle detection with a bounded ancestry walk), stays within
  `MAX_DECOMPOSITION_DEPTH` (8) nesting levels, and the fully-expanded
  operation count stays under `MAX_EXPANDED_OPERATIONS` (4,000).
- **Parameters**: names must be valid identifiers, no duplicates, finite
  defaults, `min ≤ max`.

All limits live in `frontend/lib/customGates.ts` as named constants (matrix
qubits, decomposition qubits/steps/depth/expansion, parameter count,
definition count, name/label/description length, import file size).

## Persistence (`frontend/lib/customGateRepository.ts`)

A `CustomGateRepository` interface (list/get/save/rename/duplicate/remove/
setFavorite/recentIds/touch/exportAll/importMany) is implemented today as
`localCustomGateRepository`, backed by `localStorage` under a versioned
envelope (`{version: 1, definitions: [...]}`) — the same shape and
corrupt-recovery pattern as `frontend/lib/projects.ts` (a corrupt store is
backed up under a timestamped key with a session notice, then reset to
empty, rather than wiping silently or crashing). The interface boundary
means a future cloud-sync adapter can implement the same shape without
touching any call site.

`importMany` merges an incoming set of definitions into the existing
library: an id collision with byte-identical content is treated as
idempotent (re-importing the same bundle twice does not create a duplicate);
a genuine id collision gets a fresh id; a name collision gets " (imported)"
appended. It returns an `idMap` (old id → final id) so callers that also
need to rewrite a circuit's `customId` references (share-link loading,
circuit JSON import) can keep them pointing at the right definition after
a rename.

## The resolver: how a custom instance reaches the backend

`frontend/lib/customGateResolve.ts`'s `resolveCustomOperations(circuit,
library)` is the **single place** every "custom" operation gets flattened,
called before every backend request (validate/simulate/analyze/code/qasm)
and before the local state preview:

- A **matrix** definition becomes one `{ gate: "unitary", qubits, matrix,
  label }` operation — the only new gate the backend needs to know about.
- A **decomposition/composite** definition is expanded recursively into
  plain built-in operations: local qubit/clbit indices are remapped through
  the placed instance's actual qubits/clbits, `param:<name>` references are
  bound to the instance's own `params` (or the definition's default), and
  nested `custom:<id>` steps recurse the same way. **The backend never learns
  the custom-gate schema exists for these** — a Bell-pair macro reaches the
  backend as plain `H` then `CX`.
- Expansion order is preserved (each definition's own steps are sorted by
  their local `moment` before remapping), then a greedy "as soon as
  possible" per-wire scheduler assigns final moments to the fully flattened,
  order-correct instruction list. The resulting moment numbers are synthetic
  — a resolved circuit is never shown on the visual canvas, only sent to the
  backend or the local preview, so only relative order matters.
- Resolution **fails closed**: a dangling `customId`, an operand-count
  mismatch between a placed instance and its definition, or a corrupted
  reference produces `{ ok: false, reason }` instead of guessing, and every
  call site (Run, Analyze, Generate, Simulator Lab handoff, the local state
  preview) shows that reason instead of proceeding.

## Sharing, export, and import

A circuit that places any custom gate is **not self-contained** on its own —
the definition lives in the browser's separate custom-gate library. Every
persistence path that can leave the browser embeds the definitions a circuit
actually needs (collected transitively through nested `custom:<id>` steps
via `collectReferencedDefinitions`):

- **Compressed share links** (`?c2=`) auto-switch from the existing v2
  tuple-packed format (unchanged, byte-for-byte backward compatible for
  custom-gate-free circuits) to a new v3 object-shaped format that embeds
  `{ circuit, definitions }` whenever the circuit places a custom gate.
  Loading a v3 link imports the embedded definitions into the local library
  (idempotently) before loading the circuit, so opening someone else's link
  works even with an empty local library.
- **Circuit JSON export/import** (Projects drawer) uses the same idea: a
  custom-gate-free circuit exports as the exact same plain `CircuitData`
  shape as before; a circuit with custom gates exports as `{ format:
  "quantum-composer-circuit", version: 1, circuit, definitions }`. Import
  detects and handles both shapes.
- **Legacy uncompressed `?c=` links** are unchanged and do not bundle
  definitions — they still decode a custom-gate-bearing circuit structurally,
  but the recipient needs the same definitions locally already. This is a
  known, accepted limitation of the legacy path (use `?c2=` instead).
- The custom-gate **library's own** export/import (the library drawer's
  "Export all" / "Import") is a separate, simpler `{version, definitions}`
  file with no circuit attached — for backing up or transferring your whole
  library.

Missing definitions are always a **recoverable** state, never a silent
failure: a placed instance whose `customId` no longer resolves renders with
a dashed red outline and a "?" glyph, stays selectable/movable/deletable, and
the Inspector explains that it can't be simulated, generated, or expanded
until fixed.

## Qiskit and OpenQASM generation

Because decomposition/composite gates are fully flattened before reaching
the backend, `backend/codegen.py`'s existing gate-by-gate code generator
needed **no changes** for them — the generated Python already reads like a
plain `H`/`CX` sequence.

For matrix gates, the backend gained exactly one new case:
`backend/circuit_builder.py` appends a Qiskit `UnitaryGate(matrix,
label=...)`, and `backend/codegen.py` emits the matching readable source
(`from qiskit.circuit.library import UnitaryGate` plus a literal `complex(re,
im)` matrix). OpenQASM export (`qasm2.dumps()`) was verified empirically
(not assumed) to synthesize a proper `gate unitary q0 { ... }` definition
for 1-, 2-, and 3-qubit `UnitaryGate` instructions via Qiskit's own unitary
synthesis passes — no special-case fallback was needed. If a future Qiskit
version's synthesis ever fails for some matrix, the existing
`RuntimeError → 501` path in `/circuit/qasm` already surfaces that honestly
instead of producing incorrect QASM.

The frontend's creation wizard also shows its own **read-only** Qiskit-style
code preview (`frontend/lib/customGateCodePreview.ts`) while you're still
editing a definition, so the eventual generated code is never a surprise —
this preview is a separate, simpler string template from the backend's real
generator, not shared code (Python vs. TypeScript), kept consistent in
style and intent.

## Simulator and analyzer compatibility

`backend/analysis/circuit_analyzer.py`'s Clifford classification needed
**one new line**: a `"unitary"` operation is always added to
`non_clifford_reasons` (matrix gates are never automatically recognized as
Clifford-compatible from their matrix alone — that would need symbolic
Clifford-group membership testing, out of scope). Everything else was
already correct by construction:

- A decomposition/composite gate that expands entirely into Clifford
  built-ins (e.g. a Bell-pair macro: `H` then `CX`) reaches the analyzer as
  those built-ins and is correctly classified **Clifford**, recommended for
  `stim_stabilizer`/`aer_stabilizer`, with zero analyzer changes.
- A gate containing a `T` (built-in or inside a decomposition) makes the
  circuit non-Clifford, exactly as it already did.
- A matrix-defined gate makes the circuit non-Clifford unconditionally, so it
  is routed to `aer_statevector`/`aer_mps` and never offered
  `stim_stabilizer`/`aer_stabilizer`.
- Both stabilizer engines (`engines/stim_stabilizer.py`,
  `engines/aer_stabilizer.py`) already rejected any circuit where
  `analysis["contains_non_clifford"]` is true, with a clear message — so
  Stim/Aer-stabilizer correctly refuse a `"unitary"`-bearing circuit with
  **no engine-specific code changes** at all.

The frontend's own always-on local feasibility estimator
(`frontend/lib/feasibility.ts`) already treated any gate outside its known
Clifford/rotation/structural sets as conservatively non-Clifford before this
work — a safe default that was correct (if pessimistic for expandable
custom gates) and was left unchanged; it is advisory-only and never gates a
real backend call.

## Safety summary

- Never `eval`, never `Function()`, never executes imported JS/Python, never
  accepts Qiskit source as a definition.
- Every imported field is validated; unknown gate references, cycles, and
  malformed matrices are rejected with an explanation.
- Hard limits on matrix qubit count, decomposition depth/steps/expansion,
  parameter count, definition count, and import file size prevent a
  malformed or hostile import from causing runaway expansion or storage
  bloat.
- The backend independently re-validates and re-limits a `"unitary"`
  operation's qubit count and matrix shape/unitarity (`backend/schemas.py`)
  — it never trusts that the frontend's own checks already ran.

## Known limitations

- Matrix-defined gates are never auto-classified as Clifford, even if their
  matrix happens to equal a Clifford gate.
- Expand/collapse on the canvas is a **read-only preview** (a dialog showing
  the flattened operation sequence and code, via the same resolver used for
  real backend calls), not a persistent spatial reflow of the canvas — the
  collapsed block remains the single source of truth for the operation's
  logical identity.
- The composite "from selection" flow uses a qubit-range × time-range
  picker against the live circuit, not freeform multi-select/marquee
  selection on the canvas.
- Legacy uncompressed share links (`?c=`) do not bundle custom gate
  definitions.
- Simulator Lab (the separate large/generated-circuit analysis mode) has no
  custom-gate concept of its own; "Open in Simulator Lab" hands it the
  already-resolved (flattened) circuit rather than an unrenderable custom
  block.
