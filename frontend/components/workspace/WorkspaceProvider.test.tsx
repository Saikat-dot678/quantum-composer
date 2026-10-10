// @vitest-environment jsdom
import React from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceProvider, useWorkspace } from "./WorkspaceProvider";
import { getProject, saveNewProject, setLastActiveProjectId } from "@/lib/projects";

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const mount = () => renderHook(useWorkspace, { wrapper: ({ children }) => <WorkspaceProvider>{children}</WorkspaceProvider> });
it("flushes edits to their original project before a rapid project switch", () => {
  const { result } = mount();
  act(() => { result.current.createProject("A"); });
  const a = result.current.activeProjectId!;
  act(() => { result.current.setCircuit(value => ({ ...value, shots: 333 })); });
  act(() => { result.current.createProject("B"); });
  const b = result.current.activeProjectId!;
  act(() => { vi.advanceTimersByTime(1000); });
  expect(getProject(a)?.circuit.shots).toBe(333);
  expect(getProject(b)?.circuit.shots).toBe(1024);
});
it("preserves the current circuit when detaching and deleting the active project", () => {
  const { result } = mount();
  act(() => { result.current.createProject("A"); });
  const id = result.current.activeProjectId!;
  act(() => { result.current.setCircuit(value => ({ ...value, shots: 777 })); });
  act(() => { expect(result.current.deleteProject(id).ok).toBe(true); });
  expect(result.current.activeProjectId).toBeNull();
  expect(JSON.parse(localStorage.getItem("quantum-composer.workspace.v2")!).shots).toBe(777);
  expect(getProject(id)).toBeNull();
});
it("blocks switching if saving the pending edit fails", () => {
  const { result } = mount();
  act(() => { result.current.createProject("A"); });
  const id = result.current.activeProjectId;
  act(() => { result.current.setCircuit(value => ({ ...value, shots: 555 })); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
  act(() => { expect(result.current.createProject("B").ok).toBe(false); });
  expect(result.current.activeProjectId).toBe(id);
  expect(result.current.circuit.shots).toBe(555);
  expect(result.current.saveState).toBe("error");
});
it("flushes on pagehide before the debounce timer fires", () => {
  const { result } = mount();
  act(() => { result.current.createProject("A"); });
  const id = result.current.activeProjectId!;
  act(() => { result.current.setCircuit(value => ({ ...value, shots: 222 })); });
  act(() => { window.dispatchEvent(new Event("pagehide")); });
  expect(getProject(id)?.circuit.shots).toBe(222);
});

it("opens an already-saved project even when storage becomes read-only", () => {
  const saved = saveNewProject("Read only", { num_qubits: 2, num_clbits: 2, shots: 321, operations: [] }).value!;
  setLastActiveProjectId(saved.id);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
  const { result } = mount();
  expect(result.current.activeProjectId).toBe(saved.id);
  expect(result.current.circuit.shots).toBe(321);
  expect(result.current.saveState).toBe("saved");
});
