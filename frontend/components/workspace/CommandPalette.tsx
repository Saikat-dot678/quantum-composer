"use client";

// Dependency-free ⌘K command palette on the shared modal foundation (focus
// trap, inert background, Escape). Commands come from three sources: static
// navigation/circuit commands, the five most recent projects, and actions
// registered by whichever view is mounted (e.g. Composer run/analyze).
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { encodeCircuitLinkCompressed } from "@/lib/circuitShare";
import { PRESETS } from "@/lib/presets";
import { listProjects } from "@/lib/projects";
import { useActionRegistry } from "./ActionRegistry";
import { ModalPortal, useModalLifecycle } from "./Modal";
import { useToast } from "./ToastProvider";
import { useWorkspace } from "./WorkspaceProvider";

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  run: () => void;
}

export function CommandPalette({ open, onClose, onOpenProjects }: { open: boolean; onClose: () => void; onOpenProjects: () => void }) {
  const router = useRouter();
  const workspace = useWorkspace();
  const { actions: registeredActions } = useActionRegistry();
  const { pushToast } = useToast();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  useModalLifecycle(open, panelRef, onClose, inputRef);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      router.push(path);
      onClose();
    };
    return [
      { id: "nav-composer", group: "Navigate", label: "Go to Circuit Composer", hint: "editor", run: go("/composer") },
      { id: "nav-simulator", group: "Navigate", label: "Go to Simulator Lab", hint: "feasibility + engines", run: go("/simulator") },
      { id: "nav-crypto", group: "Navigate", label: "Go to Cryptography Lab", hint: "BB84 · E91 · B92 · QRNG", run: go("/crypto") },
      // Actions contributed by the mounted view (e.g. Composer run/analyze).
      ...registeredActions.map((action) => ({ ...action, run: () => { action.run(); onClose(); } })),
      {
        id: "circuit-undo",
        group: "Circuit",
        label: "Undo circuit change",
        hint: "Ctrl+Z",
        disabled: !workspace.canUndo,
        run: () => { workspace.undo(); onClose(); },
      },
      {
        id: "circuit-redo",
        group: "Circuit",
        label: "Redo circuit change",
        hint: "Ctrl+Shift+Z",
        disabled: !workspace.canRedo,
        run: () => { workspace.redo(); onClose(); },
      },
      {
        id: "circuit-clear",
        group: "Circuit",
        label: "Clear circuit operations",
        disabled: workspace.circuit.operations.length === 0,
        run: () => {
          workspace.setCircuit((current) => ({ ...current, operations: [] }));
          onClose();
        },
      },
      {
        id: "circuit-share",
        group: "Circuit",
        label: "Copy shareable circuit link",
        hint: "compressed URL",
        run: () => {
          void encodeCircuitLinkCompressed(workspace.circuit, window.location.origin).then(async (result) => {
            if (result.ok && result.url) {
              await navigator.clipboard?.writeText(result.url).catch(() => undefined);
              pushToast("Share link copied — the URL reproduces this circuit.", "success");
            } else {
              pushToast(result.reason ?? "This circuit cannot be shared as a link.", "error");
            }
          });
          onClose();
        },
      },
      {
        id: "circuit-to-lab",
        group: "Circuit",
        label: "Open current circuit in Simulator Lab",
        run: () => {
          workspace.setLabCircuit(workspace.circuit);
          router.push("/simulator");
          onClose();
        },
      },
      {
        id: "projects-save",
        group: "Projects",
        label: workspace.activeProjectId ? "Save project now" : "Save circuit as project…",
        hint: workspace.activeProjectName ?? undefined,
        run: () => {
          if (workspace.activeProjectId) {
            const result = workspace.saveActiveProject();
            pushToast(result.ok ? "Project saved." : result.reason ?? "Save failed.", result.ok ? "success" : "error");
            onClose();
          } else {
            onOpenProjects();
          }
        },
      },
      {
        id: "projects-open",
        group: "Projects",
        label: "Open projects…",
        hint: "save · import · export",
        run: () => onOpenProjects(),
      },
      ...(typeof window !== "undefined" && open
        ? listProjects().slice(0, 5).map((project) => ({
            id: `project-${project.id}`,
            group: "Projects",
            label: `Open recent: ${project.name}`,
            hint: `${project.circuit.num_qubits}q`,
            run: () => {
              if (workspace.openProject(project.id)) pushToast(`Opened “${project.name}”.`, "success");
              router.push("/composer");
              onClose();
            },
          }))
        : []),
      ...PRESETS.map((preset) => ({
        id: `preset-${preset.id}`,
        group: "Presets",
        label: `Load preset: ${preset.name}`,
        hint: `${preset.circuit.num_qubits}q`,
        run: () => {
          workspace.loadCircuit(preset.circuit);
          router.push("/composer");
          onClose();
        },
      })),
    ];
  }, [router, workspace, onClose, onOpenProjects, pushToast, registeredActions, open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) => `${command.group} ${command.label} ${command.hint ?? ""}`.toLowerCase().includes(needle));
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const activeId = filtered[activeIndex] ? `command-${filtered[activeIndex].id}` : undefined;
  let lastGroup: string | null = null;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[90] flex items-start justify-center bg-black/55 p-4 pt-[10vh] backdrop-blur-[2px]"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <section
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          tabIndex={-1}
          className="w-full max-w-lg overflow-hidden rounded-xl border border-lab-borderStrong bg-lab-panel shadow-[0_24px_80px_rgba(0,0,0,.5)]"
        >
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={activeId}
            aria-label="Search commands"
            placeholder="Type a command — run, analyze, projects, presets…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, filtered.length - 1)); }
              else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
              else if (event.key === "Enter") {
                event.preventDefault();
                const command = filtered[activeIndex];
                if (command && !command.disabled) command.run();
              }
            }}
            className="w-full border-b border-lab-border bg-lab-surface px-4 py-3 text-sm text-lab-text outline-none placeholder:text-lab-faint"
          />
          <ul id="command-palette-list" role="listbox" aria-label="Commands" className="max-h-[46vh] overflow-y-auto p-1.5">
            {filtered.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-lab-faint" role="presentation">No commands match “{query}”.</li>
            )}
            {filtered.map((command, index) => {
              const groupHeader = command.group !== lastGroup ? command.group : null;
              lastGroup = command.group;
              return (
                <li key={command.id} role="presentation">
                  {groupHeader && <p className="instrument-label px-2.5 pb-1 pt-2.5" role="presentation">{groupHeader}</p>}
                  <button
                    id={`command-${command.id}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    disabled={command.disabled}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => { if (!command.disabled) command.run(); }}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      index === activeIndex ? "bg-accent-cyan/[.12] text-accent-cyan" : "text-lab-muted hover:text-lab-text"
                    }`}
                  >
                    <span className="truncate">{command.label}</span>
                    {command.hint && <span className="shrink-0 font-mono text-[10px] text-lab-faint">{command.hint}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-lab-border bg-lab-surface/70 px-4 py-2 text-[10px] text-lab-faint">
            ↑↓ select · Enter run · Esc close
          </p>
        </section>
      </div>
    </ModalPortal>
  );
}
