const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, readonly code?: string, readonly status?: number, readonly requestId?: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(init?.headers || {}) },
  });
  const body: any = await response.json().catch(() => ({ error: { message: "The server returned an invalid response." } }));
  if (!response.ok) {
    const error = body?.error;
    const message = typeof error === "string" ? error : error?.message || `Request failed (${response.status}).`;
    throw new ApiError(message, error?.code, response.status, error?.requestId);
  }
  return body as T;
}
