/**
 * The website's API, for playing online. On the website the page is on the
 * same origin and the session cookie signs requests; in the app the WebView
 * passes the app's session token in (`window.__STREET__.token`).
 */
import { host } from "../bridge";

export interface Me {
  user: { id: string; name: string; image: string | null };
  pusher: { key: string; cluster: string };
  /** Signs room messages sent through /api/street/relay. */
  relay: string;
}

export interface OpenRoom {
  code: string;
  host: { name: string; image: string | null };
}

export const apiBase = () => host.api ?? "";
export const authHeaders = (): Record<string, string> => (host.token ? { Authorization: `Bearer ${host.token}` } : {});

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, { headers: authHeaders(), credentials: host.token ? "omit" : "same-origin" });
  if (!res.ok) throw Object.assign(new Error(`${path}: ${res.status}`), { status: res.status });
  return (await res.json()) as T;
}

/** Who's signed in, or null if nobody is. */
export async function getMe(): Promise<Me | null> {
  try {
    return await get<Me>("/api/street/me");
  } catch (e) {
    if ((e as { status?: number }).status === 401) return null;
    throw e;
  }
}

export async function listRooms(): Promise<OpenRoom[]> {
  return (await get<{ rooms: OpenRoom[] }>("/api/street/rooms")).rooms;
}

/**
 * Post a message to the other player in a room (through the website and Pusher).
 * `keepalive` lets a goodbye get out as the page closes.
 */
export async function relay(me: Me, room: string, socketId: string | undefined, msg: unknown, keepalive = false) {
  const res = await fetch(`${apiBase()}/api/street/relay`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-street-relay": me.relay },
    credentials: "omit",
    body: JSON.stringify({ room, socketId, msg }),
    keepalive,
  });
  if (!res.ok) throw new Error(`relay: ${res.status}`);
}

/**
 * Website only: sign in with Google and come back to the game (what next-auth's
 * `signIn("google", { callbackUrl })` does, without React).
 */
export async function signInOnWebsite(callbackUrl: string) {
  const { csrfToken } = (await (await fetch("/api/auth/csrf")).json()) as { csrfToken: string };
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/auth/signin/google";
  for (const [k, v] of Object.entries({ csrfToken, callbackUrl })) {
    const i = document.createElement("input");
    i.type = "hidden";
    i.name = k;
    i.value = v;
    form.appendChild(i);
  }
  document.body.appendChild(form);
  form.submit();
}
