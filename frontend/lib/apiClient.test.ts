// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { apiRequest } from "./apiClient";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("honors cancellation supplied by the caller", async () => {
  vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  })));
  const controller = new AbortController();
  const result = apiRequest("/health", { signal: controller.signal });
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
});
it("keeps the timeout active while reading the response body", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => ({ ok: true, json: () => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  }) })));
  const assertion = expect(apiRequest("/health", {}, 1000)).rejects.toThrow("within 1 seconds");
  await vi.advanceTimersByTimeAsync(1000);
  await assertion;
});
it("attaches an opaque session identifier to hardware calls", async () => {
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
  vi.stubGlobal("fetch", fetch);
  await apiRequest("/hardware/status");
  const options = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(new Headers(options[1].headers).get("X-Quantum-Session")).toMatch(/^[a-f0-9]{64}$/);
});
