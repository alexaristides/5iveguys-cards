// Exhibition mode: pick any two 7-a-side teams from the full card pool and run
// a one-off friendly through the real match engine. Fully client-side — no DB,
// no ownership checks. Team A maps to the engine's "user" side (blue, bottom),
// Team B to the "cpu" side (red, top).

import {
  type AssignedPlayer, type Formation, type FootballCard, type MatchEvent,
  type Position, type Rarity, calcTeamStats, getPlayerRating,
} from "./football";
import { CARDS } from "./cards";
import { simulateHalfLogic, momentsToFrames, type MatchFrame } from "./match-engine";

/**
 * Static fallback pool (the legacy 5iveguysfc cards) used only if the live
 * player API returns nothing. These carry no fan-voted stats, so they fall back
 * to rarity-based ratings. In production the pool is fetched from
 * `/api/exhibition/players`, where each player carries their fan-rated stats.
 */
export const EXHIBITION_POOL: FootballCard[] = CARDS.map((c) => ({
  id: c.id,
  name: c.name,
  rarity: c.rarity,
  attribute: c.attribute,
  imageUrl: c.image,
  kit: c.kit ?? null,
}));

export interface ExhibitionScorer {
  cardId: string;
  name: string;
  imageUrl: string;
  rarity: Rarity;
  minute: number;
}

export interface PlayerMatchRating {
  cardId: string;          // side-prefixed id
  side: "A" | "B";
  name: string;
  imageUrl: string;
  rarity: Rarity;
  position: Position;
  rating: number;          // 4.5–10.0, one decimal
  goals: number;
  assists: number;
  saves: number;
}

export interface ExhibitionResult {
  frames: MatchFrame[];
  durationSec: number;
  aScore: number;
  bScore: number;
  aOverall: number;
  bOverall: number;
  winner: "A" | "B" | "draw";
  aScorers: ExhibitionScorer[];
  bScorers: ExhibitionScorer[];
  events: MatchEvent[];
  /** Per-player performance ratings (both teams), plus the man of the match. */
  ratings: PlayerMatchRating[];
  motmCardId: string | null;
  /**
   * The lineups with side-prefixed card ids — these MUST be the ones handed to
   * the pitch component, because the frame data references these same ids. Using
   * the unprefixed lineups would leave every token stranded at kick-off.
   */
  aLineup: AssignedPlayer[];
  bLineup: AssignedPlayer[];
}

/**
 * Prefix a lineup's card ids per side so the two teams never collide when the
 * same card is fielded by both — the engine keys player tokens by card id.
 */
function sidePrefixed(lineup: AssignedPlayer[], side: "A" | "B"): AssignedPlayer[] {
  return lineup.map((p) => ({ ...p, card: { ...p.card, id: `${side}:${p.card.id}` } }));
}

/**
 * Simulate a full exhibition friendly (two halves concatenated into one
 * continuous tape, FM-style). Deterministic for a given seed.
 */
export function simulateExhibition(
  teamA: AssignedPlayer[],
  teamB: AssignedPlayer[],
  formationA: Formation,
  formationB: Formation,
  seed: string,
): ExhibitionResult {
  const aLineup = sidePrefixed(teamA, "A");
  const bLineup = sidePrefixed(teamB, "B");

  const input = {
    userLineup: aLineup, cpuLineup: bLineup,
    userFormation: formationA, cpuFormation: formationB, seed,
  };

  const h1 = simulateHalfLogic(input, 1, { user: 0, cpu: 0 });
  const h2 = simulateHalfLogic(input, 2, h1.endScore, h1.involvements);
  const moments = [...h1.moments, ...h2.moments];
  const frames = momentsToFrames(moments);
  const events = [...h1.events, ...h2.events];

  const aScore = h2.endScore.user;
  const bScore = h2.endScore.cpu;

  // ── Per-player match tallies (goals / assists / keeper saves) ──────────────
  // Read straight off the moments so both teams are covered (the engine's own
  // involvement map only tracks the "user" side).
  const tally = new Map<string, { goals: number; assists: number; saves: number }>();
  const bump = (id: string, key: "goals" | "assists" | "saves") => {
    const t = tally.get(id) ?? { goals: 0, assists: 0, saves: 0 };
    t[key]++;
    tally.set(id, t);
  };
  for (const m of moments) {
    if (m.type === "goal") {
      if (m.scorerCardId) bump(m.scorerCardId, "goals");
      if (m.assisterCardId) bump(m.assisterCardId, "assists");
    } else if (m.type === "save" && m.possessorId) {
      // Save moments record the goalkeeper as possessor.
      bump(m.possessorId, "saves");
    }
  }

  const ratings = ratePlayers(aLineup, bLineup, aScore, bScore, tally);
  let motm: PlayerMatchRating | null = null;
  for (const r of ratings) {
    if (!motm || r.rating > motm.rating ||
        (r.rating === motm.rating && r.goals > motm.goals)) {
      motm = r;
    }
  }

  const nameOf = new Map<string, AssignedPlayer>();
  for (const p of [...aLineup, ...bLineup]) nameOf.set(p.card.id, p);

  const scorersFor = (team: "user" | "cpu"): ExhibitionScorer[] =>
    events
      .filter((ev) => ev.type === "goal" && ev.team === team && ev.scorerCardId)
      .map((ev) => {
        const p = nameOf.get(ev.scorerCardId!);
        return {
          cardId: ev.scorerCardId!,
          name: p?.card.name ?? "—",
          imageUrl: p?.card.imageUrl ?? "",
          rarity: (p?.card.rarity ?? "common") as Rarity,
          minute: ev.minute,
        };
      });

  // ~10 logical frames/sec keeps a full match around 25–35s; capped both ways.
  const durationSec = Math.max(16, Math.min(34, frames.length / 10));

  return {
    frames,
    durationSec,
    aScore,
    bScore,
    aOverall: calcTeamStats(teamA).overall,
    bOverall: calcTeamStats(teamB).overall,
    winner: aScore > bScore ? "A" : bScore > aScore ? "B" : "draw",
    aScorers: scorersFor("user"),
    bScorers: scorersFor("cpu"),
    events,
    ratings,
    motmCardId: motm?.cardId ?? null,
    aLineup,
    bLineup,
  };
}

/**
 * Turn a match into a 4.5–10.0 performance rating per player. Built from the
 * unambiguous, position-aware signals: goals, assists, keeper saves, the result,
 * and clean sheets — nudged by the player's own rating in the slot they played.
 */
function ratePlayers(
  aLineup: AssignedPlayer[],
  bLineup: AssignedPlayer[],
  aScore: number,
  bScore: number,
  tally: Map<string, { goals: number; assists: number; saves: number }>,
): PlayerMatchRating[] {
  const out: PlayerMatchRating[] = [];

  const rateSide = (lineup: AssignedPlayer[], side: "A" | "B", conceded: number, gd: number) => {
    for (const p of lineup) {
      const t = tally.get(p.card.id) ?? { goals: 0, assists: 0, saves: 0 };
      const ovr = getPlayerRating(p.card, p.position);
      const resultMod = gd > 0 ? 0.4 : gd === 0 ? 0.1 : -0.2;
      const cleanSheet = conceded === 0 && (p.position === "GK" || p.position === "DEF") ? 0.5 : 0;
      const raw =
        6.4 +
        (ovr - 75) * 0.025 +     // ±~0.5 from the player's quality in this slot
        t.goals * 1.1 +
        t.assists * 0.7 +
        t.saves * 0.18 +
        resultMod +
        cleanSheet;
      const rating = Math.round(Math.max(4.5, Math.min(10, raw)) * 10) / 10;
      out.push({
        cardId: p.card.id, side, name: p.card.name, imageUrl: p.card.imageUrl,
        rarity: p.card.rarity, position: p.position, rating,
        goals: t.goals, assists: t.assists, saves: t.saves,
      });
    }
  };

  rateSide(aLineup, "A", bScore, aScore - bScore);
  rateSide(bLineup, "B", aScore, bScore - aScore);
  return out;
}
