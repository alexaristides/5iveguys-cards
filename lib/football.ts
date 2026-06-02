import { CARDS, type Rarity, type Attribute } from "./cards";
import {
  createCommentary, GOAL_GENERIC, GOAL_PACE, GOAL_SKILL, GOAL_POWER,
  SAVE_TEMPLATES, MISS_TEMPLATES, NEARPOST_TEMPLATES, TACKLE_TEMPLATES,
  CLEARANCE_TEMPLATES, FREEKICK_TEMPLATES, YELLOW_TEMPLATES, COUNTER_TEMPLATES,
  POSSESSION_TEMPLATES,
} from "./commentary";

export type { Rarity, Attribute };
export type Position = "GK" | "DEF" | "MID" | "ATT";
export type Formation = "2-2-2" | "3-2-1" | "1-3-2" | "2-3-1";
export type MatchPhase =
  | "kickoff"
  | "user-attack"
  | "cpu-attack"
  | "midfield"
  | "halftime";

export interface FootballCard {
  id: string;
  name: string;
  rarity: Rarity;
  attribute: Attribute;
  imageUrl: string;
  kit?: string | null;
}

export interface AssignedPlayer {
  card: FootballCard;
  position: Position;
  posIndex: number;
}

export const FORMATIONS: Record<Formation, { label: string; desc: string; positions: Position[] }> = {
  "2-2-2": { label: "2-2-2", desc: "Balanced",         positions: ["DEF","DEF","MID","MID","ATT","ATT"] },
  "3-2-1": { label: "3-2-1", desc: "Defensive",        positions: ["DEF","DEF","DEF","MID","MID","ATT"] },
  "1-3-2": { label: "1-3-2", desc: "Attacking",        positions: ["DEF","MID","MID","MID","ATT","ATT"] },
  "2-3-1": { label: "2-3-1", desc: "Midfield Control", positions: ["DEF","DEF","MID","MID","MID","ATT"] },
};

const RARITY_RATING: Record<Rarity, number> = {
  common: 63, rare: 73, epic: 83, legendary: 93,
};

const POSITION_ATTR_BONUS: Record<Position, Record<Attribute, number>> = {
  GK:  { Power: 8, Skill: 4, Pace: 2 },
  DEF: { Power: 7, Pace: 5, Skill: 3 },
  MID: { Skill: 8, Pace: 5, Power: 2 },
  ATT: { Pace: 8, Skill: 6, Power: 2 },
};

export function getPlayerRating(card: FootballCard, position: Position): number {
  const base = RARITY_RATING[card.rarity] ?? 63;
  const bonus = POSITION_ATTR_BONUS[position]?.[card.attribute] ?? 3;
  return base + bonus;
}

export function assignPositions(cards: FootballCard[], formation: Formation): AssignedPlayer[] {
  const [gkCard, ...outfield] = cards;
  const positions = FORMATIONS[formation].positions;
  const remaining = [...outfield];
  const posCounters: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  const assigned: AssignedPlayer[] = [{ card: gkCard, position: "GK", posIndex: posCounters.GK++ }];
  for (const pos of positions) {
    if (remaining.length === 0) break;
    let bestIdx = 0, bestRating = getPlayerRating(remaining[0], pos);
    for (let i = 1; i < remaining.length; i++) {
      const r = getPlayerRating(remaining[i], pos);
      if (r > bestRating) { bestRating = r; bestIdx = i; }
    }
    assigned.push({ card: remaining[bestIdx], position: pos, posIndex: posCounters[pos]++ });
    remaining.splice(bestIdx, 1);
  }
  return assigned;
}

// ── Formation tactical modifiers ──────────────────────────────────────────────

export const FORMATION_MODS: Record<Formation, {
  atkMult: number;
  defMult: number;
  midMult: number;
  extraPoss: boolean; // generates extra possession events
}> = {
  "2-2-2": { atkMult: 1.00, defMult: 1.00, midMult: 1.00, extraPoss: false },
  "3-2-1": { atkMult: 0.72, defMult: 1.32, midMult: 0.90, extraPoss: false },
  "1-3-2": { atkMult: 1.32, defMult: 0.72, midMult: 0.90, extraPoss: false },
  "2-3-1": { atkMult: 0.92, defMult: 1.06, midMult: 1.28, extraPoss: true  },
};

// ── Team stats ────────────────────────────────────────────────────────────────

export interface TeamStats {
  attack: number;
  midfield: number;
  defense: number;
  goalkeeping: number;
  overall: number;
}

export function calcTeamStats(lineup: AssignedPlayer[]): TeamStats {
  let atk = 0, atkN = 0, mid = 0, midN = 0, def = 0, defN = 0, gk = 65;
  for (const { card, position } of lineup) {
    const r = getPlayerRating(card, position);
    if (position === "GK") gk = r;
    else if (position === "DEF") { def += r; defN++; }
    else if (position === "MID") { mid += r; midN++; }
    else { atk += r; atkN++; }
  }
  const a = atkN > 0 ? atk / atkN : 65;
  const m = midN > 0 ? mid / midN : 65;
  const d = defN > 0 ? def / defN : 65;
  return { attack: a, midfield: m, defense: d, goalkeeping: gk, overall: (a + m + d + gk) / 4 };
}

// ── Event types & interfaces ──────────────────────────────────────────────────

export type MatchEventType =
  | "kickoff" | "goal" | "save" | "miss" | "tackle" | "clearance"
  | "halftime" | "fulltime" | "possession" | "freekick" | "yellowcard"
  | "nearpost" | "counter"
  | "corner" | "throwin" | "goalkick" | "redcard";

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  team: "user" | "cpu";
  description: string;
  scoreUser: number;
  scoreCpu: number;
  phase: MatchPhase;
  scorerCardId?: string;
  assisterCardId?: string;
}

export interface PlayerInvolvement {
  cardId: string;
  name: string;
  goals: number;
  assists: number;
  imageUrl: string;
}

export interface MatchSimulation {
  events: MatchEvent[];
  userScore: number;
  cpuScore: number;
  result: "win" | "loss" | "draw";
  userOverall: number;
  cpuOverall: number;
  halftimeScore: { user: number; cpu: number };
  mvp: PlayerInvolvement | null;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function rnd<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function pickCard(lineup: AssignedPlayer[], ...positions: Position[]): AssignedPlayer | null {
  const pool = lineup.filter((p) => positions.includes(p.position));
  return pool.length > 0 ? rnd(pool) : null;
}

function pickAttrCard(lineup: AssignedPlayer[], attr: Attribute, ...positions: Position[]): AssignedPlayer | null {
  const pool = lineup.filter((p) => positions.includes(p.position) && p.card.attribute === attr);
  return pool.length > 0 ? rnd(pool) : null;
}

function pickDifferent(lineup: AssignedPlayer[], excludeId: string | null, ...positions: Position[]): AssignedPlayer | null {
  const pool = lineup.filter((p) => positions.includes(p.position) && p.card.id !== excludeId);
  return pool.length > 0 ? rnd(pool) : null;
}

function name(p: AssignedPlayer | null, fallback = "A player"): string {
  return p?.card.name ?? fallback;
}

// ── Commentary pools ──────────────────────────────────────────────────────────

// ── Main simulation ───────────────────────────────────────────────────────────

export function simulateMatch(
  userLineup: AssignedPlayer[],
  cpuLineup: AssignedPlayer[],
  userFormation: Formation = "2-2-2",
  cpuFormation: Formation = "2-2-2",
  rng: () => number = Math.random,
): MatchSimulation {
  // Local helpers that use the seeded RNG (so the simulation is deterministic when a seed is passed)
  function _rnd<T>(arr: T[]): T { return arr[Math.floor(rng() * arr.length)]; }
  function _pickCard(lineup: AssignedPlayer[], ...positions: Position[]): AssignedPlayer | null {
    const pool = lineup.filter((p) => positions.includes(p.position));
    return pool.length > 0 ? _rnd(pool) : null;
  }
  function _pickAttrCard(lineup: AssignedPlayer[], attr: Attribute, ...positions: Position[]): AssignedPlayer | null {
    const pool = lineup.filter((p) => positions.includes(p.position) && p.card.attribute === attr);
    return pool.length > 0 ? _rnd(pool) : null;
  }
  function _pickDifferent(lineup: AssignedPlayer[], excludeId: string | null, ...positions: Position[]): AssignedPlayer | null {
    const pool = lineup.filter((p) => positions.includes(p.position) && p.card.id !== excludeId);
    return pool.length > 0 ? _rnd(pool) : null;
  }

  const us = calcTeamStats(userLineup);
  const cs = calcTeamStats(cpuLineup);
  const uMod = FORMATION_MODS[userFormation];
  const cMod = FORMATION_MODS[cpuFormation];

  const uEff = {
    attack:      us.attack      * uMod.atkMult,
    defense:     us.defense     * uMod.defMult,
    midfield:    us.midfield    * uMod.midMult,
    goalkeeping: us.goalkeeping,
  };
  const cEff = {
    attack:      cs.attack      * cMod.atkMult,
    defense:     cs.defense     * cMod.defMult,
    midfield:    cs.midfield    * cMod.midMult,
    goalkeeping: cs.goalkeeping,
  };

  const events: MatchEvent[] = [];
  let userScore = 0, cpuScore = 0;
  let halftimeUser = 0, halftimeCpu = 0;
  const involvements = new Map<string, PlayerInvolvement>();

  // No-repeat commentary picker bound to the seeded RNG.
  const { pick } = createCommentary(rng);

  function trackInv(card: FootballCard, type: "goal" | "assist") {
    const e = involvements.get(card.id) ?? { cardId: card.id, name: card.name, goals: 0, assists: 0, imageUrl: card.imageUrl };
    if (type === "goal") e.goals++; else e.assists++;
    involvements.set(card.id, e);
  }

  function push(
    minute: number, type: MatchEventType, team: "user" | "cpu",
    description: string, phase: MatchPhase,
    scorerCardId?: string, assisterCardId?: string,
  ) {
    events.push({ minute, type, team, description, scoreUser: userScore, scoreCpu: cpuScore, phase, scorerCardId, assisterCardId });
  }

  push(0, "kickoff", "user", "⚡ Kick off! The match is underway!", "kickoff");

  const phaseCount = 26 + Math.floor(rng() * 8); // 26–33 phases for higher scoring
  const minuteStep = 89 / phaseCount;
  let halfAdded = false;

  for (let i = 1; i <= phaseCount; i++) {
    const minute = Math.round(1 + i * minuteStep);

    if (minute >= 43 && minute <= 47 && !halfAdded) {
      halfAdded = true;
      halftimeUser = userScore;
      halftimeCpu = cpuScore;
      push(45, "halftime", "user", `⏸ Half time! ${userScore}–${cpuScore}`, "halftime");
      continue;
    }

    // Midfield battle
    const userMidRoll = uEff.midfield + rng() * 22;
    const cpuMidRoll  = cEff.midfield + rng() * 22;
    const atk = userMidRoll > cpuMidRoll ? "user" : "cpu";
    const atkEff      = atk === "user" ? uEff : cEff;
    const defEff      = atk === "user" ? cEff : uEff;
    const atkLineup   = atk === "user" ? userLineup : cpuLineup;
    const defLineup   = atk === "user" ? cpuLineup  : userLineup;
    const phase: MatchPhase = atk === "user" ? "user-attack" : "cpu-attack";
    const atkGoals    = atk === "user" ? userScore : cpuScore;
    const atkMod      = atk === "user" ? uMod : cMod;

    // Midfield Control extra possession events
    if (atkMod.extraPoss && rng() < 0.35) {
      const m1 = _pickCard(atkLineup, "MID");
      const m2 = _pickDifferent(atkLineup, m1?.card.id ?? null, "MID", "ATT");
      push(minute, "possession", atk, pick(POSSESSION_TEMPLATES, name(m1), name(m2)), phase);
      continue;
    }

    // Random special events (~7% per phase)
    if (rng() < 0.07) {
      const defP = _pickCard(defLineup, "DEF");
      const attP = _pickCard(atkLineup, "ATT", "MID");
      const isYellow = rng() < 0.4;
      push(minute, isYellow ? "yellowcard" : "freekick", atk === "user" ? "cpu" : "user",
        pick(isYellow ? YELLOW_TEMPLATES : FREEKICK_TEMPLATES, name(defP), name(attP)), phase);
      continue;
    }

    // Does attack become dangerous?
    const atkDanger = atkEff.attack  + rng() * 18;
    const defBlock  = defEff.defense + rng() * 18;
    const isDangerous = atkDanger > defBlock * 0.82;

    if (!isDangerous) {
      const defP = _pickCard(defLineup, "DEF");
      const attP = _pickCard(atkLineup, "ATT", "MID");
      const isTackle = rng() > 0.45;
      push(minute, isTackle ? "tackle" : "clearance",
        atk === "user" ? "cpu" : "user",
        pick(isTackle ? TACKLE_TEMPLATES : CLEARANCE_TEMPLATES, name(defP), name(attP)), phase);
      continue;
    }

    // Attribute-driven shot selection
    const pacer    = _pickAttrCard(atkLineup, "Pace",  "ATT");
    const powerAtt = _pickAttrCard(atkLineup, "Power", "ATT", "MID");
    const skillAtt = _pickAttrCard(atkLineup, "Skill", "ATT");

    let scorerPlayer: AssignedPlayer | null;
    let assisterPlayer: AssignedPlayer | null;
    let goalTemplates = GOAL_GENERIC;
    let isCounterEvent = false;

    if (pacer && rng() < 0.30) {
      scorerPlayer  = pacer;
      assisterPlayer = _pickDifferent(atkLineup, pacer.card.id, "MID", "DEF");
      goalTemplates  = GOAL_PACE;
      isCounterEvent = true;
    } else if (powerAtt && rng() < 0.28) {
      scorerPlayer  = powerAtt;
      assisterPlayer = _pickDifferent(atkLineup, powerAtt.card.id, "MID", "ATT");
      goalTemplates  = GOAL_POWER;
    } else if (skillAtt && rng() < 0.30) {
      scorerPlayer  = skillAtt;
      assisterPlayer = _pickDifferent(atkLineup, skillAtt.card.id, "MID", "ATT");
      goalTemplates  = GOAL_SKILL;
    } else {
      scorerPlayer  = _pickCard(atkLineup, "ATT", "MID");
      assisterPlayer = _pickDifferent(atkLineup, scorerPlayer?.card.id ?? null, "MID", "ATT");
    }

    const sc  = name(scorerPlayer);
    const as  = name(assisterPlayer, name(_pickCard(atkLineup, "MID")));
    const gk  = name(_pickCard(defLineup, "GK"));
    const def = name(_pickCard(defLineup, "DEF"));

    // Balanced goal probability — sigmoid with luck floor, cap at 12
    const goalProb = clamp((() => {
      const combined = defEff.defense * 0.42 + defEff.goalkeeping * 0.58;
      const advantage = (atkEff.attack - combined) / 14;
      const sigmoid = 1 / (1 + Math.exp(-advantage));
      const base = sigmoid * 0.52;            // [~0.10 .. ~0.42] for normal OVR spreads
      const noise = (rng() - 0.5) * 0.12;
      const softCap = atkGoals >= 9 ? 0.45 : 1.0; // slight dampener after 9 goals
      return (base + noise) * softCap;
    })(), 0.08, atkGoals >= 12 ? 0.03 : 0.55);

    if (rng() < goalProb) {
      if (atk === "user") userScore++; else cpuScore++;

      if (atk === "user") {
        if (scorerPlayer)  trackInv(scorerPlayer.card,  "goal");
        if (assisterPlayer) trackInv(assisterPlayer.card, "assist");
      }

      push(minute, "goal", atk, `⚽ GOAL! ${pick(goalTemplates, sc, as)}`, phase,
        scorerPlayer?.card.id, assisterPlayer?.card.id);
    } else {
      const r = rng();
      if (r < 0.42) {
        push(minute, "save",     atk, `🧤 ${pick(SAVE_TEMPLATES, gk, sc)}`, phase);
      } else if (r < 0.57) {
        push(minute, "nearpost", atk, pick(NEARPOST_TEMPLATES, sc, as), phase);
      } else if (r < 0.70 && isCounterEvent) {
        push(minute, "counter",  atk, pick(COUNTER_TEMPLATES, sc, as), phase);
      } else {
        push(minute, "miss", atk, pick(MISS_TEMPLATES, sc, as), phase);
      }
    }
  }

  push(90, "fulltime", "user", `🔔 Full time! Final score: ${userScore}–${cpuScore}`, "midfield");

  const result: "win" | "loss" | "draw" =
    userScore > cpuScore ? "win" : cpuScore > userScore ? "loss" : "draw";

  let mvp: PlayerInvolvement | null = null, bestScore = 0;
  for (const inv of involvements.values()) {
    const s = inv.goals * 3 + inv.assists;
    if (s > bestScore) { bestScore = s; mvp = inv; }
  }

  return { events, userScore, cpuScore, result, userOverall: us.overall, cpuOverall: cs.overall, halftimeScore: { user: halftimeUser, cpu: halftimeCpu }, mvp };
}

// ── Lineup / squad builder ────────────────────────────────────────────────────

export interface LineupSlot {
  position: Position;
  posIndex: number;
  card: FootballCard | null;
}

export function buildSlots(formation: Formation): LineupSlot[] {
  const positions = FORMATIONS[formation].positions;
  const counters: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  const slots: LineupSlot[] = [{ position: "GK", posIndex: counters.GK++, card: null }];
  for (const pos of positions) slots.push({ position: pos, posIndex: counters[pos]++, card: null });
  return slots;
}

export function adaptSlots(current: LineupSlot[], newFormation: Formation): LineupSlot[] {
  const next = buildSlots(newFormation);
  for (const slot of next) {
    const match = current.find((s) => s.position === slot.position && s.posIndex === slot.posIndex);
    if (match) slot.card = match.card;
  }
  return next;
}

export function slotsToLineup(slots: LineupSlot[]): AssignedPlayer[] {
  return slots
    .filter((s): s is LineupSlot & { card: FootballCard } => s.card !== null)
    .map((s) => ({ card: s.card, position: s.position, posIndex: s.posIndex }));
}

const RANDOM_FORMATIONS: Formation[] = ["2-2-2", "3-2-1", "1-3-2", "2-3-1"];

function makeCpuSquad(): { formation: Formation; lineup: AssignedPlayer[]; overall: number } {
  const formation = RANDOM_FORMATIONS[Math.floor(Math.random() * RANDOM_FORMATIONS.length)];
  const pool = [...CARDS].sort(() => Math.random() - 0.5).slice(0, 7);
  const cards: FootballCard[] = pool.map((c) => ({
    id: c.id, name: c.name ?? "CPU", rarity: c.rarity,
    attribute: c.attribute, imageUrl: c.image, kit: c.kit,
  }));
  const lineup = assignPositions(cards, formation);
  return { formation, lineup, overall: calcTeamStats(lineup).overall };
}

/**
 * Pick a CPU squad. With no target, a fully random draw (legacy behaviour).
 * With a target overall, samples several random squads and returns the one
 * whose overall is closest — used to scale CPU strength to the player's team.
 */
export function pickCpuLineup(targetOverall?: number): { formation: Formation; lineup: AssignedPlayer[] } {
  if (targetOverall === undefined) {
    const { formation, lineup } = makeCpuSquad();
    return { formation, lineup };
  }
  let best = makeCpuSquad();
  for (let i = 0; i < 40; i++) {
    const c = makeCpuSquad();
    if (Math.abs(c.overall - targetOverall) < Math.abs(best.overall - targetOverall)) best = c;
  }
  return { formation: best.formation, lineup: best.lineup };
}
