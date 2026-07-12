import { ActivityIcon, CircuitIcon, PlayIcon, XIcon } from "@/components/ui/icons";
import { Badge, Button, Tooltip } from "@/components/ui/primitives";
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
  const working = busyAction !== null;
  return (
    <div className="mb-4 min-w-0 rounded-xl border border-lab-border bg-lab-panel p-3 shadow-panel sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral"><span className="font-mono">{qubits}q</span> · {operationCount} operations</Badge>
          <Badge tone={simulationPath.id === "v1" ? "green" : "amber"} dot>{simulationPath.label}</Badge>
        </div>
        <div className="grid w-full min-w-0 grid-cols-2 items-center gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
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
