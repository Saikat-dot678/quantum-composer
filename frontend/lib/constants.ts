// Central limit model. The core design rule: there is no single "max qubits".
// Different concerns have different ceilings, and they must never be conflated:
//
// - `composer.*`      — how much the *interactive visual grid* will draw. A DOM
//                       rendering concern only; says nothing about simulability.
// - `largeCircuit.*`  — how large a *generated/structured descriptor* may be.
//                       Matches the backend V2 request-validation ceilings; a
//                       schema bound, not a feasibility promise.
// - `simulation.*`    — the guarded V1 exact envelope and the backend's hard
//                       per-engine caps. Actual feasibility is decided per
//                       circuit by the backend resource estimator and router.
// - `crypto.*`        — protocol-level simulator input bounds (backend schema).
// - `shots.*`         — sampling bounds for the two simulation paths.
//
// Backend sources of truth: backend/schemas.py (request ceilings),
// backend/engines/aer_statevector.py and aer_density.py (hard qubit caps).

export const LIMITS = {
  composer: {
    minQubits: 1,
    /** Interactive visual editing bound. Above this, use generated presets + Simulator Lab. */
    interactiveMaxQubits: 128,
    interactiveMaxClbits: 128,
    minColumns: 4,
    interactiveMaxColumns: 256,
    /** Rendered cells (quantum + classical rows × columns) above which the grid warns about responsiveness. */
    softCellLimit: 4096,
    /** Rendered cells above which the grid refuses to draw and directs to Simulator Lab. */
    hardCellLimit: 16384,
  },
  largeCircuit: {
    /** Backend V2 `AdvancedCircuitRequest` qubit ceiling (schema bound, not a feasibility promise). */
    maxDescriptorQubits: 4096,
    /** Backend V2 operation-count ceiling. */
    maxDescriptorOperations: 200_000,
    /** Circuits at or below this width can still be drawn interactively if desired. */
    recommendedVisualQubits: 128,
  },
  simulation: {
    /** The old V1 exact path stays intentionally small and safe. */
    safeV1MaxQubits: 8,
    safeV1MaxClbits: 8,
    safeV1MaxOperations: 200,
    safeV1MaxShots: 8192,
    /** Backend hard caps for exact engines, independent of the memory budget. */
    statevectorHardCapQubits: 30,
    densityMatrixHardCapQubits: 15,
    /** V2 run-budget bounds (MB) accepted by simulate-v2. */
    minMemoryBudgetMb: 16,
    maxMemoryBudgetMb: 65_536,
    defaultMemoryBudgetMb: 1024,
  },
  crypto: {
    /** BB84 / E91 / B92 backend input ceilings. */
    maxKeyProtocolBits: 4096,
    /** QRNG backend input ceiling. */
    maxQrngBits: 8192,
    defaultProtocolBits: 128,
  },
  shots: {
    min: 1,
    /** V1 exact path ceiling. */
    v1Max: 8192,
    /** V2 router ceiling. */
    v2Max: 1_000_000,
    options: [128, 256, 512, 1024, 2048, 4096, 8192] as const,
  },
} as const;

/** Shot presets offered by the composer settings panel. */
export const SHOT_OPTIONS = LIMITS.shots.options;

// The one-line honesty statement reused across the UI.
export const HONESTY_NOTE =
  "100+ qubit support only applies to structured circuits such as Clifford/stabilizer or low-entanglement circuits. Arbitrary 100-qubit statevector simulation is infeasible.";
