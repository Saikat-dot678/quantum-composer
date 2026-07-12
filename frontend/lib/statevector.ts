// Tiny client-side statevector simulator for the Composer's live state
// preview. Deliberately bounded: it refuses anything above MAX_PREVIEW_QUBITS
// (2^5 = 32 amplitudes), applies the ideal unitary only, and *ignores*
// measurement and barrier operations — it shows the pre-measurement ideal
// state, which is exactly what the preview labels say. This is an educational
// preview, not a replacement for the backend engines.
import type { CircuitData, CircuitOperation } from "./types";

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

type Complex = [number, number];
type Matrix2 = [Complex, Complex, Complex, Complex]; // row-major [a b; c d]

const INV_SQRT2 = Math.SQRT1_2;

function singleQubitMatrix(operation: CircuitOperation): Matrix2 | null {
  const theta = typeof operation.params.theta === "number" ? operation.params.theta : 0;
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  switch (operation.gate) {
    case "x": return [[0, 0], [1, 0], [1, 0], [0, 0]];
    case "y": return [[0, 0], [0, -1], [0, 1], [0, 0]];
    case "z": return [[1, 0], [0, 0], [0, 0], [-1, 0]];
    case "h": return [[INV_SQRT2, 0], [INV_SQRT2, 0], [INV_SQRT2, 0], [-INV_SQRT2, 0]];
    case "s": return [[1, 0], [0, 0], [0, 0], [0, 1]];
    case "t": return [[1, 0], [0, 0], [0, 0], [INV_SQRT2, INV_SQRT2]];
    case "rx": return [[c, 0], [0, -s], [0, -s], [c, 0]];
    case "ry": return [[c, 0], [-s, 0], [s, 0], [c, 0]];
    case "rz": return [[c, -s], [0, 0], [0, 0], [c, s]];
    default: return null;
  }
}

function applySingleQubit(re: Float64Array, im: Float64Array, target: number, m: Matrix2): void {
  const bit = 1 << target;
  for (let index = 0; index < re.length; index += 1) {
    if ((index & bit) !== 0) continue;
    const pair = index | bit;
    const aRe = re[index], aIm = im[index];
    const bRe = re[pair], bIm = im[pair];
    const [[m00r, m00i], [m01r, m01i], [m10r, m10i], [m11r, m11i]] = m;
    re[index] = m00r * aRe - m00i * aIm + m01r * bRe - m01i * bIm;
    im[index] = m00r * aIm + m00i * aRe + m01r * bIm + m01i * bRe;
    re[pair] = m10r * aRe - m10i * aIm + m11r * bRe - m11i * bIm;
    im[pair] = m10r * aIm + m10i * aRe + m11r * bIm + m11i * bRe;
  }
}

function applyTwoQubit(re: Float64Array, im: Float64Array, operation: CircuitOperation): void {
  const [first, second] = operation.qubits;
  const firstBit = 1 << first;
  const secondBit = 1 << second;
  if (operation.gate === "cx") {
    // Control = first, target = second: swap amplitudes where control is 1.
    for (let index = 0; index < re.length; index += 1) {
      if ((index & firstBit) !== 0 && (index & secondBit) === 0) {
        const pair = index | secondBit;
        [re[index], re[pair]] = [re[pair], re[index]];
        [im[index], im[pair]] = [im[pair], im[index]];
      }
    }
  } else if (operation.gate === "cz") {
    for (let index = 0; index < re.length; index += 1) {
      if ((index & firstBit) !== 0 && (index & secondBit) !== 0) {
        re[index] = -re[index];
        im[index] = -im[index];
      }
    }
  } else if (operation.gate === "swap") {
    for (let index = 0; index < re.length; index += 1) {
      if ((index & firstBit) !== 0 && (index & secondBit) === 0) {
        const pair = (index & ~firstBit) | secondBit;
        [re[index], re[pair]] = [re[pair], re[index]];
        [im[index], im[pair]] = [im[pair], im[index]];
      }
    }
  }
}

/** Compute the ideal pre-measurement state, or null when the preview does not apply. */
export function computeStatePreview(circuit: CircuitData): StatePreview | null {
  const n = circuit.num_qubits;
  if (n < 1 || n > MAX_PREVIEW_QUBITS) return null;

  const size = 1 << n;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  re[0] = 1;

  let ignoredMeasurements = 0;
  const ordered = [...circuit.operations].sort((left, right) => left.moment - right.moment);
  for (const operation of ordered) {
    if (operation.gate === "measure") {
      ignoredMeasurements += 1;
      continue;
    }
    if (operation.gate === "barrier") continue;
    if (operation.qubits.length === 2) {
      applyTwoQubit(re, im, operation);
      continue;
    }
    const matrix = singleQubitMatrix(operation);
    if (matrix) applySingleQubit(re, im, operation.qubits[0], matrix);
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
