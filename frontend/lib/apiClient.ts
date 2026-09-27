const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface HealthResponse {
  status: string;
}

function formatDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          const message = (item as { msg?: unknown }).msg;
          return typeof message === "string" ? message : null;
        }
        return null;
      })
      .filter((item): item is string => Boolean(item));
    if (messages.length) return messages.join("; ");
  }
  return fallback;
}

export function getApiUrl(): string {
  return API_URL;
}

let accountSession: string | null = null;
function sessionId(): string {
  if (accountSession) return accountSession;
  const key = "quantum-composer.account-session";
  try { accountSession = window.sessionStorage.getItem(key); } catch { /* in-memory fallback */ }
  if (!accountSession || !/^[a-f0-9]{64}$/.test(accountSession)) {
    accountSession = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
    try { window.sessionStorage.setItem(key, accountSession); } catch { /* in-memory fallback */ }
  }
  return accountSession;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, timeoutMs = 90_000): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (path.startsWith("/hardware/")) headers.set("X-Quantum-Session", sessionId());
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init, headers, signal: controller.signal });
    const payload = await response.json().catch((error: unknown) => {
      if (controller.signal.aborted) throw error;
      return null;
    }) as unknown;
    if (!response.ok) {
      const detail = payload && typeof payload === "object" && "detail" in payload
        ? (payload as { detail?: unknown }).detail : null;
      throw new Error(formatDetail(detail, `Backend request failed (${response.status} ${response.statusText}).`));
    }
    if (payload === null) throw new Error("The backend returned an invalid JSON response.");
    return payload as T;
  } catch (error) {
    if (timedOut) throw new Error(`The backend did not respond within ${Math.ceil(timeoutMs / 1000)} seconds.`);
    if (init.signal?.aborted) throw new DOMException("The request was canceled.", "AbortError");
    if (error instanceof TypeError) throw new Error(`The Quantum Composer backend is unreachable at ${API_URL}. Confirm the service is running and retry.`);
    throw error;
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abort);
  }
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "POST", body: JSON.stringify(body) });
}
