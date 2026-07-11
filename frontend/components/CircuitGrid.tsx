import { GRID_CELL_SOFT_LIMIT } from "@/lib/constants";
import type { CircuitOperation, GateName } from "@/lib/types";
import { QubitRow } from "./QubitRow";

interface Props {
  numQubits: number;
  numClbits: number;
  columns: number;
  operations: CircuitOperation[];
  selectedGate: GateName;
  pending?: { qubit: number; moment: number } | null;
  onCellClick: (qubit: number, moment: number) => void;
}

export function CircuitGrid(props: Props) {
  const cellCount = props.numQubits * props.columns;
  if (cellCount > GRID_CELL_SOFT_LIMIT) {
    return (
      <div className="rounded-xl border border-dashed border-accent-amber/40 bg-accent-amber/[.05] p-8 text-center">
        <p className="text-sm font-medium text-amber-100">This grid is large ({props.numQubits} qubits × {props.columns} steps).</p>
        <p className="mt-1 text-xs text-lab-muted">
          Rendering that many cells would be heavy. Reduce the size to edit visually, or use the <b className="text-accent-cyan">Simulator Lab</b> and its large-circuit presets to analyze and run structured circuits at scale.
        </p>
      </div>
    );
  }

  return (
    <div className="max-h-[62vh] overflow-auto rounded-xl border border-lab-border bg-lab-panel p-4">
      <div style={{ minWidth: 64 + props.columns * 56 }}>
        <div className="sticky top-0 z-30 flex items-end border-b border-dashed border-lab-border bg-lab-panel pb-2">
          <div className="sticky left-0 z-40 w-16 shrink-0 bg-lab-panel text-[10px] font-semibold uppercase tracking-wider text-lab-faint">Qubits</div>
          {Array.from({ length: props.columns }, (_, column) => (
            <div key={column} className="w-14 shrink-0 text-center font-mono text-[10px] text-lab-faint">
              t{column}
            </div>
          ))}
        </div>
        <div className="py-2">
          {Array.from({ length: props.numQubits }, (_, qubit) => (
            <QubitRow
              key={qubit}
              qubit={qubit}
              columns={props.columns}
              operations={props.operations}
              selectedGate={props.selectedGate}
              pending={props.pending}
              onCellClick={props.onCellClick}
            />
          ))}
        </div>
        {props.numClbits > 0 && (
          <div className="border-t-2 border-double border-lab-borderStrong pt-2">
            {Array.from({ length: props.numClbits }, (_, clbit) => (
              <div key={clbit} className="flex h-8 items-center">
                <div className="sticky left-0 z-20 w-16 shrink-0 bg-lab-panel font-mono text-xs font-semibold text-lab-faint">c{clbit}</div>
                {Array.from({ length: props.columns }, (_, moment) => {
                  const measured = props.operations.some((item) => item.gate === "measure" && item.moment === moment && item.clbits[0] === clbit);
                  return (
                    <div key={moment} className="relative h-8 w-14 shrink-0">
                      <span className="absolute left-0 right-0 top-1/2 border-t border-double border-lab-borderStrong" />
                      {measured && <span className="absolute left-1/2 top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent-green bg-lab-panel" />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
