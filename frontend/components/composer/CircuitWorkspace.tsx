import { XIcon } from "@/components/ui/icons";
import { Badge, Button, Panel, SectionHeader, StatusNotice } from "@/components/ui/primitives";
import type { CircuitOperation, GateName } from "@/lib/types";
import { CircuitGrid } from "./CircuitGrid";
import type { ComposerNotice, PendingGateSelection } from "./types";

export function CircuitWorkspace({
  numQubits,
  numClbits,
  columns,
  operations,
  selectedGate,
  pending,
  notice,
  onCellClick,
  onCancelPending,
  onOpenSimulatorLab,
}: {
  numQubits: number;
  numClbits: number;
  columns: number;
  operations: CircuitOperation[];
  selectedGate: GateName;
  pending: PendingGateSelection | null;
  notice: ComposerNotice | null;
  onCellClick: (qubit: number, moment: number) => void;
  onCancelPending: () => void;
  onOpenSimulatorLab: () => void;
}) {
  return (
    <Panel className="min-w-0 p-4 sm:p-5">
      <SectionHeader
        eyebrow="Circuit workspace"
        title="Compose across time"
        description="Select a gate, then activate a timeline cell. Activate an occupied cell to remove its operation."
        right={<Badge tone="neutral"><span className="font-mono">t0–t{columns - 1}</span></Badge>}
      />

      {operations.length === 0 && (
        <div className="mb-3 rounded-lg border border-dashed border-accent-cyan/30 bg-accent-cyan/[.04] px-3 py-2.5 text-xs leading-5 text-cyan-100/85">
          The circuit is empty. Pick a gate from the library, then activate a cell on a qubit wire — or load a teaching preset. Arrow keys move around the grid once a cell has focus.
        </div>
      )}

      {pending && (
        <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent-cyan/35 bg-accent-cyan/[.07] px-3 py-2.5">
          <p className="text-xs text-cyan-100">
            <b>{selectedGate.toUpperCase()}</b> first endpoint: <span className="font-mono">q{pending.qubit} · t{pending.moment}</span>. Choose a different qubit in the same time step.
          </p>
          <Button variant="quiet" size="sm" onClick={onCancelPending}>
            <XIcon className="h-3.5 w-3.5" />
            Cancel placement
          </Button>
        </div>
      )}

      <CircuitGrid
        numQubits={numQubits}
        numClbits={numClbits}
        columns={columns}
        operations={operations}
        selectedGate={selectedGate}
        pending={pending}
        onCellClick={onCellClick}
        onOpenSimulatorLab={onOpenSimulatorLab}
      />

      {notice && <div className="mt-3"><StatusNotice kind={notice.kind}>{notice.text}</StatusNotice></div>}
    </Panel>
  );
}
