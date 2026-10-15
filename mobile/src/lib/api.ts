import { API_URL } from "./config";

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly data: Record<string, unknown>) {
    super(message);
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setApiToken(next: string | null) {
  token = next;
}

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

/** The session token, for screens that call the API from a WebView (5IVE STREET online). */
export const getApiToken = () => token;

export function authHeader(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** JSON request to the website's API, authenticated with the app's session token. */
export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: {
      ...authHeader(),
      ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    credentials: "omit", // the Bearer token is the only credential
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401 && token) onUnauthorized?.();
  if (!res.ok) {
    throw new ApiError(typeof data.error === "string" ? data.error : `Request failed (${res.status})`, res.status, data);
  }
  return data as T;
}
