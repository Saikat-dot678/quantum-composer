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

export async function apiRequest<T>(path: string, init: RequestInit = {}, timeoutMs?: number): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const controller = timeoutMs ? new AbortController() : null;
  const timeout = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      ...init,
      headers,
      signal: controller?.signal ?? init.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`The backend did not respond within ${Math.ceil((timeoutMs ?? 0) / 1000)} seconds.`);
    }
    throw new Error(
      `The Quantum Composer backend is unreachable at ${API_URL}. Start the FastAPI service and confirm NEXT_PUBLIC_API_URL, then retry.`,
    );
  } finally {
    if (timeout !== null) window.clearTimeout(timeout);
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "detail" in payload
      ? (payload as { detail?: unknown }).detail
      : null;
    throw new Error(formatDetail(detail, `Backend request failed (${response.status} ${response.statusText}).`));
  }
  return payload as T;
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "POST", body: JSON.stringify(body) });
}
