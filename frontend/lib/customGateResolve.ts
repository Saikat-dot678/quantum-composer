// Flattens "custom" circuit operations into the plain built-in gates (plus
// one new "unitary" gate for matrix-defined custom gates) that the backend
// and the local statevector preview already know how to handle. This is the
// single place that expansion happens — called before every backend request
// (simulate / analyze / code / qasm) and before the local state preview, so
// neither has to know the custom-gate schema exists. Decomposition and
// composite definitions never reach the backend as anything but their
// expansion; only matrix definitions introduce the one new "unitary" gate.
//
// Two passes: (1) walk the circuit in canonical visual-moment order and expand
// custom instances recursively; (2) assign synthetic integer moments from the
// parent moment plus the nested local timeline. Parent chronology is never
// changed, even when unrelated wires would otherwise be free earlier.
import {
  MAX_DECOMPOSITION_DEPTH,
  MAX_EXPANDED_OPERATIONS,
  definitionNumClbits,
  definitionNumQubits,
  isMatrixDefinition,
  parseCustomGateRef,
  type ComplexPair,
  type CustomDefinition,
} from "./customGates";
import type { BuiltinGateName, CircuitData, CircuitOperation } from "./types";
import { canonicalOperationOrder } from "./circuitOrdering";

export type ResolvedOperation =
  | { gate: BuiltinGateName; qubits: number[]; clbits: number[]; params: Record<string, number>; moment: number }
  | { gate: "unitary"; qubits: number[]; clbits: number[]; params: Record<string, number>; moment: number; matrix: ComplexPair[][]; label: string };

export interface ResolvedCircuit {
  num_qubits: number;
  num_clbits: number;
  shots: number;
  operations: ResolvedOperation[];
}

export interface ResolveResult {
  ok: boolean;
  circuit?: ResolvedCircuit;
  reason?: string;
}

interface FlatInstruction {
  gate: BuiltinGateName | "unitary";
  qubits: number[];
  clbits: number[];
  params: Record<string, number>;
  matrix?: ComplexPair[][];
  label?: string;
  parentMoment: number;
  localTimeline: number[];
}

interface InstanceLike {
  qubits: number[];
  clbits: number[];
  params: Record<string, number>;
}

function resolveParamValue(raw: number | `param:${string}`, bindings: Record<string, number>): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const name = raw.startsWith("param:") ? raw.slice(6) : null;
  if (name === null || !(name in bindings)) return null;
  return bindings[name];
}

/** Recursively expands one placed custom instance into `out`, remapping local qubit/clbit indices through `instance`'s actual placement. */
function expandInstance(
  instance: InstanceLike,
  definition: CustomDefinition,
  library: ReadonlyMap<string, CustomDefinition>,
  depth: number,
  out: FlatInstruction[],
  parentMoment: number,
  localPrefix: number[],
): { ok: true } | { ok: false; reason: string } {
  if (depth > MAX_DECOMPOSITION_DEPTH) {
    return { ok: false, reason: `"${definition.name}" nests more than ${MAX_DECOMPOSITION_DEPTH} levels deep — refusing to expand further.` };
  }

  if (isMatrixDefinition(definition)) {
    out.push({
      gate: "unitary", qubits: instance.qubits, clbits: [], params: {}, matrix: definition.matrix, label: definition.label,
      parentMoment, localTimeline: localPrefix.length ? localPrefix : [0],
    });
    return out.length > MAX_EXPANDED_OPERATIONS
      ? { ok: false, reason: `This circuit expands to more than ${MAX_EXPANDED_OPERATIONS.toLocaleString()} operations once custom gates are flattened.` }
      : { ok: true };
  }

  const bindings: Record<string, number> = {};
  if (definition.kind === "decomposition") {
    for (const spec of definition.parameters) bindings[spec.name] = spec.default;
    for (const [key, value] of Object.entries(instance.params)) {
      if (key in bindings && Number.isFinite(value)) bindings[key] = value;
    }
  }

  // Steps carry their own local timeline (definition.steps[i].moment) — sort
  // by that (tie-broken by lowest local qubit) so expansion preserves the
  // definition's own internal ordering regardless of insertion order in storage.
  const steps = canonicalOperationOrder(definition.steps);

  for (const step of steps) {
    const localTimeline = [...localPrefix, step.moment];
    const stepQubits = step.qubits.map((local) => instance.qubits[local]);
    const stepClbits = step.clbits.map((local) => instance.clbits[local]);
    if (stepQubits.some((q) => q === undefined) || stepClbits.some((c) => c === undefined)) {
      return { ok: false, reason: `"${definition.name}" has a step referencing an operand outside this instance's placement.` };
    }
    const stepParams: Record<string, number> = {};
    for (const [key, raw] of Object.entries(step.params)) {
      const value = resolveParamValue(raw, bindings);
      if (value === null) return { ok: false, reason: `"${definition.name}" has a step with an unresolved parameter reference.` };
      stepParams[key] = value;
    }

    const nestedId = parseCustomGateRef(step.gate);
    if (nestedId !== null) {
      const nestedDefinition = library.get(nestedId);
      if (!nestedDefinition) return { ok: false, reason: `"${definition.name}" references a custom gate that no longer exists in the library ("${nestedId}").` };
      const result = expandInstance(
        { qubits: stepQubits, clbits: stepClbits, params: stepParams }, nestedDefinition,
        library, depth + 1, out, parentMoment, localTimeline,
      );
      if (!result.ok) return result;
    } else {
      out.push({
        gate: step.gate as BuiltinGateName, qubits: stepQubits, clbits: stepClbits, params: stepParams,
        parentMoment, localTimeline,
      });
    }
    if (out.length > MAX_EXPANDED_OPERATIONS) {
      return { ok: false, reason: `This circuit expands to more than ${MAX_EXPANDED_OPERATIONS.toLocaleString()} operations once custom gates are flattened.` };
    }
  }
  return { ok: true };
}

function compareTimeline(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

/**
 * Assign integer moments from (parent moment, nested local timeline). A custom
 * expansion is a chronology block, so it cannot cross a measurement, barrier,
 * or any other operation from an earlier/later visual moment.
 */
function scheduleFlat(instructions: FlatInstruction[]): ResolvedOperation[] {
  const ordered = [...instructions].sort((left, right) =>
    left.parentMoment - right.parentMoment || compareTimeline(left.localTimeline, right.localTimeline));
  const resolved: ResolvedOperation[] = [];
  let activeParent: number | null = null;
  let activeTimeline: number[] | null = null;
  let moment = -1;
  for (const instruction of ordered) {
    if (instruction.parentMoment !== activeParent) {
      activeParent = instruction.parentMoment;
      activeTimeline = instruction.localTimeline;
      moment = Math.max(instruction.parentMoment, moment + 1);
    } else if (activeTimeline === null || compareTimeline(instruction.localTimeline, activeTimeline) !== 0) {
      activeTimeline = instruction.localTimeline;
      moment += 1;
    }
    resolved.push(
      instruction.gate === "unitary"
        ? { gate: "unitary", qubits: instruction.qubits, clbits: instruction.clbits, params: instruction.params, moment, matrix: instruction.matrix!, label: instruction.label ?? "U" }
        : { gate: instruction.gate, qubits: instruction.qubits, clbits: instruction.clbits, params: instruction.params, moment },
    );
  }
  return resolved;
}

/**
 * Flattens every "custom" operation in `circuit` into built-in gates (or the
 * "unitary" gate for matrix definitions), ready for a backend call or the
 * local statevector preview. Fails closed: any dangling reference, operand
 * mismatch, or runaway expansion returns `{ ok: false, reason }` instead of
 * guessing — callers should surface `reason` and refuse to proceed, exactly
 * like any other pre-flight validation error in this app.
 */
export function resolveCustomOperations(circuit: CircuitData, library: ReadonlyMap<string, CustomDefinition>): ResolveResult {
  const ordered = canonicalOperationOrder(circuit.operations);
  const flat: FlatInstruction[] = [];

  for (const operation of ordered) {
    if (operation.gate === "unitary") {
      if (!operation.matrix) {
        return {
          ok: false,
          reason: `The resolved unitary operation at time ${operation.moment} is missing its matrix. Reload the source circuit before continuing.`,
        };
      }
      flat.push({
        gate: "unitary",
        qubits: operation.qubits,
        clbits: operation.clbits,
        params: operation.params,
        matrix: operation.matrix,
        label: operation.label,
        parentMoment: operation.moment,
        localTimeline: [0],
      });
      continue;
    }
    if (operation.gate !== "custom") {
      flat.push({
        gate: operation.gate,
        qubits: operation.qubits,
        clbits: operation.clbits,
        params: operation.params,
        parentMoment: operation.moment,
        localTimeline: [0],
      });
      continue;
    }
    const definition = operation.customId ? library.get(operation.customId) : undefined;
    if (!definition) {
      return {
        ok: false,
        reason: `The operation at time ${operation.moment} (q${operation.qubits.join(",")}) references a custom gate that no longer exists in the library${operation.customId ? ` ("${operation.customId}")` : ""}. Open the custom gate library to remove or replace it.`,
      };
    }
    const expectedQubits = definitionNumQubits(definition);
    const expectedClbits = definitionNumClbits(definition);
    if (operation.qubits.length !== expectedQubits || operation.clbits.length !== expectedClbits) {
      return {
        ok: false,
        reason: `"${definition.name}" expects ${expectedQubits} qubit(s) and ${expectedClbits} classical bit(s), but the placed instance at time ${operation.moment} has ${operation.qubits.length} and ${operation.clbits.length}.`,
      };
    }
    const result = expandInstance(operation, definition, library, 1, flat, operation.moment, []);
    if (!result.ok) return { ok: false, reason: result.reason };
  }

  return {
    ok: true,
    circuit: { num_qubits: circuit.num_qubits, num_clbits: circuit.num_clbits, shots: circuit.shots, operations: scheduleFlat(flat) },
  };
}

/** True if `circuit` contains at least one placed custom-gate instance (a cheap pre-check so callers can skip resolution entirely for ordinary circuits). */
export function hasCustomOperations(circuit: CircuitData): boolean {
  return circuit.operations.some((operation) => operation.gate === "custom");
}

/**
 * Every definition a circuit needs to be self-contained: each placed custom
 * instance's own definition, plus every definition transitively reachable
 * through decomposition/composite steps' custom:<id> references. Used to
 * embed a dependency bundle in share links, exports, and project saves.
 * Silently skips ids missing from `library` — callers that need to treat a
 * dangling reference as an error should check `resolveCustomOperations` (or
 * compare the returned list's length against the referenced-id count) first.
 */
export function collectReferencedDefinitions(circuit: CircuitData, library: ReadonlyMap<string, CustomDefinition>): CustomDefinition[] {
  const needed = new Map<string, CustomDefinition>();
  const queue: string[] = [];
  for (const operation of circuit.operations) {
    if (operation.gate === "custom" && operation.customId) queue.push(operation.customId);
  }
  while (queue.length > 0) {
    const id = queue.pop();
    if (!id || needed.has(id)) continue;
    const definition = library.get(id);
    if (!definition) continue;
    needed.set(id, definition);
    if (definition.kind !== "matrix") {
      for (const step of definition.steps) {
        const refId = parseCustomGateRef(step.gate);
        if (refId && !needed.has(refId)) queue.push(refId);
      }
    }
  }
  return [...needed.values()];
}

/** All customIds referenced anywhere in `circuit`, including only what's directly placed (not transitively expanded) — used for quick "does this still resolve" checks in the UI (e.g. the Inspector's per-instance definition lookup). */
export function directCustomIds(circuit: CircuitData): Set<string> {
  const ids = new Set<string>();
  for (const operation of circuit.operations) {
    if (operation.gate === "custom" && operation.customId) ids.add(operation.customId);
  }
  return ids;
}

export function operationRequiresCustomId(operation: CircuitOperation): operation is CircuitOperation & { customId: string } {
  return operation.gate === "custom" && typeof operation.customId === "string" && operation.customId.length > 0;
}
