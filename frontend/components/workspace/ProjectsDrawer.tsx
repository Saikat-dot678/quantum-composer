"use client";

import { useMemo, useRef, useState } from "react";
import { validateCircuitBundle, validateCircuitData } from "@/lib/circuitShare";
import { canonicalizeCircuit } from "@/lib/circuitOrdering";
import { localCustomGateRepository } from "@/lib/customGateRepository";
import { collectReferencedDefinitions } from "@/lib/customGateResolve";
import { listProjects, MAX_PROJECT_OPERATIONS, type Project } from "@/lib/projects";
import type { CircuitData } from "@/lib/types";
import { Button } from "@/components/ui/primitives";
import { useToast } from "./ToastProvider";
import { useWorkspace } from "./WorkspaceProvider";
import { ModalPortal, useModalLifecycle } from "./Modal";

const CIRCUIT_BUNDLE_FORMAT = "quantum-composer-circuit";

function remapCustomIds(circuit: CircuitData, idMap: Record<string, string>): CircuitData {
  return {
    ...circuit,
    operations: circuit.operations.map((operation) =>
      operation.gate === "custom" && operation.customId && idMap[operation.customId]
        ? { ...operation, customId: idMap[operation.customId] }
        : operation),
  };
}

function formatWhen(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp);
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  if (delta < 604_800_000) return `${Math.floor(delta / 86_400_000)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function projectSummary(project: Project): string {
  return `${project.circuit.num_qubits}q · ${project.circuit.num_clbits}c · ${project.circuit.operations.length} ops`;
}

export function ProjectsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const workspace = useWorkspace();
  const { pushToast } = useToast();
  const [query, setQuery] = useState("");
  const [saveName, setSaveName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useModalLifecycle(open, panelRef, onClose, searchRef);

  const projects = useMemo(() => {
    void version;
    void workspace.projectRevision;
    if (typeof window === "undefined") return [] as Project[];
    const needle = query.trim().toLowerCase();
    return listProjects().filter((project) => !needle || project.name.toLowerCase().includes(needle));
  }, [query, version, workspace.projectRevision]);

  if (!open) return null;
  const refresh = () => setVersion((value) => value + 1);

  function notifyFailure(reason?: string) {
    pushToast(reason ?? "The project operation could not be completed.", "error");
  }

  function saveAs() {
    if (!saveName.trim()) {
      pushToast("Give the project a name first.", "error");
      return;
    }
    const result = workspace.saveAsProject(saveName);
    if (!result.ok || !result.value) return notifyFailure(result.reason);
    pushToast(`Saved “${result.value.name}”. Future edits autosave here.`, "success");
    setSaveName("");
    refresh();
  }

  function createBlank() {
    const result = workspace.createProject("Untitled circuit");
    if (!result.ok || !result.value) return notifyFailure(result.reason);
    pushToast("Created a blank project. Rename it when you are ready.", "success");
    onClose();
  }

  function saveNow() {
    const result = workspace.saveActiveProject();
    if (result.ok) pushToast("Project saved.", "success");
    else notifyFailure(result.reason);
  }

  function exportCircuit() {
    // A circuit with no custom gates exports as the exact same plain
    // CircuitData shape as before (backward compatible); one that places any
    // custom gate switches to a self-contained bundle embedding every
    // definition it (transitively) needs, so re-importing it elsewhere
    // doesn't depend on the sender's local custom-gate library.
    const library = new Map(localCustomGateRepository.list().map((definition) => [definition.id, definition]));
    const definitions = collectReferencedDefinitions(workspace.circuit, library);
    const orderedCircuit = canonicalizeCircuit(workspace.circuit);
    const payload = definitions.length > 0
      ? { format: CIRCUIT_BUNDLE_FORMAT, version: 1, circuit: orderedCircuit, definitions }
      : orderedCircuit;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(workspace.activeProjectName ?? "quantum-circuit").replace(/[^\w-]+/g, "_")}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    pushToast(`Circuit exported as validated JSON${definitions.length > 0 ? ` with ${definitions.length} custom gate definition${definitions.length === 1 ? "" : "s"}` : ""}.`, "success");
  }

  async function importCircuit(file: File) {
    if (file.size > 2_000_000) {
      notifyFailure("Circuit files are capped at 2 MB.");
      return;
    }
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const isBundle = typeof parsed === "object" && parsed !== null && (parsed as { format?: unknown }).format === CIRCUIT_BUNDLE_FORMAT;
      const rawCircuit = isBundle ? (parsed as { circuit?: unknown }).circuit : parsed;
      const circuit = validateCircuitData(rawCircuit, { maxOperations: MAX_PROJECT_OPERATIONS });
      if (!circuit) {
        notifyFailure("That file failed strict gate, register, timeline, or operation-limit validation.");
        return;
      }

      let finalCircuit = circuit;
      if (isBundle) {
        const bundle = validateCircuitBundle(circuit, (parsed as { definitions?: unknown }).definitions);
        if (!bundle.ok) {
          notifyFailure(bundle.reason);
          return;
        }
        if (bundle.definitions && bundle.definitions.length > 0) {
          const imported = localCustomGateRepository.importMany(JSON.stringify({ version: 1, definitions: bundle.definitions }));
          if (!imported.ok || !imported.value) {
            notifyFailure(imported.reason ?? "The circuit's custom gate definitions could not be imported.");
            return;
          }
          finalCircuit = remapCustomIds(circuit, imported.value.idMap);
        }
      }

      workspace.detachProject();
      workspace.loadCircuit(finalCircuit);
      pushToast(`Imported ${file.name}: ${finalCircuit.num_qubits} qubits and ${finalCircuit.operations.length} operations.`, "success");
      onClose();
    } catch {
      notifyFailure("That file is not valid JSON.");
    }
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm"
        role="presentation"
        onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      >
        <section
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="projects-title"
          tabIndex={-1}
          className="drawer-enter absolute inset-y-0 right-0 flex w-[min(34rem,100vw)] flex-col border-l border-lab-borderStrong bg-lab-panel shadow-[-32px_0_90px_rgba(0,0,0,.5)]"
        >
          <header className="border-b border-lab-border px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="instrument-label text-accent-cyan">Local workspace</p>
                <h2 id="projects-title" className="mt-1 font-display text-lg font-semibold text-lab-text">Projects & recent circuits</h2>
                <p className="mt-1 text-xs text-lab-muted">Stored only in this browser. JSON export is the portable backup.</p>
              </div>
              <Button variant="quiet" size="sm" onClick={onClose} aria-label="Close project manager">✕</Button>
            </div>
          </header>

          <div className="border-b border-lab-border bg-lab-surface/55 p-4">
            <div className="rounded-xl border border-lab-border bg-lab-raised/45 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="instrument-label">Current workspace</p>
                  <p className="mt-1 truncate text-sm font-semibold text-lab-text">{workspace.activeProjectName ?? "Unsaved circuit"}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-lab-faint">{workspace.circuit.num_qubits}q · {workspace.circuit.operations.length} ops · {workspace.saveState}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {workspace.activeProjectId && <Button size="sm" variant="primary" onClick={saveNow}>Save now</Button>}
                  <Button size="sm" variant="secondary" onClick={createBlank}>New blank</Button>
                </div>
              </div>
              {!workspace.activeProjectId && (
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={saveName}
                    maxLength={80}
                    placeholder="Name this circuit"
                    aria-label="Name current circuit"
                    onChange={(event) => setSaveName(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") saveAs(); }}
                    className="min-h-10 min-w-0 flex-1 rounded-lg border border-lab-borderStrong bg-lab-bg px-3 text-sm text-lab-text outline-none focus:border-accent-cyan"
                  />
                  <Button variant="primary" size="sm" onClick={saveAs}>Save as</Button>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2 border-t border-lab-border pt-3">
                <Button variant="quiet" size="sm" onClick={exportCircuit}>Export JSON</Button>
                <Button variant="quiet" size="sm" onClick={() => fileInputRef.current?.click()}>Import JSON</Button>
                {workspace.activeProjectId && <Button variant="quiet" size="sm" onClick={() => { workspace.detachProject(); pushToast("Detached from the project; this circuit now autosaves anonymously."); }}>Detach</Button>}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  aria-label="Import circuit JSON"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void importCircuit(file);
                    event.target.value = "";
                  }}
                />
              </div>
            </div>
          </div>

          <div className="border-b border-lab-border px-4 py-3">
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder="Search projects"
              aria-label="Search projects"
              onChange={(event) => setQuery(event.target.value)}
              className="min-h-10 w-full rounded-lg border border-lab-border bg-lab-bg px-3 text-sm text-lab-text outline-none focus:border-accent-cyan"
            />
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto p-3" aria-label="Recent local projects">
            {projects.length === 0 && (
              <li className="rounded-xl border border-dashed border-lab-borderStrong px-5 py-10 text-center text-sm leading-6 text-lab-muted">
                {query ? `No projects match “${query}”.` : "No local projects yet. Save the current circuit or create a blank project."}
              </li>
            )}
            {projects.map((project) => {
              const active = project.id === workspace.activeProjectId;
              return (
                <li key={project.id} className={`mb-2 rounded-xl border p-3 transition ${active ? "border-accent-cyan/55 bg-accent-cyan/[.07]" : "border-lab-border bg-lab-raised/35 hover:border-lab-borderStrong"}`}>
                  {renamingId === project.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={renameValue}
                        maxLength={80}
                        aria-label={`New name for ${project.name}`}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            const result = workspace.renameProject(project.id, renameValue);
                            if (!result.ok) notifyFailure(result.reason);
                            setRenamingId(null);
                            refresh();
                          }
                          if (event.key === "Escape") setRenamingId(null);
                        }}
                        className="min-h-10 min-w-0 flex-1 rounded-lg border border-accent-cyan/50 bg-lab-bg px-3 text-sm text-lab-text outline-none"
                      />
                      <Button variant="primary" size="sm" onClick={() => {
                        const result = workspace.renameProject(project.id, renameValue);
                        if (!result.ok) notifyFailure(result.reason);
                        setRenamingId(null);
                        refresh();
                      }}>Rename</Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => {
                        if (workspace.openProject(project.id)) {
                          pushToast(`Opened “${project.name}”.`, "success");
                          onClose();
                        } else notifyFailure("That project could not be opened.");
                      }}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-lab-text">{project.name}</span>
                          <span className="mt-1 block font-mono text-[11px] text-lab-faint">{projectSummary(project)}</span>
                        </span>
                        <span className="shrink-0 text-right text-[11px] text-lab-faint">
                          {active && <span className="mb-1 block font-semibold text-accent-cyan">active</span>}
                          opened {formatWhen(project.lastOpenedAt)}
                        </span>
                      </span>
                    </button>
                  )}

                  {renamingId !== project.id && (
                    <div className="mt-3 flex flex-wrap gap-1 border-t border-lab-border pt-2">
                      <Button variant="quiet" size="sm" onClick={() => { setRenamingId(project.id); setRenameValue(project.name); }}>Rename</Button>
                      <Button variant="quiet" size="sm" onClick={() => {
                        const result = workspace.duplicateProject(project.id);
                        if (result.ok && result.value) pushToast(`Duplicated as “${result.value.name}”.`, "success");
                        else notifyFailure(result.reason);
                        refresh();
                      }}>Duplicate</Button>
                      {deletingId === project.id ? (
                        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-red-200">
                          Delete permanently?
                          <Button variant="danger" size="sm" onClick={() => {
                            const result = workspace.deleteProject(project.id);
                            if (result.ok) pushToast(`Deleted “${project.name}”.`);
                            else notifyFailure(result.reason);
                            setDeletingId(null);
                            refresh();
                          }}>Confirm</Button>
                          <Button variant="quiet" size="sm" onClick={() => setDeletingId(null)}>Cancel</Button>
                        </span>
                      ) : (
                        <Button variant="quiet" size="sm" className="ml-auto !text-red-200" onClick={() => setDeletingId(project.id)}>Delete</Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </ModalPortal>
  );
}
