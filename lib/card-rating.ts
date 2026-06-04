// ── Position-aware card overall rating ────────────────────────────────────────
//
// Cards are rated by fans across 11 attributes. A flat average punishes
// specialists: a goalkeeper scores ~0 on Attack / Skill Moves / Speed, which
// are irrelevant to the role, dragging their overall far below an outfield
// player. To fix that, each position weights the attributes that actually
// matter for it — a keeper's overall is driven by Goalkeeping, an outfield
// player's by their on-the-ball stats — so every card is judged on its own job.
//
// Cards with no position (or the "Moment" screenshot cards) fall back to a
// plain average, preserving the original behaviour.

export const STAT_FIELDS = [
  "attack", "defense", "speed", "strength", "skillMoves",
  "iq", "aura", "goalkeeping", "agility", "celebration", "clutch",
] as const;

export type StatKey = (typeof STAT_FIELDS)[number];
export type StatsMap = Record<StatKey, number>;

export type RatingPosition =
  | "GK" | "DEF" | "CDM" | "CM" | "CAM" | "LW" | "RW" | "ST" | "Moment";

// Relative attribute weights per position. Values are not required to sum to
// anything — the overall is the weighted mean, so only their ratios matter.
// A weight of 0 means the attribute is ignored entirely for that role.
const POSITION_WEIGHTS: Record<RatingPosition, StatsMap> = {
  GK:  { goalkeeping: 5, defense: 2, agility: 2, iq: 2, clutch: 2, strength: 1, aura: 1, celebration: 1, speed: 1, attack: 0, skillMoves: 0 },
  DEF: { defense: 5, strength: 3, speed: 2, iq: 2, clutch: 1.5, agility: 1, aura: 1, celebration: 1, skillMoves: 1, attack: 1, goalkeeping: 0 },
  CDM: { defense: 4, iq: 3, strength: 2.5, speed: 1.5, skillMoves: 1.5, attack: 1.5, clutch: 1.5, agility: 1, aura: 1, celebration: 1, goalkeeping: 0 },
  CM:  { iq: 3, skillMoves: 2.5, attack: 2, defense: 2, speed: 2, strength: 1.5, agility: 1.5, clutch: 1.5, aura: 1, celebration: 1, goalkeeping: 0 },
  CAM: { attack: 3, skillMoves: 3, iq: 2.5, agility: 2, speed: 2, clutch: 1.5, aura: 1.5, celebration: 1.5, strength: 1, defense: 1, goalkeeping: 0 },
  LW:  { speed: 3.5, agility: 3, skillMoves: 3, attack: 2.5, clutch: 1.5, iq: 1.5, aura: 1.5, celebration: 1.5, strength: 1, defense: 0.5, goalkeeping: 0 },
  RW:  { speed: 3.5, agility: 3, skillMoves: 3, attack: 2.5, clutch: 1.5, iq: 1.5, aura: 1.5, celebration: 1.5, strength: 1, defense: 0.5, goalkeeping: 0 },
  ST:  { attack: 4, clutch: 2.5, strength: 2.5, speed: 2.5, skillMoves: 2, agility: 1.5, iq: 1.5, aura: 1.5, celebration: 1.5, defense: 0.5, goalkeeping: 0 },
  // Screenshot / highlight cards aren't players — rate them on the flat average.
  Moment: { attack: 1, defense: 1, speed: 1, strength: 1, skillMoves: 1, iq: 1, aura: 1, goalkeeping: 1, agility: 1, celebration: 1, clutch: 1 },
};

function isRatingPosition(p: string | null | undefined): p is RatingPosition {
  return p != null && p in POSITION_WEIGHTS;
}

/**
 * Position-weighted overall (0–100, rounded).
 *
 * @param stats    Average attribute values for the card.
 * @param position Card position. When null/unknown, falls back to a flat mean.
 */
export function computeOverall(stats: StatsMap, position?: string | null): number {
  const weights = isRatingPosition(position)
    ? POSITION_WEIGHTS[position]
    : null;

  if (!weights) {
    const sum = STAT_FIELDS.reduce((s, f) => s + stats[f], 0);
    return Math.round(sum / STAT_FIELDS.length);
  }

  let weighted = 0;
  let totalWeight = 0;
  for (const f of STAT_FIELDS) {
    const w = weights[f];
    weighted += stats[f] * w;
    totalWeight += w;
  }
  return totalWeight > 0 ? Math.round(weighted / totalWeight) : 0;
}

/** Sum/average helper over a list of votes, returning the weighted overall. */
export function overallFromVotes(
  votes: StatsMap[],
  position?: string | null,
): number {
  if (votes.length === 0) return 0;
  const avg = {} as StatsMap;
  for (const f of STAT_FIELDS) {
    avg[f] = votes.reduce((s, v) => s + v[f], 0) / votes.length;
  }
  return computeOverall(avg, position);
}
