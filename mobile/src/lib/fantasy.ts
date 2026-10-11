import { isValidStartingSeven, type FantasyPosition } from "@shared/fantasy";
import type { FantasyPlayer } from "./types";

/** Outfield shape of the starting 7 (always one keeper). */
export interface Formation { DEF: number; MID: number; FWD: number }

/** Every legal 7-a-side shape: at least 2 defenders, a midfielder and a forward. */
export const FORMATIONS: Formation[] = [
  { DEF: 3, MID: 2, FWD: 1 }, { DEF: 2, MID: 3, FWD: 1 }, { DEF: 2, MID: 2, FWD: 2 },
  { DEF: 3, MID: 1, FWD: 2 }, { DEF: 2, MID: 1, FWD: 3 }, { DEF: 4, MID: 1, FWD: 1 },
];

export const formationLabel = (f: Formation) => `${f.DEF}-${f.MID}-${f.FWD}`;
const sameFormation = (a: Formation, b: Formation) => a.DEF === b.DEF && a.MID === b.MID && a.FWD === b.FWD;

/** Positions of the 7 starting slots in display order: keeper, defenders, midfielders, forwards. */
export function slotPositions(f: Formation): FantasyPosition[] {
  return ["GK", ...Array<FantasyPosition>(f.DEF).fill("DEF"), ...Array<FantasyPosition>(f.MID).fill("MID"), ...Array<FantasyPosition>(f.FWD).fill("FWD")];
}

const ORDER: Record<FantasyPosition, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

/** A team being edited: starting slots follow the formation, the 2 subs are in bench order. */
export interface Lineup {
  formation: Formation;
  starters: (string | null)[];
  bench: (string | null)[];
}

export const EMPTY_LINEUP: Lineup = { formation: FORMATIONS[0], starters: Array(7).fill(null), bench: [null, null] };

/** Lay out a saved team (7 starters then 2 subs). */
export function lineupFromIds(ids: string[], players: Map<string, FantasyPlayer>): Lineup {
  const pos = (id: string) => players.get(id)?.position ?? "MID";
  const starters = ids.slice(0, 7).sort((a, b) => ORDER[pos(a)] - ORDER[pos(b)]);
  const count = (p: FantasyPosition) => starters.filter((id) => pos(id) === p).length;
  return { formation: { DEF: count("DEF"), MID: count("MID"), FWD: count("FWD") }, starters, bench: ids.slice(7, 9) };
}

/** 7 starters then 2 subs, or null while there are empty slots. */
export function lineupIds(l: Lineup): string[] | null {
  const ids = [...l.starters, ...l.bench];
  return ids.every(Boolean) ? (ids as string[]) : null;
}

export function inLineup(l: Lineup) {
  return new Set([...l.starters, ...l.bench].filter((id): id is string => !!id));
}

/**
 * Switch formation: starters who still fit stay; the rest drop to an empty bench slot,
 * or out of the team if the bench is full.
 */
export function changeFormation(l: Lineup, f: Formation, players: Map<string, FantasyPlayer>): Lineup {
  if (sameFormation(l.formation, f)) return l;
  const slots = slotPositions(f);
  const starters: (string | null)[] = Array(7).fill(null);
  const leftover: string[] = [];
  for (const id of l.starters) {
    if (!id) continue;
    const i = slots.findIndex((p, j) => p === players.get(id)?.position && !starters[j]);
    if (i >= 0) starters[i] = id; else leftover.push(id);
  }
  const bench = [...l.bench];
  for (const id of leftover) {
    const free = bench.indexOf(null);
    if (free >= 0) bench[free] = id;
  }
  return { formation: f, starters, bench };
}

/** Put a player in a slot (replacing whoever was there). */
export function placePlayer(l: Lineup, slot: { kind: "starter" | "bench"; index: number }, id: string): Lineup {
  const starters = l.starters.map((s) => (s === id ? null : s));
  const bench = l.bench.map((s) => (s === id ? null : s));
  if (slot.kind === "starter") starters[slot.index] = id; else bench[slot.index] = id;
  return { ...l, starters, bench };
}

export function removePlayer(l: Lineup, id: string): Lineup {
  return { ...l, starters: l.starters.map((s) => (s === id ? null : s)), bench: l.bench.map((s) => (s === id ? null : s)) };
}

/** Swap a starter with a sub. The formation follows the new 7; null if that 7 isn't legal. */
export function swapWithBench(l: Lineup, starterIndex: number, benchIndex: number, players: Map<string, FantasyPlayer>): Lineup | null {
  const incoming = l.bench[benchIndex];
  const outgoing = l.starters[starterIndex];
  if (!incoming || !outgoing) return null;
  const starters = l.starters.map((s, i) => (i === starterIndex ? incoming : s)) as string[];
  if (starters.some((s) => !s)) return null;
  const positions = starters.map((id) => players.get(id)?.position ?? "MID");
  if (!isValidStartingSeven(positions)) return null;
  const bench = l.bench.map((s, i) => (i === benchIndex ? outgoing : s));
  return { ...lineupFromIds([...starters, ...(bench as string[])], players) };
}

export function formatCountdown(ms: number) {
  if (ms <= 0) return "Locked";
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatDeadline(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
