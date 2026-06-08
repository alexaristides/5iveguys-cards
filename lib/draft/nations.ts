import type { Nation, DraftPlayer, Pos, RatingsMode } from "./types";
import { PART1 } from "./squads/part1";
import { PART2 } from "./squads/part2";
import { PART3 } from "./squads/part3";

export const NATIONS: Nation[] = [...PART1, ...PART2, ...PART3];

/** All 12 group letters present in the dataset. */
export const GROUPS = Array.from(new Set(NATIONS.map((n) => n.group))).sort();

const TOTAL_PLAYERS = NATIONS.reduce((sum, n) => sum + n.players.length, 0);
export const STATS = {
  nations: NATIONS.length,
  players: TOTAL_PLAYERS,
};

/** Effective rating for a player under the chosen ratings mode. */
export function effectiveRating(
  player: { rating: number; peak?: number },
  mode: RatingsMode,
): number {
  if (mode === "peak") return player.peak ?? player.rating;
  return player.rating;
}

/** All positions a player can fill (primary + alts). */
export function playerPositions(player: { pos: Pos; alt?: Pos[] }): Pos[] {
  return [player.pos, ...(player.alt ?? [])];
}

/** Turn a nation's roster into runtime DraftPlayers, sorted best-first. */
export function nationSquad(nation: Nation, mode: RatingsMode): DraftPlayer[] {
  return nation.players
    .map((p) => ({
      ...p,
      nationId: nation.id,
      nationName: nation.name,
      flag: nation.flag,
      group: nation.group,
      uid: `${nation.id}:${p.id}`,
      rating: effectiveRating(p, mode),
    }))
    .sort((a, b) => b.rating - a.rating);
}

export function getNation(id: string): Nation | undefined {
  return NATIONS.find((n) => n.id === id);
}

/** Pick a random nation, optionally excluding ids already used. */
export function randomNation(excludeIds: string[] = []): Nation {
  const pool = NATIONS.filter((n) => !excludeIds.includes(n.id));
  const list = pool.length > 0 ? pool : NATIONS;
  return list[Math.floor(Math.random() * list.length)];
}
