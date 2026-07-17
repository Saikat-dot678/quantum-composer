# Circuit Editor Interactions

How placing, moving, selecting, and acting on gates works on the Composer
canvas (`frontend/components/composer/CircuitCanvas.tsx`), and the single
shared system behind all of it.

## One placement system, five call sites

`frontend/lib/placement.ts` exports `checkPlacement`, `shiftQubits`,
`qubitSpan`, and `withinRegister` — pure functions with no rendering or event
concerns. `checkPlacement(circuit, target, options)` checks timeline bounds,
register bounds, internal qubit/clbit duplication, and occupancy conflicts
against every *other* operation (an in-progress move excludes itself via
`excludeOperation`), and returns `{ ok, reason? }`.

This one module is the validator for:

1. Keyboard-driven and drag-driven **repositioning** of an existing gate.
2. **Multi-qubit** gate/operation placement and movement (arbitrary qubit
   count, not just 2 — a 12-qubit custom decomposition moves exactly the
   same way a CX does).
3. **Custom gate click-placement** (`ComposerMode.tsx`'s `placeCustomGate`).

Built-in gate click-placement and drag-from-dock placement (a much older,
pre-existing part of the app) use their own simpler occupancy check that
*replaces* a conflicting cell rather than rejecting the placement — a
deliberate, disclosed inconsistency: extending that legacy click-to-place
behavior to also route through `checkPlacement` was out of scope for this
pass (it would change long-standing, already-tested behavior without being
asked to), but custom-gate placement was built fresh and the "one shared
validator" requirement applies to it directly, so it rejects on conflict
with a clear reason instead of overwriting. This is worth revisiting for
full consistency in a future pass.

Because every interaction shares one validator, they can never silently
disagree about what is a legal drop — a target that a drag rejects, keyboard
movement rejects for the identical reason, using the identical message.

## Moving a placed gate

Moving changes the operation's numeric `moment` (and its qubit operands when
needed) but intentionally does not reorder the JavaScript array. Undo/redo and
save/reload preserve that moment. Every execution/export consumer canonicalizes
by moment, so an operation's stale array position can never override the new
visual chronology. Duplication and paste assign a validated numeric target
moment; project, JSON, and share-link decoders reject malformed moments rather
than converting strings.

Two equivalent paths, sharing one state shape (`ActiveMove` in
`CircuitCanvas.tsx`) and one ghost/snap-guide rendering block, regardless of
which one is driving it:

- **Pointer drag**: press on a placed gate (`handleGatePointerDown` — does
  *not* call `stopPropagation`, so a plain click still reaches the gate's own
  `onClick` for selection; only real movement past a 3px threshold promotes
  it to a drag and acquires pointer capture). While dragging: a dashed
  target-moment guide, a green/red highlight per target qubit, a connector
  line for multi-qubit spans, and a floating status banner
  (`role="status"`/`role="alert"` depending on validity) name the gate and
  say "release to drop, Escape to cancel." Dropping outside the canvas's own
  bounds always cancels — `pointToCell` clamps coordinates to the grid, so an
  explicit `isPointWithinCanvas` check is what actually distinguishes "off
  the edge of a big canvas" from "off the browser window entirely," forcing
  `valid: false` with an explicit reason in the latter case rather than
  silently snapping to whatever edge cell the clamp landed on. Optional edge
  auto-scroll runs its own `requestAnimationFrame` loop (not recomputed
  per-pointer-event) while the pointer sits near a container edge.
- **Keyboard move mode**: select a gate, press `M` (or use the Inspector's
  Move button / the command palette's "Move selected gate" action) to enter
  move mode; arrow keys slide the *target* (not the viewport cursor)
  through the same `checkPlacement` path, `Enter` confirms, `Escape` cancels
  without changing anything. The status banner appears immediately on
  entering move mode (pressing `M` is already an unambiguous, deliberate
  action, unlike a pointer-down which could just be a click) — this was a
  real bug caught by a Playwright test during development, not just review:
  the banner was originally gated to `hasMoved`, which stayed `false` until
  the first arrow-key press.

`Escape` cancels an in-progress move **regardless of which input started
it** — a pointer drag held down while the other hand hits `Escape` is a real
path, not just keyboard mode; this was also a real bug found by review (the
original code only checked `activeMove?.source === "keyboard"`).

A no-op move (confirm/drop back onto the same cell) commits nothing — no
history entry, no toast.

### Multi-qubit atomic movement

`shiftQubits(qubits, newAnchorQubit)` shifts every qubit in an operation by
the same offset derived from moving its anchor (first) qubit — this is what
keeps a CX's control→target *gap* intact while dragging, instead of
collapsing both endpoints onto the same qubit, and it works identically for
any qubit count. Because `checkPlacement`/`shiftQubits` never hardcode an
arity, a 12-qubit custom decomposition instance moves through the exact same
code path as a CX with zero special-casing — confirmed by inspection and by
`e2e/movement.spec.ts`'s two-qubit-gate test plus `e2e/custom-gates.spec.ts`
placing and reselecting a 2-qubit composite.

### Undo/redo

`WorkspaceProvider` commits one history entry per `setCircuit` call, not per
field change — so a whole move, a whole multi-step duplicate, or a whole
custom-gate placement is automatically **one** undo/redo step with no
history-batching code needed anywhere in the editor.

## Selection and contextual actions

Clicking an occupied cell selects it (never deletes on click); the Inspector
shows Move / Copy / Duplicate / Delete, a "Swap control/target" button for
non-swap 2-qubit gates, and a "Replace with" row offering same-arity
same-family gates (single-qubit ↔ single-qubit, rotation ↔ rotation,
two-qubit ↔ two-qubit) that preserves qubits, time step, and — where
meaningful — the rotation angle. A selected custom instance additionally
shows "Edit definition" (opens the creation wizard pre-loaded) and, for an
expandable (decomposition/composite) kind, "Expand preview."

Keyboard shortcuts (only active when a gate is selected and no text input
has focus): `Delete`/`Backspace` removes, `Ctrl`/`Cmd`+`D` duplicates,
`Ctrl`/`Cmd`+`C`/`V` copies/pastes (paste finds the next free moment on the
copied operation's own qubits and validates the copy still fits the current
register size), `M` enters move mode, `Escape` clears the selection or
cancels an in-progress move. All of these are also registered command
palette actions (`ComposerMode.tsx`'s `useRegisterActions("composer", …)`),
so they are discoverable and documented in one place rather than only living
in a keyboard-shortcuts list.

## Coordinate handling under zoom/pan

`frontend/lib/canvasGeometry.ts`'s `screenToCanvas`/`pointToCell` convert a
client-space pointer position into canvas space using the live viewport
transform (`{x, y, zoom}`), then into a `(qubit, moment)` cell — the same
conversion for every interaction (click placement, drag, minimap pan-to,
edge auto-scroll). Playwright tests read the actual live `<g transform>` off
the DOM and invert it (`e2e/helpers.ts`'s `circuitCellPoint`) rather than
assuming a fixed pixel grid, so they stay correct regardless of the current
zoom/pan state (which `zoomToFit()` changes on mount based on viewport size)
— this was a deliberate test-infrastructure choice after an earlier
hard-coded-pixel version proved flaky.

## Local preview vs. backend state analysis

The Inspector's state preview (`StatePreviewPanel.tsx`, for circuits up to 5
qubits) is explicitly labeled "Live ideal preview — calculated locally in
this browser" — an idealized, noiseless state recomputed on every edit by a
small hand-rolled simulator (`frontend/lib/statevector.ts`), never a
simulation result. It is not, and does not claim to be, the actual state a
backend engine would return for the same circuit (real engine routing,
honest measurement semantics, noise). Two explicit, non-automatic actions
sit next to it:

- **"Open in Simulator Lab"** hands off the resolved circuit and navigates to
  the full multi-engine analysis workbench, where an opt-in "Post-simulation
  quantum state analysis" run option (off by default) returns the actual
  backend-computed state — amplitudes, probabilities, phases, per-qubit
  Bloch spheres, density-matrix diagnostics, and entanglement metrics — in a
  dedicated "Quantum State" result tab. See
  [ARCHITECTURE.md](ARCHITECTURE.md) for the full pipeline.
- **"Compare with backend result"** runs one real `simulate-v2` call and
  shows a small table of the local preview's probability for each basis
  state next to the backend's exact theoretical probability for the same
  state (both deterministic, no shot noise) — useful for confirming a custom
  gate resolves the way the preview assumed. Neither action, nor the
  comparison it triggers, ever runs automatically on an edit; both require an
  explicit click.
- **"Open in Hardware Mapping"** hands off the same resolved snapshot and
  navigates to `/hardware`. Decomposition/composite definitions are flattened,
  matrix definitions become validated unitary operations, and missing
  definitions stop the action. The Hardware workspace preserves logical qubit
  identity while its topology, layout table, used-edge controls, and routing
  SWAP timeline synchronize logical-to-physical selection. Transpilation occurs
  only after **Transpile and map** is clicked and never submits a QPU job.

The local preview's own limits (≤ 5 qubits, ignores measurement, resolves
custom gates first or explains why it can't) are unchanged by any of this —
see [CUSTOM_GATES.md](CUSTOM_GATES.md) and `README.md`'s "Live state preview"
section.

## Responsive behavior

Desktop gate/inspector rails become labelled modal bottom sheets below the
wide-canvas breakpoint; the SVG remains the spatial source of truth and its
toolbar wraps/scrolls locally. The custom-gate wizard is a viewport-bounded,
internally scrolling full-height drawer, including during its entry animation,
so its header/footer remain reachable at 360×800. Project/library drawers,
command palette, output dock, minimap controls, and mobile navigation each own
their local scroll behavior—there is no global overflow-hiding workaround.
Playwright covers the required desktop/tablet/phone/landscape sizes, 80–200%
layout zoom, document width, and wizard bounds.

## Performance

- **Viewport virtualization**: only the visible `(qubit, moment)` window is
  iterated per render (`visibleRange` in `CircuitCanvas.tsx`, padded by a
  couple of cells so panning doesn't visibly pop content in) — a 128×256
  grid is ~33,000 logical cells, but only a few hundred are ever mounted as
  SVG nodes at once.
- **Memoization**: `CanvasMinimap` is wrapped in `React.memo`; its `onPanTo`
  callback is stabilized via `useCallback` in `CircuitCanvas.tsx` (a
  memoized component re-rendering anyway because a parent prop is a fresh
  closure every render defeats the memoization, so the callback's own
  stability matters as much as the wrapper).
- **Edge auto-scroll** runs its own `requestAnimationFrame` loop rather than
  recomputing scroll velocity on every `pointermove` event, so its rate is
  independent of how often the browser delivers pointer events.
- **Deferred**: a broader `requestAnimationFrame`-throttle of pointer-move
  state updates, and a wider `React.memo`/`useCallback` audit of
  `ComposerMode.tsx`'s handler functions passed into `CircuitCanvas`, were
  identified but not implemented in this pass (see Known limitations below)
  — the current interactive performance was verified acceptable by hand and
  by the Playwright movement/custom-gate suites, but a systematic
  large-circuit (hundreds of operations, sustained dragging) profiling pass
  was not performed.

## Known limitations

- Built-in gate click-placement/drag-from-dock still uses its pre-existing
  "replace the conflicting cell" behavior rather than `checkPlacement`'s
  reject-on-conflict behavior (see "One placement system" above) — a
  disclosed, deliberate scope boundary, not an oversight.
- No systematic large-circuit (hundreds of visible operations, sustained
  drag) performance profiling was performed in this pass; virtualization and
  memoization changes were verified functionally correct and reasonable by
  inspection, not benchmarked against a numeric target.
- Touch/pointer support relies on the existing pointer-event-based drag
  implementation (already pointer-type-agnostic) — it was not separately
  tested on a physical touch device in this pass.
