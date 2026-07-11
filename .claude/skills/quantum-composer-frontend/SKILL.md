---

name: quantum-composer-frontend
description: Use this skill when improving the frontend of the quantum-composer project, especially Simulator Lab, Cryptography Lab, circuit composer UI, result panels, educational quantum visualizations, accessibility, responsive design, and production-quality React/Next.js interfaces.
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# Quantum Composer Frontend Skill

You are improving the frontend of `quantum-composer`, an educational quantum circuit composer, multi-engine quantum simulator, and quantum cryptography lab.

The frontend must feel like a serious technical lab tool, not a generic AI dashboard.

## Core Design Identity

Design direction:

* Dark scientific interface
* Clean lab-instrument feel
* Quantum/cybersecurity aesthetic
* Dense but readable information layout
* No childish neon overload
* No generic purple SaaS gradients everywhere
* Use purposeful visual hierarchy
* Make complex quantum information understandable

The UI should feel closer to:

* IBM Quantum Composer
* scientific instrumentation software
* cybersecurity analysis dashboards
* VS Code-style technical tools
* modern developer consoles

But do not copy IBM’s exact design.

## Project Context

The app has or will have these major areas:

1. Composer Mode

   * visual quantum circuit grid
   * gate palette
   * qubit/classical bit rows
   * generated Qiskit code
   * simulation histogram

2. Simulator Lab

   * engine selector
   * circuit analysis
   * resource estimation
   * feasibility badges
   * selected engine explanation
   * statevector/density matrix memory estimates
   * large-circuit warnings

3. Cryptography Lab

   * BB84
   * E91
   * B92
   * QRNG
   * QBER display
   * Eve attack simulation
   * basis comparison
   * key sifting visualization
   * protocol explanation

4. Results/Analysis

   * histograms
   * tables
   * warnings
   * educational explanations
   * run metadata
   * timing and engine details

## UI Quality Rules

When modifying frontend code:

1. Preserve existing functionality.
2. Do not break API contracts.
3. Use typed TypeScript interfaces.
4. Keep components modular.
5. Avoid huge monolithic components.
6. Do not hardcode backend results when real endpoints exist.
7. Add loading, empty, error, and success states.
8. Make warnings visible but not ugly.
9. Use responsive layout.
10. Keep accessibility in mind:

* semantic buttons
* keyboard-friendly controls
* clear labels
* sufficient contrast
* no color-only meaning

## Visual System

Use a consistent design system:

* Background: deep neutral/dark lab background
* Panels: slightly lighter cards with borders
* Accent colors:

  * blue/cyan for quantum simulation
  * green for successful/safe results
  * amber for warnings/heavy simulations
  * red for infeasible/error states
  * violet only sparingly for quantum identity
* Typography:

  * clean sans-serif for UI
  * monospace for code, bitstrings, basis strings, memory estimates, circuit JSON
* Spacing:

  * compact but not cramped
  * technical dashboards need information density, but every panel must breathe

## Simulator Lab UX

The Simulator Lab should clearly answer:

1. Can this circuit be simulated?
2. Which engine should be used?
3. Why was that engine selected?
4. How much memory would exact simulation require?
5. Is this a structured large circuit or an infeasible arbitrary one?

Use badges:

* Safe
* Heavy
* Dangerous
* Infeasible
* Clifford-compatible
* Non-Clifford
* Low-entanglement candidate
* MPS candidate
* Hardware recommended

The UI must clearly teach:

“100+ qubit support only applies to structured circuits such as Clifford/stabilizer or low-entanglement circuits. Arbitrary 100-qubit statevector simulation is infeasible.”

## Cryptography Lab UX

The Cryptography Lab should be educational and interactive.

For BB84:

* Show Alice bits
* Show Alice bases
* Show Bob bases
* Show Bob measurements
* Show sifted key
* Show QBER
* Show Eve detected true/false
* Show clear explanation of intercept-resend attack

For QRNG:

* Show generated bits
* Show zero/one distribution
* Show histogram
* Explain that this is an educational simulator, not certified hardware randomness

For E91:

* Show entanglement/correlation idea clearly
* Show QBER and correlation summary
* Avoid pretending to be a full production QKD security proof

## Component Guidelines

Prefer components like:

* AppShell
* TopNav
* ModeTabs
* CircuitGrid
* GatePalette
* SimulatorEngineSelector
* ResourceEstimateCard
* FeasibilityBadge
* EngineReasonPanel
* SimulationWarnings
* HistogramPanel
* CodePanel
* CryptoProtocolTabs
* BB84Panel
* E91Panel
* B92Panel
* QRNGPanel
* BitStringViewer
* BasisComparisonTable
* QBERMeter
* EveAttackToggle
* EducationalCallout

## Data Visualization

For charts:

* Keep charts simple and readable.
* Do not overanimate scientific data.
* Histograms should prioritize clarity.
* Use tooltips where useful.
* Use legends only when needed.
* For QBER, use a meter/progress style with safe/warning/danger regions.
* For memory estimates, use compact cards and human-readable units.

## Code Panels

Generated Qiskit code, OpenQASM, and JSON should be shown in polished code blocks:

* monospace font
* copy button
* scrollable content
* syntax-friendly spacing
* avoid giant unbounded panels
* include tabs if multiple formats exist

## Error and Warning Language

Do not show raw scary stack traces to normal users.

Convert backend failures into educational messages:

Bad:
“Simulation failed.”

Good:
“This circuit is too large for exact statevector simulation. A 100-qubit arbitrary circuit would require memory exponential in qubit count. Try stabilizer mode, MPS mode, reduce qubits, or run on real quantum hardware.”

## Development Process

Before changing UI:

1. Inspect current frontend structure.
2. Identify existing components and styling system.
3. Preserve current behavior.
4. Make one coherent UI improvement at a time.
5. Run lint/build if available.
6. Report changed files and any remaining limitations.

## Acceptance Standard

A frontend change is good only if:

* It works.
* It looks professional.
* It teaches the quantum concept clearly.
* It does not overclaim simulation capability.
* It makes the project stronger for a quantum computing/cryptography portfolio.
