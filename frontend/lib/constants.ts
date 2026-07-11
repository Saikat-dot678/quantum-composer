// Central limits and thresholds. The key idea: **visual drawing limits are
// separate from simulation feasibility limits.** The composer can draw larger
// circuits than the old safe V1 statevector path can simulate; the Simulator Lab
// and the backend resource estimator decide what is actually feasible.

// How large a circuit the visual composer will draw.
export const COMPOSER_MIN_QUBITS = 1;
export const COMPOSER_MAX_QUBITS = 64;
export const COMPOSER_MAX_CLBITS = 64;
export const COMPOSER_MIN_COLUMNS = 4;
export const COMPOSER_MAX_COLUMNS = 200;

// The old V1 `/circuit/simulate` endpoint runs an exact statevector and is kept
// deliberately small and safe. Circuits above this qubit count must go through
// `/circuit/simulate-v2` (the honest multi-engine router) instead.
export const SAFE_V1_SIM_MAX_QUBITS = 8;
export const SAFE_V1_SIM_MAX_CLBITS = 8;

// Beyond this many rendered cells (qubits x columns) the grid gets heavy; we
// nudge the user toward the Simulator Lab rather than drawing a giant DOM.
export const GRID_CELL_SOFT_LIMIT = 3200;

export const SHOT_OPTIONS = [128, 256, 512, 1024, 2048, 4096, 8192] as const;

// The one-line honesty statement reused across the UI.
export const HONESTY_NOTE =
  "100+ qubit support only applies to structured circuits such as Clifford/stabilizer or low-entanglement circuits. Arbitrary 100-qubit statevector simulation is infeasible.";
