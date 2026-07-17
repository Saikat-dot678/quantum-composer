# Graphical Circuit Diagrams

Simulation and hardware-mapping results use Qiskit's Matplotlib circuit drawer
instead of displaying the legacy ASCII/text drawer. Generated Qiskit code,
OpenQASM, custom-definition code previews, metadata, and diagnostic logs remain
text because they are not circuit-diagram visualizations.

## Backend rendering

`backend/visualization/circuit_renderer.py` is the single rendering boundary
used by V1 simulation, V2 simulation, circuit import, and hardware
transpilation. It configures Matplotlib's non-interactive `Agg` backend before
importing `pyplot`, so normal Uvicorn processes need no desktop display, Qt,
Tk, or X server.

The validated Qiskit circuit is drawn with:

```python
circuit.draw(
    output="mpl",
    fold=fold,
    idle_wires=False,
    style="iqp",
)
```

The figure is saved as SVG with a tight bounding box, 0.15-inch padding, and a
white background. Every figure is closed in `finally`; figures opened by a
drawer that subsequently raises are also closed. Matplotlib work is serialized
behind a process lock because its global font/figure machinery is not
thread-safe. A stable QPY-based hash feeds a 24-entry process-local LRU cache.

## Transport and safety

The typed optional `circuit_diagram` payload is:

```json
{
  "format": "svg",
  "encoding": "base64",
  "content": "PHN2Zy4uLg==",
  "width": 1200,
  "height": 420,
  "fold": 32,
  "wrapped": true
}
```

Hardware transpilation returns `original_circuit_diagram` and
`transpiled_circuit_diagram`. Base64 avoids inserting raw SVG markup into the
DOM; the frontend validates the envelope and displays it through an image data
URL. The SVG is generated only from a circuit that has already passed the
application's schema and Qiskit construction boundary.

Legacy `diagram`, `original_diagram`, and `transpiled_diagram` text fields are
retained for older API clients, but normal application UI never renders them.

## Folding and limits

Folding is based on real Qiskit depth and operation count:

- depth <=18 and <=32 operations: no folding;
- depth <=72 and <=140 operations: fold at 32;
- larger safe circuits: fold at 20.

The response marks a circuit as `wrapped` when its depth crosses the selected
fold. The UI explains that multiple rows preserve label readability.

Rendering is declined before Matplotlib allocation when a circuit exceeds any
of these safety limits:

- 48 qubits;
- 64 classical bits;
- 400 operations;
- depth 240;
- 260 estimated wrapped wire rows.

Serialized SVG is capped at 5.5 MB and reported display dimensions are capped
at 8192 pixels per axis. These are diagram limits, not simulation limits. A
larger structured circuit may still simulate successfully while its diagram is
omitted with an explanatory warning.

## Frontend viewer

`frontend/components/results/CircuitDiagram.tsx` is shared by Composer results,
Simulator Lab, and Hardware Mapping. It provides:

- a bounded, keyboard-focusable viewport with internal horizontal/vertical
  scrolling and touch panning;
- zoom from 50% to 300%, reset, and fit-to-width with a 50% readability floor;
- a viewport-contained fullscreen dialog with focus trapping and Escape close;
- SVG download and a browser-generated PNG download;
- loading, unavailable, and image-failure states;
- a wrapped-circuit notice and descriptive image/toolbar labels.

The canvas remains white so Qiskit's standard gate colors and labels stay
readable in both application themes. Very wide circuits scroll rather than
shrinking below 50%. No viewer may expand the document width.

## Failure behavior

Rendering is best-effort. A drawer/import/serialization exception is logged by
the backend, converted into a generic diagram warning, and never fails the
simulation or transpilation response. The UI shows that the diagram is
unavailable while leaving counts, metrics, state analysis, code, QASM, and
mapping results intact. The legacy ASCII field is not exposed as a visual
fallback.

## Dependencies and verification

The base backend requirements include `matplotlib` and `pylatexenc`; both are
needed by Qiskit's Matplotlib drawer. No GUI toolkit is installed.

Backend tests cover one-qubit, Bell, measurement, multiple registers, custom
decomposition, custom unitary, folding, SVG validity, cache bounds, render
limits, failure fallback, figure cleanup, and the `Agg` backend. Frontend tests
cover transport validation, zoom math, loading/unavailable states, SVG and PNG
downloads, fullscreen, internal scrolling, responsive overflow, Composer/V2/
Hardware integration, and Bell/medium/folded/mobile/fullscreen screenshots.

