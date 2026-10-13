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
  | { type: "result"; home: number; away: number; won: boolean }
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
