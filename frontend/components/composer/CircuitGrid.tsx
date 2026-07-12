"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button, WarningCallout } from "@/components/ui/primitives";
import { gridRenderState } from "@/lib/circuitSizing";
import type { CircuitOperation, GateName } from "@/lib/types";
import type { PendingGateSelection } from "./types";
import { QubitRow } from "./QubitRow";

const cellKey = (row: number, moment: number) => `${row}:${moment}`;

export function CircuitGrid({
  numQubits,
  numClbits,
  columns,
  operations,
  selectedGate,
  pending,
  onCellClick,
  onOpenSimulatorLab,
}: {
  numQubits: number;
  numClbits: number;
  columns: number;
  operations: CircuitOperation[];
  selectedGate: GateName;
  pending: PendingGateSelection | null;
  onCellClick: (qubit: number, moment: number) => void;
  onOpenSimulatorLab: () => void;
}) {
  // Roving tabindex: exactly one grid cell is in the tab order; arrow keys move
  // it. This keeps Tab usable (one stop for the whole grid) even at 128×256.
  const [focusCell, setFocusCell] = useState({ qubit: 0, moment: 0 });
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    setFocusCell((current) => ({
      qubit: Math.min(current.qubit, Math.max(0, numQubits - 1)),
      moment: Math.min(current.moment, Math.max(0, columns - 1)),
    }));
  }, [numQubits, columns]);

  const registerCell = (qubit: number, moment: number, element: HTMLButtonElement | null) => {
    const key = cellKey(qubit, moment);
    if (element) cellRefs.current.set(key, element);
    else cellRefs.current.delete(key);
  };

  const moveFocus = (qubit: number, moment: number) => {
    const nextQubit = Math.min(Math.max(qubit, 0), numQubits - 1);
    const nextMoment = Math.min(Math.max(moment, 0), columns - 1);
    setFocusCell({ qubit: nextQubit, moment: nextMoment });
    cellRefs.current.get(cellKey(nextQubit, nextMoment))?.focus();
  };

  const handleGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const { qubit, moment } = focusCell;
    switch (event.key) {
      case "ArrowRight": event.preventDefault(); moveFocus(qubit, moment + 1); break;
      case "ArrowLeft": event.preventDefault(); moveFocus(qubit, moment - 1); break;
      case "ArrowDown": event.preventDefault(); moveFocus(qubit + 1, moment); break;
      case "ArrowUp": event.preventDefault(); moveFocus(qubit - 1, moment); break;
      case "Home": event.preventDefault(); moveFocus(qubit, 0); break;
      case "End": event.preventDefault(); moveFocus(qubit, columns - 1); break;
      default: break;
    }
  };

  const { operationIndex, connectorIndex, measurementIndex } = useMemo(() => {
    const operationMap = new Map<string, CircuitOperation>();
    const connectorMap = new Map<string, CircuitOperation>();
    const measurements = new Set<string>();
    for (const operation of operations) {
      for (const qubit of operation.qubits) operationMap.set(cellKey(qubit, operation.moment), operation);
      if (operation.qubits.length === 2 && ["cx", "cz", "swap"].includes(operation.gate)) {
        const low = Math.min(...operation.qubits);
        const high = Math.max(...operation.qubits);
        for (let qubit = low; qubit <= high; qubit += 1) {
          const key = cellKey(qubit, operation.moment);
          if (!connectorMap.has(key)) connectorMap.set(key, operation);
        }
      }
      if (operation.gate === "measure" && operation.clbits[0] != null) measurements.add(cellKey(operation.clbits[0], operation.moment));
    }
    return { operationIndex: operationMap, connectorIndex: connectorMap, measurementIndex: measurements };
  }, [operations]);

  const renderState = gridRenderState(numQubits, numClbits, columns);
  if (renderState.level === "paused") {
    return (
      <div className="rounded-lg border border-dashed border-accent-amber/45 bg-accent-amber/[.045] px-5 py-10 text-center">
        <p className="font-display text-sm font-semibold text-amber-100">Visual grid paused to protect browser performance</p>
        <p className="mx-auto mt-2 max-w-2xl text-xs leading-5 text-lab-muted">
          {numQubits} quantum rows + {numClbits} classical rows across {columns} steps would render {renderState.cellCount.toLocaleString()} cells. Reduce the register or timeline to edit visually; the circuit data remains intact. Large structured circuits belong in Simulator Lab as generated presets.
        </p>
        <Button variant="secondary" size="sm" onClick={onOpenSimulatorLab} className="mt-4">Analyze in Simulator Lab</Button>
      </div>
    );
  }

  return (
    <>
    {renderState.level === "heavy" && (
      <div className="mb-2">
        <WarningCallout>{renderState.message}</WarningCallout>
      </div>
    )}
    <p id="circuit-grid-keys" className="sr-only">
      Use the arrow keys to move between circuit cells, Home and End to jump within a row, and Enter or Space to place or remove the selected gate.
    </p>
    <div className="lab-grid-bg max-h-[62vh] overflow-auto rounded-lg border border-lab-border bg-lab-panel" role="region" aria-label={`Circuit editor with ${numQubits} qubits and ${columns} time steps`}>
      <div style={{ minWidth: 72 + columns * 56 }} role="grid" aria-describedby="circuit-grid-keys" aria-label="Quantum circuit timeline">
        <div className="sticky top-0 z-30 flex h-10 items-end border-b border-lab-border bg-lab-panel/95 pb-2 backdrop-blur" role="row">
          <div className="sticky left-0 z-40 w-[72px] shrink-0 border-r border-lab-border bg-lab-panel px-3 text-[10px] font-semibold uppercase tracking-wider text-lab-faint" role="columnheader">Register</div>
          {Array.from({ length: columns }, (_, column) => (
            <div key={column} className="w-14 shrink-0 text-center font-mono text-[10px] text-lab-faint" role="columnheader">t{column}</div>
          ))}
        </div>
        <div className="py-2" role="rowgroup" onKeyDown={handleGridKeyDown}>
          {Array.from({ length: numQubits }, (_, qubit) => (
            <QubitRow
              key={qubit}
              qubit={qubit}
              columns={columns}
              operationIndex={operationIndex}
              connectorIndex={connectorIndex}
              selectedGate={selectedGate}
              pending={pending}
              focusMoment={focusCell.qubit === qubit ? focusCell.moment : null}
              onCellClick={onCellClick}
              onCellFocus={(nextQubit, nextMoment) => setFocusCell({ qubit: nextQubit, moment: nextMoment })}
              registerCell={registerCell}
            />
          ))}
        </div>
        {numClbits > 0 && (
          <div className="border-t-2 border-double border-lab-borderStrong py-2" role="rowgroup" aria-label="Classical registers">
            {Array.from({ length: numClbits }, (_, clbit) => (
              <div key={clbit} className="flex h-8 items-center" role="row" aria-label={`Classical register c${clbit}`}>
                <div className="sticky left-0 z-20 w-[72px] shrink-0 border-r border-lab-border bg-lab-panel px-3 font-mono text-xs font-semibold text-lab-faint" role="rowheader">c{clbit}</div>
                {Array.from({ length: columns }, (_, moment) => {
                  const measured = measurementIndex.has(cellKey(clbit, moment));
                  return (
                    <div key={moment} className="relative h-8 w-14 shrink-0" role="gridcell" aria-label={measured ? `Measurement written to c${clbit} at time ${moment}` : `c${clbit}, time ${moment}`}>
                      <span className="absolute left-0 right-0 top-1/2 border-t border-double border-lab-borderStrong" aria-hidden="true" />
                      {measured && <span className="absolute left-1/2 top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent-green bg-lab-panel" aria-hidden="true" />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
