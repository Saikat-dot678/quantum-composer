import type { AmplitudeEntry } from "./labTypes";
export interface MeasurementMap {
  version: number;
  num_clbits: number;
  classical_to_qubit: (number | null)[];
}
export function classicalProbabilities(entries: AmplitudeEntry[], mapping: MeasurementMap): Map<string, number> | null {
  // A sparse/top-k state cannot support an exact marginal. Never fill its
  // missing probabilities with zeros and label the comparison shot noise.
  if (Math.abs(entries.reduce((sum, entry) => sum + entry.probability, 0) - 1) > 1e-6) return null;
  if (mapping.version !== 1 || mapping.classical_to_qubit.length !== mapping.num_clbits) return null;
  const result = new Map<string, number>();
  for (const entry of entries) {
    const bits = mapping.classical_to_qubit.map(q => q === null ? "0" : entry.basis[entry.basis.length - 1 - q]);
    if (bits.some(bit => bit !== "0" && bit !== "1")) return null;
    const key = bits.reverse().join("");
    result.set(key, (result.get(key) ?? 0) + entry.probability);
  }
  return result;
}
