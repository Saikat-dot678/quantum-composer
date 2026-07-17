"use client";

// Floating toolbar over the canvas (reference study #3 tldraw, #5 Excalidraw
// "Island" pattern) — replaces the old full-width bordered ComposerToolbar.
// Left: undo/redo + zoom. Right: primary workflow actions. The circuit's
// qubit/op/route status is a small on-canvas chip, not global chrome.
import { Copy, FolderOpen, Minus, Network, Plus, Redo2, Scan, Undo2 } from "lucide-react";
import { Badge, Button, Tooltip } from "@/components/ui/primitives";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import type { SimulationPath } from "@/lib/circuitRouting";
import type { ComposerBusyAction } from "./types";

export function CanvasToolbar({
  qubits,
  operationCount,
  simulationPath,
  busyAction,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onOpenSimulatorLab,
  onOpenHardwareMapping,
  onAnalyze,
  onClear,
  onGenerate,
  onRun,
  onShare,
  shareState,
}: {
  qubits: number;
  operationCount: number;
  simulationPath: SimulationPath;
  busyAction: ComposerBusyAction;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onOpenSimulatorLab: () => void;
  onOpenHardwareMapping: () => void;
  onAnalyze: () => void;
  onClear: () => void;
  onGenerate: () => void;
  onRun: () => void;
  onShare: () => void;
  shareState: "idle" | "copied" | "blocked";
}) {
  const { undo, redo, canUndo, canRedo } = useWorkspace();
  const working = busyAction !== null;

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-wrap items-start justify-between gap-2">
      <div className="pointer-events-auto flex items-center gap-1 rounded-xl2 border border-line bg-surface p-1 shadow-floating">
        <Tooltip content="Undo (Control Z)"><span><Button variant="quiet" size="sm" disabled={!canUndo} onClick={undo} aria-label="Undo"><Undo2 className="h-3.5 w-3.5" /></Button></span></Tooltip>
        <Tooltip content="Redo (Control Shift Z)"><span><Button variant="quiet" size="sm" disabled={!canRedo} onClick={redo} aria-label="Redo"><Redo2 className="h-3.5 w-3.5" /></Button></span></Tooltip>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        <Tooltip content="Zoom out"><span><Button variant="quiet" size="sm" onClick={onZoomOut} aria-label="Zoom out"><Minus className="h-3.5 w-3.5" /></Button></span></Tooltip>
        <Tooltip content="Fit to screen"><span><Button variant="quiet" size="sm" onClick={onZoomFit} aria-label="Fit circuit to screen"><Scan className="h-3.5 w-3.5" /></Button></span></Tooltip>
        <Tooltip content="Zoom in"><span><Button variant="quiet" size="sm" onClick={onZoomIn} aria-label="Zoom in"><Plus className="h-3.5 w-3.5" /></Button></span></Tooltip>
      </div>

      <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-xl2 border border-line bg-surface p-1.5 shadow-floating">
        <Badge tone="neutral" className="mr-1 hidden sm:inline-flex" aria-label="Workspace status"><span className="font-mono">{qubits}q</span>&nbsp;·&nbsp;{operationCount} ops</Badge>
        <Badge tone={simulationPath.id === "v1" ? "green" : "amber"} dot className="mr-1 hidden md:inline-flex">{simulationPath.id.toUpperCase()}</Badge>
        <Button variant="quiet" size="sm" onClick={onShare} aria-live="polite">
          {shareState === "copied" ? "Link copied ✓" : shareState === "blocked" ? "Too large" : "Share"}
        </Button>
        <Button variant="quiet" size="sm" onClick={onOpenSimulatorLab}><FolderOpen className="h-3.5 w-3.5" /><span className="hidden lg:inline">Simulator Lab</span></Button>
        <Button variant="quiet" size="sm" onClick={onOpenHardwareMapping}><Network className="h-3.5 w-3.5" /><span className="hidden lg:inline">Hardware</span></Button>
        <Button variant="quiet" size="sm" onClick={onClear}>Clear</Button>
        <Button variant="secondary" size="sm" disabled={working} loading={busyAction === "analyze"} onClick={onAnalyze}>Analyze</Button>
        <Button variant="secondary" size="sm" disabled={working} loading={busyAction === "generate"} onClick={onGenerate}><Copy className="h-3.5 w-3.5" /><span className="hidden lg:inline">Generate</span></Button>
        <Button variant="primary" size="sm" disabled={working} loading={busyAction === "run"} onClick={onRun}>Run</Button>
      </div>
    </div>
  );
}
