import { validateCircuitData } from "./circuitShare";
import { localCustomGateRepository } from "./customGateRepository";
import { collectReferencedDefinitions, resolveCustomOperations } from "./customGateResolve";
import { normalizeCustomDefinition } from "./customGateValidation";
import type { CustomDefinition } from "./customGates";
import type { CircuitData } from "./types";

const STORE_KEY = "quantum-composer.projects.v2";
const LEGACY_STORE_KEY = "quantum-composer.projects.v1";
const LAST_ACTIVE_KEY = "quantum-composer.projects.last-active.v1";
const RECOVERY_NOTICE_KEY = "quantum-composer.projects.recovery-notice.v1";
const RECOVERY_PREFIX = "quantum-composer.projects.recovery.";
export const MAX_PROJECTS = 100;
export const MAX_PROJECT_OPERATIONS = 5_000;

export interface Project {
  id: string;
  name: string;
  circuit: CircuitData;
  definitions?: CustomDefinition[];
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
}

interface ProjectEnvelope {
  version: 2;
  projects: Project[];
}

export interface ProjectMutation<T = Project> {
  ok: boolean;
  value?: T;
  reason?: string;
}

/** A narrow persistence boundary that can be replaced by a cloud adapter later. */
export interface ProjectRepository {
  list(): Project[];
  get(id: string): Project | null;
  create(name: string, circuit: CircuitData): ProjectMutation;
  save(id: string, circuit: CircuitData): ProjectMutation;
  rename(id: string, name: string): ProjectMutation;
  duplicate(id: string): ProjectMutation;
  remove(id: string): ProjectMutation<true>;
  touch(id: string): ProjectMutation;
}

const cloneCircuit = (circuit: CircuitData): CircuitData =>
  typeof structuredClone === "function"
    ? structuredClone(circuit)
    : JSON.parse(JSON.stringify(circuit)) as CircuitData;

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeName(name: string, fallback = "Untitled circuit"): string {
  const normalized = name.trim().replace(/\s+/g, " ").slice(0, 80);
  return normalized || fallback;
}

function normalizeProject(value: unknown): Project | null {
  if (typeof value !== "object" || value === null) return null;
  const project = value as Record<string, unknown>;
  if (
    typeof project.id !== "string" || !project.id ||
    typeof project.name !== "string" ||
    typeof project.createdAt !== "number" || !Number.isFinite(project.createdAt) ||
    typeof project.updatedAt !== "number" || !Number.isFinite(project.updatedAt)
  ) return null;
  const circuit = validateCircuitData(project.circuit, { maxOperations: MAX_PROJECT_OPERATIONS });
  if (!circuit) return null;
  const definitions = project.definitions === undefined ? undefined : Array.isArray(project.definitions) ? project.definitions.map(normalizeCustomDefinition) : null;
  if (definitions === null || definitions?.some(def => def === null)) return null;
  if (definitions && !resolveCustomOperations(circuit, new Map(definitions.map(def => [def!.id, def!]))).ok) return null;
  const lastOpenedAt = typeof project.lastOpenedAt === "number" && Number.isFinite(project.lastOpenedAt)
    ? project.lastOpenedAt
    : project.updatedAt;
  return {
    id: project.id,
    name: normalizeName(project.name),
    circuit,
    definitions: definitions as CustomDefinition[] | undefined,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    lastOpenedAt,
  };
}

function recoverCorruptStore(raw: string, detail: string): void {
  try {
    const recoveryKey = `${RECOVERY_PREFIX}${Date.now()}`;
    window.localStorage.setItem(recoveryKey, raw);
    window.sessionStorage.setItem(
      RECOVERY_NOTICE_KEY,
      `Saved projects could not be read (${detail}). A recovery copy was kept as ${recoveryKey}; the project list was reset safely.`,
    );
    window.localStorage.removeItem(STORE_KEY);
  } catch {
    // Storage may be unavailable entirely. The caller still gets an empty store.
  }
}

function parseStore(raw: string): Project[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const values = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null && (parsed as { version?: unknown }).version === 2
        ? (parsed as { projects?: unknown }).projects
        : null;
    if (!Array.isArray(values)) return null;
    const projects = values.map(normalizeProject);
    if (projects.some((project) => project === null)) return null;
    const unique = new Set(projects.map((project) => project!.id));
    if (unique.size !== projects.length || projects.length > MAX_PROJECTS) return null;
    return projects as Project[];
  } catch {
    return null;
  }
}

function readStore(): Project[] {
  try {
    const current = window.localStorage.getItem(STORE_KEY);
    if (current) {
      const projects = parseStore(current);
      if (projects) return projects;
      recoverCorruptStore(current, "invalid v2 structure");
      return [];
    }

    const legacy = window.localStorage.getItem(LEGACY_STORE_KEY);
    if (!legacy) return [];
    const projects = parseStore(legacy);
    if (!projects) {
      recoverCorruptStore(legacy, "invalid legacy structure");
      return [];
    }
    const migrated = writeStore(projects);
    if (migrated.ok) window.localStorage.removeItem(LEGACY_STORE_KEY);
    return projects;
  } catch {
    return [];
  }
}

function writeStore(projects: Project[]): ProjectMutation<true> {
  try {
    const previous = window.localStorage.getItem(STORE_KEY);
    if (previous && !parseStore(previous)) return { ok: false, reason: "The damaged project store could not be backed up. Export its complete data before replacing it." };
    const envelope: ProjectEnvelope = { version: 2, projects };
    window.localStorage.setItem(STORE_KEY, JSON.stringify(envelope));
    return { ok: true, value: true };
  } catch (error) {
    const reason = error instanceof DOMException && error.name === "QuotaExceededError"
      ? "Browser storage is full. Export a project, then remove an older local project."
      : "Browser storage is unavailable, so the project could not be saved.";
    return { ok: false, reason };
  }
}

function findProject(projects: Project[], id: string): number {
  return projects.findIndex((project) => project.id === id);
}

function snapshotDefinitions(circuit: CircuitData): CustomDefinition[] {
  const library = new Map(localCustomGateRepository.list().map(def => [def.id, def]));
  const resolved = resolveCustomOperations(circuit, library);
  if (!resolved.ok) throw new Error(resolved.reason);
  return collectReferencedDefinitions(circuit, library);
}

/** Restore the saved physics, even if its shared definitions were edited. */
export function restoreProjectCircuit(project: Project): CircuitData {
  if (!project.definitions?.length) return cloneCircuit(project.circuit);
  const imported = localCustomGateRepository.importMany(JSON.stringify({ version: 1, definitions: project.definitions }));
  if (!imported.ok || !imported.value) throw new Error(imported.reason ?? "Saved definitions could not be restored.");
  const ids = imported.value.idMap;
  return { ...cloneCircuit(project.circuit), operations: project.circuit.operations.map(op =>
    op.gate === "custom" && op.customId ? { ...op, customId: ids[op.customId] ?? op.customId } : op) };
}

// Per-tab baselines detect another tab's changes before overwriting a project.
const observedContent = new Map<string, string>();
const contentVersion = (project: Project) => JSON.stringify([project.circuit, project.definitions]);

export const localProjectRepository: ProjectRepository = {
  list: () => readStore().sort((a, b) => b.lastOpenedAt - a.lastOpenedAt || b.updatedAt - a.updatedAt),
  get: (id) => {
    const project = readStore().find(project => project.id === id) ?? null;
    if (project) observedContent.set(id, contentVersion(project));
    return project;
  },
  create: (name, circuit) => {
    const validated = validateCircuitData(circuit, { maxOperations: MAX_PROJECT_OPERATIONS });
    if (!validated) return { ok: false, reason: "The circuit exceeds local project limits or is invalid." };
    let definitions: CustomDefinition[];
    try { definitions = snapshotDefinitions(validated); } catch (error) { return { ok: false, reason: String(error) }; }
    const projects = readStore();
    if (projects.length >= MAX_PROJECTS) return { ok: false, reason: `Local projects are capped at ${MAX_PROJECTS}.` };
    const now = Date.now();
    const project: Project = {
      id: makeId(),
      name: normalizeName(name),
      circuit: cloneCircuit(validated),
      definitions,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    };
    const written = writeStore([...projects, project]);
    if (written.ok) observedContent.set(project.id, contentVersion(project));
    return written.ok ? { ok: true, value: project } : { ok: false, reason: written.reason };
  },
  save: (id, circuit) => {
    const validated = validateCircuitData(circuit, { maxOperations: MAX_PROJECT_OPERATIONS });
    if (!validated) return { ok: false, reason: "The circuit exceeds local project limits or is invalid." };
    const projects = readStore();
    const index = findProject(projects, id);
    if (index < 0) return { ok: false, reason: "That project no longer exists." };
    const baseline = observedContent.get(id);
    if (baseline && baseline !== contentVersion(projects[index])) return { ok: false, reason: "This project changed in another tab. Export your current circuit before reopening the saved version." };
    let definitions: CustomDefinition[];
    try { definitions = snapshotDefinitions(validated); } catch (error) { return { ok: false, reason: String(error) }; }
    const next = { ...projects[index], circuit: cloneCircuit(validated), definitions, updatedAt: Date.now() };
    projects[index] = next;
    const written = writeStore(projects);
    if (written.ok) observedContent.set(id, contentVersion(next));
    return written.ok ? { ok: true, value: next } : { ok: false, reason: written.reason };
  },
  rename: (id, name) => {
    const projects = readStore();
    const index = findProject(projects, id);
    if (index < 0) return { ok: false, reason: "That project no longer exists." };
    const next = { ...projects[index], name: normalizeName(name, projects[index].name), updatedAt: Date.now() };
    projects[index] = next;
    const written = writeStore(projects);
    return written.ok ? { ok: true, value: next } : { ok: false, reason: written.reason };
  },
  duplicate: (id) => {
    const source = localProjectRepository.get(id);
    if (!source) return { ok: false, reason: "That project no longer exists." };
    try { return localProjectRepository.create(`${source.name} copy`, restoreProjectCircuit(source)); }
    catch (error) { return { ok: false, reason: String(error) }; }
  },
  remove: (id) => {
    const projects = readStore();
    if (findProject(projects, id) < 0) return { ok: false, reason: "That project no longer exists." };
    const written = writeStore(projects.filter((project) => project.id !== id));
    if (written.ok && getLastActiveProjectId() === id) setLastActiveProjectId(null);
    return written;
  },
  touch: (id) => {
    const projects = readStore();
    const index = findProject(projects, id);
    if (index < 0) return { ok: false, reason: "That project no longer exists." };
    const next = { ...projects[index], lastOpenedAt: Date.now() };
    projects[index] = next;
    const written = writeStore(projects);
    return written.ok ? { ok: true, value: next } : { ok: false, reason: written.reason };
  },
};

export const listProjects = () => localProjectRepository.list();
export const searchProjects = (query: string) => {
  const needle = query.trim().toLowerCase();
  return listProjects().filter((project) => !needle || project.name.toLowerCase().includes(needle));
};
export const getProject = (id: string) => localProjectRepository.get(id);
export const saveNewProject = (name: string, circuit: CircuitData) => localProjectRepository.create(name, circuit);
export const updateProjectCircuit = (id: string, circuit: CircuitData) => localProjectRepository.save(id, circuit);
export const renameProject = (id: string, name: string) => localProjectRepository.rename(id, name);
export const duplicateProject = (id: string) => localProjectRepository.duplicate(id);
export const deleteProject = (id: string) => localProjectRepository.remove(id);
export const touchProject = (id: string) => localProjectRepository.touch(id);

export function consumeProjectRecoveryNotice(): string | null {
  try {
    const notice = window.sessionStorage.getItem(RECOVERY_NOTICE_KEY);
    if (notice) window.sessionStorage.removeItem(RECOVERY_NOTICE_KEY);
    return notice;
  } catch {
    return null;
  }
}

export function getLastActiveProjectId(): string | null {
  try {
    return window.localStorage.getItem(LAST_ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setLastActiveProjectId(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(LAST_ACTIVE_KEY, id);
    else window.localStorage.removeItem(LAST_ACTIVE_KEY);
  } catch {
    // The active marker is convenience state; project data remains authoritative.
  }
}
