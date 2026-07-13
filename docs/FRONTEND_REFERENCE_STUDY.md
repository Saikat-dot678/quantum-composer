# Frontend Reference Study

> Written before the "Complete Frontend Rebuild #2" pass (2026-07-13). This
> document records the products studied, the concrete patterns extracted from
> each, what was deliberately *not* copied, and the resulting product
> direction for Quantum Composer's Composer, Simulator Lab, Cryptography Lab,
> and global shell.

## Method and a stated limitation

Research was performed via targeted web search and by fetching public
documentation, design-system breakdowns, and changelog posts for each
product. This session has no general-purpose browser-screenshot tool for
arbitrary third-party sites (only Playwright against *this* app, which is
how `docs/frontend-before/` and `docs/frontend-after/` were captured). No
image assets for third-party products are included here — per the fallback
instruction, every entry below instead records the exact page/doc consulted
and detailed, specific observations rather than a generic screenshot.

## Why the previous interface stayed visually similar across passes

Reviewing `docs/frontend-before/*.png` against three prior "rebuild" commits
shows the same structural skeleton reappearing under different names each
time: an **eyebrow-label + title + one-line description** header, followed by
a **horizontal telemetry strip** of bordered segments, followed by a
**grid of bordered rectangular panels** (`Panel`/`Badge`/`instrument-label`
primitives), in a constant **dark-navy background with a single cyan accent**.
Composer, Simulator Lab, and Cryptography Lab all repeat this exact skeleton —
only the panel *contents* differ. Renaming the shell ("console header",
"activity rail") or adjusting a token (`#6f8092` → `#7d90a4` for contrast)
never touched the skeleton itself, so the product kept reading as one
dashboard with three tabs. The rebuild below deliberately replaces the
skeleton, not just its labels or colors.

## References studied

### 1. Linear — command palette (⌘K)

**Screen/workflow:** the global command palette, documented in Linear's own
product writing and third-party breakdowns of its interaction model.
**Pattern worth learning:** the palette searches a **local, already-loaded
object pool**, so results appear with no network latency; **every result row
shows its keyboard shortcut inline**, which teaches shortcuts passively during
normal use instead of requiring a separate cheat sheet.
**Not to copy:** Linear's issue-tracker-specific single-letter global
shortcuts (e.g. bare `C` to create) don't fit a canvas editor where letter keys
must remain free for future direct-manipulation use.
**Relevant to:** global shell (command palette, already implemented in this
repo).
**Adaptation:** keep the existing registered-actions palette, but show each
action's shortcut hint right-aligned in the row (already partially done via
`hint`) and ensure it never depends on a network round-trip for local actions.

### 2. Figma — contextual right-side properties panel

**Screen/workflow:** the Design tab of the right sidebar, per Figma's Help
Center article "Design, prototype, and explore layer properties in the right
sidebar."
**Pattern worth learning:** the properties panel is **empty/minimal when
nothing is selected** and **populates with exactly the controls relevant to
the selected layer type** the moment something is selected. The panel does not
pre-render a form for every possible property up front.
**Not to copy:** Figma's deep multi-level nested-component property system is
far beyond what a gate operation needs.
**Relevant to:** Composer.
**Adaptation:** replace the permanently-visible "Selected Operation" and
"Circuit Settings" sidebar forms with a **contextual inspector** that is empty
(prompting selection) until a placed gate is clicked, then shows exactly that
gate's editable fields (angle for rotations, qubit roles for two-qubit gates,
delete/duplicate).

### 3. tldraw — minimal, overridable floating UI over an infinite canvas

**Screen/workflow:** the default `tldraw` editor UI and its documented
`overrides`/`hideUi` API (tldraw.dev, GitHub `apps/docs/content/docs/user-interface.mdx`).
**Pattern worth learning:** the canvas owns the *entire* viewport; UI (toolbar,
style panel) floats **on top of** the canvas in small islands rather than
occupying dedicated layout columns that shrink the canvas.
**Not to copy:** tldraw's shape-library breadth (arrows, freehand draw,
frames) is irrelevant to a fixed gate vocabulary.
**Relevant to:** Composer (global layout).
**Adaptation:** the circuit canvas becomes the full workspace background;
the gate dock, toolbar, and inspector are floating panels positioned over it,
not grid columns that compete with it for width.

### 4. Vercel Geist — neutral surface and typography system

**Screen/workflow:** the public Geist design-system docs (`vercel.com/geist`)
and third-party breakdowns of its token values.
**Pattern worth learning:** the gray ramp is **pure neutral, no warm or cool
tint**, background is white/`#fafafa`, and color is "used like punctuation" —
a single accent reserved for genuinely interactive/important moments, not
painted across every label and border. Typography uses **tight, confident
weight contrast** rather than uppercase micro-labels everywhere.
**Not to copy:** Geist's exact typeface (proprietary) and Vercel's specific
deployment-log content model.
**Relevant to:** global visual system (all three modes).
**Adaptation:** this is the single highest-leverage decision in this rebuild
— replace the dark-navy/cyan-everywhere "instrument" palette with a light,
pure-neutral surface system (`slate` gray ramp, off-white canvas) and one
accent (`indigo`) used only for primary actions and the current selection,
not for every badge and hairline.

### 5. Excalidraw — Island toolbar + popover overflow properties

**Screen/workflow:** `LayerUI`/`Actions.tsx` architecture as documented on
DeepWiki's Excalidraw analysis and the public `docs.excalidraw.com` UI-options
reference.
**Pattern worth learning:** a reusable **"Island"** container gives every
floating toolbar/panel the same elevation and corner treatment; properties
that don't fit inline are pushed into a **popover** rather than growing the
toolbar.
**Not to copy:** Excalidraw's hand-drawn "sketchy" rendering style is wrong
for a precise circuit diagram.
**Relevant to:** Composer (toolbar), Simulator Lab (compact/advanced toggle).
**Adaptation:** one `FloatingIsland` primitive backs the Composer toolbar, the
gate dock, and the contextual inspector so they read as one visual family;
advanced numeric controls (MPS bond dimension, memory budget) move into a
popover instead of a permanently expanded panel.

### 6. Raycast — dark list UI with inline accessories

**Screen/workflow:** Raycast's `List`/`List.Item.Accessory` API reference and
third-party design breakdowns.
**Pattern worth learning:** list rows carry **right-aligned accessory
metadata** (icon + short text) instead of a separate metadata column; surfaces
use **tight 6–10px radii and hairline 1px borders**, not heavy drop shadows.
**Not to copy:** Raycast is a native macOS panel, not a browser page; its
single-context-per-screen model doesn't map to a multi-route app.
**Relevant to:** Composer gate dock and command palette rows.
**Adaptation:** gate-dock rows and palette rows use small right-aligned
accessory text (gate arity, shortcut) instead of stacked multi-line cards.

### 7. React Flow — MiniMap and Controls for node-graph navigation

**Screen/workflow:** the `MiniMap` and `Controls` component references on
`reactflow.dev`.
**Pattern worth learning:** the **MiniMap** renders every node as a tiny
shape plus a **draggable viewport rectangle** so users can jump to any part of
a large graph in one click; **Controls** is a small floating cluster
(zoom in/out/fit-view) independent of the minimap.
**Not to copy:** React Flow's general-purpose node/edge graph model (arbitrary
connections) is more general than a circuit's fixed qubit-wire topology.
**Relevant to:** Composer (large-circuit navigation).
**Adaptation:** implement a lightweight bespoke minimap (scaled SVG overview
+ viewport rectangle, click/drag to pan) and a separate small zoom/fit control
cluster, both floating over the canvas corner — same *pattern*, purpose-built
renderer.

### 8. Quirk — real-time drag-and-drop circuit simulator

**Screen/workflow:** `algassert.com/quirk` and the Quirk GitHub wiki
"How to use Quirk."
**Pattern worth learning:** gates are **dragged directly from toolboxes onto
wires**; the circuit **simulates continuously as you edit** (no explicit "run"
step for the state display), with probability/amplitude readouts positioned
immediately beside the circuit.
**Not to copy:** Quirk has no concept of shots/measurement sampling or
backend-routed engines — appropriate for its scope, not for this project's
resource-honesty requirements.
**Relevant to:** Composer (placement interaction, live state preview — already
implemented and kept).
**Adaptation:** add pointer-based drag-from-dock-to-wire as a **progressive
enhancement** on top of the existing accessible click-to-place path (dragging
is never the only way to place a gate — keyboard and click remain first-class,
per WCAG 2.5.7).

### 9. IBM Quantum Composer — categorized operations catalog on qubit wires

**Screen/workflow:** `quantum.cloud.ibm.com/docs/en/guides/composer`
("Construct circuits").
**Pattern worth learning:** the **operations catalog groups gates by color
per category** (classical/phase/non-unitary); gates are dragged onto
horizontal qubit wires; a **control modifier** can be dragged onto an existing
gate to add a control qubit, with connector dots appearing live.
**Not to copy:** IBM's freeform-vs-left alignment toggle and full OpenQASM
live-sync editing are more than this project's declarative-JSON safety model
should take on right now.
**Relevant to:** Composer (gate dock categorization, wire rendering, connector
visualization — already has connector dots; kept and refined).
**Adaptation:** keep category grouping in the gate dock, keep the categorical
color-by-gate-class idea but express it through the new neutral+indigo system
(one hue family, varied by lightness/role, not many hues).

### 10. Sentry — progressive disclosure via collapsible sections

**Screen/workflow:** the redesigned Issue Details page, per Sentry's own
changelog ("New Issue Details UI") and product docs.
**Pattern worth learning:** sections are **collapsible by default state**, with
overflow detail pushed into **drawers**; workflow actions (assign, resolve) are
visually separated from descriptive/diagnostic content so the primary action
is never buried under detail.
**Not to copy:** Sentry's dense tag/breadcrumb taxonomy is specific to error
telemetry.
**Relevant to:** Simulator Lab (engine technical detail), Cryptography Lab
(protocol explanation panels).
**Adaptation:** each engine lane in Simulator Lab (`EngineStrip.tsx`) shows a
one-line verdict by default as a compact chip; the underlying scaling/reason/
limitation detail expands only for the one lane currently selected, not all
five at once, and the "run" action stays visually separated from diagnostic
reading material.

### 11. Framer — canvas + empty-until-selected properties panel

**Screen/workflow:** Framer's own Help Center "Properties panel" article and
Framer Academy "Interacting with layers."
**Pattern worth learning:** independently confirms Figma's pattern — the right
panel is **empty when nothing is selected** and fills in per-selection; the
canvas/layers/properties three-pane split is the load-bearing structure of the
whole editor.
**Not to copy:** Framer's component-instance override model doesn't apply.
**Relevant to:** Composer.
**Adaptation:** cross-validates decision #2 (contextual inspector) as a
convergent, not idiosyncratic, pattern across two unrelated production design
tools — increases confidence this is the correct default for Composer rather
than a stylistic experiment.

## Selected product direction: "Instrument Canvas"

A synthesis, not a copy of any one product:

- **Product personality:** a precise, quiet, professional design tool —
  closer to Figma/Framer/tldraw's canvas-editor register than to a "sci-fi lab
  console" or an admin dashboard. Confidence comes from restraint and
  correctness, not glow effects.
- **Navigation model:** a slim top bar (product mark, route switch as a
  segmented control, global actions: palette trigger, projects, share) —
  *not* a persistent vertical rail with a permanent telemetry strip beneath
  it. Circuit telemetry becomes a small on-canvas status chip in Composer,
  not global chrome repeated on every route (references #3, #4).
- **Editor model (Composer):** a real spatial SVG canvas with pan/zoom, a
  floating searchable gate dock (references #6, #9), click-to-place kept as
  the accessible baseline with pointer drag-from-dock added as enhancement
  (reference #8), a contextual inspector that is empty until something is
  selected (references #2, #11), and a minimap + zoom/fit controls for large
  circuits (reference #7).
- **Global information architecture:** Composer / Simulator / Cryptography
  stay as the three routes (proven useful architecture, kept), but each
  route's *internal* composition stops repeating the header+telemetry-strip
  skeleton. Simulator Lab becomes a memory-scaling visualization plus a
  compact engine strip with progressive detail (reference #10). Cryptography
  Lab becomes an SVG protocol-flow diagram (Alice → channel → optional Eve →
  Bob) instead of stage-cards-in-a-row.
- **Visual principles:** neutral gray ramp, off-white canvas, one accent
  (indigo) reserved for primary actions/selection (reference #4); semantic
  color (emerald/amber/rose) stays reserved for feasibility state, never
  decorative.
- **Responsive strategy:** the canvas always owns the viewport; the gate dock
  and inspector become bottom sheets on narrow screens instead of disappearing
  or becoming unusable tab panes.
- **Motion strategy:** a real animation library (Framer Motion) drives the
  inspector's enter/exit, drawer/sheet transitions, palette open/close, and
  toast entrances with `prefers-reduced-motion` respected globally; canvas pan
  and drag remain un-animated (they must track the pointer 1:1).
- **Accessibility principles:** every canvas interaction keeps a full
  non-pointer path (keyboard placement/selection/deletion continues to work
  exactly as before); the contextual inspector is reachable and operable by
  keyboard once a gate is selected via keyboard, not only by pointer.
