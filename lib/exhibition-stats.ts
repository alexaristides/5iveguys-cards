// Client-side, persistent Exhibition stats. Kept in localStorage (no server) so
// the "hall of fame" — games played, most-picked players, most wins — survives
// across sessions on the same device.

import type { Rarity } from "./football";

export interface PlayerStat {
  id: string;
  name: string;
  imageUrl: string;
  rarity: Rarity;
  picks: number;   // appearances in a fielded team
  wins: number;    // appearances on the winning side
  goals: number;
}

export interface ExhibitionStats {
  gamesPlayed: number;
  players: Record<string, PlayerStat>;
}

export interface MatchPlayerEntry {
  id: string;
  name: string;
  imageUrl: string;
  rarity: Rarity;
  won: boolean;
  goals: number;
}

const KEY = "exhibition_stats_v1";

const EMPTY: ExhibitionStats = { gamesPlayed: 0, players: {} };

export function readExhibitionStats(): ExhibitionStats {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as ExhibitionStats;
    if (typeof parsed.gamesPlayed !== "number" || typeof parsed.players !== "object") return EMPTY;
    return parsed;
  } catch {
    return EMPTY;
  }
}

/** Record one completed match and return the updated, persisted stats. */
export function recordExhibitionMatch(entries: MatchPlayerEntry[]): ExhibitionStats {
  const stats = readExhibitionStats();
  const next: ExhibitionStats = {
    gamesPlayed: stats.gamesPlayed + 1,
    players: { ...stats.players },
  };
  for (const e of entries) {
    const prev = next.players[e.id] ?? {
      id: e.id, name: e.name, imageUrl: e.imageUrl, rarity: e.rarity,
      picks: 0, wins: 0, goals: 0,
    };
    next.players[e.id] = {
      ...prev,
      // refresh display fields in case art/name changed
      name: e.name, imageUrl: e.imageUrl, rarity: e.rarity,
      picks: prev.picks + 1,
      wins: prev.wins + (e.won ? 1 : 0),
      goals: prev.goals + e.goals,
    };
  }
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota / private mode */ }
  }
  return next;
}

export function topPlayers(
  stats: ExhibitionStats,
  by: "picks" | "wins" | "goals",
  limit = 5,
): PlayerStat[] {
  return Object.values(stats.players)
    .filter((p) => p[by] > 0)
    .sort((a, b) => b[by] - a[by] || b.wins - a.wins || a.name.localeCompare(b.name))
    .slice(0, limit);
}
