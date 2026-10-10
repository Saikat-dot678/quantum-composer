import { expect, it } from "vitest";
import { classicalProbabilities } from "./measurement";
import { computeStatePreview } from "./statevector";
import type { AmplitudeEntry } from "./labTypes";
const entries = [{ basis: "01", probability: 0.7 }, { basis: "11", probability: 0.3 }] as AmplitudeEntry[];
it("compares counts in classical-register order including unused bits", () => {
  expect(classicalProbabilities(entries, { version: 1, num_clbits: 3, classical_to_qubit: [1, null, 0] }))
    .toEqual(new Map([["100", 0.7], ["101", 0.3]]));
});
it("marginalizes unmeasured qubits rather than joining quantum and classical labels", () => {
  expect(classicalProbabilities(entries, { version: 1, num_clbits: 1, classical_to_qubit: [0] }))
    .toEqual(new Map([["1", 1]]));
});
it("does not invent missing probabilities for top-k state output", () => {
  expect(classicalProbabilities(entries.slice(0, 1), { version: 1, num_clbits: 2, classical_to_qubit: [0, 1] })).toBeNull();
});
it("blocks a false pure-state preview for H-measure-H", () => {
  const ops: import("./customGateResolve").ResolvedOperation[] = [
    { gate: "h", qubits: [0], clbits: [], params: {}, moment: 0 },
    { gate: "measure", qubits: [0], clbits: [0], params: {}, moment: 1 },
    { gate: "h", qubits: [0], clbits: [], params: {}, moment: 2 },
  ];
  expect(computeStatePreview({ num_qubits: 1, num_clbits: 1, shots: 32, operations: ops })).toBeNull();
  expect(computeStatePreview({ num_qubits: 1, num_clbits: 1, shots: 32, operations: ops.slice(0, 2) })).not.toBeNull();
});
