import {
  MAX_CUSTOM_DEFINITIONS,
  MAX_DECOMPOSITION_QUBITS,
  definitionNumClbits,
  definitionNumQubits,
  type CustomDefinition,
} from "./customGates";
import { normalizeCustomDefinition, validateDefinition } from "./customGateValidation";
import { LIMITS } from "./constants";
import { canonicalOperationOrder } from "./circuitOrdering";
import type { CircuitData, CircuitOperation, GateName } from "./types";

const GATES = ["x", "y", "z", "h", "s", "t", "rx", "ry", "rz", "cx", "cz", "swap", "measure", "barrier"] as const;
const GATE_SET: ReadonlySet<string> = new Set(GATES);
const SINGLE_QUBIT = new Set<GateName>(["x", "y", "z", "h", "s", "t"]);
const ROTATIONS = new Set<GateName>(["rx", "ry", "rz"]);
const TWO_QUBIT = new Set<GateName>(["cx", "cz", "swap"]);
const GATE_TO_INDEX = new Map<GateName, number>(GATES.map((gate, index) => [gate, index]));
const MAX_CUSTOM_ID_LENGTH = 128;

export const MAX_SHARE_OPERATIONS = 400;
export const MAX_SHARE_URL_LENGTH = 7_000;
const MAX_INFLATED_BYTES = 160 * 1024;
const MAX_MOMENT = LIMITS.composer.interactiveMaxColumns - 1;

export interface ShareResult {
  ok: boolean;
  url?: string;
  reason?: string;
}

export interface ShareDecodeResult {
  ok: boolean;
  circuit?: CircuitData;
  /** Custom gate/operation definitions embedded in the payload that `circuit`'s "custom" operations reference — empty unless the shared circuit actually used any. Callers must import these (e.g. into lib/customGateRepository.ts) before the circuit's customId references will resolve. */
  definitions?: CustomDefinition[];
  reason?: string;
}

export interface CircuitValidationOptions {
  maxOperations?: number;
  maxMoment?: number;
}

type CompactOperation = [gate: number, moment: number, qubits: number[], clbits?: number[], theta?: number];
interface CompactCircuit {
  v: 2;
  q: number;
  c: number;
  s: number;
  o: CompactOperation[];
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function fromBase64Url(value: string): string | null {
  const bytes = base64UrlToBytes(value);
  if (!bytes) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.every((key) => allowed.includes(key)) && keys.length === allowed.length;
}

function normalizeOperation(value: unknown, maxMoment: number): CircuitOperation | null {
  const isCustom = isPlainObject(value) && value.gate === "custom";
  const allowedKeys = isCustom ? ["gate", "qubits", "clbits", "params", "moment", "customId"] : ["gate", "qubits", "clbits", "params", "moment"];
  if (!isPlainObject(value) || !hasOnlyKeys(value, allowedKeys)) return null;
  if (typeof value.gate !== "string" || (!GATE_SET.has(value.gate) && value.gate !== "custom")) return null;
  const gate = value.gate as GateName;
  if (!Array.isArray(value.qubits) || !value.qubits.every((q) => Number.isInteger(q) && (q as number) >= 0)) return null;
  if (!Array.isArray(value.clbits) || !value.clbits.every((c) => Number.isInteger(c) && (c as number) >= 0)) return null;
  if (new Set(value.qubits).size !== value.qubits.length || new Set(value.clbits).size !== value.clbits.length) return null;
  if (!Number.isInteger(value.moment) || (value.moment as number) < 0 || (value.moment as number) > maxMoment) return null;
  if (!isPlainObject(value.params)) return null;

  const qubits = value.qubits as number[];
  const clbits = value.clbits as number[];
  const paramKeys = Object.keys(value.params);
  let params: Record<string, number> = {};

  if (isCustom) {
    if (typeof value.customId !== "string" || !value.customId || value.customId.length > MAX_CUSTOM_ID_LENGTH) return null;
    if (qubits.length < 1 || qubits.length > MAX_DECOMPOSITION_QUBITS) return null;
    for (const key of paramKeys) {
      const raw = value.params[key];
      if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
      params[key] = raw;
    }
    return { gate, qubits: [...qubits], clbits: [...clbits], params, moment: value.moment as number, customId: value.customId };
  }

  if (SINGLE_QUBIT.has(gate)) {
    if (qubits.length !== 1 || clbits.length !== 0 || paramKeys.length !== 0) return null;
  } else if (ROTATIONS.has(gate)) {
    if (qubits.length !== 1 || clbits.length !== 0 || paramKeys.length !== 1 || paramKeys[0] !== "theta") return null;
    const theta = value.params.theta;
    if (typeof theta !== "number" || !Number.isFinite(theta)) return null;
    params = { theta };
  } else if (TWO_QUBIT.has(gate)) {
    if (qubits.length !== 2 || qubits[0] === qubits[1] || clbits.length !== 0 || paramKeys.length !== 0) return null;
  } else if (gate === "measure") {
    if (qubits.length !== 1 || clbits.length !== 1 || paramKeys.length !== 0) return null;
  } else if (gate === "barrier") {
    if (qubits.length < 1 || clbits.length !== 0 || paramKeys.length !== 0) return null;
  }

  return { gate, qubits: [...qubits], clbits: [...clbits], params, moment: value.moment as number };
}

/** Strictly validate browser/project/URL input against the backend gate shapes. */
export function validateCircuitData(parsed: unknown, options: CircuitValidationOptions = {}): CircuitData | null {
  if (!isPlainObject(parsed) || !hasOnlyKeys(parsed, ["num_qubits", "num_clbits", "shots", "operations"])) return null;
  const maxOperations = options.maxOperations ?? MAX_SHARE_OPERATIONS;
  const maxMoment = options.maxMoment ?? MAX_MOMENT;
  if (!Number.isInteger(parsed.num_qubits) || (parsed.num_qubits as number) < LIMITS.composer.minQubits || (parsed.num_qubits as number) > LIMITS.composer.interactiveMaxQubits) return null;
  if (!Number.isInteger(parsed.num_clbits) || (parsed.num_clbits as number) < 0 || (parsed.num_clbits as number) > LIMITS.composer.interactiveMaxClbits) return null;
  if (!Number.isInteger(parsed.shots) || (parsed.shots as number) < LIMITS.shots.min || (parsed.shots as number) > LIMITS.shots.v2Max) return null;
  if (!Array.isArray(parsed.operations) || parsed.operations.length > maxOperations) return null;

  const operations: CircuitOperation[] = [];
  const occupiedQubits = new Set<string>();
  const occupiedClbits = new Set<string>();
  for (const rawOperation of parsed.operations) {
    const operation = normalizeOperation(rawOperation, maxMoment);
    if (!operation) return null;
    if (operation.qubits.some((qubit) => qubit >= (parsed.num_qubits as number))) return null;
    if (operation.clbits.some((clbit) => clbit >= (parsed.num_clbits as number))) return null;
    for (const qubit of operation.qubits) {
      const key = `${operation.moment}:${qubit}`;
      if (occupiedQubits.has(key)) return null;
      occupiedQubits.add(key);
    }
    for (const clbit of operation.clbits) {
      const key = `${operation.moment}:${clbit}`;
      if (occupiedClbits.has(key)) return null;
      occupiedClbits.add(key);
    }
    operations.push(operation);
  }

  return {
    num_qubits: parsed.num_qubits as number,
    num_clbits: parsed.num_clbits as number,
    shots: parsed.shots as number,
    operations: canonicalOperationOrder(operations),
  };
}

export interface BundleValidation {
  ok: boolean;
  definitions?: CustomDefinition[];
  reason?: string;
}

/**
 * Cross-checks a set of untrusted custom gate definitions against a
 * (already-`validateCircuitData`-validated) circuit: every definition must
 * itself be well-formed and internally valid (unitarity, decomposition
 * cycles/depth/expansion — the exact same rules as saving one locally), and
 * every "custom" operation in `circuit` must resolve to a definition in the
 * bundle with a matching qubit/clbit count. Used by the share-link and
 * circuit-import paths so a shared/exported circuit is self-contained rather
 * than depending on the recipient already having the right definitions.
 */
export function validateCircuitBundle(circuit: CircuitData, rawDefinitions: unknown): BundleValidation {
  if (rawDefinitions === undefined) return { ok: true, definitions: [] };
  if (!Array.isArray(rawDefinitions)) return { ok: false, reason: "The bundled custom gate definitions are malformed." };
  if (rawDefinitions.length > MAX_CUSTOM_DEFINITIONS) return { ok: false, reason: `A shared or exported circuit can carry at most ${MAX_CUSTOM_DEFINITIONS} custom gate definitions.` };

  const normalized: CustomDefinition[] = [];
  for (const raw of rawDefinitions) {
    const definition = normalizeCustomDefinition(raw);
    if (!definition) return { ok: false, reason: "One of the bundled custom gate definitions is malformed." };
    normalized.push(definition);
  }
  if (new Set(normalized.map((definition) => definition.id)).size !== normalized.length) {
    return { ok: false, reason: "The bundled custom gate definitions contain duplicate ids." };
  }

  const library = new Map(normalized.map((definition) => [definition.id, definition]));
  for (const definition of normalized) {
    const check = validateDefinition(definition, library);
    if (!check.ok) return { ok: false, reason: `Custom gate "${definition.name}" failed validation: ${check.reason}` };
  }

  for (const operation of circuit.operations) {
    if (operation.gate !== "custom") continue;
    const definition = operation.customId ? library.get(operation.customId) : undefined;
    if (!definition) {
      return { ok: false, reason: `The circuit references a custom gate that was not included in the bundle (id "${operation.customId ?? "unknown"}").` };
    }
    if (operation.qubits.length !== definitionNumQubits(definition) || operation.clbits.length !== definitionNumClbits(definition)) {
      return { ok: false, reason: `"${definition.name}" expects ${definitionNumQubits(definition)} qubit(s) and ${definitionNumClbits(definition)} classical bit(s), but a placed instance does not match.` };
    }
  }

  return { ok: true, definitions: normalized };
}

function compactCircuit(circuit: CircuitData): CompactCircuit {
  return {
    v: 2,
    q: circuit.num_qubits,
    c: circuit.num_clbits,
    s: circuit.shots,
    o: circuit.operations.map((operation) => {
      const gate = GATE_TO_INDEX.get(operation.gate);
      if (gate === undefined) throw new Error("Unsupported gate");
      const tuple: CompactOperation = [gate, operation.moment, operation.qubits];
      if (operation.clbits.length || typeof operation.params.theta === "number") tuple[3] = operation.clbits;
      if (typeof operation.params.theta === "number") tuple[4] = operation.params.theta;
      return tuple;
    }),
  };
}

function expandCompact(value: unknown): unknown {
  if (!isPlainObject(value) || value.v !== 2 || !Array.isArray(value.o)) return value;
  if (!Number.isInteger(value.q) || !Number.isInteger(value.c) || !Number.isInteger(value.s)) return null;
  const operations: CircuitOperation[] = [];
  for (const raw of value.o) {
    if (!Array.isArray(raw) || raw.length < 3 || raw.length > 5) return null;
    const [gateIndex, moment, qubits, clbits = [], theta] = raw;
    if (!Number.isInteger(gateIndex) || typeof GATES[gateIndex as number] !== "string") return null;
    const gate = GATES[gateIndex as number];
    const params = theta === undefined ? {} : { theta };
    operations.push({ gate, moment, qubits, clbits, params } as CircuitOperation);
  }
  return { num_qubits: value.q, num_clbits: value.c, shots: value.s, operations };
}

// Compact v3: used only when a circuit actually contains "custom" operations
// (auto-selected by encodeCircuitLinkCompressed) — a plain object-shaped
// encoding rather than v2's numeric tuples, since custom operations carry a
// variable customId/params shape that doesn't fit the fixed gate-index
// scheme. Custom-free circuits keep encoding as v2 exactly as before, so
// existing links and exports are untouched (true backward compatibility).
interface CompactOperationV3 {
  g: string;
  m: number;
  qb: number[];
  cb: number[];
  p: Record<string, number>;
  cid?: string;
}
interface CompactCircuitV3 {
  v: 3;
  nq: number;
  nc: number;
  s: number;
  o: CompactOperationV3[];
  d: CustomDefinition[];
}

function compactCircuitV3(circuit: CircuitData, definitions: CustomDefinition[]): CompactCircuitV3 {
  return {
    v: 3,
    nq: circuit.num_qubits,
    nc: circuit.num_clbits,
    s: circuit.shots,
    o: circuit.operations.map((operation) => ({
      g: operation.gate,
      m: operation.moment,
      qb: operation.qubits,
      cb: operation.clbits,
      p: operation.params,
      ...(operation.gate === "custom" && operation.customId ? { cid: operation.customId } : {}),
    })),
    d: definitions,
  };
}

/** Structural-only reshape into the plain-object CircuitData shape validateCircuitData expects — semantic validation (including the bundle cross-check) happens after this in the caller. */
function expandCompactV3(value: Record<string, unknown>): { circuit: unknown; definitions: unknown } | null {
  if (!Number.isInteger(value.nq) || !Number.isInteger(value.nc) || !Number.isInteger(value.s) || !Array.isArray(value.o) || !Array.isArray(value.d)) {
    return null;
  }
  const operations: unknown[] = [];
  for (const raw of value.o) {
    if (!isPlainObject(raw) || typeof raw.g !== "string" || !Number.isInteger(raw.m) || !Array.isArray(raw.qb)) return null;
    const operation: Record<string, unknown> = {
      gate: raw.g,
      moment: raw.m,
      qubits: raw.qb,
      clbits: Array.isArray(raw.cb) ? raw.cb : [],
      params: isPlainObject(raw.p) ? raw.p : {},
    };
    if (raw.g === "custom" && typeof raw.cid === "string") operation.customId = raw.cid;
    operations.push(operation);
  }
  return {
    circuit: { num_qubits: value.nq, num_clbits: value.nc, shots: value.s, operations },
    definitions: value.d,
  };
}

function validateForShare(circuit: CircuitData): ShareDecodeResult {
  if (circuit.operations.length > MAX_SHARE_OPERATIONS) {
    return { ok: false, reason: `Share links are capped at ${MAX_SHARE_OPERATIONS} operations; this circuit has ${circuit.operations.length}. Export JSON for larger circuits.` };
  }
  const validated = validateCircuitData(circuit);
  return validated
    ? { ok: true, circuit: validated }
    : { ok: false, reason: "The circuit contains invalid gate shapes, register references, overlaps, or timeline positions." };
}

/** Legacy uncompressed link encoder retained only for backward compatibility tests. */
export function encodeCircuitLink(circuit: CircuitData, origin: string): ShareResult {
  const validated = validateForShare(circuit);
  if (!validated.ok || !validated.circuit) return { ok: false, reason: validated.reason };
  const payload = toBase64Url(JSON.stringify(validated.circuit));
  const url = `${origin}/composer?c=${payload}`;
  return url.length <= MAX_SHARE_URL_LENGTH
    ? { ok: true, url }
    : { ok: false, reason: "The circuit exceeds a safe URL length. Export JSON instead." };
}

export function decodeCircuitParamDetailed(payload: string): ShareDecodeResult {
  if (!payload) return { ok: false, reason: "The legacy share payload is empty." };
  if (payload.length > MAX_SHARE_URL_LENGTH) return { ok: false, reason: "The legacy share payload exceeds the size limit." };
  const json = fromBase64Url(payload);
  if (!json) return { ok: false, reason: "The legacy share payload is not valid base64url text." };
  try {
    const circuit = validateCircuitData(JSON.parse(json));
    return circuit
      ? { ok: true, circuit }
      : { ok: false, reason: "The shared circuit failed strict gate and register validation." };
  } catch {
    return { ok: false, reason: "The legacy share payload does not contain valid JSON." };
  }
}

export function decodeCircuitParam(payload: string): CircuitData | null {
  return decodeCircuitParamDetailed(payload).circuit ?? null;
}

const supportsCompression = () =>
  typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

async function compress(bytes: Uint8Array): Promise<Uint8Array> {
  const readable = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(readable).arrayBuffer());
}

async function decompressWithLimit(bytes: Uint8Array, limit: number): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += chunk.byteLength;
      if (total > limit) {
        await reader.cancel("inflated payload exceeded limit");
        throw new Error("inflated payload exceeded limit");
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/**
 * Versioned compact encoding compressed with deflate-raw. Custom-free
 * circuits always encode as v2 (numeric tuples, unchanged from before custom
 * gates existed); a circuit that places any "custom" operation automatically
 * switches to v3, which embeds the definitions it needs so the link is
 * self-contained. `definitions` should be every definition the circuit's
 * custom operations reference, directly or transitively — see
 * lib/customGateResolve.ts's collectReferencedDefinitions. Passing an
 * incomplete bundle fails the encode with a clear reason rather than
 * producing a link that won't resolve for the recipient.
 */
export async function encodeCircuitLinkCompressed(circuit: CircuitData, origin: string, definitions: CustomDefinition[] = []): Promise<ShareResult> {
  const validated = validateForShare(circuit);
  if (!validated.ok || !validated.circuit) return { ok: false, reason: validated.reason };
  const usesCustom = validated.circuit.operations.some((operation) => operation.gate === "custom");
  if (usesCustom) {
    const bundle = validateCircuitBundle(validated.circuit, definitions);
    if (!bundle.ok) return { ok: false, reason: bundle.reason };
  }
  if (!supportsCompression()) return usesCustom
    ? { ok: false, reason: "This browser cannot create a share link for circuits with custom gates (compression is unavailable). Export JSON instead." }
    : encodeCircuitLink(validated.circuit, origin);
  try {
    const payloadObject = usesCustom ? compactCircuitV3(validated.circuit, definitions) : compactCircuit(validated.circuit);
    const source = new TextEncoder().encode(JSON.stringify(payloadObject));
    const payload = bytesToBase64Url(await compress(source));
    const url = `${origin}/composer?c2=${payload}`;
    return url.length <= MAX_SHARE_URL_LENGTH
      ? { ok: true, url }
      : { ok: false, reason: "The compressed circuit still exceeds the safe URL limit. Export JSON instead." };
  } catch {
    return { ok: false, reason: "This browser could not create a compressed share link. Export JSON instead." };
  }
}

export async function decodeCompressedCircuitParamDetailed(payload: string): Promise<ShareDecodeResult> {
  if (!payload) return { ok: false, reason: "The compressed share payload is empty." };
  if (payload.length > MAX_SHARE_URL_LENGTH) return { ok: false, reason: "The compressed share payload exceeds the size limit." };
  if (!supportsCompression()) return { ok: false, reason: "This browser does not support compressed circuit links." };
  const bytes = base64UrlToBytes(payload);
  if (!bytes) return { ok: false, reason: "The compressed share payload is not valid base64url data." };
  try {
    const inflated = await decompressWithLimit(bytes, MAX_INFLATED_BYTES);
    const json = new TextDecoder("utf-8", { fatal: true }).decode(inflated);
    const parsed = JSON.parse(json) as unknown;

    if (isPlainObject(parsed) && parsed.v === 3) {
      const expanded = expandCompactV3(parsed);
      if (!expanded) return { ok: false, reason: "The shared circuit failed strict gate and register validation." };
      const circuit = validateCircuitData(expanded.circuit);
      if (!circuit) return { ok: false, reason: "The shared circuit failed strict gate and register validation." };
      const bundle = validateCircuitBundle(circuit, expanded.definitions);
      if (!bundle.ok) return { ok: false, reason: bundle.reason };
      return { ok: true, circuit, definitions: bundle.definitions };
    }

    const circuit = validateCircuitData(expandCompact(parsed));
    return circuit
      ? { ok: true, circuit, definitions: [] }
      : { ok: false, reason: "The shared circuit failed strict gate and register validation." };
  } catch (error) {
    const tooLarge = error instanceof Error && error.message.includes("exceeded limit");
    return { ok: false, reason: tooLarge ? "The shared circuit expands beyond the safe size limit." : "The compressed share payload is damaged or unsupported." };
  }
}

export async function decodeCompressedCircuitParam(payload: string): Promise<CircuitData | null> {
  return (await decodeCompressedCircuitParamDetailed(payload)).circuit ?? null;
}
