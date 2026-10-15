/**
 * Talks to the React Native screen hosting the game (mobile/src/app/play/street.tsx).
 * In a plain browser (development) there's no host, so messages are dropped.
 */
import { blendStats, ROSTER, type FanAverages, type RosterPlayer } from "./roster";

/** What the app injects as `window.__STREET__` before the page loads. */
export interface HostConfig {
  /** Fan-voted averages per player key ("neymar"…), from the player's Home Kit card. */
  ratings?: Record<string, { averages: FanAverages; voteCount: number }>;
  /** True when hosted by the app (shows Exit instead of reloading). */
  app?: boolean;
  /** The app's session token, for playing online (the website uses its cookie). */
  token?: string;
  /** The website the API is on (default: the page's own origin). */
  api?: string;
  /** Room code from an invite link: join it straight away. */
  room?: string;
}

declare global {
  interface Window {
    __STREET__?: HostConfig;
    ReactNativeWebView?: { postMessage(msg: string): void };
  }
}

export const host: HostConfig = window.__STREET__ ?? {};

export type HostMessage =
  | { type: "ready" }
  | { type: "haptic"; style: "light" | "medium" | "heavy" | "success" | "error" }
  /** `home`: your goals, `away`: theirs (online you may be the away side). */
  | { type: "result"; home: number; away: number; won: boolean; online?: boolean }
  /** Online invite: the app shows the share sheet. */
  | { type: "share"; text: string; url: string }
  | { type: "exit" };

export function send(msg: HostMessage) {
  window.ReactNativeWebView?.postMessage(JSON.stringify(msg));
}

export const haptic = (style: Extract<HostMessage, { type: "haptic" }>["style"]) => send({ type: "haptic", style });

/** The roster with fan ratings blended into each player's stats. */
export function rosterWithRatings(): RosterPlayer[] {
  return ROSTER.map((p) => {
    const r = host.ratings?.[p.key];
    return { ...p, stats: blendStats(p.stats, r?.averages, r?.voteCount ?? 0) };
  });
}

/**
 * On the website there's no app to pass ratings in, so fetch them from the
 * site's own API (same origin as the page). Resolves to {} if that fails.
 */
export async function fetchWebRatings(): Promise<NonNullable<HostConfig["ratings"]>> {
  const get = async <T,>(url: string): Promise<T> => {
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return (await res.json()) as T;
  };
  const { cards } = await get<{ cards: { id: string; name: string; kit: string | null }[] }>("/api/channels/5iveguysfc/cards");
  const wanted = new Map(ROSTER.map((p) => [p.name, p.key]));
  const home = cards.filter((c) => c.kit === "Home Kit" && wanted.has(c.name));
  const entries = await Promise.all(home.map(async (c) => {
    const v = await get<{ averages: FanAverages; voteCount: number }>(`/api/cards/${c.id}/votes`);
    return [wanted.get(c.name)!, { averages: v.averages, voteCount: v.voteCount }] as const;
  }));
  return Object.fromEntries(entries);
}

/** Re-blend each player's stats with newly arrived fan ratings (in place). */
export function applyRatings(roster: RosterPlayer[], ratings: NonNullable<HostConfig["ratings"]>) {
  for (const p of roster) {
    const base = ROSTER.find((r) => r.key === p.key)?.stats;
    const r = ratings[p.key];
    if (base && r) p.stats = blendStats(base, r.averages, r.voteCount);
  }
}
