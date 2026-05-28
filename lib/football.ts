import { CARDS, type Rarity, type Attribute } from "./cards";

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
  posIndex: number; // nth player of this position type
}

export const FORMATIONS: Record<
  Formation,
  { label: string; desc: string; positions: Position[] }
> = {
  "2-2-2": {
    label: "2-2-2",
    desc: "Balanced",
    positions: ["DEF", "DEF", "MID", "MID", "ATT", "ATT"],
  },
  "3-2-1": {
    label: "3-2-1",
    desc: "Defensive",
    positions: ["DEF", "DEF", "DEF", "MID", "MID", "ATT"],
  },
  "1-3-2": {
    label: "1-3-2",
    desc: "Attacking",
    positions: ["DEF", "MID", "MID", "MID", "ATT", "ATT"],
  },
  "2-3-1": {
    label: "2-3-1",
    desc: "Midfield Control",
    positions: ["DEF", "DEF", "MID", "MID", "MID", "ATT"],
  },
};

const RARITY_RATING: Record<Rarity, number> = {
  common: 63,
  rare: 73,
  epic: 83,
  legendary: 93,
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

export function assignPositions(
  cards: FootballCard[],
  formation: Formation,
): AssignedPlayer[] {
  const [gkCard, ...outfield] = cards;
  const positions = FORMATIONS[formation].positions;
  const remaining = [...outfield];
  const posCounters: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };

  const assigned: AssignedPlayer[] = [
    { card: gkCard, position: "GK", posIndex: posCounters.GK++ },
  ];

  for (const pos of positions) {
    if (remaining.length === 0) break;
    let bestIdx = 0;
    let bestRating = getPlayerRating(remaining[0], pos);
    for (let i = 1; i < remaining.length; i++) {
      const r = getPlayerRating(remaining[i], pos);
      if (r > bestRating) { bestRating = r; bestIdx = i; }
    }
    assigned.push({ card: remaining[bestIdx], position: pos, posIndex: posCounters[pos]++ });
    remaining.splice(bestIdx, 1);
  }

  return assigned;
}

export type MatchEventType =
  | "kickoff"
  | "goal"
  | "save"
  | "miss"
  | "tackle"
  | "clearance"
  | "halftime"
  | "fulltime"
  | "possession";

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  team: "user" | "cpu";
  description: string;
  scoreUser: number;
  scoreCpu: number;
  phase: MatchPhase;
}

interface TeamStats {
  attack: number;
  midfield: number;
  defense: number;
  goalkeeping: number;
  overall: number;
}

function calcStats(lineup: AssignedPlayer[]): TeamStats {
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

export interface MatchSimulation {
  events: MatchEvent[];
  userScore: number;
  cpuScore: number;
  result: "win" | "loss" | "draw";
  userOverall: number;
  cpuOverall: number;
}

export function simulateMatch(
  userLineup: AssignedPlayer[],
  cpuLineup: AssignedPlayer[],
): MatchSimulation {
  const us = calcStats(userLineup);
  const cs = calcStats(cpuLineup);

  const events: MatchEvent[] = [];
  let userScore = 0;
  let cpuScore = 0;

  const byPos = (lineup: AssignedPlayer[], pos: Position) =>
    lineup.find((p) => p.position === pos)?.card.name ?? pos;

  const push = (
    minute: number,
    type: MatchEventType,
    team: "user" | "cpu",
    description: string,
    phase: MatchPhase,
  ) => {
    events.push({ minute, type, team, description, scoreUser: userScore, scoreCpu: cpuScore, phase });
  };

  push(0, "kickoff", "user", "Kick off! The match begins!", "kickoff");

  const phaseCount = 22 + Math.floor(Math.random() * 6);
  const minuteStep = 89 / phaseCount;
  let halfAdded = false;

  for (let i = 1; i <= phaseCount; i++) {
    const minute = Math.round(1 + i * minuteStep);

    if (minute >= 43 && minute <= 47 && !halfAdded) {
      push(45, "halftime", "user", `Half time! ${userScore}-${cpuScore}`, "halftime");
      halfAdded = true;
      continue;
    }

    const userMid = us.midfield + Math.random() * 20;
    const cpuMid = cs.midfield + Math.random() * 20;
    const atk = userMid > cpuMid ? "user" : "cpu";
    const atkStats = atk === "user" ? us : cs;
    const defStats = atk === "user" ? cs : us;
    const atkLineup = atk === "user" ? userLineup : cpuLineup;
    const defLineup = atk === "user" ? cpuLineup : userLineup;
    const phase: MatchPhase = atk === "user" ? "user-attack" : "cpu-attack";

    const attackPower = atkStats.attack + Math.random() * 18;
    const defensePower = defStats.defense + Math.random() * 18;

    if (attackPower > defensePower * 0.8) {
      // Shot on goal
      const advantage = (atkStats.attack - (defStats.defense * 0.55 + defStats.goalkeeping * 0.45)) / 20;
      const prob = Math.max(0.06, Math.min(0.72, 0.28 + advantage * 0.15 + (Math.random() - 0.5) * 0.18));

      if (Math.random() < prob) {
        if (atk === "user") userScore++;
        else cpuScore++;
        // Back-patch the last event score (so feed shows correct score before goal banner)
        if (events.length > 0) {
          events[events.length - 1].scoreUser = userScore;
          events[events.length - 1].scoreCpu = cpuScore;
        }
        const scorer = byPos(atkLineup, "ATT");
        push(minute, "goal", atk, `⚽ GOAL! ${scorer} finds the net!`, phase);
      } else {
        const gk = byPos(defLineup, "GK");
        const isSave = Math.random() > 0.38;
        push(
          minute,
          isSave ? "save" : "miss",
          atk,
          isSave ? `Great save by ${gk}!` : "Shot just wide!",
          phase,
        );
      }
    } else {
      const def = byPos(defLineup, "DEF");
      const options: [MatchEventType, string][] = [
        ["tackle", `${def} wins the ball with a crunching tackle`],
        ["clearance", `${def} heads it clear`],
      ];
      const [t, d] = options[Math.floor(Math.random() * options.length)];
      push(minute, t, atk === "user" ? "cpu" : "user", d, phase);
    }
  }

  push(90, "fulltime", "user", `Full time! Final score: ${userScore}-${cpuScore}`, "midfield");

  const result: "win" | "loss" | "draw" =
    userScore > cpuScore ? "win" : cpuScore > userScore ? "loss" : "draw";

  return { events, userScore, cpuScore, result, userOverall: us.overall, cpuOverall: cs.overall };
}

// ── Lineup slot (used by the squad builder UI) ────────────────────────────────

export interface LineupSlot {
  position: Position;
  posIndex: number;
  card: FootballCard | null;
}

/** Create a fresh set of empty slots for a given formation. */
export function buildSlots(formation: Formation): LineupSlot[] {
  const positions = FORMATIONS[formation].positions;
  const counters: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  const slots: LineupSlot[] = [{ position: "GK", posIndex: counters.GK++, card: null }];
  for (const pos of positions) {
    slots.push({ position: pos, posIndex: counters[pos]++, card: null });
  }
  return slots;
}

/** When the user switches formation, preserve cards that fit in the new shape. */
export function adaptSlots(current: LineupSlot[], newFormation: Formation): LineupSlot[] {
  const next = buildSlots(newFormation);
  for (const slot of next) {
    const match = current.find(
      (s) => s.position === slot.position && s.posIndex === slot.posIndex,
    );
    if (match) slot.card = match.card;
  }
  return next;
}

/** Convert filled lineup slots into AssignedPlayer[] for the match engine. */
export function slotsToLineup(slots: LineupSlot[]): AssignedPlayer[] {
  return slots
    .filter((s): s is LineupSlot & { card: FootballCard } => s.card !== null)
    .map((s) => ({ card: s.card, position: s.position, posIndex: s.posIndex }));
}

const RANDOM_FORMATIONS: Formation[] = ["2-2-2", "3-2-1", "1-3-2", "2-3-1"];

export function pickCpuLineup(): { formation: Formation; lineup: AssignedPlayer[] } {
  const formation = RANDOM_FORMATIONS[Math.floor(Math.random() * RANDOM_FORMATIONS.length)];
  const pool = [...CARDS].sort(() => Math.random() - 0.5).slice(0, 7);
  const cards: FootballCard[] = pool.map((c) => ({
    id: c.id,
    name: c.name ?? "CPU",
    rarity: c.rarity,
    attribute: c.attribute,
    imageUrl: c.image,
    kit: c.kit,
  }));
  return { formation, lineup: assignPositions(cards, formation) };
}
