import { Button, Badge, Tooltip } from "@/components/ui/primitives";
import { RefreshIcon, ServerIcon } from "@/components/ui/icons";
import type { BackendStatus } from "./StatusStrip";
import { ModeTabs, type Mode } from "./ModeTabs";

const BACKEND_COPY: Record<BackendStatus, { label: string; tone: "amber" | "green" | "red"; detail: string }> = {
  checking: { label: "Checking backend", tone: "amber", detail: "Contacting the FastAPI health endpoint." },
  online: { label: "Backend online", tone: "green", detail: "FastAPI reported a healthy status." },
  offline: { label: "Backend offline", tone: "red", detail: "Requests are unavailable. Start FastAPI or verify NEXT_PUBLIC_API_URL." },
};

export function TopBar({
  mode,
  onModeChange,
  backendStatus,
  onRetryBackend,
}: {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  backendStatus: BackendStatus;
  onRetryBackend: () => void;
}) {
  const backend = BACKEND_COPY[backendStatus];
  return (
    <div className="mx-auto max-w-[1800px] px-4 py-3 sm:px-5 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-accent-cyan/35 bg-accent-cyan/[.08] shadow-glow" aria-hidden="true">
            <span className="font-mono text-[13px] font-semibold tracking-tight text-accent-cyan">|ψ⟩</span>
            <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-accent-green" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-sm font-semibold tracking-[-0.01em] text-lab-text sm:text-base">Quantum Composer</h1>
              <Badge tone="cyan" className="hidden sm:inline-flex">Structured large-circuit simulation only</Badge>
            </div>
            <p className="truncate text-[11px] leading-4 text-lab-faint sm:text-xs">Circuit composer · multi-engine simulator · quantum cryptography lab</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip content={backend.detail}>
            <span>
              <Badge tone={backend.tone} dot>{backend.label}</Badge>
            </span>
          </Tooltip>
          {backendStatus === "offline" && (
            <Button variant="quiet" size="sm" onClick={onRetryBackend} aria-label="Retry backend health check">
              <RefreshIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Retry</span>
            </Button>
          )}
          {backendStatus === "checking" && <ServerIcon className="h-4 w-4 animate-pulse text-accent-amber" />}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <ModeTabs mode={mode} onModeChange={onModeChange} />
        <Badge tone="cyan" className="shrink-0 sm:hidden">Structured only</Badge>
      </div>
    </div>
  );
}
