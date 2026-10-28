/**
 * 3v3 match rules and the on-ball mechanics: possession, dribbling, passing,
 * shooting, tackling, skill moves, goals, the clock and the 5IVE MODE meter.
 * Renders nothing itself — main.ts reads the state and `events`.
 */
import * as THREE from "three";
import { angleOf, clamp, dirX, dirZ, dist, gauss, len, lerp, normal, segDist, wrapAngle, type V2 } from "../math";
import type { PlayerModel } from "../rig/model";
import { CELEBRATIONS, GROUP_CELEBRATIONS, type Celebration, type RosterPlayer } from "../roster";
import { TeamAI } from "./ai";
import { aimKick, Ball, flight, rollingSpin, type BallEvent, type KickKind } from "./ball";
import { attackDir, attackX, BALL_R, GOAL_H, GOAL_HALF, GRAVITY, HALF_L, HALF_W, rollDecel, rollSpeedFor, rollTime } from "./field";
import { JOG, Player, PLAYER_R, rate } from "./player";

export const MATCH_SECONDS = 180;
const GOLDEN_GOAL_SECONDS = 60;
const FIVE_MODE_SECONDS = 15;
/**
 * 5IVE MODE (style fills a meter that powers your team up for a while) is
 * switched off for now: the glow made both teams look the same colour and it
 * wasn't clear how it worked. Style moves still score for the man of the match.
 */
export const FIVE_MODE = false;

/**
 * How far from a player the ball can be for them to take it (m): good first
 * touch (dribbling) reaches further. The intended receiver of a pass gets more.
 */
export const controlReach = (p: Player) => 0.45 + 0.4 * rate(p.stats.dribbling);
/** Most a pass bends onto its receiver (m/s² sideways): passes stick to people a little. */
const PASS_ASSIST = 3.6;
/** Half-width of a player's body for the ball to hit (legs, then torso). */
const LEGS_R = 0.22;
const TORSO_R = 0.27;

export interface Difficulty {
  /** Story mode makes its own in between (see `story/career.ts`). */
  id: "amateur" | "pro" | "legend" | "story";
  label: string;
  /** CPU decision delay (s). */
  react: number;
  /** CPU top-speed multiplier. */
  speed: number;
  /** CPU poke/tackle success multiplier. */
  steal: number;
  /** CPU shot error multiplier. */
  aim: number;
  /** How often the CPU tries skills. */
  flair: number;
}

export const DIFFICULTIES: Difficulty[] = [
  { id: "amateur", label: "Amateur", react: 0.5, speed: 0.9, steal: 0.6, aim: 1.5, flair: 0.4 },
  { id: "pro", label: "Pro", react: 0.3, speed: 0.97, steal: 0.9, aim: 1.1, flair: 0.8 },
  { id: "legend", label: "Legend", react: 0.16, speed: 1.03, steal: 1.2, aim: 0.85, flair: 1.2 },
];

/** Seconds to fill the shot / pass power rings; a quick tap of Pass (under PASS_TAP) is a normal pass. */
const SHOT_CHARGE = 0.85;
const PASS_TAP = 0.15;
const PASS_CHARGE = 0.6;

export interface Pad {
  /** World-space stick, length 0..1 (+x = right of screen, +z = toward the camera, both reversed from the other touchline: see `camSide`). */
  move: V2;
  passDown: boolean;
  passHeld: boolean;
  passUp: boolean;
  shootDown: boolean;
  shootHeld: boolean;
  shootUp: boolean;
  skill: boolean;
  /** Sprint: the stick pushed right out (or Shift). */
  sprint: boolean;
  /**
   * How long Pass / Shoot were held (s), measured on the phone they were pressed
   * on (online, the other player's). Used on release instead of the match clock.
   */
  passHeldFor?: number;
  shootHeldFor?: number;
}

/** No buttons, stick centred. */
export const IDLE_PAD: Pad = {
  move: { x: 0, z: 0 }, passDown: false, passHeld: false, passUp: false, shootDown: false, shootHeld: false, shootUp: false, skill: false, sprint: false,
};

export type Sound = "kick" | "bigkick" | "wall" | "post" | "net" | "bounce" | "tackle" | "smash" | "trick" | "whistle" | "whistleEnd" | "cheer" | "ooh" | "meter";

type TackleKind = "barge" | "slide" | "kungfu";
/**
 * Each tackle: how long it lasts (s), when in it (0..1) it can hit, where (metres
 * in front, and radius), how likely it is to win the ball off a carrier before
 * stats, how far it sends people, and what it's called.
 */
const TACKLES: Record<TackleKind, { dur: number; from: number; to: number; reach: number; radius: number; base: number; launch: number; text: string }> = {
  barge: { dur: 0.45, from: 0.1, to: 0.6, reach: 0.5, radius: 0.5, base: 0.65, launch: 0.75, text: "BODY CHECK!" },
  slide: { dur: 0.85, from: 0.06, to: 0.62, reach: 0.8, radius: 0.6, base: 0.6, launch: 0.9, text: "SLIDE TACKLE!" },
  kungfu: { dur: 1.05, from: 0.08, to: 0.42, reach: 0.75, radius: 0.65, base: 0.55, launch: 1.25, text: "KUNG FU!" },
};

export type MatchEvent =
  | { type: "sound"; name: Sound; v: number }
  /** `team`: only for the person playing that side (unset = everyone). */
  | { type: "haptic"; style: "light" | "medium" | "heavy" | "success" | "error"; team?: 0 | 1 }
  | { type: "style"; team: 0 | 1; text: string }
  | { type: "goal"; team: 0 | 1; scorer: Player | null; og: boolean; label?: string }
  | { type: "fiveMode"; team: 0 | 1 }
  | { type: "hit"; x: number; z: number; power: number; user: boolean }
  | { type: "kickoff" }
  /** Story mode: a substitution, and one of the user's players running low on legs. */
  | { type: "sub"; team: 0 | 1; off: Player; on: Player }
  | { type: "tired"; player: Player }
  /** `motm` is filled in when the match comes from another phone (online). */
  | { type: "end"; motm?: Player };

export type MatchState = "kickoff" | "play" | "goal" | "fulltime" | "over";

export interface Scorer { team: 0 | 1; name: string; og: boolean; second: number }

/** Someone playing one side: the player they control and the buttons they have going. */
export class Controller {
  /** Defending, hand them the teammate nearest the ball when theirs is out of the play. */
  autoSwitch = true;
  /** When the shoot button went down (charging), or null. */
  chargeStart: number | null = null;
  /** When the pass button went down (charging), or null. */
  passStart: number | null = null;
  /** First-time pass/shot queued before the ball arrived. */
  buffered: { kind: "pass" | "shot"; power: number; until: number } | null = null;
  /** Last Switch press (manual). */
  lastSwitch = 0;
  lastAutoSwitch = -Infinity;
  /** Who the last auto switch took them off. */
  switchedFrom: Player | null = null;
  /** How long an auto switch has been on the cards. */
  switchFor = 0;

  constructor(readonly team: 0 | 1, public user: Player) {}

  reset() {
    this.buffered = null;
    this.chargeStart = null;
    this.passStart = null;
  }
}

export class Match {
  t = 0;
  clock = MATCH_SECONDS;
  goldenGoal = false;
  state: MatchState = "kickoff";
  stateT = 0;
  score: [number, number] = [0, 0];
  scorers: Scorer[] = [];
  meter: [number, number] = [0, 0];
  fiveMode: [number, number] = [0, 0];
  /** On the pitch. */
  readonly teams: [Player[], Player[]];
  readonly players: Player[];
  /** Subs waiting to come on (story mode). */
  readonly bench: [Player[], Player[]];
  /** Players tire over the match and subs matter (story mode): see `Player.energy`. */
  readonly fatigue: boolean;
  readonly ball: Ball;
  /** Who's playing each side (null = the CPU). */
  readonly humans: [Controller | null, Controller | null];
  /** The side this screen plays: its HUD, haptics and result. */
  readonly userTeam: 0 | 1;
  lastScorer: Player | null = null;
  events: MatchEvent[] = [];
  /** Style points per player, for the man of the match. */
  style = new Map<Player, number>();

  /** Both teams AI-driven (demo / balance testing). */
  autopilot = false;
  /** Stats for balancing. */
  log = {
    goalDist: [] as number[], shots: [0, 0], onTarget: [0, 0], blocks: [0, 0], tackles: [0, 0], pokes: [0, 0], tricks: [0, 0],
    passes: [0, 0], completed: [0, 0], heavyTouches: [0, 0], bodyBlocks: [0, 0], possession: [0, 0], sprint: [0, 0], takedowns: [0, 0],
  };
  /** Celebrations each player has done this match (a new one for every goal). */
  private celebrated = new Map<Player, Celebration[]>();
  /** The last pass someone took, for assists. */
  private lastPass: { from: Player; to: Player; t: number } | null = null;
  /** Players we've already said are tiring. */
  private warned = new Set<Player>();
  private nextCpuSub = 0;

  private people: Controller[];
  private kickoffTeam: 0 | 1 = 0;
  private possessionTeam: 0 | 1 | null = null;
  private graceUntil = 0;
  private ai: [TeamAI, TeamAI];
  private ballEvents: BallEvent[] = [];

  constructor(
    scene: THREE.Object3D,
    home: RosterPlayer[],
    away: RosterPlayer[],
    readonly difficulty: Difficulty,
    model: (p: RosterPlayer) => PlayerModel,
    /**
     * Online both sides are people; `userTeam` is the one playing on this screen.
     * Story mode: `bench` (subs for each side) and `fatigue`.
     */
    opts: { humans?: [boolean, boolean]; userTeam?: 0 | 1; bench?: [RosterPlayer[], RosterPlayer[]]; fatigue?: boolean } = {},
  ) {
    this.teams = [
      home.map((r) => new Player(r, 0, model(r))),
      away.map((r) => new Player(r, 1, model(r))),
    ];
    this.players = [...this.teams[0], ...this.teams[1]];
    this.bench = [0, 1].map((t) => (opts.bench?.[t] ?? []).map((r) => new Player(r, t as 0 | 1, model(r)))) as Match["bench"];
    this.fatigue = !!opts.fatigue;
    this.ball = new Ball(scene);
    this.userTeam = opts.userTeam ?? 0;
    const humans = opts.humans ?? [true, false];
    this.humans = [0, 1].map((t) => (humans[t] || t === this.userTeam ? new Controller(t as 0 | 1, this.teams[t][0]) : null)) as Match["humans"];
    this.people = this.humans.filter((c): c is Controller => !!c);
    this.ai = [new TeamAI(this, 0), new TeamAI(this, 1)];
    for (const p of [...this.players, ...this.bench[0], ...this.bench[1]]) this.style.set(p, 0);
    this.setupKickoff(Math.random() < 0.5 ? 0 : 1);
  }

  emit(e: MatchEvent) { this.events.push(e); }
  sound(name: Sound, v = 1) { this.emit({ type: "sound", name, v }); }

  /** The person playing on this screen. */
  get me(): Controller { return this.humans[this.userTeam]!; }
  /** The player this screen controls. */
  get user() { return this.me.user; }
  get autoSwitch() { return this.me.autoSwitch; }
  set autoSwitch(on: boolean) { this.me.autoSwitch = on; }
  isUser(p: Player) { return p === this.humans[p.team]?.user; }
  isCpu(team: 0 | 1) { return !this.humans[team]; }
  /**
   * Which touchline a side's screen watches from: 1 is the usual one (z > 0). Online the
   * away player watches from the other one, so both people attack left to right.
   */
  camSide(team: 0 | 1): 1 | -1 { return team === 1 && this.humans[1] ? -1 : 1; }
  opponents(team: 0 | 1) { return this.teams[team === 0 ? 1 : 0]; }
  get possession() { return this.ball.owner?.team ?? null; }
  speedMul(p: Player) {
    const cpu = this.isCpu(p.team) ? this.difficulty.speed : 1;
    return cpu * (this.fiveMode[p.team] > 0 ? 1.08 : 1);
  }

  // ── Flow ──────────────────────────────────────────────────────────────────

  private setupKickoff(team: 0 | 1) {
    this.kickoffTeam = team;
    this.state = "kickoff";
    this.stateT = 0;
    this.ball.reset(0, 0);
    for (const t of [0, 1] as const) {
      const own = -attackDir(t);
      const spots: V2[] = t === team
        ? [{ x: own * 0.45, z: 0 }, { x: own * 4.5, z: -3.6 }, { x: own * 4.5, z: 3.6 }]
        : [{ x: own * 4.2, z: 0 }, { x: own * 8, z: -3.2 }, { x: own * 8, z: 3.2 }];
      this.teams[t].forEach((p, i) => {
        p.pos = { ...spots[i] };
        p.vel = { x: 0, z: 0 };
        p.want = { x: 0, z: 0 };
        p.facing = angleOf(-own, 0);
        p.action = null;
        p.mood = "play";
        p.look = null;
        p.anim.snap();
      });
    }
    // Rolling subs: the CPU freshens up at kick-offs.
    if (this.fatigue) for (const t of [0, 1] as const) if (this.isCpu(t)) this.cpuSubs(t, 0.55, true);
    const kicker = this.teams[team][0];
    this.giveBall(kicker);
    this.graceUntil = this.t + 1.5;
    for (const c of this.people) {
      c.reset();
      c.user = c.team === team ? kicker : this.nearestTo(this.teams[c.team], this.ball.pos);
    }
    this.emit({ type: "kickoff" });
  }

  private nearestTo(list: Player[], p: { x: number; z: number }, except?: Player) {
    let best = list[0], bd = Infinity;
    for (const q of list) {
      if (q === except) continue;
      const d = dist(q.pos, p);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  /** Advance the match. `pad` drives the home side's person, `away` the away side's (online). */
  step(dt: number, pad: Pad, away: Pad = IDLE_PAD) {
    this.t += dt;
    this.stateT += dt;
    for (const t of [0, 1] as const) {
      if (this.fiveMode[t] > 0) {
        this.fiveMode[t] = Math.max(0, this.fiveMode[t] - (this.state === "play" ? dt : 0));
      }
      for (const p of this.teams[t]) p.glow = this.fiveMode[t] > 0;
    }

    switch (this.state) {
      case "kickoff":
        this.glueBall(dt);
        if (this.stateT > 1.6) {
          this.state = "play";
          this.stateT = 0;
          this.graceUntil = this.t + 1.2;
          this.sound("whistle");
        }
        for (const p of this.players) { p.want = { x: 0, z: 0 }; p.move(dt, this.t, 1, false); }
        return;
      case "play":
        this.clock -= dt;
        if (this.clock <= 0) {
          if (!this.goldenGoal && this.score[0] === this.score[1]) {
            this.goldenGoal = true;
            this.clock = GOLDEN_GOAL_SECONDS;
            this.emit({ type: "style", team: this.userTeam, text: "GOLDEN GOAL" });
            this.sound("whistle");
          } else {
            this.endMatch();
            return;
          }
        }
        this.play(dt, pad, away);
        if (this.fatigue) this.tireOut(dt);
        return;
      case "goal":
        this.celebrate(dt);
        if (this.stateT > 4.2) {
          if (this.goldenGoal) this.endMatch();
          else this.setupKickoff(this.lastGoalTeam === 0 ? 1 : 0);
        }
        return;
      case "fulltime":
        this.celebrate(dt);
        if (this.stateT > 3.2) {
          this.state = "over";
          this.emit({ type: "end" });
        }
        return;
      case "over":
        this.celebrate(dt);
        return;
    }
  }

  private lastGoalTeam: 0 | 1 = 0;

  private endMatch() {
    this.state = "fulltime";
    this.stateT = 0;
    this.sound("whistleEnd");
    const [h, a] = this.score;
    for (const p of this.players) {
      const won = p.team === 0 ? h > a : a > h;
      const lost = p.team === 0 ? h < a : a < h;
      p.mood = won ? "cheer" : lost ? "dejected" : "idle";
      p.moodT = Math.random();
      p.want = { x: 0, z: 0 };
      p.action = null;
    }
    this.ball.owner = null;
    for (const c of this.people) {
      const [mine, theirs] = c.team === 0 ? [h, a] : [a, h];
      this.emit({ type: "haptic", style: mine > theirs ? "success" : mine < theirs ? "error" : "medium", team: c.team });
    }
  }

  private celebrate(dt: number) {
    const scorer = this.lastScorer;
    for (const p of this.players) {
      p.moodT += dt;
      p.sprint = p.mood === "celebrate" && p === scorer;
      if (p.mood === "celebrate" && p === scorer) {
        // Off towards the scoring side's camera, and face it. Slides and dives take off after a run-up.
        const side = this.camSide(p.team);
        const tx = attackX(p.team) * 0.7, tz = (HALF_W - 4) * side;
        const d = dist(p.pos, { x: tx, z: tz });
        const c = p.celebration;
        const glide = c === "kneeSlide" || c === "bellyDive";
        const run = glide ? p.moodT < 0.9 : d > 0.8 && p.moodT < (c === "backflip" ? 0.95 : 2.6);
        p.want = run ? { x: ((tx - p.pos.x) / d) * 6.5, z: ((tz - p.pos.z) / d) * 6.5 } : { x: 0, z: 0 };
        if (!run) p.look = angleOf(0, side);
      } else if (this.state === "goal" && p.team === this.lastGoalTeam && scorer) {
        // Teammates mob the scorer, and join in with the group ones (the dance, the robot…).
        const s = scorer.pos;
        const d = dist(p.pos, s);
        p.want = d > 1.6 ? { x: ((s.x - p.pos.x) / d) * 5.5, z: ((s.z - p.pos.z) / d) * 5.5 } : { x: 0, z: 0 };
        if (d < 2 && p.mood === "play") {
          const join = GROUP_CELEBRATIONS.includes(scorer.celebration) && scorer.moodT > 0.8;
          p.mood = join ? "celebrate" : "cheer";
          p.moodT = join ? scorer.moodT : 0;
          if (join) p.celebration = scorer.celebration;
        }
        if (p.mood === "celebrate") p.look = angleOf(0, this.camSide(p.team));
      } else if (this.state === "goal") {
        if (p.mood === "play") { p.mood = "dejected"; p.moodT = Math.random(); }
        p.want = { x: 0, z: 0 };
      } else {
        p.want = { x: 0, z: 0 };
      }
      const slide = p.mood === "celebrate" && p === scorer && (p.celebration === "kneeSlide" || p.celebration === "bellyDive") && p.moodT > 0.9;
      if (slide) {
        // Knee slide: keep gliding and slow down gently.
        p.vel.x *= Math.exp(-1.6 * dt);
        p.vel.z *= Math.exp(-1.6 * dt);
        p.pos.x = clamp(p.pos.x + p.vel.x * dt, -HALF_L + 0.3, HALF_L - 0.3);
        p.pos.z = clamp(p.pos.z + p.vel.z * dt, -HALF_W + 0.3, HALF_W - 0.3);
      } else {
        p.move(dt, this.t, 1, false);
      }
    }
    this.separate();
    this.freeBall(dt);
  }

  // ── Play ──────────────────────────────────────────────────────────────────

  private play(dt: number, pad: Pad, away: Pad) {
    if (!this.autopilot) {
      for (const c of this.people) {
        const p = c.team === 0 ? pad : away;
        this.autoSwitchUser(c, dt, p);
        this.userControl(c, p);
      }
    }
    const pt = this.possession;
    if (pt !== null) this.log.possession[pt] += dt;
    this.ai[0].update(dt);
    this.ai[1].update(dt);

    this.chaseOwnTouch();
    for (const p of this.players) {
      const withBall = this.ball.owner === p;
      p.move(dt, this.t, this.speedMul(p) * (withBall ? p.dribbleSpeed : 1), withBall);
      if (p.sprinting) this.log.sprint[p.team] += dt;
    }
    this.separate();
    this.tackles();

    if (this.ball.owner) {
      this.dribble(dt);
      if (this.ball.owner) this.pokes(dt);
    } else {
      this.freeBall(dt);
      if (this.state !== "play") return;
      this.tryControl();
    }
  }

  /**
   * Keep players from overlapping (the stronger one gives less ground). Running
   * into someone hard (closing at more than 2 m/s) is a bump: the speed over that
   * is lost, shared by "mass" (physical). Leaning on someone isn't: it only keeps
   * them apart. A carrier running into a man rolls round him rather than
   * stopping dead (otherwise a defender stood in the way is a wall).
   */
  private separate() {
    const ps = this.players;
    const owner = this.ball.owner;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d = len(dx, dz);
        const min = PLAYER_R * 2;
        if (d >= min || d < 1e-4) continue;
        const nx = dx / d, nz = dz / d;
        const push = min - d;
        const wa = b.stats.physical / (a.stats.physical + b.stats.physical);
        a.pos.x -= nx * push * wa;
        a.pos.z -= nz * push * wa;
        b.pos.x += nx * push * (1 - wa);
        b.pos.z += nz * push * (1 - wa);
        if (a.air > 0 || b.air > 0) continue;
        const vn = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
        const hit = -vn - 2;
        if (hit > 0) {
          const ma = 1 + rate(a.stats.physical) * 0.6, mb = 1 + rate(b.stats.physical) * 0.6;
          const j2 = (1.15 * hit) / (1 / ma + 1 / mb);
          a.vel.x -= (nx * j2) / ma; a.vel.z -= (nz * j2) / ma;
          b.vel.x += (nx * j2) / mb; b.vel.z += (nz * j2) / mb;
          a.bumpedAt = b.bumpedAt = this.t;
        }
        if (owner === a) this.rollRound(a, b, nx, nz);
        else if (owner === b) this.rollRound(b, a, -nx, -nz);
      }
    }
  }

  /**
   * Turn a carrier's run into someone (`n`: toward them) into a run round them:
   * more of it for a good dribbler, less against a good defender (they hold you up).
   */
  private rollRound(p: Player, by: Player, nx: number, nz: number) {
    const into = p.vel.x * nx + p.vel.z * nz;
    if (into <= 0) return;
    // Round the side the stick leans to, else the side the ball's on, else their left.
    const tx = -nz, tz = nx;
    const lean = p.want.x * tx + p.want.z * tz;
    const ball = (this.ball.pos.x - p.pos.x) * tx + (this.ball.pos.z - p.pos.z) * tz;
    const side = Math.abs(lean) > 0.3 ? Math.sign(lean) : Math.abs(ball) > 0.05 ? Math.sign(ball) : 1;
    const edge = by.team === p.team ? 0.5 : clamp(0.5 + (rate(p.stats.dribbling) - rate(by.stats.defending)) * 0.8, 0, 1);
    const round = (0.35 + 0.5 * edge) * into;
    p.vel.x += -nx * into + tx * side * round;
    p.vel.z += -nz * into + tz * side * round;
  }

  private giveBall(p: Player) {
    const b = this.ball;
    const prevTeam = this.possessionTeam;
    const kick = b.kick;
    b.owner = p;
    b.lastTouch = p;
    // Cushion it (a good first touch kills it dead), and take the first touch straight away.
    // Off the chest or thigh it drops in front of them, going their way.
    const cushion = 0.35 - 0.25 * rate(p.stats.dribbling);
    if (b.pos.y > 0.5) b.vel.set(p.vel.x + dirX(p.facing) * 0.8, Math.min(0, b.vel.y) * 0.2, p.vel.z + dirZ(p.facing) * 0.8);
    else b.vel.set(b.vel.x * cushion, Math.min(0, b.vel.y) * 0.2, b.vel.z * cushion);
    b.spin.multiplyScalar(0.2);
    p.touchAt = this.t;
    p.pressure = 0;
    const passed = !!kick && kick.by !== p && kick.by.team === p.team && (kick.kind === "pass" || kick.kind === "lob" || kick.kind === "space");
    if (passed) {
      this.log.completed[p.team]++;
      this.lastPass = { from: kick!.by, to: p, t: this.t };
    } else if (this.lastPass && this.lastPass.to !== p) this.lastPass = null;
    this.possessionTeam = p.team;
    this.graceUntil = this.t + 0.45;

    // Style for getting your own trick/wall pass back.
    if (kick && kick.by === p && this.t - kick.t < 3) {
      if (kick.kind === "panna") this.addStyle(p, "PANNA!", 0.28, 300);
      else if (kick.kind === "rainbow") this.addStyle(p, "RAINBOW FLICK!", 0.2, 220);
      else if (kick.walled && (kick.kind === "space" || kick.kind === "pass")) this.addStyle(p, "WALL PASS", 0.12, 150);
    }
    b.kick = null;

    for (const c of this.people) {
      if (p.team === c.team) {
        c.user = p;
        if (prevTeam !== null && prevTeam !== p.team) this.emit({ type: "haptic", style: "light", team: c.team });
        // A first-time pass or shot queued before the ball arrived.
        const q = c.buffered;
        c.buffered = null;
        if (q && this.t <= q.until) {
          if (q.kind === "shot") this.shoot(p, q.power, null, true);
          else this.pass(p, this.pickPassTarget(p, null), null, q.power);
        }
      } else if (prevTeam === c.team && this.ball.owner && c.autoSwitch) {
        // Lost it: give them the defender nearest the ball.
        const u = this.nearestTo(this.teams[c.team], this.ball.pos);
        if (u !== c.user && dist(u.pos, this.ball.pos) + 1.5 < dist(c.user.pos, this.ball.pos)) {
          c.user = u;
          c.lastAutoSwitch = this.t;
        }
      }
    }
  }

  /** The ball stuck to the carrier's boot: stood still, mid-trick or striking it, and at kick-off. */
  private glueBall(dt: number) {
    const o = this.ball.owner;
    if (!o) return;
    const b = this.ball;
    const a = o.action;
    const s = o.speed;
    let reach = 0.42 + 0.03 * s;
    if (a?.kind === "roulette") reach = 0.22;
    if (a?.kind === "stepover") reach = 0.36;
    if (a?.kind === "kick") reach = 0.4;
    if (a?.kind === "barge") reach = 0.45;
    const tx = o.pos.x + dirX(o.facing) * reach;
    const tz = o.pos.z + dirZ(o.facing) * reach;
    const k = 1 - Math.exp(-28 * dt);
    const nx = b.pos.x + (tx - b.pos.x) * k;
    const nz = b.pos.z + (tz - b.pos.z) * k;
    b.vel.set((nx - b.pos.x) / Math.max(dt, 1e-4), 0, (nz - b.pos.z) / Math.max(dt, 1e-4));
    rollingSpin(b.vel.x, b.vel.z, b.spin);
    b.pos.set(clamp(nx, -HALF_L + BALL_R, HALF_L - BALL_R), BALL_R, clamp(nz, -HALF_W + BALL_R, HALF_W - BALL_R));
  }

  /**
   * The ball at the carrier's feet. Stood still, doing a trick or striking it,
   * it's glued to the boot. On the move it's a real ball: each touch knocks it
   * into their stride and it rolls on until the next one (further ahead flat
   * out, more so for poor dribblers), and they touch it again to turn with it.
   * If it gets away from them (a heavy touch, the boards, a defender's legs)
   * it's anyone's.
   */
  private dribble(dt: number) {
    const b = this.ball;
    const o = b.owner!;
    const a = o.action;
    const sp = o.speed;
    const wl = len(o.want.x, o.want.z);
    if (this.state !== "play" || a || (sp < 1.4 && wl < 1.5)) {
      this.glueBall(dt);
      o.touchAt = this.t;
      return;
    }
    const ctrl = rate(o.stats.dribbling);
    const d = dist(b.pos, o.pos);
    // Turning right round with it (a drag-back) takes it straight away.
    const back = sp > 1 && wl > 1 && Math.abs(wrapAngle(angleOf(o.want.x, o.want.z) - angleOf(o.vel.x, o.vel.z))) > 2;
    const gap = back ? 0.05 : lerp(0.12, 0.06, ctrl);
    const ready = d < this.touchReach(o) && b.pos.y < 0.8 && this.t >= o.lastTouchT + gap;
    if (ready) {
      // Touch it when one's due, or now if it won't be where they'll be by then (they've
      // turned, sped up or stopped, or run past it).
      const plan = this.touchPlan(o, sp, ctrl);
      let due = this.t >= o.touchAt || (back && this.t >= o.lastTouchT + 0.2);
      if (!due) {
        const tau = o.touchAt - this.t;
        const rs = b.speed;
        const roll = rs > 0 ? Math.max(0, rs * tau - 0.5 * rollDecel(rs) * tau * tau) / rs : 0;
        const at = o.predict(tau, this.t, this.speedMul(o) * o.dribbleSpeed, true);
        const ps = Math.max(0.3, len(at.vx, at.vz));
        const ahead = this.touchAhead(o, sp, ctrl);
        const ex = b.pos.x + b.vel.x * roll - (at.x + (at.vx / ps) * ahead);
        const ez = b.pos.z + b.vel.z * roll - (at.z + (at.vz / ps) * ahead);
        due = len(ex, ez) > 0.3 + 0.15 * ctrl;
      }
      if (due) this.touch(o, plan, ctrl);
    }

    this.ballPhysics(dt);
    if (b.owner !== o) return;
    if (dist(b.pos, o.pos) > 1.9 + 0.4 * ctrl) this.loseTouch(o);
  }

  /**
   * Where the ball will be over the next 2.6 s (every 0.05 s), if nobody touches
   * it: flight, spin, bounces and the boards. Worked out once a step and shared.
   */
  ballPath() {
    if (this.pathT === this.t) return this.path;
    this.pathT = this.t;
    const b = this.ball;
    const pos = this.pp.copy(b.pos), vel = this.pv.copy(b.vel), w = this.pw.copy(b.spin);
    const h = 0.05;
    let i = 0;
    for (let t = 0; t <= 2.6 + 1e-6; t += h, i++) {
      const q = (this.path[i] ??= { t: 0, x: 0, y: 0, z: 0 });
      q.t = t; q.x = pos.x; q.y = pos.y; q.z = pos.z;
      flight(pos, vel, w, h);
      if (Math.abs(pos.z) > HALF_W - 0.2) { vel.z = -vel.z * 0.7; pos.z = Math.sign(pos.z) * (HALF_W - 0.2); }
      if (Math.abs(pos.x) > HALF_L - 0.2) { vel.x = -vel.x * 0.7; pos.x = Math.sign(pos.x) * (HALF_L - 0.2); }
    }
    this.path.length = i;
    return this.path;
  }
  private path: { t: number; x: number; y: number; z: number }[] = [];
  private pathT = -1;
  private pp = new THREE.Vector3();
  private pv = new THREE.Vector3();
  private pw = new THREE.Vector3();

  /** How far from them a carrier can still play the ball. */
  touchReach(p: Player) { return 0.7 + 0.35 * rate(p.stats.dribbling); }

  /** How far in front of them a touch should leave the ball. */
  private touchAhead(o: Player, sp: number, ctrl: number) {
    return 0.36 + 0.02 * sp + (o.sprinting ? 0.1 + 0.25 * (1 - ctrl) : 0);
  }

  /**
   * Until the next touch: little and often running with it (closer still for
   * good dribblers); flat out, bigger knocks ahead that a defender can nick.
   */
  private touchPlan(o: Player, sp: number, ctrl: number) {
    return sp < 3.5 ? 0.24 : o.sprinting ? lerp(0.66, 0.46, ctrl) : lerp(0.36, 0.26, ctrl);
  }

  /** Knock the ball on so it meets them, a little ahead, at their next touch. */
  private touch(o: Player, T: number, ctrl: number) {
    const b = this.ball;
    const sp = o.speed;
    const at = o.predict(T, this.t, this.speedMul(o) * o.dribbleSpeed, true);
    const ps = len(at.vx, at.vz);
    const hx = ps > 0.3 ? at.vx / ps : dirX(o.facing), hz = ps > 0.3 ? at.vz / ps : dirZ(o.facing);
    const ahead = this.touchAhead(o, sp, ctrl);
    const tx = clamp(at.x + hx * ahead, -HALF_L + 0.35, HALF_L - 0.35);
    const tz = clamp(at.z + hz * ahead, -HALF_W + 0.35, HALF_W - 0.35);
    const ddx = tx - b.pos.x, ddz = tz - b.pos.z;
    const avg = len(ddx, ddz) / T;
    let v = avg + 0.5 * rollDecel(avg) * T;
    // Poorer feet: touches a bit off, more so flat out.
    const loose = (1 - ctrl) * (o.sprinting ? 1.4 : 0.5);
    const ang = angleOf(ddx, ddz) + gauss() * (0.012 + 0.045 * loose) * Math.min(1, sp / 6);
    v *= 1 + gauss() * (0.02 + 0.045 * loose);
    b.vel.set(dirX(ang) * v, Math.max(0, b.vel.y), dirZ(ang) * v);
    rollingSpin(b.vel.x, b.vel.z, b.spin);
    o.touchAt = this.t + T;
    o.lastTouchT = this.t;
  }

  /**
   * A carrier whose ball has run a little away from them goes after it rather
   * than leaving it behind: the CPU always, a person unless they've turned
   * right away from it.
   */
  private chaseOwnTouch() {
    const b = this.ball;
    const o = b.owner;
    if (!o || o.action || this.state !== "play") return;
    const dx = b.pos.x - o.pos.x, dz = b.pos.z - o.pos.z;
    const d = len(dx, dz);
    const wl = len(o.want.x, o.want.z);
    if (d < this.touchReach(o) * 0.9 || wl < 1) return;
    // Aim at where it's rolling to, not where it is.
    const ax = dx + b.vel.x * 0.25, az = dz + b.vel.z * 0.25;
    const person = this.isUser(o) && !this.autopilot;
    if (person && Math.abs(wrapAngle(angleOf(ax, az) - angleOf(o.want.x, o.want.z))) > 2.3) return;
    const al = Math.max(0.01, len(ax, az));
    o.want = { x: (ax / al) * Math.max(wl, b.speed + 1), z: (az / al) * Math.max(wl, b.speed + 1) };
  }

  /** The carrier's let it get away: nobody has it now. */
  private loseTouch(o: Player) {
    const b = this.ball;
    b.owner = null;
    b.kick = { by: o, kind: "loose", t: this.t, walled: false, fromX: b.pos.x, fromZ: b.pos.z };
    this.log.heavyTouches[o.team]++;
  }

  private freeBall(dt: number) {
    const b = this.ball;
    if (b.owner) return;
    this.passAssist(dt);
    this.ballPhysics(dt);
  }

  /** Step the ball (owned or not) in small steps: bounces, bodies in the way, goals. */
  private ballPhysics(dt: number) {
    const b = this.ball;
    const sub = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / sub;
    const ev = this.ballEvents;
    ev.length = 0;
    for (let i = 0; i < sub; i++) {
      b.step(h, ev);
      if (this.state === "play") this.bodyHits();
    }
    for (const e of ev) {
      switch (e.type) {
        case "wall": if (e.speed > 2) this.sound("wall", Math.min(1, e.speed / 16)); break;
        case "post":
          if (b.kick) b.kick.rebound = true;
          if (e.speed > 2) {
            this.sound("post", Math.min(1, e.speed / 18));
            if (this.state === "play") this.sound("ooh", 1);
          }
          break;
        case "net": if (e.speed > 1) this.sound("net", Math.min(1, e.speed / 18)); break;
        case "bounce": if (e.speed > 2.5) this.sound("bounce", Math.min(1, e.speed / 10)); break;
        case "goal": if (this.state === "play") this.goal(e.side === 1 ? 0 : 1); break;
      }
    }
  }

  /**
   * The ball hits whoever's in its way and can't (or won't) take it: anyone
   * knocked down, stumbling, mid-tackle or just beaten; heads when it's too high
   * to control; and an opponent's legs when a sprinting carrier knocks it too
   * far ahead into them (kept close, it's at the carrier's feet and gets past).
   */
  private bodyHits() {
    const b = this.ball;
    const o = b.owner;
    const k = b.kick;
    if (o && (!o.sprinting || dist(b.pos, o.pos) < this.touchReach(o))) return;
    for (const p of this.players) {
      if (p === o || (o && p.team === o.team)) continue;
      if (k && k.by === p && this.t - k.t < 0.25) continue;
      if (k?.beat?.includes(p)) continue;
      // A nutmeg goes through their legs and a rainbow flick over their head.
      if (k && (k.kind === "panna" || k.kind === "rainbow") && this.t - k.t < 1) continue;
      // Free ball: anyone who can take it gets the chance to (tryControl) unless it's over their head.
      if (!o && p.canControl(this.t) && b.pos.y <= p.info.look.height + 0.05) continue;
      const down = p.action?.kind === "floored" || p.action?.kind === "slide";
      const top = (down ? 0.45 : p.info.look.height * 0.95) + p.air;
      if (b.pos.y - BALL_R > top || b.pos.y + BALL_R < p.air) continue;
      const dx = b.pos.x - p.pos.x, dz = b.pos.z - p.pos.z;
      const d = len(dx, dz);
      const r = (b.pos.y < 0.7 ? LEGS_R : TORSO_R) + BALL_R;
      if (d >= r || d < 1e-4) continue;
      const nx = dx / d, nz = dz / d;
      b.pos.x = p.pos.x + nx * r;
      b.pos.z = p.pos.z + nz * r;
      const vn = (b.vel.x - p.vel.x) * nx + (b.vel.z - p.vel.z) * nz;
      if (vn >= 0) continue;
      // Bodies give: a soft bounce, and the glancing part slowed a little. It always comes off
      // them (so it can't sit on someone's head), popping up off a head or chest it hit hard.
      const j = -1.3 * vn;
      b.vel.x = (b.vel.x + j * nx) * 0.85;
      b.vel.z = (b.vel.z + j * nz) * 0.85;
      const out = b.vel.x * nx + b.vel.z * nz;
      if (out < 1) { b.vel.x += nx * (1 - out); b.vel.z += nz * (1 - out); }
      if (b.pos.y > 0.7 && -vn > 3) b.vel.y = Math.max(b.vel.y, 1 + Math.random());
      b.spin.multiplyScalar(0.3);
      if (-vn > 1.5) {
        b.lastTouch = p;
        if (-vn > 4) this.sound("bounce", Math.min(1, -vn / 12));
      }
      if (k) k.target = null;
      if (o) {
        // Into a defender's legs: it's loose.
        b.owner = null;
        b.kick = { by: p, kind: "loose", t: this.t, walled: false, fromX: b.pos.x, fromZ: b.pos.z };
        o.noControlUntil = this.t + 0.2;
        this.log.bodyBlocks[p.team]++;
        return;
      }
    }
  }

  /**
   * Passes stick to people a little: a pass on its way to someone bends gently
   * toward where they're going to meet it (better passers' more), as long as
   * it hasn't hit anything and they're roughly in front of it.
   */
  private passAssist(dt: number) {
    const b = this.ball;
    const k = b.kick;
    if (!k || (k.kind !== "pass" && k.kind !== "lob") || !k.target || k.walled || k.rebound || this.t - k.t > 3) return;
    const r = k.target;
    if (!r.canControl(this.t)) return;
    const s = b.speed;
    if (s < 1.5) return;
    const dx = r.pos.x - b.pos.x, dz = r.pos.z - b.pos.z;
    const d = len(dx, dz);
    if (d < 0.4) return;
    const T = d / s;
    const tx = dx + r.vel.x * T * 0.7, tz = dz + r.vel.z * T * 0.7;
    const cur = angleOf(b.vel.x, b.vel.z);
    const off = wrapAngle(angleOf(tx, tz) - cur);
    if (Math.abs(off) > 1.1) return;
    // Sideways acceleration that would put it on them by the time it gets there, capped.
    const need = (2 * Math.sin(off) * len(tx, tz)) / (T * T);
    const cap = PASS_ASSIST * (0.7 + 0.5 * rate(k.by.stats.passing));
    const turn = (clamp(need, -cap, cap) * dt) / s;
    const ang = cur + turn;
    b.vel.x = dirX(ang) * s;
    b.vel.z = dirZ(ang) * s;
    if (!b.airborne) rollingSpin(b.vel.x, b.vel.z, b.spin);
  }

  private goal(team: 0 | 1) {
    const b = this.ball;
    const scorer = b.lastTouch;
    const og = !!scorer && scorer.team !== team;
    this.score[team]++;
    this.lastGoalTeam = team;
    this.lastScorer = og ? null : scorer;
    this.scorers.push({ team, name: scorer?.name ?? "?", og, second: Math.round(MATCH_SECONDS - this.clock) });
    this.state = "goal";
    this.stateT = 0;
    b.owner = null;
    for (const c of this.people) c.reset();

    let label: string | undefined;
    if (scorer && !og) {
      scorer.goals++;
      const lp = this.lastPass;
      if (lp && lp.to === scorer && lp.from !== scorer && this.t - lp.t < 10) lp.from.assists++;
      scorer.mood = "celebrate";
      scorer.moodT = 0;
      scorer.action = null;
      const kick = b.kick;
      if (kick?.kind === "shot" && Math.abs(kick.fromX - attackX(team)) > 15) { label = "WORLDIE!"; this.addStyle(scorer, label, 0.15, 300); }
      else if (kick?.walled) { label = "OFF THE WALL!"; this.addStyle(scorer, label, 0.1, 200); }
      this.style.set(scorer, (this.style.get(scorer) ?? 0) + 500);
      scorer.celebration = this.pickCelebration(scorer, label);
    }
    this.lastPass = null;
    if (b.kick) this.log.goalDist.push(Math.round(Math.abs(b.kick.fromX - attackX(team))));
    this.emit({ type: "goal", team, scorer, og, label });
    this.sound("cheer", 1);
    this.sound("whistle", 0.6);
    for (const c of this.people) this.emit({ type: "haptic", style: c.team === team ? "success" : "heavy", team: c.team });
  }

  /**
   * A different celebration for every goal: their own one first, then whatever
   * fits — showing off after a worldie, cupping an ear for an equaliser, calming
   * everyone down when it's a rout — or one they haven't done yet.
   */
  private pickCelebration(p: Player, label?: string): Celebration {
    const done = this.celebrated.get(p) ?? [];
    this.celebrated.set(p, done);
    const fresh = (c: Celebration) => !done.includes(c);
    const mine = this.score[p.team], theirs = this.score[p.team === 0 ? 1 : 0];
    let pick: Celebration | undefined;
    if (!done.length) pick = p.info.celebration;
    else if (label === "WORLDIE!" && fresh("backflip") && Math.random() < 0.6) pick = "backflip";
    else if (mine === theirs && fresh("cupEars") && Math.random() < 0.5) pick = "cupEars";
    else if (mine - theirs >= 3 && fresh("calma") && Math.random() < 0.5) pick = "calma";
    else if (mine - theirs === 1 && this.clock < 30 && fresh("shush") && Math.random() < 0.5) pick = "shush";
    if (!pick) {
      const left = CELEBRATIONS.filter(fresh);
      const pool = left.length ? left : CELEBRATIONS;
      pick = pool[Math.floor(Math.random() * pool.length)];
    }
    done.push(pick);
    return pick;
  }

  // ── Control and contests ─────────────────────────────────────────────────

  private tryControl() {
    const b = this.ball;
    if (b.pos.y > 1.85) return;
    const ballSpeed = b.speed;
    let best: Player | null = null, bestD = Infinity;
    const kick = b.kick;
    const shot = kick?.kind === "shot" ? kick.by.team : null;
    // A shot on its way in, before it comes back off a post or the wall.
    const fresh = shot !== null && !!kick && !kick.walled && !kick.rebound && this.t - kick.t < 0.6;
    for (const p of this.players) {
      if (!p.canControl(this.t) || (fresh && kick?.beat?.includes(p))) continue;
      // Up to head height (and a little over: they rise for it).
      if (b.pos.y > p.info.look.height + 0.05) continue;
      const d = len(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      // More reach for the intended receiver, for defenders throwing a body/leg at a shot,
      // and for good defenders reading the other side's passes.
      const theirs = !!kick && kick.by.team !== p.team && kick.kind !== "loose";
      // Cutting out someone else's pass is harder than taking one meant for you, and a shot
      // is only stopped by a body or a leg thrown at it (good defenders read both better).
      const cutOut = theirs && (kick.kind === "pass" || kick.kind === "lob" || kick.kind === "space");
      const block = shot !== null && shot !== p.team;
      const reach = (block ? 0.55 : controlReach(p) * (cutOut ? 0.7 : 1)) + (kick?.target === p ? 0.25 : 0) + (b.pos.y > 0.9 ? -0.15 : 0)
        + (block && b.pos.y < 1.9 ? 0.2 : 0)
        + (theirs ? (rate(p.stats.defending) - 0.5) * (block ? 0.12 : 0.2) : 0);
      if (d >= reach || d >= bestD) continue;
      // A shot that isn't straight at them is past them before they react, more so the harder
      // it's hit; good defenders react quicker. One chance per shot.
      if (kick && fresh && shot !== p.team && d > PLAYER_R) {
        const react = clamp(1.7 - b.speed / 40 + (rate(p.stats.defending) - 0.5) * 0.15, 0.45, 1);
        if (Math.random() > react) { (kick.beat ??= []).push(p); continue; }
      }
      best = p; bestD = d;
    }
    if (!best) return;
    const p = best;
    const rel = len(b.vel.x - p.vel.x, b.vel.z - p.vel.z);
    const intended = kick?.target === p || (kick?.by.team === p.team && kick.kind !== "shot");

    // Hard shots get blocked, not controlled.
    if (kick?.kind === "shot" && kick.by.team !== p.team && rel > 12) {
      this.deflect(p, 0.35);
      this.log.blocks[p.team]++;
      this.addStyle(p, "BLOCKED!", 0.06, 80);
      this.sound("tackle", 0.7);
      return;
    }
    // First touch: a good dribbler takes it in their stride, a good passer's ball is easier to take.
    const passer = intended && kick ? rate(kick.by.stats.passing) : 0;
    let chance = intended
      ? clamp(0.9 + passer * 0.05 + rate(p.stats.dribbling) * 0.05 - Math.max(0, rel - 17) / 30, 0.6, 0.99)
      : clamp(1.1 - rel / 22 + (rate(p.stats.dribbling) - 0.5) * 0.3, 0.3, 1);
    if (b.pos.y > 0.9) chance *= 0.75; // chest/head control
    if (ballSpeed < 3) chance = 1;
    if (Math.random() < chance) {
      this.giveBall(p);
      if (rel > 6) this.sound("kick", 0.25);
    } else {
      this.deflect(p, 0.3);
    }
  }

  /** Ball cannons off a player. */
  private deflect(p: Player, keep: number) {
    const b = this.ball;
    const ang = Math.atan2(b.pos.z - p.pos.z, b.pos.x - p.pos.x) + gauss() * 0.6;
    const s = Math.max(2.5, b.speed * keep);
    b.vel.set(Math.cos(ang) * s, 1 + Math.random() * 2, Math.sin(ang) * s);
    b.lastTouch = p;
    if (b.kick) b.kick.target = null;
    p.noControlUntil = this.t + 0.25;
    this.sound("bounce", 0.6);
  }

  /** Defenders hassling the carrier can poke the ball away. */
  private pokes(dt: number) {
    const b = this.ball;
    const o = b.owner;
    if (!o || this.t < this.graceUntil || this.t < o.invulnUntil) {
      for (const p of this.players) p.pressure = 0;
      return;
    }
    for (const d of this.opponents(o.team)) {
      // Within a leg's stretch of the ball.
      const near = len(b.pos.x - d.pos.x, b.pos.z - d.pos.z) < 1.05 && !d.busy;
      if (!near) { d.pressure = Math.max(0, d.pressure - dt); continue; }
      d.pressure += dt;
      if (d.pressure < 0.18) continue;
      // Shielding: a defender behind the carrier has a much harder time, the stronger the carrier.
      const toD = angleOf(d.pos.x - o.pos.x, d.pos.z - o.pos.z);
      const behind = Math.abs(wrapAngle(toD - o.facing)) > 2.0;
      const cpuMul = this.isCpu(d.team) ? this.difficulty.steal : 1;
      const edge = (rate(d.stats.defending) - rate(o.stats.dribbling)) * 0.7 + (rate(d.stats.physical) - rate(o.stats.physical)) * 0.45;
      // Easier to nick when it's out in front of them than tucked under their feet.
      const loose = clamp((dist(b.pos, o.pos) - 0.45) / 0.5, 0, 1);
      let chance = 1.3 * clamp(0.5 + edge, 0.1, 1.2) * (0.6 + 0.8 * loose);
      chance *= (behind ? 0.2 + 0.35 * (1 - rate(o.stats.physical)) : 1) * (o.sprinting ? 1.4 : 1);
      chance *= cpuMul * (this.fiveMode[o.team] > 0 ? 0.5 : 1);
      if (Math.random() < chance * dt) {
        this.log.pokes[d.team]++;
        if (Math.random() < 0.45) {
          this.giveBall(d);
          d.tackles++;
          this.addStyle(d, "STOLEN", 0.05, 60);
        } else {
          b.owner = null;
          const ang = toD + Math.PI + gauss() * 0.8;
          b.vel.set(Math.sin(ang) * 3.2, 0.6, Math.cos(ang) * 3.2);
          b.lastTouch = d;
          b.kick = { by: d, kind: "loose", t: this.t, walled: false, fromX: b.pos.x, fromZ: b.pos.z };
          o.noControlUntil = this.t + 0.3;
        }
        this.sound("tackle", 0.5);
        d.pressure = 0;
      }
    }
  }

  /**
   * Resolve tackles. There are no fouls: anyone in the way gets taken out, ball or
   * no ball. A ball carrier can still ride it (defending vs dribbling, physical vs
   * physical); everyone else goes flying.
   */
  private tackles() {
    const b = this.ball;
    for (const p of this.players) {
      const a = p.action;
      const spec = a && TACKLES[a.kind as TackleKind];
      if (!a || !spec) continue;
      const k = a.t / a.dur;
      if (k < spec.from || k > spec.to) continue;
      const fx = p.pos.x + dirX(p.facing) * spec.reach, fz = p.pos.z + dirZ(p.facing) * spec.reach;

      // A loose ball in reach: a barge takes it, a slide or a kick knocks it on.
      if (!b.owner && b.pos.y < 0.8 && len(b.pos.x - fx, b.pos.z - fz) < spec.radius && b.kick?.by !== p) {
        if (a.kind === "barge" && p.canControl(this.t)) this.giveBall(p);
        else this.knockLoose(p, 5);
      }

      let flattened = 0;
      for (const o of this.opponents(p.team)) {
        if (a.hit?.includes(o) || o.action?.kind === "floored") continue;
        if (len(o.pos.x - fx, o.pos.z - fz) > spec.radius + PLAYER_R) continue;
        (a.hit ??= []).push(o);
        const hadBall = b.owner === o;
        if (hadBall) {
          if (this.t < o.invulnUntil) { this.addStyle(o, "SKILLED HIM!", 0.1, 150); continue; }
          const toP = angleOf(p.pos.x - o.pos.x, p.pos.z - o.pos.z);
          const fromBehind = Math.abs(wrapAngle(toP - o.facing)) > 2.2;
          const cpuMul = this.isCpu(p.team) ? this.difficulty.steal : 1;
          const edge = (rate(p.stats.defending) - rate(o.stats.dribbling)) * 0.35 + (rate(p.stats.physical) - rate(o.stats.physical)) * 0.25;
          const chance = clamp(spec.base + edge - (fromBehind ? 0.2 : 0), 0.15, 0.95) * Math.min(1.15, cpuMul);
          if (Math.random() > chance) {
            // Rides it: a hop over the challenge.
            o.invulnUntil = this.t + 0.35;
            this.addStyle(o, "HURDLED!", 0.08, 120);
            this.sound("trick", 0.6);
            continue;
          }
        }
        this.flatten(o, p, spec.launch);
        flattened++;
        if (hadBall) {
          this.log.tackles[p.team]++;
          p.tackles++;
          if (a.kind === "barge" && Math.random() < 0.6) this.giveBall(p);
          else this.knockLoose(p, 4.5);
        }
        this.addStyle(p, hadBall ? spec.text : "TAKEN OUT!", 0.1, hadBall ? 120 : 80);
      }
      if (flattened > 1) this.addStyle(p, "DOUBLE TAKEDOWN!", 0.15, 200);
    }
  }

  /** Knock the ball on from a tackle (nobody has it any more). */
  private knockLoose(by: Player, speed: number) {
    const b = this.ball;
    b.owner = null;
    b.vel.set(dirX(by.facing) * speed + gauss(), 0.8 + Math.random(), dirZ(by.facing) * speed + gauss());
    b.lastTouch = by;
    b.kick = { by, kind: "loose", t: this.t, walled: false, fromX: b.pos.x, fromZ: b.pos.z };
  }

  /** Send `o` flying from `by`'s tackle: further the harder it was and the stronger `by` is than them. */
  private flatten(o: Player, by: Player, launch: number) {
    const s = launch * clamp(1 + (rate(by.stats.physical) - rate(o.stats.physical)) * 0.6, 0.6, 1.4);
    const kx = dirX(by.facing), kz = dirZ(by.facing);
    this.log.takedowns[by.team]++;
    o.start("floored", 0.9 + Math.random() * 0.2, { flip: Math.random() < 0.7 ? 1 : -1 });
    // Face the tackler so falling on their back carries them the way they were hit.
    o.facing = angleOf(-kx, -kz);
    o.vel = { x: kx * 5.5 * s + by.vel.x * 0.25, z: kz * 5.5 * s + by.vel.z * 0.25 };
    o.vy = 2.5 + 3 * s;
    o.air = Math.max(o.air, 0.01);
    o.noControlUntil = this.t + o.action!.dur;
    o.pressure = 0;
    o.jockeying = false;
    if (this.ball.owner === o) this.ball.owner = null;
    const user = !this.isCpu(o.team) || !this.isCpu(by.team);
    this.emit({ type: "hit", x: o.pos.x, z: o.pos.z, power: s, user });
    this.sound("smash", Math.min(1, 0.6 + 0.4 * s));
    this.sound("ooh", 0.7);
    if (user) this.emit({ type: "haptic", style: "heavy" });
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  private kickBall(p: Player, kind: KickKind, vx: number, vy: number, vz: number, target: Player | null = null, spin?: THREE.Vector3) {
    const b = this.ball;
    b.owner = null;
    b.vel.set(vx, vy, vz);
    // Along the ground it's struck to roll true; in the air it goes with the spin it was given.
    if (spin) b.spin.copy(spin);
    else if (vy === 0) rollingSpin(vx, vz, b.spin);
    else b.spin.set(0, 0, 0);
    b.lastTouch = p;
    b.kick = { by: p, kind, t: this.t, target, walled: false, fromX: b.pos.x, fromZ: b.pos.z };
    p.noControlUntil = this.t + (kind === "shot" ? 0.4 : 0.3);
  }

  /** Best teammate to pass to, preferring the stick direction. */
  pickPassTarget(p: Player, dir: V2 | null): Player | null {
    const aim = dir && len(dir.x, dir.z) > 0.3 ? angleOf(dir.x, dir.z) : p.facing;
    let best: Player | null = null, bestScore = -Infinity;
    for (const m of this.teams[p.team]) {
      if (m === p) continue;
      const dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z;
      const d = len(dx, dz);
      const off = Math.abs(wrapAngle(angleOf(dx, dz) - aim));
      if (dir && off > 1.1) continue;
      let open = 4;
      for (const o of this.opponents(p.team)) open = Math.min(open, dist(o.pos, m.pos));
      const score = Math.cos(off) * 2 - d / 25 + open * 0.15;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  /**
   * Pass to `target`, or into space along `dir` if there's no one that way.
   * Rolled so it gets there at a pace that's easy to take (firmer from good
   * passers), into the runner's stride. `power` (Pass held, 0..1) drives it:
   * harder, and further ahead into their path, but a little less accurate.
   */
  pass(p: Player, target: Player | null, dir: V2 | null, power = 0) {
    if (this.ball.owner !== p) return;
    const b = this.ball;
    this.log.passes[p.team]++;
    p.start("kick", 0.26, { power: 0.3 + 0.5 * power });
    // Passing: how far off line it goes (1σ, radians), and how crisply it's played.
    const skill = rate(p.stats.passing);
    const err = gauss() * (0.006 + (1 - skill) * 0.05) * (1 + 0.6 * power);
    const crisp = 0.9 + skill * 0.2;

    if (!target) {
      // Pass into space along the stick — off the wall if you like.
      const a = (dir && len(dir.x, dir.z) > 0.3 ? angleOf(dir.x, dir.z) : p.facing) + err;
      const v = 13 * crisp * (1 + 0.6 * power);
      this.kickBall(p, "space", dirX(a) * v, 0, dirZ(a) * v);
      this.sound("kick", 0.45 + 0.4 * power);
      return;
    }
    // Good passers play it into the runner's stride; poor ones leave it behind them.
    // Driven, it goes well ahead of them: a through ball.
    const lead = (0.4 + skill * 0.45) * (1 + 1.6 * power);
    let tx = target.pos.x, tz = target.pos.z, v0 = 0, d = 0;
    for (let i = 0; i < 3; i++) {
      d = Math.max(0.5, len(tx - b.pos.x, tz - b.pos.z));
      v0 = Math.min(24, rollSpeedFor(d, (7.5 + 0.3 * d) * crisp * (1 + 0.5 * power)));
      const T = Math.min(2.5, rollTime(v0, d));
      tx = clamp(target.pos.x + target.vel.x * T * lead, -HALF_L + 0.6, HALF_L - 0.6);
      tz = clamp(target.pos.z + target.vel.z * T * lead, -HALF_W + 0.6, HALF_W - 0.6);
    }
    const a = angleOf(tx - b.pos.x, tz - b.pos.z) + err;

    // Chip it over anyone standing in the lane, with a little backspin so it sits down.
    const blocked = this.opponents(p.team).some((o) => {
      const s = segDist(o.pos, b.pos, { x: tx, z: tz });
      return s.d < 0.9 && s.t > 0.12 && s.t < 0.85;
    });
    if (blocked && d > 3) {
      // High enough to clear the man in the way (a 2.6 m peak), quicker over longer distances.
      const h = clamp(4 + d * 0.5, 7, 12.5);
      const T = Math.max(d / h, Math.sqrt((8 * 2.6) / GRAVITY));
      // Dropped into their path for when it comes down.
      const lx = clamp(target.pos.x + target.vel.x * T * lead, -HALF_L + 0.6, HALF_L - 0.6);
      const lz = clamp(target.pos.z + target.vel.z * T * lead, -HALF_W + 0.6, HALF_W - 0.6);
      const ld = len(lx - b.pos.x, lz - b.pos.z), la = angleOf(lx - b.pos.x, lz - b.pos.z) + err;
      const land = new THREE.Vector3(b.pos.x + dirX(la) * ld, BALL_R, b.pos.z + dirZ(la) * ld);
      const spin = new THREE.Vector3(-dirZ(la), 0, dirX(la)).multiplyScalar(12);
      const v = aimKick(b.pos, land, T, spin);
      this.kickBall(p, "lob", v.x, v.y, v.z, target, spin);
    } else {
      this.kickBall(p, "pass", dirX(a) * v0, 0, dirZ(a) * v0, target);
    }
    this.sound("kick", 0.45 + 0.4 * power);
    const c = this.humans[p.team];
    if (c) c.user = target;
  }

  /**
   * Shoot at the goal. `aimZ` picks the corner (-1..1 across the goal); null = auto.
   * Placed shots curl in from outside the post; hit hard they dip with topspin.
   */
  shoot(p: Player, power: number, aimZ: number | null, firstTime = false) {
    if (this.ball.owner !== p) return;
    const b = this.ball;
    const team = p.team;
    const five = this.fiveMode[team] > 0;
    power = clamp(power, 0.1, 1);
    p.start("kick", 0.34, { power });

    const gx = attackX(team) + attackDir(team) * 0.6;
    // Shooting: good finishers go for the corner (just inside the posts), hit it harder and miss less.
    const skill = rate(p.stats.shooting);
    const corner = (0.7 + skill * 0.6) * (GOAL_HALF / 1.75);
    let z: number;
    if (aimZ !== null && Math.abs(aimZ) > 0.25) z = Math.sign(aimZ) * (corner + 0.1);
    else {
      // Away from the nearest defender to goal.
      const keeper = this.nearestTo(this.opponents(team), { x: attackX(team), z: 0 });
      z = keeper.pos.z > b.pos.z * 0.2 ? -corner : corner;
      z += gauss() * 0.25;
    }
    const D = len(gx - b.pos.x, z - b.pos.z);
    const h = (13 + power * 15) * (0.9 + skill * 0.18) + (five ? 4 : 0) + (firstTime ? 1.5 : 0);
    let y = 0.25 + power * 0.95;
    const cpuAim = this.isCpu(team) ? this.difficulty.aim : 1;
    // Spread (1σ, radians / metres): worse from distance, with power, and for weaker shooters.
    let sAng = (0.012 + (1 - skill) * 0.1 + Math.max(0, D - 6) * 0.004 + power ** 3 * 0.025) * cpuAim;
    let sY = (0.1 + power * power * 0.4 + Math.max(0, D - 10) * 0.025) * (1.3 - skill * 0.6) * cpuAim;
    if (five) { sAng *= 0.5; sY *= 0.5; }
    const a = angleOf(gx - b.pos.x, z - b.pos.z) + normal() * sAng;
    y = clamp(y + normal() * sY, 0.15, GOAL_H + 1.5);
    const to = new THREE.Vector3(b.pos.x + dirX(a) * D, y, b.pos.z + dirZ(a) * D);
    if (Math.abs(to.z) < GOAL_HALF && to.y < GOAL_H) this.log.onTarget[team]++;

    // Spin. Sidespin bends it back toward the middle of the goal; the less power, the more bend.
    const fx = dirX(a), fz = dirZ(a);
    const spin = new THREE.Vector3(fz, 0, -fx).multiplyScalar(4 + 22 * power * power); // topspin: dips
    if (Math.abs(to.z) > 0.5) {
      const bend = (18 + 34 * skill) * (1 - 0.6 * power) * (five ? 1.3 : 1);
      // Curl toward the middle (-z for a ball going to +z): ω_y × v points that way.
      spin.y = Math.sign(to.z) * Math.sign(fx) * bend;
    }
    const v = aimKick(b.pos, to, D / h, spin);
    this.kickBall(p, "shot", v.x, v.y, v.z, null, spin);
    this.log.shots[team]++;
    this.sound("bigkick", 0.6 + power * 0.4);
    if (!this.isCpu(team)) this.emit({ type: "haptic", style: power > 0.7 ? "heavy" : "medium", team });
    if (firstTime) this.addStyle(p, "FIRST TIME!", 0.05, 80);
  }

  /** Pick a skill move for the situation and do it. */
  trick(p: Player) {
    if (this.ball.owner !== p || this.t < p.trickReadyAt || p.busy) return;
    const b = this.ball;
    const five = this.fiveMode[p.team] > 0;
    p.trickReadyAt = this.t + 0.75;
    this.log.tricks[p.team]++;

    // Nearest opponent in front of us.
    let def: Player | null = null, dd = Infinity, side = 0;
    for (const o of this.opponents(p.team)) {
      const dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z;
      const d = len(dx, dz);
      const off = wrapAngle(angleOf(dx, dz) - p.facing);
      if (d < 4.6 && Math.abs(off) < 0.8 && d < dd) { def = o; dd = d; side = off; }
    }
    const away = side >= 0 ? -1 : 1; // sidestep away from the defender's side
    const drib = p.stats.dribbling;
    const r = Math.random();

    if (def && dd < 2.4 && (drib >= 68 || r < 0.4)) {
      // Panna: through the legs, run round him.
      p.start("panna", 0.45, { shift: away * 1.1 });
      p.invulnUntil = this.t + 0.45;
      const success = five || Math.random() < clamp(0.6 + (drib - def.stats.defending) / 110, 0.25, 0.92);
      const a = angleOf(def.pos.x - b.pos.x, def.pos.z - b.pos.z);
      if (success) {
        this.kickBall(p, "panna", dirX(a) * (dd * 1.2 + 4.2), 0, dirZ(a) * (dd * 1.2 + 4.2));
        p.noControlUntil = this.t + 0.2;
        def.noControlUntil = this.t + 0.8;
        def.start("stumble", 0.6);
        this.sound("trick", 1);
      } else {
        this.kickBall(p, "loose", dirX(a) * 5, 0, dirZ(a) * 5);
        p.noControlUntil = this.t + 0.5;
      }
    } else if (def && dd < 4.6 && (drib >= 78 || r < 0.35)) {
      // Rainbow flick over his head.
      p.start("flick", 0.42);
      p.invulnUntil = this.t + 0.5;
      // High enough to clear their head (about a 1.9 m peak).
      const reach = dd + 2.6;
      const T = Math.max(reach / 5.2, 1.15);
      const vh = reach / T;
      this.kickBall(p, "rainbow", dirX(p.facing) * vh, (GRAVITY * T) / 2, dirZ(p.facing) * vh);
      p.noControlUntil = this.t + 0.45;
      const success = five || Math.random() < clamp(0.55 + (drib - def.stats.defending) / 100, 0.3, 0.92);
      def.noControlUntil = this.t + (success ? 1.0 : 0.15);
      if (success) def.start("stumble", 0.5);
      this.sound("trick", 1);
    } else if (def || r < 0.5) {
      p.start("roulette", 0.5, { shift: away * 0.9 });
      p.invulnUntil = this.t + 0.5;
      p.burstUntil = this.t + 0.9;
      this.addStyle(p, "ROULETTE", def && dd < 3 ? 0.09 : 0.04, 100);
      this.sound("trick", 0.7);
    } else {
      p.start("stepover", 0.42, { shift: (Math.random() < 0.5 ? -1 : 1) * 0.6 });
      p.invulnUntil = this.t + 0.42;
      p.burstUntil = this.t + 0.9;
      this.addStyle(p, "STEPOVER", 0.04, 60);
      this.sound("trick", 0.5);
    }
  }

  /**
   * Tackle! Picked by how far away the ball is: a shoulder barge up close, a
   * flying kung-fu kick or a slide from a couple of metres, a long slide from
   * further. Slides and kicks leave you on the floor for a moment if you miss.
   */
  tackle(p: Player) {
    if (this.t < p.tackleReadyAt || p.busy || p.air > 0) return;
    const b = this.ball;
    const d = len(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
    // Aim at the ball if it's in range (turned into over the first frames, not snapped).
    const aim = d < 5 ? p.facing + clamp(wrapAngle(angleOf(b.pos.x - p.pos.x, b.pos.z - p.pos.z) - p.facing), -1.1, 1.1) : undefined;
    const kind: TackleKind = d < 1.4 ? "barge" : d < 2.8 && Math.random() < 0.5 ? "kungfu" : "slide";
    const spec = TACKLES[kind];
    p.start(kind, spec.dur, { aim });
    if (kind === "kungfu") { p.vy = 4.4; p.air = 0.01; }
    p.tackleReadyAt = this.t + spec.dur + 0.15;
    this.sound("kick", 0.3);
  }

  addStyle(p: Player, text: string, meter: number, points: number) {
    this.style.set(p, (this.style.get(p) ?? 0) + points);
    this.emit({ type: "style", team: p.team, text });
    if (!FIVE_MODE || this.fiveMode[p.team] > 0) return;
    this.meter[p.team] = Math.min(1, this.meter[p.team] + meter);
    if (this.meter[p.team] >= 1) {
      this.meter[p.team] = 0;
      this.fiveMode[p.team] = FIVE_MODE_SECONDS;
      this.emit({ type: "fiveMode", team: p.team });
      this.sound("meter", 1);
    }
  }

  // ── People ────────────────────────────────────────────────────────────────

  private userControl(c: Controller, pad: Pad) {
    const u = c.user;
    const b = this.ball;
    const tilt = len(pad.move.x, pad.move.z);
    const stick = tilt > 0.2 ? pad.move : null;
    const hasBall = b.owner === u;

    // Movement. The stick is analogue: a half push walks, further runs, and right out
    // to the rim sprints. With no input, a receiver drifts onto a pass, and after a
    // panna or rainbow flick you chase your own ball.
    const chasing = !b.owner && b.kick?.by === u && (b.kick.kind === "panna" || b.kick.kind === "rainbow");
    const receiving = !b.owner && b.kick?.target === u && b.kick.by.team === u.team;
    u.sprint = pad.sprint && !!stick;
    // Receiving a pass: they go to meet it, and a stick pointing roughly that way is taken as "meet it".
    const meet = receiving || chasing ? this.ai[u.team].intercept(u) : null;
    const toMeet = meet ? { x: meet.x - u.pos.x, z: meet.z - u.pos.z } : null;
    const meetD = toMeet ? len(toMeet.x, toMeet.z) : 0;
    if (stick) {
      const sp = u.sprint ? u.topSpeed : u.topSpeed * JOG * clamp((tilt - 0.1) / 0.8, 0.15, 1);
      let mx = pad.move.x / tilt, mz = pad.move.z / tilt;
      if (toMeet && meetD > 0.3 && Math.abs(wrapAngle(angleOf(mx, mz) - angleOf(toMeet.x, toMeet.z))) < 0.7) {
        mx = toMeet.x / meetD; mz = toMeet.z / meetD;
      }
      u.want = { x: mx * sp, z: mz * sp };
    } else if (toMeet) {
      const sp = chasing ? u.topSpeed : clamp(meetD * 3, 0, u.topSpeed * JOG);
      u.want = meetD > 0.3 ? { x: (toMeet.x / meetD) * sp, z: (toMeet.z / meetD) * sp } : { x: 0, z: 0 };
    } else u.want = { x: 0, z: 0 };
    u.jockeying = !!b.owner && b.owner.team !== u.team && dist(u.pos, b.owner.pos) < 3;
    // Jockeying, they stay side-on to the ball.
    u.look = u.jockeying ? angleOf(b.pos.x - u.pos.x, b.pos.z - u.pos.z) : null;

    const aimZ = stick ? pad.move.z : null;
    const ourBall = b.owner?.team === u.team;
    const comingToUs = !b.owner && (b.kick?.target === u || len(b.pos.x - u.pos.x, b.pos.z - u.pos.z) < 3.5);
    // Shoot and Pass charge while held and go on release, but only when pressed with
    // the ball (or it on its way): pressed to tackle or switch, the release does nothing.
    const onTheBall = hasBall || comingToUs;

    if (pad.shootDown) c.chargeStart = onTheBall ? this.t : null;
    const released = pad.shootUp && c.chargeStart !== null;
    const power = released ? clamp((pad.shootHeldFor ?? this.t - c.chargeStart!) / SHOT_CHARGE, 0.12, 1) : 0;
    if (pad.shootUp) c.chargeStart = null;

    if (pad.passDown) c.passStart = onTheBall ? this.t : null;
    const passed = pad.passUp && c.passStart !== null;
    const passPower = passed ? clamp(((pad.passHeldFor ?? this.t - c.passStart!) - PASS_TAP) / PASS_CHARGE, 0, 1) : 0;
    if (pad.passUp) c.passStart = null;

    if (hasBall) {
      if (u.action?.kind === "kick") return;
      // Knocked a little too far ahead to strike: do it as soon as they're back on it.
      const inReach = dist(b.pos, u.pos) < this.touchReach(u) + 0.15;
      if ((passed || released) && !inReach) {
        c.buffered = { kind: passed ? "pass" : "shot", power: passed ? passPower : power, until: this.t + 0.6 };
        return;
      }
      const q = c.buffered;
      if (q && inReach && !passed && !released) {
        c.buffered = null;
        if (this.t <= q.until) {
          if (q.kind === "shot") this.shoot(u, q.power, aimZ);
          else this.pass(u, this.pickPassTarget(u, stick), stick, q.power);
          return;
        }
      }
      if (passed) this.pass(u, this.pickPassTarget(u, stick), stick, passPower);
      else if (released) this.shoot(u, power, aimZ);
      else if (pad.skill) this.trick(u);
      return;
    }

    if (comingToUs && (passed || released)) {
      // Queue a first-time pass/shot for when it arrives.
      c.buffered = { kind: passed ? "pass" : "shot", power: passed ? passPower : power, until: this.t + 0.6 };
      return;
    }
    if (pad.passDown && !ourBall && !onTheBall) this.switchPlayer(c);
    if (pad.shootDown && !ourBall && !onTheBall) this.tackle(u);
  }

  /** How full this screen's shot and pass power rings are (0..1), for the HUD. */
  get shotCharge() { return this.me.chargeStart === null ? 0 : Math.min(1, (this.t - this.me.chargeStart) / SHOT_CHARGE); }
  get passCharge() { return this.me.passStart === null ? 0 : clamp((this.t - this.me.passStart - PASS_TAP) / PASS_CHARGE, 0, 1); }

  /**
   * Defending, switch someone to the teammate nearest the ball, but only when the
   * player they have is out of the play: clearly further away, not already going
   * for the ball, and not just picked with Switch. It has to stay that way for a
   * moment, so play rushing past doesn't flick control back and forth.
   */
  private autoSwitchUser(c: Controller, dt: number, pad: Pad) {
    const b = this.ball;
    const u = c.user;
    const carrier = b.owner;
    if (!c.autoSwitch || !carrier || carrier.team === c.team || (u.busy && u.action?.kind !== "floored")
      || this.t - c.lastSwitch < 3 || this.t - c.lastAutoSwitch < 1.5) {
      c.switchFor = 0;
      return;
    }
    // Nearest to the ball, counting goal side of it as a metre closer (they can step in, not chase).
    const own = -attackX(c.team);
    const score = (p: Player) => dist(p.pos, b.pos) - (Math.abs(p.pos.x - own) < Math.abs(b.pos.x - own) ? 1 : 0);
    let best: Player | null = null;
    for (const m of this.teams[c.team]) {
      if (m !== u && !m.busy && (!best || score(m) < score(best))) best = m;
    }
    const dU = dist(u.pos, b.pos);
    const dB = best ? dist(best.pos, b.pos) : Infinity;
    // Going for it: the stick points at the ball. Leave them be unless they're miles off.
    const s = pad.move;
    const engaged = len(s.x, s.z) > 0.3
      && Math.abs(wrapAngle(angleOf(s.x, s.z) - angleOf(b.pos.x - u.pos.x, b.pos.z - u.pos.z))) < 0.9;
    // Straight back to the player it just took them off needs a much bigger gap.
    const back = best === c.switchedFrom && this.t - c.lastAutoSwitch < 4;
    const margin = back ? 5 : 2.5, ratio = back ? 0.5 : 0.65;
    const outOfIt = dU > 3 && dB + margin < dU && dB < dU * ratio && (!engaged || dU > 8);
    if (!best || !outOfIt) { c.switchFor = 0; return; }
    c.switchFor += dt;
    if (c.switchFor < 0.4) return;
    c.switchFor = 0;
    c.switchedFrom = u;
    c.user = best;
    c.lastAutoSwitch = this.t;
  }

  switchPlayer(c: Controller = this.me) {
    const b = this.ball;
    const mates = this.teams[c.team];
    // Nearest to the ball (anyone flat out on the floor last), or the next one if pressed again quickly.
    const score = (p: Player) => dist(p.pos, b.pos) + (p.action?.kind === "floored" ? 100 : 0);
    const sorted = [...mates].sort((a, x) => score(a) - score(x));
    let next = sorted[0] === c.user ? sorted[1] : sorted[0];
    if (this.t - c.lastSwitch < 0.6) next = sorted[(sorted.indexOf(c.user) + 1) % sorted.length];
    c.lastSwitch = this.t;
    c.user = next;
    this.emit({ type: "haptic", style: "light", team: c.team });
  }

  // ── Fatigue and subs (story mode) ─────────────────────────────────────────

  /**
   * Legs drain on the pitch over the match (sprinting more than twice as fast; strong
   * players last longer) and come back on the bench. Played the whole match, a weak
   * player is down to about a third by full time, a strong one to about half.
   */
  private tireOut(dt: number) {
    for (const p of this.players) {
      p.secs += dt;
      const drain = ((0.62 - 0.3 * rate(p.base.physical)) / MATCH_SECONDS) * (p.sprinting ? 2.2 : 1);
      p.tire(p.energy - drain * dt);
      if (p.energy < 0.35 && !this.warned.has(p) && !this.isCpu(p.team) && this.bench[p.team].length) {
        this.warned.add(p);
        this.emit({ type: "tired", player: p });
      }
    }
    for (const t of [0, 1] as const) for (const p of this.bench[t]) if (p.energy < 1) p.tire(p.energy + dt / 200);
    // The CPU also brings on a sub mid-play for someone out on their feet and away from the ball.
    if (this.t >= this.nextCpuSub) {
      this.nextCpuSub = this.t + 5;
      for (const t of [0, 1] as const) if (this.isCpu(t)) this.cpuSubs(t, 0.38, false);
    }
  }

  /** CPU: swap tired players (under `below`) for the freshest sub, if they're a lot fresher. */
  private cpuSubs(team: 0 | 1, below: number, dead: boolean) {
    for (const p of [...this.teams[team]]) {
      if (p.energy >= below) continue;
      if (!dead && (this.ball.owner === p || p.busy || dist(p.pos, this.ball.pos) < 7)) continue;
      const fresh = [...this.bench[team]].sort((a, b) => b.energy - a.energy)[0];
      if (fresh && fresh.energy > p.energy + 0.3) this.substitute(p, fresh);
    }
  }

  /**
   * Rolling sub: `on` (from the bench) takes over from `off` where they stand, ball and
   * all, and `off` sits down. Fine at any point in the match.
   */
  substitute(off: Player, on: Player) {
    const team = off.team;
    const i = this.teams[team].indexOf(off), j = this.bench[team].indexOf(on);
    if (i < 0 || j < 0) return;
    this.teams[team][i] = on;
    this.bench[team][j] = off;
    this.players[this.players.indexOf(off)] = on;
    on.pos = { ...off.pos };
    on.vel = { x: 0, z: 0 };
    on.want = { x: 0, z: 0 };
    on.facing = off.facing;
    on.look = off.look;
    on.action = null;
    on.air = on.vy = 0;
    on.mood = off.mood === "celebrate" ? "cheer" : off.mood;
    on.moodT = 0;
    on.stamina = 1;
    on.winded = false;
    on.anim.snap();
    off.action = null;
    off.sprint = off.sprinting = false;
    const b = this.ball;
    if (b.owner === off) { b.owner = on; on.touchAt = this.t; }
    if (b.lastTouch === off) b.lastTouch = on;
    if (b.kick?.target === off) b.kick.target = on;
    if (this.lastScorer === off) this.lastScorer = null;
    if (this.lastPass?.to === off) this.lastPass = null;
    for (const c of this.people) {
      if (c.user === off) c.user = on;
      if (c.switchedFrom === off) c.switchedFrom = null;
    }
    this.ai[team].forget();
    off.model.root.visible = false;
    on.model.root.visible = true;
    this.emit({ type: "sub", team, off, on });
  }

  /** Man of the match: goals and style. */
  motm(): Player {
    let best = this.players[0], bs = -1;
    for (const p of [...this.players, ...this.bench[0], ...this.bench[1]]) {
      const s = this.style.get(p) ?? 0;
      if (s > bs) { bs = s; best = p; }
    }
    return best;
  }
}
