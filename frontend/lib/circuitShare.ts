import { LIMITS } from "./constants";
import type { CircuitData, CircuitOperation, GateName } from "./types";

const GATES = ["x", "y", "z", "h", "s", "t", "rx", "ry", "rz", "cx", "cz", "swap", "measure", "barrier"] as const;
const GATE_SET: ReadonlySet<string> = new Set(GATES);
const SINGLE_QUBIT = new Set<GateName>(["x", "y", "z", "h", "s", "t"]);
const ROTATIONS = new Set<GateName>(["rx", "ry", "rz"]);
const TWO_QUBIT = new Set<GateName>(["cx", "cz", "swap"]);
const GATE_TO_INDEX = new Map<GateName, number>(GATES.map((gate, index) => [gate, index]));

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
  if (!isPlainObject(value) || !hasOnlyKeys(value, ["gate", "qubits", "clbits", "params", "moment"])) return null;
  if (typeof value.gate !== "string" || !GATE_SET.has(value.gate)) return null;
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
  const occupied = new Set<string>();
  for (const rawOperation of parsed.operations) {
    const operation = normalizeOperation(rawOperation, maxMoment);
    if (!operation) return null;
    if (operation.qubits.some((qubit) => qubit >= (parsed.num_qubits as number))) return null;
    if (operation.clbits.some((clbit) => clbit >= (parsed.num_clbits as number))) return null;
    for (const qubit of operation.qubits) {
      const key = `${operation.moment}:${qubit}`;
      if (occupied.has(key)) return null;
      occupied.add(key);
    }
    operations.push(operation);
  }

  return {
    num_qubits: parsed.num_qubits as number,
    num_clbits: parsed.num_clbits as number,
    shots: parsed.shots as number,
    operations,
  };
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

/** Versioned compact tuple encoding compressed with deflate-raw. */
export async function encodeCircuitLinkCompressed(circuit: CircuitData, origin: string): Promise<ShareResult> {
  const validated = validateForShare(circuit);
  if (!validated.ok || !validated.circuit) return { ok: false, reason: validated.reason };
  if (!supportsCompression()) return encodeCircuitLink(validated.circuit, origin);
  try {
    const source = new TextEncoder().encode(JSON.stringify(compactCircuit(validated.circuit)));
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
    const circuit = validateCircuitData(expandCompact(JSON.parse(json)));
    return circuit
      ? { ok: true, circuit }
      : { ok: false, reason: "The shared circuit failed strict gate and register validation." };
  } catch (error) {
    const tooLarge = error instanceof Error && error.message.includes("exceeded limit");
    return { ok: false, reason: tooLarge ? "The shared circuit expands beyond the safe size limit." : "The compressed share payload is damaged or unsupported." };
  }
}

export async function decodeCompressedCircuitParam(payload: string): Promise<CircuitData | null> {
  return (await decodeCompressedCircuitParamDetailed(payload)).circuit ?? null;
}
