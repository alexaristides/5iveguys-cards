// Bridges the World Cup draft to the 5iveguys football match engine (the FM-style
// animated pitch). Both sides field a full 11, positioned by the draft formation's
// real slot coordinates (the engine reads each player's explicit `home`), then a tie
// is run through the real match engine to produce animation frames + a score.

import seedrandom from "seedrandom";
import {
  type AssignedPlayer, type Formation as FbFormation, type FootballCard,
  type Position, type Attribute, type Rarity, type TacticalMods,
  calcTeamStats,
} from "@/lib/football";
import { simulateHalfLogic, momentsToFrames, type MatchFrame } from "@/lib/match-engine";
import { getFormation, playerFitsSlot } from "./formations";
import { effectiveRating, playerPositions } from "./nations";
import type { Formation, Nation, PlacedPlayer, RatingsMode } from "./types";

export interface FootballTeam {
  lineup: AssignedPlayer[];
  formation: FbFormation;
  mods: TacticalMods;
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

// Positioning comes from explicit home coords, so the football Formation string is
// just a placeholder for the engine input ("2-2-2" = neutral). Tactical weighting is
// supplied explicitly via `mods` below.
const PLACEHOLDER_FORMATION: FbFormation = "2-2-2";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Tactical multipliers derived from a draft formation's shape (broad-line counts,
 * the same buckets the engine averages over). Centred on a 4-defender / 4-midfield /
 * 2-attacker balance, so a 4-4-2 is neutral, 3-4-3 leans attacking, 5-3-2 defensive,
 * 4-2-3-1 dominates midfield. Wing-backs count as defenders (their engine group).
 */
export function tacticalModsFor(formation: Formation): TacticalMods {
  let def = 0, mid = 0, att = 0;
  for (const s of formation.slots) {
    if (s.group === "DEF") def++;
    else if (s.group === "MID") mid++;
    else if (s.group === "ATT") att++;
  }
  return {
    atkMult: clamp(1 + 0.1 * (att - 2), 0.8, 1.3),
    defMult: clamp(1 + 0.07 * (def - 4), 0.8, 1.25),
    midMult: clamp(1 + 0.07 * (mid - 4), 0.8, 1.25),
    extraPoss: mid >= 5,
  };
}

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

function toCard(
  p: { id: string; name: string; rating: number; flag: string },
  position: Position, side: "u" | "c",
): FootballCard {
  return {
    id: `${side}:${p.id}`,
    name: p.name,
    rarity: rarityFor(p.rating),
    attribute: attrFor(position),
    imageUrl: "",
    flag: p.flag,
    overall: p.rating,
  };
}

/** Build a football team from the user's drafted XI, keeping each slot's pitch spot. */
export function placedToFootballTeam(
  placed: PlacedPlayer[], formation: Formation, _mode: RatingsMode, label = "YOU",
): FootballTeam {
  const lineup: AssignedPlayer[] = [];
  const counters: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const pp of placed) {
    const slot = formation.slots[pp.slotIndex];
    if (!slot) continue;
    const group = slot.group as Position;
    lineup.push({
      card: toCard({ id: pp.player.uid, name: pp.player.name, rating: pp.player.rating, flag: pp.player.flag }, group, "u"),
      position: group,
      posIndex: counters[group]++,
      home: { x: slot.x, y: slot.y },
    });
  }
  return {
    lineup, formation: PLACEHOLDER_FORMATION, mods: tacticalModsFor(formation),
    overall: calcTeamStats(lineup).overall, label,
  };
}

/** Build an opponent nation's best XI into a 4-3-3, filling each slot with a best fit. */
export function nationToFootballTeam(nation: Nation, mode: RatingsMode, formationId = "433"): FootballTeam {
  const formation = getFormation(formationId);
  const players = nation.players
    .map((p) => ({ id: p.id, name: p.name, rating: effectiveRating(p, mode), pos: p.pos, alt: p.alt, flag: nation.flag }))
    .sort((a, b) => b.rating - a.rating);

  const used = new Set<string>();
  const lineup: AssignedPlayer[] = [];
  const counters: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const slot of formation.slots) {
    const group = slot.group as Position;
    // Best-rated unused player that fits the slot; otherwise the best remaining.
    const pick =
      players.find((p) => !used.has(p.id) && playerFitsSlot(playerPositions(p), slot.label)) ??
      players.find((p) => !used.has(p.id));
    if (!pick) break;
    used.add(pick.id);
    lineup.push({
      card: toCard(pick, group, "c"),
      position: group,
      posIndex: counters[group]++,
      home: { x: slot.x, y: slot.y },
    });
  }
  return {
    lineup, formation: PLACEHOLDER_FORMATION, mods: tacticalModsFor(formation),
    overall: calcTeamStats(lineup).overall, label: nation.name,
  };
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
    userMods: user.mods, cpuMods: opp.mods,
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
