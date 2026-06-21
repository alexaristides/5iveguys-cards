// Bridges the World Cup draft (11-a-side national squads) to the 5iveguys
// football match engine (7-a-side, FM-style animated pitch). A drafted XI and an
// opponent nation are each compressed into a GK + 6 outfield football lineup, then
// a tie is run through the real match engine to produce animation frames + a score.

import seedrandom from "seedrandom";
import {
  type AssignedPlayer, type Formation as FbFormation, type FootballCard,
  type Position, type Attribute, type Rarity,
  calcTeamStats,
} from "@/lib/football";
import { simulateHalfLogic, momentsToFrames, type MatchFrame } from "@/lib/match-engine";
import { POS_GROUP } from "./formations";
import { effectiveRating } from "./nations";
import type { Formation, Nation, PlacedPlayer, PosGroup, RatingsMode } from "./types";

export interface FootballTeam {
  lineup: AssignedPlayer[];
  formation: FbFormation;
  overall: number;
  label: string;
}

export interface TieResult {
  frames: MatchFrame[];
  userGoals: number;
  oppGoals: number;
  userPens?: number;
  oppPens?: number;
}

// A flat player record used to assemble a football lineup.
interface PoolPlayer { id: string; name: string; rating: number; group: Position; flag: string }

// 7-a-side football formation templates (outfield counts; +1 GK).
const FB_TEMPLATES: { f: FbFormation; d: number; m: number; a: number }[] = [
  { f: "2-2-2", d: 2, m: 2, a: 2 },
  { f: "3-2-1", d: 3, m: 2, a: 1 },
  { f: "1-3-2", d: 1, m: 3, a: 2 },
  { f: "2-3-1", d: 2, m: 3, a: 1 },
];

function rarityFor(rating: number): Rarity {
  if (rating >= 87) return "legendary";
  if (rating >= 82) return "epic";
  if (rating >= 76) return "rare";
  return "common";
}

// Position → attribute family, so the engine's attribute-driven commentary still varies.
function attrFor(position: Position): Attribute {
  if (position === "ATT") return "Pace";
  if (position === "MID") return "Skill";
  return "Power"; // DEF + GK
}

// Choose the football shape that best matches the squad's outfield distribution.
// Lines that come up short (need > have) are penalised more than surplus, so the
// engine never has to badly miscast players.
function chooseTemplate(nDef: number, nMid: number, nAtt: number) {
  let best = FB_TEMPLATES[0];
  let bestCost = Infinity;
  for (const t of FB_TEMPLATES) {
    const cost =
      Math.max(0, t.d - nDef) * 2 + Math.max(0, nDef - t.d) +
      Math.max(0, t.m - nMid) * 2 + Math.max(0, nMid - t.m) +
      Math.max(0, t.a - nAtt) * 2 + Math.max(0, nAtt - t.a);
    if (cost < bestCost) { bestCost = cost; best = t; }
  }
  return best;
}

function assembleTeam(pool: PoolPlayer[], label: string, side: "u" | "c"): FootballTeam {
  const toCard = (p: PoolPlayer, position: Position): FootballCard => ({
    id: `${side}:${p.id}`,
    name: p.name,
    rarity: rarityFor(p.rating),
    attribute: attrFor(position),
    imageUrl: "",
    flag: p.flag,
    overall: p.rating,
  });

  const byGroup: Record<PosGroup, PoolPlayer[]> = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const p of pool) byGroup[p.group].push(p);
  (Object.keys(byGroup) as PosGroup[]).forEach((g) => byGroup[g].sort((a, b) => b.rating - a.rating));
  const allSorted = [...pool].sort((a, b) => b.rating - a.rating);

  const used = new Set<string>();
  const gk = byGroup.GK[0] ?? allSorted[0];
  used.add(gk.id);

  const lineup: AssignedPlayer[] = [{ card: toCard(gk, "GK"), position: "GK", posIndex: 0 }];

  const tmpl = chooseTemplate(byGroup.DEF.length, byGroup.MID.length, byGroup.ATT.length);
  const counters: Record<Position, number> = { GK: 1, DEF: 0, MID: 0, ATT: 0 };

  const take = (group: Exclude<Position, "GK">, need: number) => {
    for (let i = 0; i < need; i++) {
      // Prefer a natural-line player; otherwise borrow the best unused outfielder.
      const fromLine = byGroup[group].find((p) => !used.has(p.id));
      const pick = fromLine ?? allSorted.find((p) => p.id !== gk.id && !used.has(p.id));
      if (!pick) return;
      used.add(pick.id);
      lineup.push({ card: toCard(pick, group), position: group, posIndex: counters[group]++ });
    }
  };
  take("DEF", tmpl.d);
  take("MID", tmpl.m);
  take("ATT", tmpl.a);

  return { lineup, formation: tmpl.f, overall: calcTeamStats(lineup).overall, label };
}

/** Build a football team from the user's drafted XI. */
export function placedToFootballTeam(
  placed: PlacedPlayer[], formation: Formation, _mode: RatingsMode, label = "YOU",
): FootballTeam {
  const pool: PoolPlayer[] = placed.map((pp) => {
    const slot = formation.slots[pp.slotIndex];
    const group = (slot ? slot.group : POS_GROUP[pp.player.pos]) as Position;
    return { id: pp.player.uid, name: pp.player.name, rating: pp.player.rating, group, flag: pp.player.flag };
  });
  return assembleTeam(pool, label, "u");
}

/** Build a football team from an opponent nation's best XI. */
export function nationToFootballTeam(nation: Nation, mode: RatingsMode): FootballTeam {
  const players = nation.players.map((p) => ({
    id: p.id,
    name: p.name,
    rating: effectiveRating(p, mode),
    group: POS_GROUP[p.pos] as Position,
    flag: nation.flag,
  }));
  // Keep the strongest ~14 so assembleTeam draws from real talent without huge pools.
  const pool = players.sort((a, b) => b.rating - a.rating).slice(0, 14);
  return assembleTeam(pool, nation.name, "c");
}

// Seeded penalty shootout, weighted by squad overall (mirrors the card game's MatchRunner).
function shootout(seed: string, userOverall: number, cpuOverall: number) {
  const rng = seedrandom(seed);
  const pUser = userOverall / (userOverall + cpuOverall);
  let u = 0, c = 0;
  for (let i = 0; i < 5; i++) { if (rng() < pUser * 0.95) u++; if (rng() < (1 - pUser) * 0.95) c++; }
  while (u === c) { if (rng() < pUser) u++; else c++; }
  return { userPens: u, cpuPens: c };
}

/**
 * Simulate one tie through the football engine, producing a single continuous tape
 * (both halves concatenated, no halftime hold) plus the final scoreline. Knockout
 * draws are decided by a seeded shootout.
 */
export function simulateFootballTie(
  user: FootballTeam, opp: FootballTeam, seed: string, knockout: boolean,
): TieResult {
  const input = {
    userLineup: user.lineup, cpuLineup: opp.lineup,
    userFormation: user.formation, cpuFormation: opp.formation, seed,
  };
  const h1 = simulateHalfLogic(input, 1, { user: 0, cpu: 0 });
  const h2 = simulateHalfLogic(input, 2, h1.endScore, h1.involvements);
  const frames = momentsToFrames([...h1.moments, ...h2.moments]);

  const userGoals = h2.endScore.user;
  const oppGoals = h2.endScore.cpu;
  if (knockout && userGoals === oppGoals) {
    const so = shootout(`${seed}:pens`, user.overall, opp.overall);
    return { frames, userGoals, oppGoals, userPens: so.userPens, oppPens: so.cpuPens };
  }
  return { frames, userGoals, oppGoals };
}
