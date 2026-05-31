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
  | "nearpost" | "counter";

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

type Tpl = (a: string, b: string) => string;

const GOAL_GENERIC: Tpl[] = [
  (sc, as) => `${as} plays it through to ${sc}, who slots it home!`,
  (sc, as) => `${sc} latches onto a clever ball from ${as} and fires in!`,
  (sc, as) => `Brilliant finish! ${as}'s pass was perfectly weighted for ${sc}!`,
  (sc, as) => `${sc} receives from ${as} and buries it in the bottom corner!`,
  (sc, as) => `GOAL! ${sc} doesn't miss from there! ${as} gets the assist!`,
  (sc, as) => `${sc} tucks it away beautifully after a lay-off by ${as}!`,
  (sc, as) => `${as} finds ${sc} in the box and he finishes it off!`,
];

const GOAL_PACE: Tpl[] = [
  (sc, as) => `COUNTER! ${sc} bursts through with electric pace and slots it past the keeper — ${as} started the move!`,
  (sc, as) => `${sc} leaves the defence for dead on the break! ${as} released him and he finishes clinically!`,
  (sc, as) => `Blistering pace from ${sc}! ${as} picks him out in behind and it's a goal!`,
];

const GOAL_SKILL: Tpl[] = [
  (sc, as) => `Silky skill from ${sc} — beats his man and curls it into the corner! ${as} linked it up beautifully!`,
  (sc, as) => `Incredible dribble from ${sc}! Past one, past two, into the net! ${as} started the move!`,
  (sc, as) => `${sc} does the stepovers, creates the space, and finds the net! Great work from ${as}!`,
  (sc, as) => `${as} plays a clever through ball, ${sc} takes one touch and arrows it in!`,
];

const GOAL_POWER: Tpl[] = [
  (sc, as) => `${sc} rises highest from ${as}'s cross and powers the header into the net!`,
  (sc, as) => `THUNDERBOLT! ${sc} hits it with sheer power from distance — ${as} can't believe it went in!`,
  (sc, as) => `${sc} muscles past the defender and smashes it home! ${as} gets the assist!`,
  (sc, as) => `${as} floats it in, ${sc} attacks the ball and buries the header!`,
];

const SAVE_TEMPLATES: Tpl[] = [
  (gk, sh) => `Brilliant save by ${gk}! ${sh}'s shot was heading for the top corner!`,
  (gk, sh) => `${gk} dives to his right and pushes away ${sh}'s powerful effort!`,
  (gk, sh) => `What a stop from ${gk}! He denies ${sh} with an outstretched hand!`,
  (gk, sh) => `${sh} thought he'd scored but ${gk} pulls off a world-class save!`,
  (gk, sh) => `Point-blank chance for ${sh} but ${gk} stands tall — remarkable reaction!`,
];

const MISS_TEMPLATES: Tpl[] = [
  (sh, cr) => `${sh} blazes it over the bar! ${cr} put him clean through — chance wasted!`,
  (sh, cr) => `${sh} pulls it just wide of the far post — agonising! ${cr} made the chance!`,
  (sh, cr) => `One on one after ${cr}'s pass but ${sh} can't convert!`,
  (sh, cr) => `${sh} sidefoots it the wrong side of the post. ${cr} won't be happy either!`,
];

const NEARPOST_TEMPLATES: Tpl[] = [
  (sh, as) => `OFF THE POST! ${sh} was so close! ${as}'s cross was perfect but the woodwork intervenes!`,
  (sh, as) => `Off the bar from ${sh}! ${as} set it up beautifully — no goal!`,
];

const TACKLE_TEMPLATES: Tpl[] = [
  (def, att) => `${def} times the tackle perfectly and wins it cleanly from ${att}!`,
  (def, att) => `Crunching challenge from ${def} on ${att} — referee waves play on!`,
  (def, att) => `${def} reads ${att}'s run and cuts it out before it's dangerous!`,
  (def, att) => `${def} and ${att} go shoulder to shoulder — ${def} comes out on top!`,
];

const CLEARANCE_TEMPLATES: Tpl[] = [
  (def, att) => `${def} gets there just in time to head it clear as ${att} closes in!`,
  (def, att) => `Last-ditch clearance from ${def}! ${att} was clean through!`,
  (def, att) => `${def} blocks ${att}'s effort on the line! Vital interception!`,
];

const FREEKICK_TEMPLATES: Tpl[] = [
  (def, att) => `Free kick awarded! ${def} hauled back ${att} just outside the box — cynical foul!`,
  (def, att) => `Referee stops play! ${att} goes down under a heavy challenge from ${def}!`,
];

const YELLOW_TEMPLATES: Tpl[] = [
  (def, att) => `Yellow card for ${def}! He pulled back ${att} — no choice for the referee!`,
  (def, att) => `${def} is booked! Reckless challenge on ${att} — lucky it wasn't red!`,
];

const COUNTER_TEMPLATES: Tpl[] = [
  (pac, mid) => `COUNTER-ATTACK! ${pac} picks up the ball from ${mid} and flies forward at pace!`,
  (pac, mid) => `${mid} wins it back and immediately feeds ${pac} — lightning fast break!`,
  (pac, mid) => `Quick transition! ${mid} to ${pac} who's now racing towards goal with space!`,
];

const POSSESSION_TEMPLATES: Tpl[] = [
  (m1, m2) => `${m1} plays a neat one-two with ${m2} — slick football in the middle!`,
  (m1, m2) => `${m1} switches it to ${m2} — keeping possession nicely!`,
  (m1, m2) => `Clever interplay between ${m1} and ${m2} in the middle of the park!`,
  (m1, m2) => `${m1} finds ${m2} in space — recycling possession well!`,
];

// ── Main simulation ───────────────────────────────────────────────────────────

export function simulateMatch(
  userLineup: AssignedPlayer[],
  cpuLineup: AssignedPlayer[],
  userFormation: Formation = "2-2-2",
  cpuFormation: Formation = "2-2-2",
): MatchSimulation {
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

  // No-repeat commentary: track recently used index per pool (by identity)
  const poolHistory = new Map<Tpl[], number[]>();
  function pick(pool: Tpl[], a: string, b: string): string {
    const used = poolHistory.get(pool) ?? [];
    const candidates = pool.map((_, i) => i).filter((i) => !used.includes(i));
    const from = candidates.length > 0 ? candidates : pool.map((_, i) => i);
    const idx = from[Math.floor(Math.random() * from.length)];
    const next = [...used, idx].slice(-(Math.max(2, Math.floor(pool.length * 0.6))));
    poolHistory.set(pool, next);
    return pool[idx](a, b);
  }

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

  const phaseCount = 26 + Math.floor(Math.random() * 8); // 26–33 phases for higher scoring
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
    const userMidRoll = uEff.midfield + Math.random() * 22;
    const cpuMidRoll  = cEff.midfield + Math.random() * 22;
    const atk = userMidRoll > cpuMidRoll ? "user" : "cpu";
    const atkEff      = atk === "user" ? uEff : cEff;
    const defEff      = atk === "user" ? cEff : uEff;
    const atkLineup   = atk === "user" ? userLineup : cpuLineup;
    const defLineup   = atk === "user" ? cpuLineup  : userLineup;
    const phase: MatchPhase = atk === "user" ? "user-attack" : "cpu-attack";
    const atkGoals    = atk === "user" ? userScore : cpuScore;
    const atkMod      = atk === "user" ? uMod : cMod;

    // Midfield Control extra possession events
    if (atkMod.extraPoss && Math.random() < 0.35) {
      const m1 = pickCard(atkLineup, "MID");
      const m2 = pickDifferent(atkLineup, m1?.card.id ?? null, "MID", "ATT");
      push(minute, "possession", atk, pick(POSSESSION_TEMPLATES, name(m1), name(m2)), phase);
      continue;
    }

    // Random special events (~7% per phase)
    if (Math.random() < 0.07) {
      const defP = pickCard(defLineup, "DEF");
      const attP = pickCard(atkLineup, "ATT", "MID");
      const isYellow = Math.random() < 0.4;
      push(minute, isYellow ? "yellowcard" : "freekick", atk === "user" ? "cpu" : "user",
        pick(isYellow ? YELLOW_TEMPLATES : FREEKICK_TEMPLATES, name(defP), name(attP)), phase);
      continue;
    }

    // Does attack become dangerous?
    const atkDanger = atkEff.attack  + Math.random() * 18;
    const defBlock  = defEff.defense + Math.random() * 18;
    const isDangerous = atkDanger > defBlock * 0.82;

    if (!isDangerous) {
      const defP = pickCard(defLineup, "DEF");
      const attP = pickCard(atkLineup, "ATT", "MID");
      const isTackle = Math.random() > 0.45;
      push(minute, isTackle ? "tackle" : "clearance",
        atk === "user" ? "cpu" : "user",
        pick(isTackle ? TACKLE_TEMPLATES : CLEARANCE_TEMPLATES, name(defP), name(attP)), phase);
      continue;
    }

    // Attribute-driven shot selection
    const pacer    = pickAttrCard(atkLineup, "Pace",  "ATT");
    const powerAtt = pickAttrCard(atkLineup, "Power", "ATT", "MID");
    const skillAtt = pickAttrCard(atkLineup, "Skill", "ATT");

    let scorerPlayer: AssignedPlayer | null;
    let assisterPlayer: AssignedPlayer | null;
    let goalTemplates = GOAL_GENERIC;
    let isCounterEvent = false;

    if (pacer && Math.random() < 0.30) {
      scorerPlayer  = pacer;
      assisterPlayer = pickDifferent(atkLineup, pacer.card.id, "MID", "DEF");
      goalTemplates  = GOAL_PACE;
      isCounterEvent = true;
    } else if (powerAtt && Math.random() < 0.28) {
      scorerPlayer  = powerAtt;
      assisterPlayer = pickDifferent(atkLineup, powerAtt.card.id, "MID", "ATT");
      goalTemplates  = GOAL_POWER;
    } else if (skillAtt && Math.random() < 0.30) {
      scorerPlayer  = skillAtt;
      assisterPlayer = pickDifferent(atkLineup, skillAtt.card.id, "MID", "ATT");
      goalTemplates  = GOAL_SKILL;
    } else {
      scorerPlayer  = pickCard(atkLineup, "ATT", "MID");
      assisterPlayer = pickDifferent(atkLineup, scorerPlayer?.card.id ?? null, "MID", "ATT");
    }

    const sc  = name(scorerPlayer);
    const as  = name(assisterPlayer, name(pickCard(atkLineup, "MID")));
    const gk  = name(pickCard(defLineup, "GK"));
    const def = name(pickCard(defLineup, "DEF"));

    // Balanced goal probability — sigmoid with luck floor, cap at 12
    const goalProb = clamp((() => {
      const combined = defEff.defense * 0.42 + defEff.goalkeeping * 0.58;
      const advantage = (atkEff.attack - combined) / 14;
      const sigmoid = 1 / (1 + Math.exp(-advantage));
      const base = sigmoid * 0.52;            // [~0.10 .. ~0.42] for normal OVR spreads
      const noise = (Math.random() - 0.5) * 0.12;
      const softCap = atkGoals >= 9 ? 0.45 : 1.0; // slight dampener after 9 goals
      return (base + noise) * softCap;
    })(), 0.08, atkGoals >= 12 ? 0.03 : 0.55);

    if (Math.random() < goalProb) {
      if (atk === "user") userScore++; else cpuScore++;

      if (atk === "user") {
        if (scorerPlayer)  trackInv(scorerPlayer.card,  "goal");
        if (assisterPlayer) trackInv(assisterPlayer.card, "assist");
      }

      push(minute, "goal", atk, `⚽ GOAL! ${pick(goalTemplates, sc, as)}`, phase,
        scorerPlayer?.card.id, assisterPlayer?.card.id);
    } else {
      const r = Math.random();
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

export function pickCpuLineup(): { formation: Formation; lineup: AssignedPlayer[] } {
  const formation = RANDOM_FORMATIONS[Math.floor(Math.random() * RANDOM_FORMATIONS.length)];
  const pool = [...CARDS].sort(() => Math.random() - 0.5).slice(0, 7);
  const cards: FootballCard[] = pool.map((c) => ({
    id: c.id, name: c.name ?? "CPU", rarity: c.rarity,
    attribute: c.attribute, imageUrl: c.image, kit: c.kit,
  }));
  return { formation, lineup: assignPositions(cards, formation) };
}
