export interface PendingGateSelection {
  qubit: number;
  moment: number;
}

export type ComposerNotice = { kind: "info" | "error" | "success"; text: string };
export type ComposerBusyAction = "generate" | "run" | "analyze" | null;
