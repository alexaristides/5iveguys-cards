// Exhibition mode: pick any two 7-a-side teams from the full card pool and run
// a one-off friendly through the real match engine. Fully client-side — no DB,
// no ownership checks. Team A maps to the engine's "user" side (blue, bottom),
// Team B to the "cpu" side (red, top).

import {
  type AssignedPlayer, type Formation, type FootballCard, type MatchEvent,
  type Rarity, calcTeamStats,
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
  const frames = momentsToFrames([...h1.moments, ...h2.moments]);
  const events = [...h1.events, ...h2.events];

  const aScore = h2.endScore.user;
  const bScore = h2.endScore.cpu;

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
  };
}
