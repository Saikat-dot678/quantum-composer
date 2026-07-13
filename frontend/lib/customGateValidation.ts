// Safe, declarative-only validation for custom gate definitions. Nothing in
// this file executes anything the user typed — matrices are numeric arrays,
// decompositions are structured references to gates that already exist. Every
// public function returns a result object rather than throwing, so callers
// (the creation wizard, import, share-link loading) can show an educational
// reason instead of a stack trace.
import {
  DEFAULT_UNITARITY_TOLERANCE,
  MAX_DECOMPOSITION_DEPTH,
  MAX_DECOMPOSITION_STEPS,
  MAX_DESCRIPTION_LENGTH,
  MAX_EXPANDED_OPERATIONS,
  MAX_LABEL_LENGTH,
  MAX_MATRIX_QUBITS,
  MAX_NAME_LENGTH,
  MAX_PARAMETERS,
  definitionNumClbits,
  definitionNumQubits,
  parseCustomGateRef,
  type ComplexPair,
  type CustomDefinition,
  type CustomParameterSpec,
  type DecompositionStep,
} from "./customGates";
import { ROTATION_GATES, TWO_QUBIT_GATES, type GateName } from "./types";

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Structural normalization of untrusted JSON (localStorage, an imported
 * file, a decoded share link) into a CustomDefinition shape — does NOT run
 * validateDefinition (which needs the full library for recursion checks).
 * Callers that need semantic validity call validateDefinition themselves
 * once every candidate definition's own shape is confirmed sound. Shared by
 * lib/customGateRepository.ts (localStorage) and lib/circuitShare.ts
 * (share links / circuit export-import) so both trust boundaries agree on
 * exactly what counts as a well-formed definition.
 */
export function normalizeCustomDefinition(value: unknown): CustomDefinition | null {
  if (!isPlainObject(value)) return null;
  const kind = value.kind;
  if (kind !== "matrix" && kind !== "decomposition" && kind !== "composite") return null;
  if (typeof value.id !== "string" || !value.id) return null;
  if (typeof value.name !== "string" || typeof value.label !== "string" || typeof value.description !== "string") return null;
  if (typeof value.numQubits !== "number" || !Number.isInteger(value.numQubits) || value.numQubits < 1) return null;
  if (typeof value.category !== "string" || typeof value.icon !== "string") return null;
  if (!Array.isArray(value.tags) || !value.tags.every((t) => typeof t === "string")) return null;
  if (typeof value.favorite !== "boolean") return null;
  if (typeof value.createdAt !== "number" || typeof value.updatedAt !== "number") return null;

  if (kind === "matrix") {
    if (!Array.isArray(value.matrix)) return null;
    if (typeof value.unitarityError !== "number") return null;
    return value as unknown as CustomDefinition;
  }
  if (!Array.isArray(value.steps)) return null;
  if (typeof value.numClbits !== "number") return null;
  if (kind === "decomposition" && !Array.isArray((value as { parameters?: unknown }).parameters)) return null;
  return value as unknown as CustomDefinition;
}

const BUILTIN_GATES = new Set<GateName>(["x", "y", "z", "h", "s", "t", "rx", "ry", "rz", "cx", "cz", "swap", "measure", "barrier"]);
const SINGLE_QUBIT_GATES = new Set<GateName>(["x", "y", "z", "h", "s", "t"]);

export function validateName(name: string): ValidationResult {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: "Name cannot be empty." };
  if (trimmed.length > MAX_NAME_LENGTH) return { ok: false, reason: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` };
  return { ok: true };
}

export function validateLabel(label: string): ValidationResult {
  const trimmed = label.trim();
  if (!trimmed) return { ok: false, reason: "Display label cannot be empty." };
  if (trimmed.length > MAX_LABEL_LENGTH) return { ok: false, reason: `Display label must be ${MAX_LABEL_LENGTH} characters or fewer, to fit on a canvas cell.` };
  return { ok: true };
}

export function validateDescription(description: string): ValidationResult {
  if (description.length > MAX_DESCRIPTION_LENGTH) return { ok: false, reason: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.` };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Matrix gates
// ---------------------------------------------------------------------------

export interface MatrixValidation extends ValidationResult {
  maxUnitarityError?: number;
}

/** U is unitary iff U * U-dagger == I. Returns the worst per-entry deviation observed. */
function unitarityError(matrix: ComplexPair[][]): number {
  const n = matrix.length;
  let maxError = 0;
  for (let i = 0; i < n; i += 1) {
    for (let k = 0; k < n; k += 1) {
      let re = 0;
      let im = 0;
      for (let j = 0; j < n; j += 1) {
        const [aRe, aIm] = matrix[i][j];
        const [bRe, bIm] = matrix[k][j]; // conjugate transpose: U-dagger[j][k] = conj(U[k][j])
        re += aRe * bRe + aIm * bIm;
        im += aIm * bRe - aRe * bIm;
      }
      const expectedRe = i === k ? 1 : 0;
      const error = Math.hypot(re - expectedRe, im);
      if (error > maxError) maxError = error;
    }
  }
  return maxError;
}

/**
 * Validates matrix shape, numeric well-formedness, qubit-count limits, and
 * unitarity (within `tolerance` — floating point entries never compare
 * exactly, so this is an approximate check, not exact algebra. The
 * `maxUnitarityError` is always reported so a caller can show *how close* a
 * rejected matrix was, per the "distinguish exact vs. approximate" requirement).
 */
export function validateMatrix(matrix: unknown, numQubits: number, tolerance = DEFAULT_UNITARITY_TOLERANCE): MatrixValidation {
  if (!Number.isInteger(numQubits) || numQubits < 1 || numQubits > MAX_MATRIX_QUBITS) {
    return { ok: false, reason: `Matrix-defined gates support 1-${MAX_MATRIX_QUBITS} qubits — the matrix doubles in size with every additional qubit.` };
  }
  const expectedSize = 2 ** numQubits;
  if (!Array.isArray(matrix) || matrix.length !== expectedSize) {
    return { ok: false, reason: `A ${numQubits}-qubit gate needs a ${expectedSize}x${expectedSize} matrix (got ${Array.isArray(matrix) ? matrix.length : typeof matrix} rows).` };
  }
  for (const row of matrix) {
    if (!Array.isArray(row) || row.length !== expectedSize) {
      return { ok: false, reason: `Every row must have exactly ${expectedSize} entries.` };
    }
    for (const entry of row) {
      if (!Array.isArray(entry) || entry.length !== 2 || !Number.isFinite(entry[0]) || !Number.isFinite(entry[1])) {
        return { ok: false, reason: "Every matrix entry must be a finite [real, imaginary] pair." };
      }
    }
  }
  const maxUnitarityError = unitarityError(matrix as ComplexPair[][]);
  if (maxUnitarityError > tolerance) {
    return {
      ok: false,
      maxUnitarityError,
      reason: `This matrix is not unitary within tolerance: U x U-dagger deviates from the identity by up to ${maxUnitarityError.toExponential(2)} (limit ${tolerance.toExponential(0)}). Unitary gates preserve total probability — a non-unitary matrix cannot correspond to a valid quantum operation.`,
    };
  }
  return { ok: true, maxUnitarityError };
}

// ---------------------------------------------------------------------------
// Decomposition / composite steps
// ---------------------------------------------------------------------------

function expectedOperandCounts(gate: GateName): { qubits: number; clbits: number } | null {
  if (SINGLE_QUBIT_GATES.has(gate) || ROTATION_GATES.includes(gate)) return { qubits: 1, clbits: 0 };
  if (TWO_QUBIT_GATES.includes(gate)) return { qubits: 2, clbits: 0 };
  if (gate === "measure") return { qubits: 1, clbits: 1 };
  if (gate === "barrier") return { qubits: -1, clbits: 0 }; // barrier accepts any qubit count >= 1
  return null;
}

/** Like expectedOperandCounts, but also resolves `custom:<id>` step references against a library — used by the step editor UI to size its qubit/clbit inputs regardless of whether a step targets a built-in or another custom definition. */
export function stepOperandArity(gate: string, library: ReadonlyMap<string, CustomDefinition>): { qubits: number; clbits: number } | null {
  const customId = parseCustomGateRef(gate);
  if (customId !== null) {
    const referenced = library.get(customId);
    return referenced ? { qubits: definitionNumQubits(referenced), clbits: definitionNumClbits(referenced) } : null;
  }
  return expectedOperandCounts(gate as GateName);
}

export interface StepsValidation extends ValidationResult {
  /** Total operation count after fully flattening every nested custom reference. */
  expandedCount?: number;
}

/**
 * Validates a definition's internal steps: operand ranges, gate shapes,
 * parameter references, and — critically — that every `custom:<id>` step
 * resolves to a definition that (a) exists, (b) does not directly or
 * indirectly reference `ownId` again (a cycle), and (c) stays within the
 * nesting-depth and total-expanded-operation limits. `library` is the full
 * set of definitions available for lookup (this definition's own draft is
 * not required to be in it yet, so brand-new definitions can validate
 * themselves before their first save).
 */
export function validateSteps(
  steps: DecompositionStep[],
  context: { numQubits: number; numClbits: number; parameters?: CustomParameterSpec[]; ownId?: string },
  library: ReadonlyMap<string, CustomDefinition>,
): StepsValidation {
  if (steps.length === 0) return { ok: false, reason: "Add at least one operation to the definition." };
  if (steps.length > MAX_DECOMPOSITION_STEPS) return { ok: false, reason: `A definition can hold at most ${MAX_DECOMPOSITION_STEPS} internal operations.` };

  const paramNames = new Set((context.parameters ?? []).map((p) => p.name));

  let expandedCount = 0;
  for (const [index, step] of steps.entries()) {
    if (!Array.isArray(step.qubits) || step.qubits.some((q) => !Number.isInteger(q) || q < 0 || q >= context.numQubits)) {
      return { ok: false, reason: `Step ${index + 1}: qubit index is outside 0..${context.numQubits - 1}.` };
    }
    if (new Set(step.qubits).size !== step.qubits.length) {
      return { ok: false, reason: `Step ${index + 1}: cannot target the same qubit twice.` };
    }
    if (!Array.isArray(step.clbits) || step.clbits.some((c) => !Number.isInteger(c) || c < 0 || c >= context.numClbits)) {
      return { ok: false, reason: `Step ${index + 1}: classical bit index is outside 0..${Math.max(0, context.numClbits - 1)}.` };
    }
    for (const value of Object.values(step.params)) {
      if (typeof value === "number") {
        if (!Number.isFinite(value)) return { ok: false, reason: `Step ${index + 1}: parameter value must be finite.` };
        continue;
      }
      const refName = typeof value === "string" ? value.replace(/^param:/, "") : null;
      if (refName === null || !paramNames.has(refName)) {
        return { ok: false, reason: `Step ${index + 1}: references an unknown parameter "${String(value)}".` };
      }
    }

    const customId = parseCustomGateRef(step.gate);
    if (customId !== null) {
      if (context.ownId && customId === context.ownId) {
        return { ok: false, reason: `Step ${index + 1}: a definition cannot reference itself — that would recurse forever.` };
      }
      const referenced = library.get(customId);
      if (!referenced) {
        return { ok: false, reason: `Step ${index + 1}: references a custom gate that no longer exists in the library ("${customId}").` };
      }
      const nested = expandStepsForValidation(referenced, library, context.ownId ? new Set([context.ownId]) : new Set(), 1);
      if (!nested.ok) return { ok: false, reason: `Step ${index + 1}: ${nested.reason}` };
      expandedCount += nested.expandedCount ?? 1;
    } else {
      if (!BUILTIN_GATES.has(step.gate as GateName)) {
        return { ok: false, reason: `Step ${index + 1}: "${step.gate}" is not a recognized built-in gate or custom:<id> reference.` };
      }
      const shape = expectedOperandCounts(step.gate as GateName);
      if (shape && shape.qubits !== -1 && step.qubits.length !== shape.qubits) {
        return { ok: false, reason: `Step ${index + 1}: ${step.gate} needs exactly ${shape.qubits} qubit(s), got ${step.qubits.length}.` };
      }
      if (shape && step.clbits.length !== shape.clbits) {
        return { ok: false, reason: `Step ${index + 1}: ${step.gate} needs exactly ${shape.clbits} classical bit(s), got ${step.clbits.length}.` };
      }
      expandedCount += 1;
    }
  }

  if (expandedCount > MAX_EXPANDED_OPERATIONS) {
    return { ok: false, reason: `This definition would expand to ${expandedCount.toLocaleString()} operations, over the ${MAX_EXPANDED_OPERATIONS.toLocaleString()} limit.` };
  }

  return { ok: true, expandedCount };
}

/** Recursive helper: walks a referenced definition's own steps to check depth/cycles/size before it's allowed to be used. */
function expandStepsForValidation(
  definition: CustomDefinition,
  library: ReadonlyMap<string, CustomDefinition>,
  ancestry: Set<string>,
  depth: number,
): StepsValidation {
  if (depth > MAX_DECOMPOSITION_DEPTH) {
    return { ok: false, reason: `Nesting is ${depth} levels deep, over the ${MAX_DECOMPOSITION_DEPTH}-level limit.` };
  }
  if (definition.kind === "matrix") return { ok: true, expandedCount: 1 };
  if (ancestry.has(definition.id)) {
    return { ok: false, reason: `Circular reference detected: "${definition.name}" (${definition.id}) is already an ancestor of this definition.` };
  }
  const nextAncestry = new Set(ancestry);
  nextAncestry.add(definition.id);

  let total = 0;
  for (const step of definition.steps) {
    const customId = parseCustomGateRef(step.gate);
    if (customId === null) { total += 1; continue; }
    const referenced = library.get(customId);
    if (!referenced) return { ok: false, reason: `"${definition.name}" references a missing custom gate ("${customId}").` };
    const nested = expandStepsForValidation(referenced, library, nextAncestry, depth + 1);
    if (!nested.ok) return nested;
    total += nested.expandedCount ?? 1;
    if (total > MAX_EXPANDED_OPERATIONS) return { ok: false, reason: `Expansion exceeds ${MAX_EXPANDED_OPERATIONS.toLocaleString()} operations.` };
  }
  return { ok: true, expandedCount: total };
}

export function validateParameters(parameters: CustomParameterSpec[]): ValidationResult {
  if (parameters.length > MAX_PARAMETERS) return { ok: false, reason: `A definition can expose at most ${MAX_PARAMETERS} parameters.` };
  const seen = new Set<string>();
  for (const param of parameters) {
    const name = param.name.trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return { ok: false, reason: `Parameter name "${param.name}" must start with a letter and contain only letters, digits, or underscores.` };
    if (seen.has(name)) return { ok: false, reason: `Duplicate parameter name "${name}".` };
    seen.add(name);
    if (!Number.isFinite(param.default)) return { ok: false, reason: `Parameter "${name}" needs a finite default value.` };
    if (param.min !== undefined && param.max !== undefined && param.min > param.max) {
      return { ok: false, reason: `Parameter "${name}": min cannot be greater than max.` };
    }
  }
  return { ok: true };
}

/** Full validation for a definition's shape — name/label/description plus the kind-specific checks. */
export function validateDefinition(def: CustomDefinition, library: ReadonlyMap<string, CustomDefinition>): ValidationResult {
  const name = validateName(def.name);
  if (!name.ok) return name;
  const label = validateLabel(def.label);
  if (!label.ok) return label;
  const description = validateDescription(def.description);
  if (!description.ok) return description;

  if (def.kind === "matrix") {
    return validateMatrix(def.matrix, def.numQubits);
  }
  if (def.kind === "decomposition") {
    const params = validateParameters(def.parameters);
    if (!params.ok) return params;
    return validateSteps(def.steps, { numQubits: def.numQubits, numClbits: def.numClbits, parameters: def.parameters, ownId: def.id }, library);
  }
  return validateSteps(def.steps, { numQubits: def.numQubits, numClbits: def.numClbits, ownId: def.id }, library);
}
