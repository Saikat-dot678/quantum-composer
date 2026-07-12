"use client";

import { useState } from "react";
import { ActivityIcon, CircuitIcon, PlayIcon, XIcon } from "@/components/ui/icons";
import { Badge, Button, Tooltip } from "@/components/ui/primitives";
import { useToast } from "@/components/workspace/ToastProvider";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { encodeCircuitLinkCompressed } from "@/lib/circuitShare";
import type { SimulationPath } from "@/lib/circuitRouting";
import type { ComposerBusyAction } from "./types";

export function ComposerToolbar({
  qubits,
  operationCount,
  simulationPath,
  busyAction,
  onOpenSimulatorLab,
  onAnalyze,
  onClear,
  onGenerate,
  onRun,
}: {
  qubits: number;
  operationCount: number;
  simulationPath: SimulationPath;
  busyAction: ComposerBusyAction;
  onOpenSimulatorLab: () => void;
  onAnalyze: () => void;
  onClear: () => void;
  onGenerate: () => void;
  onRun: () => void;
}) {
  const { circuit, undo, redo, canUndo, canRedo } = useWorkspace();
  const { pushToast } = useToast();
  const [shareState, setShareState] = useState<"idle" | "copied" | "blocked">("idle");
  const working = busyAction !== null;

  async function shareLink() {
    const result = await encodeCircuitLinkCompressed(circuit, window.location.origin);
    if (!result.ok || !result.url) {
      setShareState("blocked");
      pushToast(result.reason ?? "This circuit cannot be shared as a link.", "error");
      window.setTimeout(() => setShareState("idle"), 2600);
      return;
    }
    try {
      await navigator.clipboard.writeText(result.url);
      setShareState("copied");
      pushToast("Compressed share link copied — the URL reproduces this circuit.", "success");
    } catch {
      setShareState("blocked");
      pushToast("Clipboard access was blocked; the link could not be copied.", "error");
    }
    window.setTimeout(() => setShareState("idle"), 2000);
  }

  return (
    <div className="mb-4 min-w-0 rounded-xl border border-lab-border bg-lab-panel p-3 shadow-panel sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral"><span className="font-mono">{qubits}q</span> · {operationCount} operations</Badge>
          <Badge tone={simulationPath.id === "v1" ? "green" : "amber"} dot>{simulationPath.label}</Badge>
        </div>
        <div className="grid w-full min-w-0 grid-cols-2 items-center gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
          <span className="col-span-2 flex items-center justify-end gap-1 sm:col-span-1" role="group" aria-label="History">
            <Button variant="quiet" size="sm" disabled={!canUndo} onClick={undo} aria-label="Undo circuit change (Control Z)">
              ↶ Undo
            </Button>
            <Button variant="quiet" size="sm" disabled={!canRedo} onClick={redo} aria-label="Redo circuit change (Control Shift Z)">
              ↷ Redo
            </Button>
          </span>
          <Tooltip content="Copy a link that reproduces this exact circuit — the whole circuit is encoded in the URL.">
            <span className="flex min-w-0 sm:flex-none">
              <Button variant="secondary" size="sm" onClick={() => void shareLink()} className="w-full" aria-live="polite">
                {shareState === "copied" ? "Link copied ✓" : shareState === "blocked" ? "Too large to share" : "Share link"}
              </Button>
            </span>
          </Tooltip>
          <Button variant="secondary" size="sm" onClick={onOpenSimulatorLab} className="min-w-0 sm:flex-none">
            <CircuitIcon className="h-4 w-4" />
            <span className="sm:hidden">Simulator Lab</span><span className="hidden sm:inline">Open in Simulator Lab</span>
          </Button>
          <Tooltip content="Ask the backend analyzer to inspect exact-memory cost, Clifford structure, and recommended engines.">
            <span className="flex min-w-0 sm:flex-none">
              <Button variant="secondary" size="sm" disabled={working} loading={busyAction === "analyze"} onClick={onAnalyze} className="w-full">
                <ActivityIcon className="h-4 w-4" />
                <span className="sm:hidden">Analyze</span><span className="hidden sm:inline">Analyze feasibility</span>
              </Button>
            </span>
          </Tooltip>
          <Button variant="quiet" size="sm" onClick={onClear} className="min-w-0">
            <XIcon className="h-4 w-4" />
            Clear
          </Button>
          <Button variant="secondary" size="sm" disabled={working} loading={busyAction === "generate"} onClick={onGenerate} className="min-w-0"><span className="sm:hidden">Generate</span><span className="hidden sm:inline">Generate outputs</span></Button>
          <Button variant="primary" size="sm" disabled={working} loading={busyAction === "run"} onClick={onRun} className="col-span-2 min-w-0 sm:col-span-1">
            <PlayIcon className="h-4 w-4" />
            Run circuit
          </Button>
        </div>
      </div>
    </div>
  );
}
