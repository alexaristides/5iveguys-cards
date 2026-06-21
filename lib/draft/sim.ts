import type { PlacedPlayer, Formation, RatingsMode } from "./types";
import { NATIONS, effectiveRating, playerPositions, getNation } from "./nations";
import { POS_GROUP, playerFitsSlot } from "./formations";
import {
  placedToFootballTeam, nationToFootballTeam, simulateFootballTie, type FootballTeam,
} from "./match-adapter";
import type { AssignedPlayer } from "@/lib/football";
import type { MatchFrame } from "@/lib/match-engine";

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

/** Animation tape + lineups for one tournament tie, played back in SimScreen. */
export interface MatchPlayback {
  stage: string;
  opponent: Opponent;
  userLineup: AssignedPlayer[];
  cpuLineup: AssignedPlayer[];
  userLabel: string;
  cpuLabel: string;
  frames: MatchFrame[];
  /** Real-time length of the clip in seconds (final ties run longer). */
  durationSec: number;
  knockout: boolean;
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
  /** One animated playback per match in `matches`, same order. */
  playbacks: MatchPlayback[];
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
  const overall = teamRating(placed, formation);
  const userFb: FootballTeam = placedToFootballTeam(placed, formation, mode);
  const seed = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const pool = allOpponents(mode).filter((o) => o.rating > 0);
  const used = new Set<string>();

  const matches: MatchResult[] = [];
  const playbacks: MatchPlayback[] = [];
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

  // Run one tie through the football engine: animate it + record the scoreline.
  const playTie = (stage: string, opp: Opponent, knockout: boolean): "W" | "D" | "L" => {
    const nation = getNation(opp.id);
    const oppFb = nation
      ? nationToFootballTeam(nation, mode)
      : userFb; // unreachable in practice — opponents always come from NATIONS
    const tie = simulateFootballTie(userFb, oppFb, `${seed}:m${playbacks.length}`, knockout);
    const sc: Scoreline = {
      userGoals: tie.userGoals, oppGoals: tie.oppGoals,
      userPens: tie.userPens, oppPens: tie.oppPens,
    };
    const outcome = record(stage, opp, sc);
    playbacks.push({
      stage, opponent: opp,
      userLineup: userFb.lineup, cpuLineup: oppFb.lineup,
      userLabel: userFb.label, cpuLabel: opp.name,
      frames: tie.frames, durationSec: stage === "Final" ? 20 : 10, knockout,
    });
    return outcome;
  };

  // Group stage — 3 matches vs a spread of opponents.
  const groupBands: [number, number][] = [[68, 78], [74, 84], [80, 90]];
  for (let g = 0; g < 3; g++) {
    const opp = pickOpponent(pool, groupBands[g][0], groupBands[g][1], used);
    used.add(opp.id);
    const outcome = playTie(`Group Match ${g + 1}`, opp, false);
    if (outcome === "W") groupPoints += 3;
    else if (outcome === "D") groupPoints += 1;
  }

  const gd = goalsFor - goalsAgainst;
  const advancedFromGroup = groupPoints >= 5 || (groupPoints === 4 && gd >= 0) || (groupPoints === 3 && gd >= 3);

  if (!advancedFromGroup) {
    return finalize(matches, groupPoints, false, "Group stage", overall, wins, draws, losses, goalsFor, goalsAgainst);
  }

  let placement: Placement = "Round of 16";
  for (const ks of KNOCKOUT_STAGES) {
    const opp = pickOpponent(pool, ks.minRating, ks.maxRating, used);
    used.add(opp.id);
    const outcome = playTie(ks.stage, opp, true);
    if (outcome === "L") {
      placement = ks.placementIfLost;
      return finalize(matches, groupPoints, true, placement, overall, wins, draws, losses, goalsFor, goalsAgainst);
    }
    if (ks.stage === "Final") placement = "Champions";
  }

  return finalize(matches, groupPoints, true, placement, overall, wins, draws, losses, goalsFor, goalsAgainst);

  function finalize(
    m: MatchResult[], pts: number, adv: boolean, place: Placement, ovr: number,
    w: number, d: number, l: number, gf: number, ga: number,
  ): TournamentResult {
    return {
      teamRating: ovr, matches: m, playbacks, groupPoints: pts, advancedFromGroup: adv,
      placement: place, won: place === "Champions", wins: w, draws: d, losses: l,
      goalsFor: gf, goalsAgainst: ga,
    };
  }
}

/** Convenience: positions broad-bucket for a slot, used by the UI position picker. */
export { POS_GROUP };
