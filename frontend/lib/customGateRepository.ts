// Persistence boundary for custom gates/operations — deliberately mirrors
// lib/projects.ts's shape (versioned envelope, corrupt-store recovery via a
// sessionStorage notice + a localStorage backup copy, ProjectMutation-style
// results) so a future cloud-sync adapter could implement the same
// `CustomGateRepository` interface without touching call sites. Stores only
// declarative JSON — never a function body, never anything eval'd.
import { normalizeCustomDefinition, validateDefinition } from "./customGateValidation";
import { MAX_CUSTOM_DEFINITIONS, customGateRef, parseCustomGateRef, type CustomDefinition } from "./customGates";

const STORE_KEY = "quantum-composer.custom-gates.v1";
const RECOVERY_NOTICE_KEY = "quantum-composer.custom-gates.recovery-notice.v1";
const RECOVERY_PREFIX = "quantum-composer.custom-gates.recovery.";
const RECENT_KEY = "quantum-composer.custom-gates.recent.v1";
const MAX_RECENT = 12;
export const CUSTOM_GATE_LIBRARY_EVENT = "quantum-composer:custom-gates-changed";

interface DefinitionEnvelope {
  version: 1;
  definitions: CustomDefinition[];
}

export interface DefinitionMutation<T = CustomDefinition> {
  ok: boolean;
  value?: T;
  reason?: string;
}

/** A narrow persistence boundary that could be replaced by a cloud adapter later, same shape as ProjectRepository. */
export interface CustomGateRepository {
  list(): CustomDefinition[];
  get(id: string): CustomDefinition | null;
  save(def: CustomDefinition): DefinitionMutation;
  rename(id: string, name: string): DefinitionMutation;
  duplicate(id: string): DefinitionMutation;
  remove(id: string): DefinitionMutation<true>;
  setFavorite(id: string, favorite: boolean): DefinitionMutation;
  recentIds(): string[];
  touch(id: string): void;
  exportAll(): string;
  importMany(json: string): DefinitionMutation<{ imported: number; skipped: number; renamed: string[]; idMap: Record<string, string> }>;
}

function notifyLibraryChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CUSTOM_GATE_LIBRARY_EVENT));
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `cg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recoverCorruptStore(raw: string, detail: string): void {
  try {
    const recoveryKey = `${RECOVERY_PREFIX}${Date.now()}`;
    window.localStorage.setItem(recoveryKey, raw);
    window.sessionStorage.setItem(
      RECOVERY_NOTICE_KEY,
      `Saved custom gates could not be read (${detail}). A recovery copy was kept as ${recoveryKey}; the library was reset safely.`,
    );
    window.localStorage.removeItem(STORE_KEY);
  } catch {
    // Storage may be unavailable entirely — the caller still gets an empty library.
  }
}

function parseStore(raw: string): CustomDefinition[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlainObject(parsed) || parsed.version !== 1 || !Array.isArray(parsed.definitions)) return null;
    const definitions = parsed.definitions.map(normalizeCustomDefinition);
    if (definitions.some((def) => def === null)) return null;
    const unique = new Set(definitions.map((def) => def!.id));
    if (unique.size !== definitions.length || definitions.length > MAX_CUSTOM_DEFINITIONS) return null;
    return definitions as CustomDefinition[];
  } catch {
    return null;
  }
}

function readStore(): CustomDefinition[] {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const definitions = parseStore(raw);
    if (definitions) return definitions;
    recoverCorruptStore(raw, "invalid v1 structure");
    return [];
  } catch {
    return [];
  }
}

function writeStore(definitions: CustomDefinition[]): DefinitionMutation<true> {
  try {
    const previous = window.localStorage.getItem(STORE_KEY);
    if (previous && !parseStore(previous)) return { ok: false, reason: "The damaged library could not be backed up. Export its complete data before replacing it." };
    const envelope: DefinitionEnvelope = { version: 1, definitions };
    window.localStorage.setItem(STORE_KEY, JSON.stringify(envelope));
    return { ok: true, value: true };
  } catch (error) {
    const reason = error instanceof DOMException && error.name === "QuotaExceededError"
      ? "Browser storage is full. Export the library, then remove an older custom gate."
      : "Browser storage is unavailable, so the custom gate could not be saved.";
    return { ok: false, reason };
  }
}

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeRecent(ids: string[]): void {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, MAX_RECENT)));
  } catch {
    // Recents are convenience state only.
  }
}

function findIndex(definitions: CustomDefinition[], id: string): number {
  return definitions.findIndex((def) => def.id === id);
}

function libraryMap(definitions: CustomDefinition[]): Map<string, CustomDefinition> {
  return new Map(definitions.map((def) => [def.id, def]));
}

/** Content equality ignoring volatile bookkeeping fields, so re-importing the same bundle twice (e.g. reopening a share link) is idempotent instead of piling up duplicates. */
function definitionsEquivalent(a: CustomDefinition, b: CustomDefinition): boolean {
  const normalize = (def: CustomDefinition): CustomDefinition => ({ ...def, favorite: false, createdAt: 0, updatedAt: 0 });
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

export const localCustomGateRepository: CustomGateRepository = {
  list: () => readStore().sort((a, b) => b.updatedAt - a.updatedAt),

  get: (id) => readStore().find((def) => def.id === id) ?? null,

  save: (def) => {
    const definitions = readStore();
    const others = definitions.filter((d) => d.id !== def.id);
    const check = validateDefinition(def, libraryMap([...others, def]));
    if (!check.ok) return { ok: false, reason: check.reason };
    const index = findIndex(definitions, def.id);
    const now = Date.now();
    const next: CustomDefinition = { ...def, updatedAt: now, createdAt: index >= 0 ? definitions[index].createdAt : (def.createdAt || now) };
    if (index >= 0) {
      if (definitions.length > MAX_CUSTOM_DEFINITIONS) return { ok: false, reason: `Custom gates are capped at ${MAX_CUSTOM_DEFINITIONS}.` };
      definitions[index] = next;
    } else {
      if (definitions.length >= MAX_CUSTOM_DEFINITIONS) return { ok: false, reason: `Custom gates are capped at ${MAX_CUSTOM_DEFINITIONS}.` };
      definitions.push(next);
    }
    const written = writeStore(definitions);
    if (written.ok) notifyLibraryChanged();
    return written.ok ? { ok: true, value: next } : { ok: false, reason: written.reason };
  },

  rename: (id, name) => {
    const definitions = readStore();
    const index = findIndex(definitions, id);
    if (index < 0) return { ok: false, reason: "That custom gate no longer exists." };
    const trimmed = name.trim().slice(0, 60);
    if (!trimmed) return { ok: false, reason: "Name cannot be empty." };
    const next = { ...definitions[index], name: trimmed, updatedAt: Date.now() };
    definitions[index] = next;
    const written = writeStore(definitions);
    if (written.ok) notifyLibraryChanged();
    return written.ok ? { ok: true, value: next } : { ok: false, reason: written.reason };
  },

  duplicate: (id) => {
    const source = localCustomGateRepository.get(id);
    if (!source) return { ok: false, reason: "That custom gate no longer exists." };
    const now = Date.now();
    const copy: CustomDefinition = { ...source, id: makeId(), name: `${source.name} copy`, createdAt: now, updatedAt: now, favorite: false };
    return localCustomGateRepository.save(copy);
  },

  remove: (id) => {
    const definitions = readStore();
    if (findIndex(definitions, id) < 0) return { ok: false, reason: "That custom gate no longer exists." };
    if (definitions.some(def => def.kind !== "matrix" && def.steps.some(step => parseCustomGateRef(step.gate) === id))) {
      return { ok: false, reason: "Another custom definition depends on this gate. Remove or update that dependency first." };
    }
    const written = writeStore(definitions.filter((def) => def.id !== id));
    if (written.ok) {
      writeRecent(readRecent().filter((recentId) => recentId !== id));
      notifyLibraryChanged();
    }
    return written;
  },

  setFavorite: (id, favorite) => {
    const definitions = readStore();
    const index = findIndex(definitions, id);
    if (index < 0) return { ok: false, reason: "That custom gate no longer exists." };
    const next = { ...definitions[index], favorite, updatedAt: definitions[index].updatedAt };
    definitions[index] = next;
    const written = writeStore(definitions);
    if (written.ok) notifyLibraryChanged();
    return written.ok ? { ok: true, value: next } : { ok: false, reason: written.reason };
  },

  recentIds: () => {
    const existing = new Set(readStore().map((def) => def.id));
    return readRecent().filter((id) => existing.has(id));
  },

  touch: (id) => {
    writeRecent([id, ...readRecent().filter((recentId) => recentId !== id)]);
    notifyLibraryChanged();
  },

  exportAll: () => {
    const envelope: DefinitionEnvelope = { version: 1, definitions: readStore() };
    return JSON.stringify(envelope, null, 2);
  },

  importMany: (json) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { ok: false, reason: "That file is not valid JSON." };
    }
    const incoming = isPlainObject(parsed) && parsed.version === 1 && Array.isArray(parsed.definitions) && parsed.definitions.length <= MAX_CUSTOM_DEFINITIONS
      ? parsed.definitions.map(normalizeCustomDefinition)
      : null;
    if (!incoming || incoming.some((def) => def === null)) {
      return { ok: false, reason: "That file is not a recognized custom-gate library export." };
    }
    const existing = readStore();
    const definitions = incoming as CustomDefinition[];
    if (new Set(definitions.map(def => def.id)).size !== definitions.length) {
      return { ok: false, reason: "The imported library contains duplicate definition IDs." };
    }
    const existingMap = libraryMap(existing);
    const incomingIds = new Set(definitions.map(def => def.id));
    for (const def of definitions) {
      if (def.kind !== "matrix" && def.steps.some(step => {
        const child = parseCustomGateRef(step.gate);
        return child !== null && !incomingIds.has(child);
      })) return { ok: false, reason: `Imported definition "${def.name}" is missing a bundled dependency.` };
    }
    const idMap: Record<string, string> = {};
    for (const def of definitions) {
      const previous = existingMap.get(def.id);
      idMap[def.id] = previous && !definitionsEquivalent(previous, def) ? makeId() : def.id;
    }
    // A parent identical in isolation is different when one of its children
    // was remapped. Propagate that change through the entire dependency graph.
    let changed = true;
    while (changed) {
      changed = false;
      for (const def of definitions) {
        if (def.kind === "matrix" || idMap[def.id] !== def.id || !existingMap.has(def.id)) continue;
        if (def.steps.some(step => {
          const child = parseCustomGateRef(step.gate);
          return child !== null && child in idMap && idMap[child] !== child;
        })) { idMap[def.id] = makeId(); changed = true; }
      }
    }
    const renamed: string[] = [];
    const names = new Set(existing.map(def => def.name.toLowerCase()));
    const merged = [...existing];
    for (const def of definitions) {
      if (idMap[def.id] === def.id && existingMap.has(def.id)) continue;
      let candidate = { ...def, id: idMap[def.id] };
      if (candidate.kind !== "matrix") {
        candidate = { ...candidate, steps: candidate.steps.map(step => {
          const child = parseCustomGateRef(step.gate);
          return child === null ? step : { ...step, gate: customGateRef(idMap[child]) };
        }) };
      }
      if (names.has(candidate.name.toLowerCase())) {
        candidate = { ...candidate, name: `${candidate.name.slice(0, 45)} (imported)` };
        renamed.push(candidate.name);
      }
      names.add(candidate.name.toLowerCase());
      merged.push(candidate);
    }
    if (merged.length > MAX_CUSTOM_DEFINITIONS) {
      return { ok: false, reason: `Import would exceed the ${MAX_CUSTOM_DEFINITIONS}-gate limit. No definitions were imported.` };
    }
    const mergedMap = libraryMap(merged);
    for (const def of merged) {
      const check = validateDefinition(def, mergedMap);
      if (!check.ok) return { ok: false, reason: check.reason };
    }
    const imported = definitions.length;
    const skipped = 0;

    const written = writeStore(merged);
    if (!written.ok) return { ok: false, reason: written.reason };
    notifyLibraryChanged();
    return { ok: true, value: { imported, skipped, renamed, idMap } };
  },
};

export function consumeCustomGateRecoveryNotice(): string | null {
  try {
    const notice = window.sessionStorage.getItem(RECOVERY_NOTICE_KEY);
    if (notice) window.sessionStorage.removeItem(RECOVERY_NOTICE_KEY);
    return notice;
  } catch {
    return null;
  }
}
