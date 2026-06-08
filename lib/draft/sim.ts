import type { PlacedPlayer, Formation, RatingsMode } from "./types";
import { NATIONS, effectiveRating, playerPositions } from "./nations";
import { POS_GROUP, playerFitsSlot } from "./formations";

// ─────────────────────────── Team rating ───────────────────────────

const LINE_WEIGHT: Record<string, number> = { GK: 1, DEF: 1, MID: 1.1, ATT: 1.15 };

/**
 * Overall rating of a drafted XI. Players slotted out of their natural position
 * take a small penalty, so picking sensible fits is rewarded.
 */
export function teamRating(placed: PlacedPlayer[], formation: Formation): number {
  if (placed.length === 0) return 0;
  let weighted = 0;
  let weightSum = 0;
  for (const p of placed) {
    const slot = formation.slots[p.slotIndex];
    if (!slot) continue;
    const fits = playerFitsSlot(playerPositions(p.player), slot.label);
    const exact = p.player.pos === slot.label;
    const penalty = exact ? 0 : fits ? 2 : 6;
    const w = LINE_WEIGHT[slot.group] ?? 1;
    weighted += (p.player.rating - penalty) * w;
    weightSum += w;
  }
  return weightSum ? Math.round(weighted / weightSum) : 0;
}

/** Attack / defence / midfield splits, for slightly richer match sim. */
export function teamLines(placed: PlacedPlayer[], formation: Formation) {
  const buckets: Record<string, number[]> = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const p of placed) {
    const slot = formation.slots[p.slotIndex];
    if (!slot) continue;
    const fits = playerFitsSlot(playerPositions(p.player), slot.label);
    const exact = p.player.pos === slot.label;
    const penalty = exact ? 0 : fits ? 2 : 6;
    buckets[slot.group].push(p.player.rating - penalty);
  }
  const avg = (arr: number[], fallback: number) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : fallback;
  const base = teamRating(placed, formation);
  return {
    gk: avg(buckets.GK, base),
    def: avg(buckets.DEF, base),
    mid: avg(buckets.MID, base),
    att: avg(buckets.ATT, base),
  };
}

// ─────────────────────────── Opponents ───────────────────────────

export interface Opponent {
  id: string;
  name: string;
  flag: string;
  rating: number;
}

/** Strength of a nation = average of its 11 best players in the chosen mode. */
function nationStrength(nationIdx: number, mode: RatingsMode): number {
  const players = NATIONS[nationIdx].players
    .map((p) => effectiveRating(p, mode))
    .sort((a, b) => b - a)
    .slice(0, 11);
  return Math.round(players.reduce((a, b) => a + b, 0) / players.length);
}

export function allOpponents(mode: RatingsMode): Opponent[] {
  return NATIONS.map((n, i) => ({
    id: n.id,
    name: n.name,
    flag: n.flag,
    rating: nationStrength(i, mode),
  }));
}

// ─────────────────────────── Match engine ───────────────────────────

export interface Scoreline {
  userGoals: number;
  oppGoals: number;
  userPens?: number;
  oppPens?: number;
}

export interface MatchResult {
  stage: string;
  opponent: Opponent;
  userGoals: number;
  oppGoals: number;
  userPens?: number;
  oppPens?: number;
  /** "W" | "D" | "L" from the user's perspective (after pens in knockouts). */
  outcome: "W" | "D" | "L";
}

function poisson(lambda: number): number {
  // Knuth's algorithm.
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

/** Expected goals for `attack` line vs opposing `defence`, anchored at ~1.4. */
function expectedGoals(attackMid: number, oppDefMid: number): number {
  const diff = attackMid - oppDefMid;
  const xg = 1.35 * Math.pow(1.045, diff);
  return Math.max(0.15, Math.min(4.2, xg));
}

interface SimTeam {
  att: number;
  mid: number;
  def: number;
  overall: number;
}

function playMatch(user: SimTeam, opp: SimTeam, knockout: boolean): Scoreline {
  const userAttMid = (user.att * 0.65 + user.mid * 0.35);
  const oppAttMid = (opp.att * 0.65 + opp.mid * 0.35);
  const userDefMid = (user.def * 0.65 + user.mid * 0.35);
  const oppDefMid = (opp.def * 0.65 + opp.mid * 0.35);

  let userGoals = poisson(expectedGoals(userAttMid, oppDefMid));
  let oppGoals = poisson(expectedGoals(oppAttMid, userDefMid));

  if (!knockout || userGoals !== oppGoals) {
    return { userGoals, oppGoals };
  }

  // Extra time: one more low-scoring mini-period.
  userGoals += poisson(expectedGoals(userAttMid, oppDefMid) * 0.35);
  oppGoals += poisson(expectedGoals(oppAttMid, userDefMid) * 0.35);
  if (userGoals !== oppGoals) {
    return { userGoals, oppGoals };
  }

  // Penalties — edge to the stronger side, but always a coin-flip element.
  const edge = (user.overall - opp.overall) * 0.012;
  let userPens = 0;
  let oppPens = 0;
  for (let i = 0; i < 5; i++) {
    if (Math.random() < 0.75 + edge) userPens++;
    if (Math.random() < 0.75 - edge) oppPens++;
  }
  while (userPens === oppPens) {
    if (Math.random() < 0.75 + edge) userPens++;
    if (Math.random() < 0.75 - edge) oppPens++;
  }
  return { userGoals, oppGoals, userPens, oppPens };
}

// ─────────────────────────── Tournament ───────────────────────────

export type Placement =
  | "Champions"
  | "Runners-up"
  | "Semi-finals"
  | "Quarter-finals"
  | "Round of 16"
  | "Group stage";

export interface TournamentResult {
  teamRating: number;
  matches: MatchResult[];
  /** Group-stage points (3 games). */
  groupPoints: number;
  advancedFromGroup: boolean;
  placement: Placement;
  won: boolean;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

const KNOCKOUT_STAGES: { stage: string; placementIfLost: Placement; minRating: number; maxRating: number }[] = [
  { stage: "Round of 16", placementIfLost: "Round of 16", minRating: 72, maxRating: 82 },
  { stage: "Quarter-final", placementIfLost: "Quarter-finals", minRating: 78, maxRating: 86 },
  { stage: "Semi-final", placementIfLost: "Semi-finals", minRating: 82, maxRating: 89 },
  { stage: "Final", placementIfLost: "Runners-up", minRating: 84, maxRating: 91 },
];

function pickOpponent(pool: Opponent[], min: number, max: number, used: Set<string>): Opponent {
  const inBand = pool.filter((o) => o.rating >= min && o.rating <= max && !used.has(o.id));
  const fallback = pool.filter((o) => !used.has(o.id));
  const list = inBand.length ? inBand : fallback.length ? fallback : pool;
  return list[Math.floor(Math.random() * list.length)];
}

export function simulateTournament(
  placed: PlacedPlayer[],
  formation: Formation,
  mode: RatingsMode,
): TournamentResult {
  const lines = teamLines(placed, formation);
  const overall = teamRating(placed, formation);
  const user: SimTeam = { att: lines.att, mid: lines.mid, def: lines.def, overall };

  const pool = allOpponents(mode).filter((o) => o.rating > 0);
  const used = new Set<string>();

  const matches: MatchResult[] = [];
  let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0, groupPoints = 0;

  const record = (stage: string, opp: Opponent, sc: Scoreline) => {
    const decided = sc.userPens != null ? (sc.userPens > sc.oppPens!) : sc.userGoals > sc.oppGoals;
    const outcome: "W" | "D" | "L" = sc.userPens != null
      ? (decided ? "W" : "L")
      : sc.userGoals > sc.oppGoals ? "W" : sc.userGoals < sc.oppGoals ? "L" : "D";
    matches.push({ stage, opponent: opp, ...sc, outcome });
    goalsFor += sc.userGoals;
    goalsAgainst += sc.oppGoals;
    if (outcome === "W") wins++;
    else if (outcome === "L") losses++;
    else draws++;
    return outcome;
  };

  // Group stage — 3 matches vs a spread of opponents.
  const groupBands: [number, number][] = [[68, 78], [74, 84], [80, 90]];
  for (let g = 0; g < 3; g++) {
    const opp = pickOpponent(pool, groupBands[g][0], groupBands[g][1], used);
    used.add(opp.id);
    const sc = playMatch(user, oppTeam(opp), false);
    const outcome = record(`Group Match ${g + 1}`, opp, sc);
    if (outcome === "W") groupPoints += 3;
    else if (outcome === "D") groupPoints += 1;
  }

  const gd = goalsFor - goalsAgainst;
  const advancedFromGroup = groupPoints >= 5 || (groupPoints === 4 && gd >= 0) || (groupPoints === 3 && gd >= 3);

  if (!advancedFromGroup) {
    return finalize(matches, groupPoints, false, "Group stage", overall, wins, draws, losses, goalsFor, goalsAgainst);
  }

  let placement: Placement = "Round of 16";
  let won = false;
  for (const ks of KNOCKOUT_STAGES) {
    const opp = pickOpponent(pool, ks.minRating, ks.maxRating, used);
    used.add(opp.id);
    const sc = playMatch(user, oppTeam(opp), true);
    const outcome = record(ks.stage, opp, sc);
    if (outcome === "L") {
      placement = ks.placementIfLost;
      return finalize(matches, groupPoints, true, placement, overall, wins, draws, losses, goalsFor, goalsAgainst);
    }
    if (ks.stage === "Final") {
      placement = "Champions";
      won = true;
    }
  }

  return finalize(matches, groupPoints, true, placement, overall, wins, draws, losses, goalsFor, goalsAgainst);

  function oppTeam(o: Opponent): SimTeam {
    return { att: o.rating, mid: o.rating, def: o.rating, overall: o.rating };
  }
  function finalize(
    m: MatchResult[], pts: number, adv: boolean, place: Placement, ovr: number,
    w: number, d: number, l: number, gf: number, ga: number,
  ): TournamentResult {
    return {
      teamRating: ovr, matches: m, groupPoints: pts, advancedFromGroup: adv,
      placement: place, won: place === "Champions", wins: w, draws: d, losses: l,
      goalsFor: gf, goalsAgainst: ga,
    };
  }
}

/** Convenience: positions broad-bucket for a slot, used by the UI position picker. */
export { POS_GROUP };
