"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { validateCircuitData } from "@/lib/circuitShare";
import { PRESETS } from "@/lib/presets";
import {
  consumeProjectRecoveryNotice,
  deleteProject as removeStoredProject,
  duplicateProject as duplicateStoredProject,
  getLastActiveProjectId,
  getProject,
  MAX_PROJECT_OPERATIONS,
  renameProject as renameStoredProject,
  saveNewProject,
  setLastActiveProjectId,
  touchProject,
  updateProjectCircuit,
  type ProjectMutation,
} from "@/lib/projects";
import type { CircuitData } from "@/lib/types";

const STORAGE_KEY = "quantum-composer.workspace.v2";
const LEGACY_STORAGE_KEY = "quantum-composer.workspace.v1";
const HISTORY_LIMIT = 80;
const AUTOSAVE_DELAY_MS = 650;

export type SaveState = "restoring" | "saved" | "unsaved" | "saving" | "error";

const EMPTY_CIRCUIT: CircuitData = {
  num_qubits: 2,
  num_clbits: 2,
  shots: 1024,
  operations: [],
};

const cloneCircuit = (circuit: CircuitData): CircuitData =>
  typeof structuredClone === "function"
    ? structuredClone(circuit)
    : JSON.parse(JSON.stringify(circuit)) as CircuitData;

const fingerprint = (circuit: CircuitData): string => JSON.stringify(circuit);

export interface WorkspaceValue {
  circuit: CircuitData;
  setCircuit: Dispatch<SetStateAction<CircuitData>>;
  loadCircuit: (next: CircuitData) => void;
  createProject: (name?: string) => ProjectMutation;
  saveAsProject: (name: string) => ProjectMutation;
  saveActiveProject: () => ProjectMutation;
  openProject: (id: string) => boolean;
  renameProject: (id: string, name: string) => ProjectMutation;
  duplicateProject: (id: string, openCopy?: boolean) => ProjectMutation;
  deleteProject: (id: string) => ProjectMutation<true>;
  detachProject: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  labCircuit: CircuitData | null;
  setLabCircuit: (circuit: CircuitData | null) => void;
  hardwareCircuit: CircuitData | null;
  setHardwareCircuit: (circuit: CircuitData | null) => void;
  hydrated: boolean;
  activeProjectId: string | null;
  activeProjectName: string | null;
  saveState: SaveState;
  lastSavedAt: number | null;
  saveError: string | null;
  storageNotice: string | null;
  projectRevision: number;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [circuit, setCircuitState] = useState<CircuitData>(() => cloneCircuit(PRESETS[1].circuit));
  const [labCircuit, setLabCircuitState] = useState<CircuitData | null>(null);
  const [hardwareCircuit, setHardwareCircuitState] = useState<CircuitData | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectName, setActiveProjectName] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("restoring");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [projectRevision, setProjectRevision] = useState(0);
  const past = useRef<CircuitData[]>([]);
  const future = useRef<CircuitData[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const circuitRef = useRef(circuit);
  const activeProjectRef = useRef(activeProjectId);
  const savedFingerprint = useRef(fingerprint(circuit));
  const autosaveTimer = useRef<number | null>(null);
  circuitRef.current = circuit;
  activeProjectRef.current = activeProjectId;

  const resetHistory = useCallback(() => {
    past.current = [];
    future.current = [];
    setHistoryVersion((version) => version + 1);
  }, []);

  const replaceWithoutHistory = useCallback((next: CircuitData) => {
    const cloned = cloneCircuit(next);
    circuitRef.current = cloned;
    setCircuitState(cloned);
    setLabCircuitState(null);
    setHardwareCircuitState(null);
    resetHistory();
  }, [resetHistory]);

  const commit = useCallback((next: CircuitData) => {
    if (next === circuitRef.current) return;
    past.current.push(cloneCircuit(circuitRef.current));
    const capacity = circuitRef.current.operations.length > 1_000 ? 20 : HISTORY_LIMIT;
    if (past.current.length > capacity) past.current.splice(0, past.current.length - capacity);
    future.current = [];
    circuitRef.current = next;
    setCircuitState(next);
    setLabCircuitState(null);
    setHardwareCircuitState(null);
    setSaveState("unsaved");
    setSaveError(null);
    setHistoryVersion((version) => version + 1);
  }, []);

  const setCircuit = useCallback<Dispatch<SetStateAction<CircuitData>>>((action) => {
    const next = typeof action === "function"
      ? (action as (previous: CircuitData) => CircuitData)(circuitRef.current)
      : action;
    commit(next);
  }, [commit]);

  const loadCircuit = useCallback((next: CircuitData) => commit(cloneCircuit(next)), [commit]);

  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(cloneCircuit(circuitRef.current));
    circuitRef.current = previous;
    setCircuitState(previous);
    setLabCircuitState(null);
    setHardwareCircuitState(null);
    setSaveState("unsaved");
    setSaveError(null);
    setHistoryVersion((version) => version + 1);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(cloneCircuit(circuitRef.current));
    circuitRef.current = next;
    setCircuitState(next);
    setLabCircuitState(null);
    setHardwareCircuitState(null);
    setSaveState("unsaved");
    setSaveError(null);
    setHistoryVersion((version) => version + 1);
  }, []);

  const markPersisted = useCallback((persistedCircuit: CircuitData) => {
    savedFingerprint.current = fingerprint(persistedCircuit);
    setSaveState("saved");
    setSaveError(null);
    setLastSavedAt(Date.now());
  }, []);

  const persistCircuit = useCallback((target: CircuitData, projectId: string | null): ProjectMutation => {
    if (target.operations.length > MAX_PROJECT_OPERATIONS) {
      return { ok: false, reason: `Autosave is capped at ${MAX_PROJECT_OPERATIONS.toLocaleString()} operations. Export this circuit to keep it.` };
    }
    if (projectId) return updateProjectCircuit(projectId, target);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(target));
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof DOMException && error.name === "QuotaExceededError"
          ? "Browser storage is full. Export this circuit before closing the tab."
          : "Browser storage is unavailable. Export this circuit before closing the tab.",
      };
    }
  }, []);

  useEffect(() => {
    let restored = cloneCircuit(PRESETS[1].circuit);
    let restoredProjectId: string | null = null;
    let restoredProjectName: string | null = null;
    try {
      const lastProjectId = getLastActiveProjectId();
      const project = lastProjectId ? getProject(lastProjectId) : null;
      if (project) {
        restored = cloneCircuit(project.circuit);
        restoredProjectId = project.id;
        restoredProjectName = project.name;
        touchProject(project.id);
      } else {
        const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw) {
          const parsed = validateCircuitData(JSON.parse(raw), { maxOperations: MAX_PROJECT_OPERATIONS });
          if (parsed) restored = parsed;
          else setStorageNotice("The anonymous autosave was invalid and was ignored; the default Bell circuit was kept.");
        }
      }
      setStorageNotice((current) => consumeProjectRecoveryNotice() ?? current);
    } catch {
      setStorageNotice("Local workspace storage could not be read. The default Bell circuit was kept.");
    }
    circuitRef.current = restored;
    savedFingerprint.current = fingerprint(restored);
    setCircuitState(restored);
    setActiveProjectId(restoredProjectId);
    activeProjectRef.current = restoredProjectId;
    setActiveProjectName(restoredProjectName);
    setSaveState("saved");
    setLastSavedAt(restoredProjectId ? Date.now() : null);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current);
    const nextFingerprint = fingerprint(circuit);
    if (nextFingerprint === savedFingerprint.current) {
      setSaveState("saved");
      return;
    }
    setSaveState("unsaved");
    autosaveTimer.current = window.setTimeout(() => {
      setSaveState("saving");
      const result = persistCircuit(circuit, activeProjectRef.current);
      if (result.ok) {
        markPersisted(circuit);
        if (activeProjectRef.current) setProjectRevision((version) => version + 1);
      } else {
        setSaveState("error");
        setSaveError(result.reason ?? "Autosave failed.");
      }
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current);
    };
  }, [circuit, hydrated, markPersisted, persistCircuit]);

  const bindProject = useCallback((id: string, name: string, next: CircuitData) => {
    setActiveProjectId(id);
    activeProjectRef.current = id;
    setActiveProjectName(name);
    setLastActiveProjectId(id);
    replaceWithoutHistory(next);
    markPersisted(next);
    setProjectRevision((version) => version + 1);
  }, [markPersisted, replaceWithoutHistory]);

  const createProject = useCallback((name = "Untitled circuit"): ProjectMutation => {
    const next = cloneCircuit(EMPTY_CIRCUIT);
    const result = saveNewProject(name, next);
    if (result.ok && result.value) bindProject(result.value.id, result.value.name, next);
    return result;
  }, [bindProject]);

  const saveAsProject = useCallback((name: string): ProjectMutation => {
    const result = saveNewProject(name, circuitRef.current);
    if (result.ok && result.value) bindProject(result.value.id, result.value.name, circuitRef.current);
    return result;
  }, [bindProject]);

  const saveActiveProject = useCallback((): ProjectMutation => {
    const id = activeProjectRef.current;
    if (!id) return { ok: false, reason: "Name this circuit to create a project before saving manually." };
    setSaveState("saving");
    const result = persistCircuit(circuitRef.current, id);
    if (result.ok) {
      markPersisted(circuitRef.current);
      setProjectRevision((version) => version + 1);
    } else {
      setSaveState("error");
      setSaveError(result.reason ?? "Save failed.");
    }
    return result;
  }, [markPersisted, persistCircuit]);

  const openProject = useCallback((id: string): boolean => {
    const project = getProject(id);
    if (!project) return false;
    touchProject(id);
    bindProject(project.id, project.name, project.circuit);
    return true;
  }, [bindProject]);

  const renameProject = useCallback((id: string, name: string): ProjectMutation => {
    const result = renameStoredProject(id, name);
    if (result.ok && result.value) {
      if (id === activeProjectRef.current) setActiveProjectName(result.value.name);
      setProjectRevision((version) => version + 1);
    }
    return result;
  }, []);

  const duplicateProject = useCallback((id: string, openCopy = false): ProjectMutation => {
    const result = duplicateStoredProject(id);
    if (result.ok && result.value) {
      setProjectRevision((version) => version + 1);
      if (openCopy) bindProject(result.value.id, result.value.name, result.value.circuit);
    }
    return result;
  }, [bindProject]);

  const detachProject = useCallback(() => {
    setActiveProjectId(null);
    activeProjectRef.current = null;
    setActiveProjectName(null);
    setLastActiveProjectId(null);
    savedFingerprint.current = "";
    setSaveState("unsaved");
  }, []);

  const deleteProject = useCallback((id: string): ProjectMutation<true> => {
    const result = removeStoredProject(id);
    if (result.ok) {
      if (id === activeProjectRef.current) detachProject();
      setProjectRevision((version) => version + 1);
    }
    return result;
  }, [detachProject]);

  const setLabCircuit = useCallback((next: CircuitData | null) => {
    setLabCircuitState(next ? cloneCircuit(next) : null);
  }, []);

  const setHardwareCircuit = useCallback((next: CircuitData | null) => {
    setHardwareCircuitState(next ? cloneCircuit(next) : null);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  const value = useMemo<WorkspaceValue>(() => ({
    circuit,
    setCircuit,
    loadCircuit,
    createProject,
    saveAsProject,
    saveActiveProject,
    openProject,
    renameProject,
    duplicateProject,
    deleteProject,
    detachProject,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    labCircuit,
    setLabCircuit,
    hardwareCircuit,
    setHardwareCircuit,
    hydrated,
    activeProjectId,
    activeProjectName,
    saveState,
    lastSavedAt,
    saveError,
    storageNotice,
    projectRevision,
    // historyVersion is intentionally listed: canUndo/canRedo read mutable refs
    // and must re-derive whenever the history stacks change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [
    circuit, setCircuit, loadCircuit, createProject, saveAsProject, saveActiveProject,
    openProject, renameProject, duplicateProject, deleteProject, detachProject, undo,
    redo, labCircuit, setLabCircuit, hardwareCircuit, setHardwareCircuit, hydrated, activeProjectId, activeProjectName,
    saveState, lastSavedAt, saveError, storageNotice, projectRevision, historyVersion,
  ]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
