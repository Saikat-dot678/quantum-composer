import type { CircuitOperation, GateName } from "@/lib/types";
import type { PendingGateSelection } from "./types";
import { GateCell } from "./GateCell";

const cellKey = (qubit: number, moment: number) => `${qubit}:${moment}`;

export function QubitRow({
  qubit,
  columns,
  operationIndex,
  connectorIndex,
  selectedGate,
  pending,
  focusMoment,
  onCellClick,
  onCellFocus,
  registerCell,
}: {
  qubit: number;
  columns: number;
  operationIndex: ReadonlyMap<string, CircuitOperation>;
  connectorIndex: ReadonlyMap<string, CircuitOperation>;
  selectedGate: GateName;
  pending: PendingGateSelection | null;
  /** Moment that holds the roving tab stop on this row, or null when another row owns it. */
  focusMoment: number | null;
  onCellClick: (qubit: number, moment: number) => void;
  onCellFocus: (qubit: number, moment: number) => void;
  registerCell: (qubit: number, moment: number, element: HTMLButtonElement | null) => void;
}) {
  return (
    <div className="flex items-center" role="row" aria-label={`Quantum register q${qubit}`}>
      <div className="sticky left-0 z-20 flex h-12 w-[72px] shrink-0 items-center border-r border-lab-border bg-lab-panel pr-3 font-mono text-xs font-semibold text-lab-muted" role="rowheader">
        <span className="mr-1.5 text-accent-cyan">|0〉</span>q{qubit}
      </div>
      {Array.from({ length: columns }, (_, moment) => {
        const key = cellKey(qubit, moment);
        return (
          <div key={moment} role="gridcell" className="h-12 w-14 shrink-0">
            <GateCell
              operation={operationIndex.get(key)}
              connector={connectorIndex.get(key)}
              qubit={qubit}
              moment={moment}
              selectedGate={selectedGate}
              pending={pending?.qubit === qubit && pending.moment === moment}
              tabIndex={focusMoment === moment ? 0 : -1}
              onFocusCell={() => onCellFocus(qubit, moment)}
              cellRef={(element) => registerCell(qubit, moment, element)}
              onClick={() => onCellClick(qubit, moment)}
            />
          </div>
        );
      })}
    </div>
  );
}
