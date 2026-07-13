"use client";

// Slim top bar: product mark, segmented mode switch, and a small cluster of
// global actions (backend status, projects, command palette). Replaces the
// old persistent activity rail + console-header telemetry strip pattern —
// per the reference study, circuit telemetry is now a contextual on-canvas
// chip in Composer, not global chrome repeated on every route.
import { Command, FolderOpen } from "lucide-react";
import { Tooltip } from "@/components/ui/primitives";
import type { SaveState } from "@/components/workspace/WorkspaceProvider";
import type { BackendStatus, Mode } from "./types";
import { MODE_LABELS } from "./types";

const MODES: Mode[] = ["composer", "simulator", "crypto"];

const BACKEND_COPY: Record<BackendStatus, { label: string; dot: string; detail: string }> = {
  checking: { label: "Checking", dot: "bg-warn", detail: "Contacting the FastAPI health endpoint." },
  online: { label: "Online", dot: "bg-safe", detail: "FastAPI reported a healthy status." },
  offline: { label: "Offline", dot: "bg-danger", detail: "Requests are unavailable. Start FastAPI or verify NEXT_PUBLIC_API_URL." },
};

const SAVE_COPY: Record<SaveState, string> = {
  restoring: "Restoring…",
  saved: "Saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  error: "Save failed",
};

export function TopBar({
  mode,
  onModeChange,
  backendStatus,
  onRetryBackend,
  onOpenPalette,
  onOpenProjects,
  activeProjectName,
  saveState,
}: {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  backendStatus: BackendStatus;
  onRetryBackend: () => void;
  onOpenPalette: () => void;
  onOpenProjects: () => void;
  activeProjectName: string | null;
  saveState: SaveState;
}) {
  const backend = BACKEND_COPY[backendStatus];
  return (
    <header className="sticky top-0 z-40 border-b border-line-hairline bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1800px] items-center gap-3 px-3 sm:px-4 lg:px-5">
        <a href="/composer" aria-label="Quantum Composer home" className="flex shrink-0 items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent-100 bg-accent-50 font-mono text-[12px] font-semibold text-accent-600">|ψ⟩</span>
          <span className="hidden font-display text-sm font-semibold tracking-[-0.01em] text-ink-900 sm:inline">Quantum Composer</span>
        </a>

        <nav aria-label="Workspace mode" className="ml-1 flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-lg bg-ink-100 p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {MODES.map((item) => {
            const active = item === mode;
            return (
              <button
                key={item}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => onModeChange(item)}
                className={`min-h-8 shrink-0 rounded-md px-3 text-xs font-semibold transition-colors ${
                  active ? "bg-surface text-accent-700 shadow-sm" : "text-ink-400 hover:text-ink-900"
                }`}
              >
                {MODE_LABELS[item]}
              </button>
            );
          })}
        </nav>

        <p aria-label="Project status" className="hidden min-w-0 truncate pl-1 font-mono text-[11px] text-ink-400 lg:block">
          {activeProjectName ?? "Untitled circuit"} <span aria-hidden="true">·</span> {SAVE_COPY[saveState]}
        </p>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Tooltip content={backend.detail}>
            <button
              type="button"
              onClick={backendStatus === "offline" ? onRetryBackend : undefined}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line-hairline bg-surface-sunken px-2.5 text-[11px] font-medium text-ink-700"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${backend.dot}`} aria-hidden="true" />
              <span className="hidden sm:inline">{backend.label}</span>
            </button>
          </Tooltip>
          <button type="button" onClick={onOpenProjects} aria-label="Open projects and recent circuits" className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line-hairline bg-surface px-2.5 text-[11px] font-medium text-ink-700 hover:border-accent-500 hover:text-accent-700">
            <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden md:inline">Projects</span>
          </button>
          <button type="button" onClick={onOpenPalette} aria-label="Open command palette (Control K)" className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line-hairline bg-surface px-2.5 text-[11px] font-medium text-ink-700 hover:border-accent-500 hover:text-accent-700">
            <Command className="h-3.5 w-3.5" aria-hidden="true" />
            <kbd className="hidden font-mono text-[10px] text-ink-500 md:inline">⌘K</kbd>
          </button>
        </div>
      </div>
    </header>
  );
}
