// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localCustomGateRepository as gates } from "./customGateRepository";
import { localProjectRepository as projects, restoreProjectCircuit } from "./projects";
import { resolveCustomOperations } from "./customGateResolve";
import type { CompositeOperationDefinition } from "./customGates";
import type { CircuitData } from "./types";

function definition(id: string, gate: string): CompositeOperationDefinition {
  return { id, name: id, label: "G", description: "", category: "Custom", icon: "circle", tags: [], favorite: false,
    createdAt: 0, updatedAt: 0, kind: "composite", numQubits: 1, numClbits: 0,
    steps: [{ gate, qubits: [0], clbits: [], params: {}, moment: 0 }] };
}
const circuit: CircuitData = { num_qubits: 1, num_clbits: 0, shots: 128,
  operations: [{ gate: "custom", customId: "parent", qubits: [0], clbits: [], params: {}, moment: 0 }] };
const bundle = (definitions: CompositeOperationDefinition[]) => JSON.stringify({ version: 1, definitions });
const resolvedGate = (value: CircuitData) => {
  const resolved = resolveCustomOperations(value, new Map(gates.list().map(def => [def.id, def])));
  expect(resolved.ok).toBe(true);
  return resolved.ok ? resolved.circuit!.operations[0].gate : null;
};
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); });

describe("atomic definition imports", () => {
  it("remaps nested collisions even when the colliding parent is identical", () => {
    gates.save(definition("child", "z"));
    gates.save(definition("parent", "custom:child"));
    const result = gates.importMany(bundle([definition("parent", "custom:child"), definition("child", "x")]));
    expect(result.ok).toBe(true);
    const imported = { ...circuit, operations: circuit.operations.map(op => ({ ...op, customId: result.value!.idMap.parent })) };
    expect(resolvedGate(imported)).toBe("x");
    expect(resolvedGate(circuit)).toBe("z");
  });
  it("rejects missing dependencies and cycles without any partial write", () => {
    gates.save(definition("existing", "h"));
    const before = gates.exportAll();
    expect(gates.importMany(bundle([definition("child", "x"), definition("parent", "custom:missing")])).ok).toBe(false);
    expect(gates.importMany(bundle([definition("a", "custom:b"), definition("b", "custom:a")])).ok).toBe(false);
    expect(gates.exportAll()).toBe(before);
  });
  it("prevents deleting a definition required by another definition", () => {
    gates.save(definition("child", "x")); gates.save(definition("parent", "custom:child"));
    expect(gates.remove("child").ok).toBe(false);
  });
});

describe("self-contained project snapshots", () => {
  it("restores and duplicates the saved gate behavior after the library changes", () => {
    gates.save(definition("parent", "x"));
    const saved = projects.create("Snapshot", circuit).value!;
    gates.save(definition("parent", "z"));
    expect(resolvedGate(restoreProjectCircuit(saved))).toBe("x");
    const copy = projects.duplicate(saved.id).value!;
    expect(resolvedGate(copy.circuit)).toBe("x");
    expect(resolvedGate(circuit)).toBe("z");
  });
  it("rejects saving unresolved custom gates", () => { expect(projects.create("Broken", circuit).ok).toBe(false); });
  it("backs up the complete corrupt payload without truncating it", () => {
    const raw = "broken".repeat(200_000);
    localStorage.setItem("quantum-composer.projects.v2", raw);
    expect(projects.list()).toEqual([]);
    const key = Object.keys(localStorage).find(key => key.startsWith("quantum-composer.projects.recovery."));
    expect(key).toBeDefined(); expect(localStorage.getItem(key!)).toBe(raw);
  });
  it("preserves the source when a recovery backup cannot be written", () => {
    const key = "quantum-composer.custom-gates.v1";
    localStorage.setItem(key, "damaged data");
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, name, value) {
      if (name.includes("recovery.")) throw new DOMException("full", "QuotaExceededError");
      original.call(this, name, value);
    });
    expect(gates.save(definition("fresh", "x")).ok).toBe(false);
    expect(localStorage.getItem(key)).toBe("damaged data");
  });
});

it("does not overwrite an external project edit with a stale tab", () => {
  const empty = { ...circuit, operations: [] };
  const project = projects.create("Concurrent", empty).value!;
  const key = "quantum-composer.projects.v2";
  const external = JSON.parse(localStorage.getItem(key)!);
  external.projects[0].circuit.shots = 999;
  localStorage.setItem(key, JSON.stringify(external));
  expect(projects.save(project.id, { ...empty, shots: 222 }).ok).toBe(false);
  expect(JSON.parse(localStorage.getItem(key)!).projects[0].circuit.shots).toBe(999);
});
