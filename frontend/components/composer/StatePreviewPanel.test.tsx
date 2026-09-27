// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StatePreviewPanel } from "./StatePreviewPanel";
import { labApi } from "@/lib/labApi";
import type { CircuitData } from "@/lib/types";
import type { SimulationV2Response } from "@/lib/labTypes";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/workspace/WorkspaceProvider", () => ({ useWorkspace: () => ({ setLabCircuit: vi.fn() }) }));
vi.mock("@/lib/labApi", () => ({ labApi: { simulateV2: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("ignores an old comparison response after the circuit changes", async () => {
  let finish!: (response: SimulationV2Response) => void;
  vi.mocked(labApi.simulateV2).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const circuit: CircuitData = { num_qubits: 1, num_clbits: 0, shots: 64, operations: [] };
  const { rerender } = render(<StatePreviewPanel circuit={circuit} />);
  fireEvent.click(screen.getByRole("button", { name: /Compare with backend result/ }));
  rerender(<StatePreviewPanel circuit={{ ...circuit, shots: 128 }} />);
  await act(async () => { finish({ selected_engine: "stale-engine", state_analysis: { available: false, unavailable_reason: "obsolete circuit response" } } as SimulationV2Response); });
  expect(screen.queryByText("obsolete circuit response")).toBeNull();
  expect(screen.getByRole("button", { name: /Compare with backend result/ }).hasAttribute("disabled")).toBe(false);
});
