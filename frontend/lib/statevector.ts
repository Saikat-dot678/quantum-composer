// Tiny client-side statevector simulator for the Composer's live state
// preview. Deliberately bounded: it refuses anything above MAX_PREVIEW_QUBITS
// (2^5 = 32 amplitudes), applies the ideal unitary only, and *ignores*
// measurement and barrier operations — it shows the pre-measurement ideal
// state, which is exactly what the preview labels say. This is an educational
// preview, not a replacement for the backend engines.
//
// Takes a *resolved* circuit (lib/customGateResolve.ts) rather than the raw
// editable CircuitData, so custom gates are already flattened into built-ins
// plus the "unitary" gate by the time they reach here — the caller is
// responsible for resolving (and for showing an honest error instead of a
// silently-wrong preview if resolution fails).
import type { ComplexPair } from "./customGates";
import type { ResolvedCircuit } from "./customGateResolve";
import { canonicalOperationOrder } from "./circuitOrdering";
import { BUILTIN_GATE_SET, gateMatrix, type BuiltinGateName } from "./gateRegistry";

export const MAX_PREVIEW_QUBITS = 5;

export interface AmplitudeEntry {
  /** Basis label, Qiskit bit order (qubit n-1 leftmost). */
  basis: string;
  probability: number;
  /** Phase in radians in (-π, π]; meaningful only when probability > 0. */
  phase: number;
  re: number;
  im: number;
}

export interface StatePreview {
  entries: AmplitudeEntry[];
  numQubits: number;
  ignoredMeasurements: number;
  /** Bloch vector for the 1-qubit case, else null. */
  bloch: { x: number; y: number; z: number } | null;
}

/**
 * Applies an arbitrary k-qubit unitary (row-major, 2^k square) to the
 * subspace spanned by `qubits`. `qubits[b]` is bit `b` of the matrix's own
 * row/col index — the same convention Qiskit uses for `UnitaryGate(matrix)`
 * appended to `qargs=qubits`, so this preview and the eventual backend
 * UnitaryGate agree on what the matrix means.
 */
function applyMatrix(re: Float64Array, im: Float64Array, qubits: number[], matrix: ComplexPair[][]): void {
  const k = qubits.length;
  const dim = 1 << k;
  const bits = qubits.map((q) => 1 << q);
  const visited = new Uint8Array(re.length);
  for (let index = 0; index < re.length; index += 1) {
    if (visited[index]) continue;
    let base = index;
    for (const bit of bits) base &= ~bit;
    const indices = new Array<number>(dim);
    for (let sub = 0; sub < dim; sub += 1) {
      let idx = base;
      for (let b = 0; b < k; b += 1) if (sub & (1 << b)) idx |= bits[b];
      indices[sub] = idx;
    }
    const inRe = indices.map((i) => re[i]);
    const inIm = indices.map((i) => im[i]);
    for (let row = 0; row < dim; row += 1) {
      let outRe = 0;
      let outIm = 0;
      for (let col = 0; col < dim; col += 1) {
        const [mRe, mIm] = matrix[row][col];
        outRe += mRe * inRe[col] - mIm * inIm[col];
        outIm += mRe * inIm[col] + mIm * inRe[col];
      }
      re[indices[row]] = outRe;
      im[indices[row]] = outIm;
    }
    for (const i of indices) visited[i] = 1;
  }
}

/** Compute the ideal pre-measurement state, or null when the preview does not apply. `circuit` must already be resolved (see lib/customGateResolve.ts) — no "custom" gate ever reaches this function. */
export function computeStatePreview(circuit: ResolvedCircuit): StatePreview | null {
  const n = circuit.num_qubits;
  if (n < 1 || n > MAX_PREVIEW_QUBITS) return null;

  const size = 1 << n;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  re[0] = 1;

  let ignoredMeasurements = 0;
  const ordered = canonicalOperationOrder(circuit.operations);
  for (const operation of ordered) {
    if (operation.gate === "measure") {
      ignoredMeasurements += 1;
      continue;
    }
    if (operation.gate === "barrier") continue;
    // Reset is a quantum channel, not a unitary. A pure-state preview cannot
    // represent its generally mixed output honestly; Simulator Lab can.
    if (operation.gate === "reset") return null;
    if (operation.gate === "unitary") {
      applyMatrix(re, im, operation.qubits, operation.matrix);
      continue;
    }
    if (!BUILTIN_GATE_SET.has(operation.gate)) return null;
    const builtinMatrix = gateMatrix(operation.gate as BuiltinGateName, operation.params, operation.qubits.length);
    if (!builtinMatrix) return null;
    applyMatrix(re, im, operation.qubits, builtinMatrix);
  }

  const entries: AmplitudeEntry[] = [];
  for (let index = 0; index < size; index += 1) {
    const probability = re[index] * re[index] + im[index] * im[index];
    entries.push({
      basis: index.toString(2).padStart(n, "0"),
      probability,
      phase: probability > 1e-12 ? Math.atan2(im[index], re[index]) : 0,
      re: re[index],
      im: im[index],
    });
  }

  let bloch: StatePreview["bloch"] = null;
  if (n === 1) {
    // ⟨X⟩ = 2Re(a*conj(b)), ⟨Y⟩ = 2Im(conj(a)b)... using a=amp0, b=amp1:
    const [aRe, aIm, bRe, bIm] = [re[0], im[0], re[1], im[1]];
    bloch = {
      x: 2 * (aRe * bRe + aIm * bIm),
      y: 2 * (aRe * bIm - aIm * bRe),
      z: aRe * aRe + aIm * aIm - (bRe * bRe + bIm * bIm),
    };
  }

  return { entries, numQubits: n, ignoredMeasurements, bloch };
}
