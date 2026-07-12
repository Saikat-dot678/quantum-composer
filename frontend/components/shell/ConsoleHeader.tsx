"use client";

// Console header: mode identity on the left, live instruments on the right —
// circuit telemetry (from the instant local analyzer), autosave state, and
// backend health with retry. Sticky, one row, information-dense but readable.
import { Badge, Button, Tooltip } from "@/components/ui/primitives";
import { RefreshIcon } from "@/components/ui/icons";
import type { LocalFeasibility } from "@/lib/feasibility";
import type { SaveState } from "@/components/workspace/WorkspaceProvider";
import { MODE_LABELS, MODE_TAGLINES, type BackendStatus, type Mode } from "./types";

const BACKEND_COPY: Record<BackendStatus, { label: string; tone: "amber" | "green" | "red"; detail: string }> = {
  checking: { label: "Checking", tone: "amber", detail: "Contacting the FastAPI health endpoint." },
  online: { label: "Online", tone: "green", detail: "FastAPI reported a healthy status." },
  offline: { label: "Offline", tone: "red", detail: "Requests are unavailable. Start FastAPI or verify NEXT_PUBLIC_API_URL." },
};

const RISK_TONE: Record<string, "green" | "amber" | "red"> = {
  safe: "green",
  heavy: "amber",
  dangerous: "amber",
  infeasible: "red",
};

const SAVE_COPY: Record<SaveState, string> = {
  restoring: "restoring…",
  saved: "saved",
  unsaved: "unsaved",
  saving: "saving…",
  error: "save failed",
};

export function ConsoleHeader({
  mode,
  backendStatus,
  onRetryBackend,
  feasibility,
  saveState,
  activeProjectName,
}: {
  mode: Mode;
  backendStatus: BackendStatus;
  onRetryBackend: () => void;
  feasibility: LocalFeasibility | null;
  saveState: SaveState;
  activeProjectName: string | null;
}) {
  const backend = BACKEND_COPY[backendStatus];
  return (
    <header className="sticky top-0 z-40 bg-lab-bg/95 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 sm:px-5 lg:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-sm font-semibold tracking-tight text-accent-cyan lg:hidden" aria-hidden="true">|ψ⟩</span>
            <h1 className="truncate font-display text-sm font-semibold tracking-[-0.01em] text-lab-text sm:text-base">
              {MODE_LABELS[mode]}
            </h1>
            <Badge tone="cyan" className="hidden xl:inline-flex">Structured large-circuit simulation only</Badge>
          </div>
          <p className="hidden truncate text-[11px] leading-4 text-lab-faint sm:block">{MODE_TAGLINES[mode]}</p>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Workspace status">
          {feasibility && (
            <>
              <Tooltip content={feasibility.isClifford ? "All gates are Clifford; stabilizer methods apply." : `Non-Clifford: T-count ${feasibility.tCount}, rotations ${feasibility.rotationCount}.`}>
                <span className="hidden rounded-md border border-lab-border bg-lab-surface/80 px-2 py-1 font-mono text-[11px] text-lab-muted sm:inline-flex">
                  {feasibility.numQubits}q · {feasibility.operationCount} ops · {feasibility.isClifford ? "Clifford" : "non-Clifford"}
                </span>
              </Tooltip>
              <Tooltip content={`Instant local estimate: exact statevector needs 16·2^n bytes. The backend estimator is authoritative at run time.`}>
                <span className="inline-flex">
                  <Badge tone={RISK_TONE[feasibility.risk] ?? "neutral"}>
                    <span className="font-mono">{feasibility.route.id.toUpperCase()} · {feasibility.statevectorHuman}</span>
                  </Badge>
                </span>
              </Tooltip>
            </>
          )}
          <Tooltip content={activeProjectName ? `Autosaving to project “${activeProjectName}”.` : "Autosaving to this browser's anonymous slot. Name it in Projects to keep it."}>
            <span className="hidden rounded-md border border-lab-border bg-lab-surface/80 px-2 py-1 font-mono text-[11px] text-lab-muted md:inline-flex">
              {activeProjectName ?? "unsaved circuit"} · {SAVE_COPY[saveState]}
            </span>
          </Tooltip>
          <Tooltip content={backend.detail}>
            <span className="inline-flex"><Badge tone={backend.tone} dot>{backend.label}</Badge></span>
          </Tooltip>
          {backendStatus === "offline" && (
            <Button variant="quiet" size="sm" onClick={onRetryBackend} aria-label="Retry backend health check">
              <RefreshIcon className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="coherence-line" aria-hidden="true" />
    </header>
  );
}
