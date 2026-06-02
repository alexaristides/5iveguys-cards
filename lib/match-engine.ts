import seedrandom from "seedrandom";
import {
  type AssignedPlayer, type Formation, type Position,
  type MatchEvent, type MatchEventType, type MatchPhase,
  type PlayerInvolvement, type FootballCard, type MatchSimulation,
  calcTeamStats, FORMATION_MODS,
} from "./football";
import { getHomeCoord } from "./formation-positions";
import {
  createCommentary, GOAL_GENERIC, GOAL_PACE, GOAL_SKILL, GOAL_POWER,
  SAVE_TEMPLATES, MISS_TEMPLATES, NEARPOST_TEMPLATES, TACKLE_TEMPLATES,
  CLEARANCE_TEMPLATES, FREEKICK_TEMPLATES, YELLOW_TEMPLATES, POSSESSION_TEMPLATES,
  CORNER_TEMPLATES, THROWIN_TEMPLATES, GOALKICK_TEMPLATES, REDCARD_TEMPLATES,
} from "./commentary";

// ── Public types ────────────────────────────────────────────────────────────

export interface HalfInput {
  userLineup: AssignedPlayer[];
  cpuLineup: AssignedPlayer[];
  userFormation: Formation;
  cpuFormation: Formation;
  seed: string;
}

export interface Moment {
  minute: number;
  type: MatchEventType;
  team: "user" | "cpu";
  phase: MatchPhase;
  description: string;
  ball: { x: number; y: number };
  targets: Record<string, { x: number; y: number }>; // all 14 players' target spots
  possessorId: string | null;
  scorerCardId?: string;
  assisterCardId?: string;
  scoreUser: number;
  scoreCpu: number;
}

export interface HalfLogicResult {
  moments: Moment[];
  endScore: { user: number; cpu: number };
  involvements: Map<string, PlayerInvolvement>;
  events: MatchEvent[];
}

// ── Tuning ──────────────────────────────────────────────────────────────────

const TUNING = {
  // Event density: fewer sequences + fewer build-up passes = calmer, more trackable play.
  seqPerHalf: 7,         // base attacks per half
  seqJitter: 2,          // + up to this many
  passesMin: 1,          // build-up passes before the shot
  passesExtra: 2,        // + up to this many (so 1–2)
  goalScale: 0.56,       // sigmoid → goal-probability scaler (tuned for ~1–2 goals/side)
  goalNoise: 0.12,
  goalFloor: 0.06,
  goalCap: 0.6,
};

// ── Geometry helpers ──────────────────────────────────────────────────────────

type SetPiece = "corner";

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function goalYFor(team: "user" | "cpu") { return team === "user" ? 4 : 96; }
function isFinalThird(team: "user" | "cpu", y: number) { return team === "user" ? y < 33 : y > 67; }
// Advance a y-position ~45% of the remaining distance toward the opponent goal.
function forwardStep(team: "user" | "cpu", y: number) { const gy = goalYFor(team); return y + (gy - y) * 0.45; }

// Returns [dx, dy] tactical offset for a player given who is attacking.
function phaseShift(team: "user" | "cpu", atk: "user" | "cpu", position: Position, baseX: number): [number, number] {
  const dirUp = team === "user" ? -1 : 1; // toward opponent goal
  if (team === atk) {
    const push = position === "ATT" ? 11 : position === "MID" ? 5 : position === "DEF" ? 1 : 0;
    return [0, dirUp * push];
  }
  const drop = position === "ATT" ? 5 : position === "MID" ? 5 : position === "DEF" ? 6 : 0;
  const cmp = position === "DEF" ? (50 - baseX) * 0.18 : position === "GK" ? (50 - baseX) * 0.12 : 0;
  return [cmp, -dirUp * drop];
}

// ── Logical simulation ─────────────────────────────────────────────────────────

export function simulateHalfLogic(
  input: HalfInput,
  half: 1 | 2,
  startScore: { user: number; cpu: number },
  involvementsIn?: Map<string, PlayerInvolvement>,
): HalfLogicResult {
  const { userLineup, cpuLineup, userFormation, cpuFormation, seed } = input;
  const rng = seedrandom(`${seed}:h${half}`);
  const { pick } = createCommentary(rng);
  const involvements = involvementsIn ?? new Map<string, PlayerInvolvement>();
  const events: MatchEvent[] = [];
  const moments: Moment[] = [];

  const us = calcTeamStats(userLineup), cs = calcTeamStats(cpuLineup);
  const uMod = FORMATION_MODS[userFormation], cMod = FORMATION_MODS[cpuFormation];
  const uEff = { attack: us.attack * uMod.atkMult, defense: us.defense * uMod.defMult, midfield: us.midfield * uMod.midMult, goalkeeping: us.goalkeeping };
  const cEff = { attack: cs.attack * cMod.atkMult, defense: cs.defense * cMod.defMult, midfield: cs.midfield * cMod.midMult, goalkeeping: cs.goalkeeping };

  let userScore = startScore.user, cpuScore = startScore.cpu;
  const startMin = half === 1 ? 0 : 45, endMin = half === 1 ? 45 : 90;

  const lineupOf = (t: "user" | "cpu") => (t === "user" ? userLineup : cpuLineup);
  const formationOf = (t: "user" | "cpu") => (t === "user" ? userFormation : cpuFormation);
  const effOf = (t: "user" | "cpu") => (t === "user" ? uEff : cEff);

  function rpick<T>(arr: T[]): T | null { return arr.length ? arr[Math.floor(rng() * arr.length)] : null; }
  function byPos(t: "user" | "cpu", ...ps: Position[]) { return rpick(lineupOf(t).filter((p) => ps.includes(p.position))); }
  function diff(t: "user" | "cpu", exclude: string | null, ...ps: Position[]) {
    return rpick(lineupOf(t).filter((p) => ps.includes(p.position) && p.card.id !== exclude));
  }
  const nameOf = (p: AssignedPlayer | null, fb = "A player") => p?.card.name ?? fb;
  const homeCoordOf = (p: AssignedPlayer, t: "user" | "cpu") => getHomeCoord(p, formationOf(t), t);

  function trackInv(card: FootballCard, type: "goal" | "assist") {
    const e = involvements.get(card.id) ?? { cardId: card.id, name: card.name, goals: 0, assists: 0, imageUrl: card.imageUrl };
    if (type === "goal") e.goals++; else e.assists++;
    involvements.set(card.id, e);
  }

  function computeTargets(atk: "user" | "cpu", ball: { x: number; y: number }, possessorId: string | null, setPiece?: SetPiece): Record<string, { x: number; y: number }> {
    const out: Record<string, { x: number; y: number }> = {};

    if (setPiece === "corner") {
      const def: "user" | "cpu" = atk === "user" ? "cpu" : "user";
      const goalY = goalYFor(atk);            // the goal being attacked
      const into = atk === "user" ? 1 : -1;   // from that goal line toward midfield

      // Attacking side: taker stays at the flag (the possessor), everyone else floods the box.
      const atkOutfield = lineupOf(atk).filter((p) => p.position !== "GK" && p.card.id !== possessorId);
      atkOutfield.forEach((p, i) => {
        const spread = atkOutfield.length <= 1 ? 0.5 : i / (atkOutfield.length - 1);
        const x = 30 + spread * 40;                 // 30..70 across the box
        const y = goalY + into * (8 + (i % 3) * 4); // staggered 8..16 out from the line
        out[p.card.id] = { x: Math.round(clamp(x, 6, 94)), y: Math.round(clamp(y, 6, 94)) };
      });
      for (const p of lineupOf(atk)) {
        if (out[p.card.id]) continue;
        if (p.card.id === possessorId) out[p.card.id] = { x: Math.round(ball.x), y: Math.round(ball.y) };
        else { const [hx, hy] = homeCoordOf(p, atk); out[p.card.id] = { x: Math.round(hx), y: Math.round(hy) }; } // GK holds back
      }

      // Defending side: drop into the box to mark, keeper on the line.
      const defOutfield = lineupOf(def).filter((p) => p.position !== "GK");
      defOutfield.forEach((p, i) => {
        const spread = defOutfield.length <= 1 ? 0.5 : i / (defOutfield.length - 1);
        const x = 26 + spread * 48;                 // 26..74
        const y = goalY + into * (5 + (i % 2) * 5); // 5..10, just in front of their line
        out[p.card.id] = { x: Math.round(clamp(x, 6, 94)), y: Math.round(clamp(y, 6, 94)) };
      });
      const dgk = lineupOf(def).find((p) => p.position === "GK");
      if (dgk) out[dgk.card.id] = { x: 50, y: Math.round(clamp(goalY + into * 3, 4, 96)) };
      return out;
    }

    for (const t of ["user", "cpu"] as const) {
      for (const p of lineupOf(t)) {
        const [bx, by] = homeCoordOf(p, t);
        const [dx, dy] = phaseShift(t, atk, p.position, bx);
        let x = clamp(bx + dx, 4, 96), y = clamp(by + dy, 4, 96);
        if (p.card.id === possessorId) { x += (ball.x - x) * 0.6; y += (ball.y - y) * 0.6; }
        out[p.card.id] = { x: Math.round(x), y: Math.round(y) };
      }
    }
    return out;
  }

  function emit(
    minute: number, type: MatchEventType, team: "user" | "cpu", description: string,
    phase: MatchPhase, ball: { x: number; y: number }, possessorId: string | null,
    scorerCardId?: string, assisterCardId?: string, setPiece?: SetPiece,
  ) {
    const b = { x: clamp(Math.round(ball.x), 0, 100), y: clamp(Math.round(ball.y), 0, 100) };
    moments.push({ minute, type, team, phase, description, ball: b, targets: computeTargets(team, b, possessorId, setPiece), possessorId, scorerCardId, assisterCardId, scoreUser: userScore, scoreCpu: cpuScore });
    events.push({ minute, type, team, description, scoreUser: userScore, scoreCpu: cpuScore, phase, scorerCardId, assisterCardId });
  }

  // Resolve a shot; emits goal/save/nearpost/miss and returns the outcome type.
  function attemptShot(
    atkTeam: "user" | "cpu", min: number, phase: MatchPhase,
    preferred: AssignedPlayer | null, opts?: { corner?: boolean },
  ): MatchEventType {
    const defTeam: "user" | "cpu" = atkTeam === "user" ? "cpu" : "user";
    const aE = effOf(atkTeam), dE = effOf(defTeam);
    const scorer = (preferred && (preferred.position === "ATT" || preferred.position === "MID"))
      ? preferred
      : (byPos(atkTeam, "ATT", "MID") ?? preferred ?? lineupOf(atkTeam)[0]);
    const assister = diff(atkTeam, scorer.card.id, "MID", "ATT", "DEF");
    const gk = byPos(defTeam, "GK");
    const dval = dE.defense * 0.42 + dE.goalkeeping * 0.58;
    const advantage = (aE.attack - dval) / 14;
    const sigmoid = 1 / (1 + Math.exp(-advantage));
    let goalProb = clamp(sigmoid * TUNING.goalScale + (rng() - 0.5) * TUNING.goalNoise, TUNING.goalFloor, TUNING.goalCap);
    if (opts?.corner) goalProb *= 0.7; // headers from corners convert less often
    const sp: SetPiece | undefined = opts?.corner ? "corner" : undefined;
    const gx = clamp(50 + (rng() - 0.5) * 20, 30, 70), gy = goalYFor(atkTeam);
    if (rng() < goalProb) {
      if (atkTeam === "user") userScore++; else cpuScore++;
      if (atkTeam === "user") { trackInv(scorer.card, "goal"); if (assister) trackInv(assister.card, "assist"); }
      const fam = scorer.card.attribute === "Pace" ? GOAL_PACE : scorer.card.attribute === "Power" ? GOAL_POWER : scorer.card.attribute === "Skill" ? GOAL_SKILL : GOAL_GENERIC;
      emit(min, "goal", atkTeam, `⚽ GOAL! ${pick(fam, nameOf(scorer), nameOf(assister))}`, phase, { x: gx, y: gy }, scorer.card.id, scorer.card.id, assister?.card.id, sp);
      return "goal";
    }
    const r = rng();
    if (r < 0.45) { emit(min, "save", atkTeam, `🧤 ${pick(SAVE_TEMPLATES, nameOf(gk), nameOf(scorer))}`, phase, { x: gx, y: gy }, gk?.card.id ?? null, undefined, undefined, sp); return "save"; }
    if (r < 0.70) { emit(min, "nearpost", atkTeam, pick(NEARPOST_TEMPLATES, nameOf(scorer), nameOf(assister)), phase, { x: gx, y: gy }, scorer.card.id, undefined, undefined, sp); return "nearpost"; }
    emit(min, "miss", atkTeam, pick(MISS_TEMPLATES, nameOf(scorer), nameOf(assister)), phase, { x: gx, y: gy }, scorer.card.id, undefined, undefined, sp); return "miss";
  }

  function emitCorner(atkTeam: "user" | "cpu", min: number, phase: MatchPhase) {
    const taker = byPos(atkTeam, "MID", "ATT") ?? lineupOf(atkTeam)[0];
    const target = byPos(atkTeam, "ATT", "DEF") ?? taker;
    const gy = goalYFor(atkTeam);
    const cx = rng() < 0.5 ? 4 : 96;                       // a corner flag
    const cy = gy + (atkTeam === "user" ? 2 : -2);         // on the goal line
    emit(min, "corner", atkTeam, pick(CORNER_TEMPLATES, nameOf(taker), nameOf(target)), phase, { x: cx, y: cy }, taker?.card.id ?? null, undefined, undefined, "corner");
  }

  function emitGoalKick(defTeam: "user" | "cpu", min: number) {
    const gk = byPos(defTeam, "GK") ?? lineupOf(defTeam)[0];
    emit(min, "goalkick", defTeam, pick(GOALKICK_TEMPLATES, nameOf(gk), ""), "midfield", homeXY(gk, defTeam, homeCoordOf), gk?.card.id ?? null);
  }

  // Kickoff
  let atk: "user" | "cpu" = rng() < 0.5 ? "user" : "cpu";
  const koHolder = byPos(atk, "MID") ?? lineupOf(atk)[0];
  emit(startMin, "kickoff", atk, "⚡ Kick off! The match is underway!", atk === "user" ? "user-attack" : "cpu-attack", { x: 50, y: 50 }, koHolder?.card.id ?? null);

  const totalMinutes = endMin - startMin;
  const sequences = TUNING.seqPerHalf + Math.floor(rng() * TUNING.seqJitter);
  const minutesPerSeq = totalMinutes / sequences;

  for (let seq = 0; seq < sequences; seq++) {
    const minute = clamp(
      Math.round(startMin + (seq + 1) * minutesPerSeq - minutesPerSeq * 0.5 + (rng() - 0.5) * minutesPerSeq * 0.6),
      startMin, endMin - 1,
    );

    // Midfield contest decides who attacks
    const uRoll = uEff.midfield + rng() * 22, cRoll = cEff.midfield + rng() * 22;
    atk = uRoll > cRoll ? "user" : "cpu";
    const def: "user" | "cpu" = atk === "user" ? "cpu" : "user";
    const phase: MatchPhase = atk === "user" ? "user-attack" : "cpu-attack";
    const aEff = effOf(atk), dEff = effOf(def);

    // Build-up starts deep
    let holder = byPos(atk, "DEF", "MID") ?? lineupOf(atk)[0];
    if (!holder) continue;
    let hy = homeCoordOf(holder, atk)[1];
    {
      const [hx, hyy] = homeCoordOf(holder, atk);
      hy = hyy;
      emit(minute, "possession", atk, pick(POSSESSION_TEMPLATES, nameOf(holder), nameOf(byPos(atk, "MID"))), phase, { x: hx, y: hy }, holder.card.id);
    }

    // A few build-up passes; the move may break down (turnover/foul) before the shot.
    const passes = TUNING.passesMin + Math.floor(rng() * TUNING.passesExtra);
    let done = false;
    for (let k = 0; k < passes && !done; k++) {
      // Interception / turnover? (stronger defence vs weaker midfield → more turnovers)
      const interceptor = byPos(def, "DEF", "MID");
      const intercepted = (dEff.defense + rng() * 22) > (aEff.midfield + rng() * 22) && rng() < 0.6;
      if (intercepted && interceptor) {
        const [dx, dy] = homeCoordOf(interceptor, def);
        const isTackle = rng() > 0.45;
        emit(minute, isTackle ? "tackle" : "clearance", def, pick(isTackle ? TACKLE_TEMPLATES : CLEARANCE_TEMPLATES, nameOf(interceptor), nameOf(holder)), phase, { x: dx, y: dy }, interceptor.card.id);
        done = true;
        break;
      }

      // Foul → card / free kick (and a shot if it's in a dangerous area).
      if (rng() < 0.06) {
        const fouler = byPos(def, "DEF", "MID");
        const inFinal = isFinalThird(atk, hy);
        if (rng() < 0.04) {
          emit(minute, "redcard", def, pick(REDCARD_TEMPLATES, nameOf(fouler), nameOf(holder)), phase, homeXY(holder, atk, homeCoordOf), holder.card.id);
        } else {
          const isYellow = rng() < 0.4;
          emit(minute, isYellow ? "yellowcard" : "freekick", def, pick(isYellow ? YELLOW_TEMPLATES : FREEKICK_TEMPLATES, nameOf(fouler), nameOf(holder)), phase, homeXY(holder, atk, homeCoordOf), holder.card.id);
        }
        if (inFinal) {
          const t = attemptShot(atk, minute, phase, holder, {});
          if (t === "save" || t === "nearpost") emitCorner(atk, minute, phase);
          else if (t === "miss" && rng() < 0.5) emitGoalKick(def, minute);
        }
        done = true;
        break;
      }

      // Advance with a forward pass (occasionally a throw-in).
      const receiver = diff(atk, holder.card.id, "MID", "ATT") ?? diff(atk, holder.card.id, "MID", "ATT", "DEF");
      if (!receiver) { done = true; break; }
      holder = receiver;
      hy = forwardStep(atk, hy);
      const isThrow = rng() < 0.12;
      const rx = isThrow ? (rng() < 0.5 ? 6 : 94) : homeCoordOf(holder, atk)[0];
      emit(minute, isThrow ? "throwin" : "possession", atk,
        pick(isThrow ? THROWIN_TEMPLATES : POSSESSION_TEMPLATES, nameOf(holder), nameOf(byPos(atk, "MID"))),
        phase, { x: rx, y: hy }, holder.card.id);
    }

    // Unless the move broke down, it ends in a shot — with set-piece follow-ups.
    if (!done) {
      if (!isFinalThird(atk, hy)) hy = forwardStep(atk, hy);
      const t = attemptShot(atk, minute, phase, holder, {});
      if (t === "save" || t === "nearpost") {
        if (rng() < 0.6) {
          emitCorner(atk, minute, phase);
          const t2 = attemptShot(atk, minute, phase, byPos(atk, "ATT", "DEF"), { corner: true });
          if (t2 !== "goal" && rng() < 0.5) emitGoalKick(def, minute);
        } else if (rng() < 0.6) {
          emitGoalKick(def, minute);
        }
      } else if (t === "miss" && rng() < 0.5) {
        emitGoalKick(def, minute);
      }
    }
  }

  return { moments, endScore: { user: userScore, cpu: cpuScore }, involvements, events };
}

// Reads a player's home (x,y) as a ball point.
function homeXY(p: AssignedPlayer, team: "user" | "cpu", get: (p: AssignedPlayer, t: "user" | "cpu") => [number, number]): { x: number; y: number } {
  const [x, y] = get(p, team);
  return { x, y };
}

// ── Frame sampler ──────────────────────────────────────────────────────────

export interface PlayerFrame { id: string; x: number; y: number }

export interface MatchFrame {
  minute: number;
  ball: { x: number; y: number };
  possessorId: string | null;
  players: PlayerFrame[];
  event?: MatchEvent;
  scoreUser: number;
  scoreCpu: number;
}

const SUBFRAMES_PER_MOMENT = 6;

// Dead-ball "hold" frames appended after an event so the viewer can register it.
const PAUSE_FRAMES: Partial<Record<MatchEventType, number>> = {
  goal: 9, save: 4, nearpost: 4, miss: 3,
  corner: 5, throwin: 3, goalkick: 3,
  freekick: 5, yellowcard: 6, redcard: 11,
  tackle: 2, clearance: 2, kickoff: 3, counter: 2,
};

export function momentsToFrames(moments: Moment[], subframes = SUBFRAMES_PER_MOMENT): MatchFrame[] {
  if (moments.length === 0) return [];
  const ids = Object.keys(moments[0].targets);
  const cur: Record<string, { x: number; y: number }> = {};
  for (const id of ids) cur[id] = { ...moments[0].targets[id] };
  let prevBall = { ...moments[0].ball };
  let prevMinute = moments[0].minute;
  const frames: MatchFrame[] = [];

  for (let i = 0; i < moments.length; i++) {
    const m = moments[i];
    const startPos: Record<string, { x: number; y: number }> = {};
    for (const id of ids) startPos[id] = { ...(cur[id] ?? m.targets[id] ?? { x: 50, y: 50 }) };
    const startBall = { ...prevBall };
    const startMinute = prevMinute;

    for (let s = 1; s <= subframes; s++) {
      const t = s / subframes;
      const players: PlayerFrame[] = ids.map((id) => {
        const a = startPos[id] ?? { x: 50, y: 50 };
        const b = m.targets[id] ?? a;
        return { id, x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t) };
      });
      const ball = {
        x: Math.round(startBall.x + (m.ball.x - startBall.x) * t),
        y: Math.round(startBall.y + (m.ball.y - startBall.y) * t),
      };
      const minute = Math.round(startMinute + (m.minute - startMinute) * t);
      const frame: MatchFrame = { minute, ball, possessorId: m.possessorId, players, scoreUser: m.scoreUser, scoreCpu: m.scoreCpu };
      if (s === subframes) {
        frame.event = {
          minute: m.minute, type: m.type, team: m.team, description: m.description,
          scoreUser: m.scoreUser, scoreCpu: m.scoreCpu, phase: m.phase,
          scorerCardId: m.scorerCardId, assisterCardId: m.assisterCardId,
        };
      }
      frames.push(frame);
    }
    // Dead-ball hold: replay the settled position with no new event for a beat.
    const hold = PAUSE_FRAMES[m.type] ?? 0;
    for (let h = 0; h < hold; h++) {
      frames.push({
        minute: m.minute,
        ball: { x: m.ball.x, y: m.ball.y },
        possessorId: m.possessorId,
        players: ids.map((id) => ({ id, x: m.targets[id]?.x ?? 50, y: m.targets[id]?.y ?? 50 })),
        scoreUser: m.scoreUser, scoreCpu: m.scoreCpu,
      });
    }
    for (const id of ids) cur[id] = { ...m.targets[id] };
    prevBall = { ...m.ball };
    prevMinute = m.minute;
  }
  return frames;
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface HalfResult {
  frames: MatchFrame[];
  endScore: { user: number; cpu: number };
  involvements: Map<string, PlayerInvolvement>;
  events: MatchEvent[];
}

export function simulateFirstHalf(input: HalfInput): HalfResult {
  const r = simulateHalfLogic(input, 1, { user: 0, cpu: 0 });
  const frames = momentsToFrames(r.moments);
  const last = frames[frames.length - 1];
  const htEvent: MatchEvent = {
    minute: 45, type: "halftime", team: "user",
    description: `⏸ Half time! ${r.endScore.user}–${r.endScore.cpu}`,
    scoreUser: r.endScore.user, scoreCpu: r.endScore.cpu, phase: "halftime",
  };
  frames.push({
    minute: 45, ball: { x: 50, y: 50 }, possessorId: null,
    players: last ? last.players : [], event: htEvent,
    scoreUser: r.endScore.user, scoreCpu: r.endScore.cpu,
  });
  return { frames, endScore: r.endScore, involvements: r.involvements, events: [...r.events, htEvent] };
}

export interface SecondHalfInput extends HalfInput {
  halftimeScore: { user: number; cpu: number };
  involvements: Map<string, PlayerInvolvement>;
  firstHalfEvents: MatchEvent[];
}

export function simulateSecondHalf(input: SecondHalfInput): { frames: MatchFrame[]; summary: MatchSimulation } {
  const r = simulateHalfLogic(input, 2, input.halftimeScore, input.involvements);
  const frames = momentsToFrames(r.moments);
  const userScore = r.endScore.user, cpuScore = r.endScore.cpu;
  const events: MatchEvent[] = [...input.firstHalfEvents, ...r.events, {
    minute: 90, type: "fulltime", team: "user",
    description: `🔔 Full time! Final score: ${userScore}–${cpuScore}`,
    scoreUser: userScore, scoreCpu: cpuScore, phase: "midfield",
  }];
  const us = calcTeamStats(input.userLineup), cs = calcTeamStats(input.cpuLineup);
  let mvp: PlayerInvolvement | null = null, best = 0;
  for (const inv of input.involvements.values()) {
    const s = inv.goals * 3 + inv.assists;
    if (s > best) { best = s; mvp = inv; }
  }
  const result: "win" | "loss" | "draw" = userScore > cpuScore ? "win" : cpuScore > userScore ? "loss" : "draw";
  const summary: MatchSimulation = {
    events, userScore, cpuScore, result,
    userOverall: us.overall, cpuOverall: cs.overall,
    halftimeScore: input.halftimeScore, mvp,
  };
  return { frames, summary };
}

/** CPU picks a second-half formation: chase the game when behind, protect a lead. */
export function pickCpuSecondHalfFormation(current: Formation, cpuScore: number, userScore: number, seed: string): Formation {
  const rng = seedrandom(`${seed}:cpu-ht`);
  if (cpuScore < userScore) return rng() < 0.7 ? "1-3-2" : "2-3-1"; // attacking
  if (cpuScore > userScore) return rng() < 0.7 ? "3-2-1" : "2-3-1"; // defensive
  return current;
}
