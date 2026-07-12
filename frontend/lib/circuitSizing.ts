// Grid-rendering cost model for the interactive composer. This is purely a
// browser/DOM concern: it decides whether the visual grid draws smoothly, draws
// with a responsiveness warning, or pauses and hands off to Simulator Lab. It
// says nothing about whether the circuit can be *simulated* — that is the
// backend estimator's job.
import { LIMITS } from "./constants";

export type GridRenderLevel = "smooth" | "heavy" | "paused";

export interface GridRenderState {
  level: GridRenderLevel;
  cellCount: number;
  message: string;
}

export function gridCellCount(numQubits: number, numClbits: number, columns: number): number {
  return (numQubits + numClbits) * columns;
}

export function gridRenderState(numQubits: number, numClbits: number, columns: number): GridRenderState {
  const cellCount = gridCellCount(numQubits, numClbits, columns);
  if (cellCount > LIMITS.composer.hardCellLimit) {
    return {
      level: "paused",
      cellCount,
      message:
        `${cellCount.toLocaleString()} cells exceed the ${LIMITS.composer.hardCellLimit.toLocaleString()}-cell rendering bound. ` +
        "Reduce the register or timeline to edit visually, or use a generated preset in Simulator Lab.",
    };
  }
  if (cellCount > LIMITS.composer.softCellLimit) {
    return {
      level: "heavy",
      cellCount,
      message:
        `${cellCount.toLocaleString()} rendered cells may make editing sluggish. ` +
        "Large structured circuits are better handled as generated presets in Simulator Lab.",
    };
  }
  return {
    level: "smooth",
    cellCount,
    message: `${cellCount.toLocaleString()} rendered cells.`,
  };
}
