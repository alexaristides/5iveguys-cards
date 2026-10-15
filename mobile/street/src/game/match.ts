/**
 * 3v3 match rules and the on-ball mechanics: possession, dribbling, passing,
 * shooting, tackling, skill moves, goals, the clock and the 5IVE MODE meter.
 * Renders nothing itself — main.ts reads the state and `events`.
 */
import type * as THREE from "three";
import { angleOf, clamp, dirX, dirZ, dist, gauss, len, normal, segDist, wrapAngle, type V2 } from "../math";
import type { PlayerModel } from "../rig/model";
import type { RosterPlayer } from "../roster";
import { TeamAI } from "./ai";
import { Ball, type BallEvent, type KickKind } from "./ball";
import { attackDir, attackX, BALL_R, GOAL_H, GRAVITY, HALF_L, HALF_W } from "./field";
import { JOG, Player, PLAYER_R, rate } from "./player";

export const MATCH_SECONDS = 180;
const GOLDEN_GOAL_SECONDS = 60;
const FIVE_MODE_SECONDS = 15;
const CONTROL_R = 0.55;

export interface Difficulty {
  id: "amateur" | "pro" | "legend";
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
  /** World-space stick, length 0..1 (+x = right of screen, +z = toward the camera). */
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
  readonly teams: [Player[], Player[]];
  readonly players: Player[];
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
  log = { goalDist: [] as number[], shots: [0, 0], blocks: [0, 0], tackles: [0, 0], pokes: [0, 0], tricks: [0, 0], passes: [0, 0], possession: [0, 0], sprint: [0, 0], takedowns: [0, 0] };

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
    /** Online both sides are people; `userTeam` is the one playing on this screen. */
    opts: { humans?: [boolean, boolean]; userTeam?: 0 | 1 } = {},
  ) {
    this.teams = [
      home.map((r) => new Player(r, 0, model(r))),
      away.map((r) => new Player(r, 1, model(r))),
    ];
    this.players = [...this.teams[0], ...this.teams[1]];
    this.ball = new Ball(scene);
    this.userTeam = opts.userTeam ?? 0;
    const humans = opts.humans ?? [true, false];
    this.humans = [0, 1].map((t) => (humans[t] || t === this.userTeam ? new Controller(t as 0 | 1, this.teams[t][0]) : null)) as Match["humans"];
    this.people = this.humans.filter((c): c is Controller => !!c);
    this.ai = [new TeamAI(this, 0), new TeamAI(this, 1)];
    for (const p of this.players) this.style.set(p, 0);
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
        this.placeBallAtFeet(dt);
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
    for (const p of this.players) {
      p.moodT += dt;
      p.sprint = p.mood === "celebrate";
      if (p.mood === "celebrate") {
        const tx = attackX(p.team) * 0.7, tz = HALF_W - 4;
        const d = dist(p.pos, { x: tx, z: tz });
        const run = p.info.celebration === "kneeSlide" ? p.moodT < 0.9 : d > 0.8 && p.moodT < 2.6;
        p.want = run ? { x: ((tx - p.pos.x) / d) * 6.5, z: ((tz - p.pos.z) / d) * 6.5 } : { x: 0, z: 0 };
        if (!run) p.look = angleOf(0, 1); // face the camera
      } else if (this.state === "goal" && p.team === this.lastGoalTeam && this.lastScorer) {
        const s = this.lastScorer.pos;
        const d = dist(p.pos, s);
        p.want = d > 1.6 ? { x: ((s.x - p.pos.x) / d) * 5.5, z: ((s.z - p.pos.z) / d) * 5.5 } : { x: 0, z: 0 };
        if (d < 2 && p.mood === "play") { p.mood = "cheer"; p.moodT = 0; }
      } else if (this.state === "goal") {
        if (p.mood === "play") { p.mood = "dejected"; p.moodT = Math.random(); }
        p.want = { x: 0, z: 0 };
      } else {
        p.want = { x: 0, z: 0 };
      }
      const slide = p.mood === "celebrate" && p.info.celebration === "kneeSlide" && p.moodT > 0.9;
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

    for (const p of this.players) {
      const withBall = this.ball.owner === p;
      p.move(dt, this.t, this.speedMul(p) * (withBall ? p.dribbleSpeed : 1), withBall);
      if (p.sprinting) this.log.sprint[p.team] += dt;
    }
    this.separate();
    this.tackles();

    if (this.ball.owner) {
      this.placeBallAtFeet(dt);
      this.pokes(dt);
    } else {
      this.freeBall(dt);
      if (this.state !== "play") return;
      this.tryControl();
    }
  }

  /** Keep players from overlapping; stronger players push weaker ones. */
  private separate() {
    const ps = this.players;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d = len(dx, dz);
        const min = PLAYER_R * 2;
        if (d >= min || d < 1e-4) continue;
        const push = min - d;
        const wa = b.stats.physical / (a.stats.physical + b.stats.physical);
        a.pos.x -= (dx / d) * push * wa;
        a.pos.z -= (dz / d) * push * wa;
        b.pos.x += (dx / d) * push * (1 - wa);
        b.pos.z += (dz / d) * push * (1 - wa);
      }
    }
  }

  private giveBall(p: Player) {
    const b = this.ball;
    const prevTeam = this.possessionTeam;
    const kick = b.kick;
    b.owner = p;
    b.lastTouch = p;
    b.vel.set(0, 0, 0);
    p.pressure = 0;
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

  private placeBallAtFeet(dt: number) {
    const o = this.ball.owner;
    if (!o) return;
    const b = this.ball;
    const a = o.action;
    const s = o.speed;
    let reach = 0.42 + 0.03 * s + (0.05 + 0.1 * (0.5 + 0.5 * Math.sin(o.runPhase))) * Math.min(1, s / 6);
    // Flat out, the ball is pushed further ahead (less so for good dribblers): easier to nick.
    if (o.sprinting) reach += (0.06 + (1 - rate(o.stats.dribbling)) * 0.22) * Math.min(1, s / 6);
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
    b.pos.set(clamp(nx, -HALF_L + BALL_R, HALF_L - BALL_R), BALL_R, clamp(nz, -HALF_W + BALL_R, HALF_W - BALL_R));
  }

  private freeBall(dt: number) {
    const b = this.ball;
    if (b.owner) return;
    const sub = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / sub;
    const ev = this.ballEvents;
    ev.length = 0;
    for (let i = 0; i < sub; i++) b.step(h, ev);
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
    for (const c of this.people) c.reset();

    let label: string | undefined;
    if (scorer && !og) {
      scorer.mood = "celebrate";
      scorer.moodT = 0;
      scorer.action = null;
      const kick = b.kick;
      if (kick?.kind === "shot" && Math.abs(kick.fromX - attackX(team)) > 15) { label = "WORLDIE!"; this.addStyle(scorer, label, 0.15, 300); }
      else if (kick?.walled) { label = "OFF THE WALL!"; this.addStyle(scorer, label, 0.1, 200); }
      this.style.set(scorer, (this.style.get(scorer) ?? 0) + 500);
    }
    if (b.kick) this.log.goalDist.push(Math.round(Math.abs(b.kick.fromX - attackX(team))));
    this.emit({ type: "goal", team, scorer, og, label });
    this.sound("cheer", 1);
    this.sound("whistle", 0.6);
    for (const c of this.people) this.emit({ type: "haptic", style: c.team === team ? "success" : "heavy", team: c.team });
  }

  // ── Control and contests ─────────────────────────────────────────────────

  private tryControl() {
    const b = this.ball;
    if (b.pos.y > 1.7) return;
    const ballSpeed = b.speed;
    let best: Player | null = null, bestD = Infinity;
    const kick = b.kick;
    const shot = kick?.kind === "shot" ? kick.by.team : null;
    // A shot on its way in, before it comes back off a post or the wall.
    const fresh = shot !== null && !!kick && !kick.walled && !kick.rebound && this.t - kick.t < 0.6;
    for (const p of this.players) {
      if (!p.canControl(this.t) || (fresh && kick?.beat?.includes(p))) continue;
      const d = len(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      // More reach for the intended receiver, for defenders throwing a body/leg at a shot,
      // and for good defenders reading the other side's passes.
      const theirs = !!kick && kick.by.team !== p.team && kick.kind !== "loose";
      const reach = CONTROL_R + (kick?.target === p ? 0.15 : 0) + (b.pos.y > 0.9 ? -0.15 : 0)
        + (shot !== null && shot !== p.team && b.pos.y < 1.9 ? 0.2 : 0)
        + (theirs ? (rate(p.stats.defending) - 0.5) * 0.12 : 0);
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
      let chance = 1.3 * clamp(0.5 + edge, 0.1, 1.2);
      chance *= (behind ? 0.2 + 0.35 * (1 - rate(o.stats.physical)) : 1) * (o.sprinting ? 1.4 : 1);
      chance *= cpuMul * (this.fiveMode[o.team] > 0 ? 0.5 : 1);
      if (Math.random() < chance * dt) {
        this.log.pokes[d.team]++;
        if (Math.random() < 0.45) {
          this.giveBall(d);
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

  private kickBall(p: Player, kind: KickKind, vx: number, vy: number, vz: number, target: Player | null = null) {
    const b = this.ball;
    b.owner = null;
    b.vel.set(vx, vy, vz);
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
   * `power` (Pass held, 0..1) drives it: harder, and further ahead into the
   * runner's path, but a little less accurate and harder to take.
   */
  pass(p: Player, target: Player | null, dir: V2 | null, power = 0) {
    if (this.ball.owner !== p) return;
    const b = this.ball;
    this.log.passes[p.team]++;
    p.start("kick", 0.26, { power: 0.3 + 0.5 * power });
    // Passing: how far off line it goes (1σ, radians), and how crisply it's played.
    const skill = rate(p.stats.passing);
    const err = gauss() * (0.01 + (1 - skill) * 0.11) * (1 + 0.8 * power);
    const pace = (0.86 + skill * 0.28) * (1 + 0.45 * power);

    if (!target) {
      // Pass into space along the stick — off the wall if you like.
      const a = (dir && len(dir.x, dir.z) > 0.3 ? angleOf(dir.x, dir.z) : p.facing) + err;
      const v = 13 * pace * (1 + 0.25 * power);
      this.kickBall(p, "space", dirX(a) * v, 0, dirZ(a) * v);
      this.sound("kick", 0.45 + 0.4 * power);
      return;
    }
    const d0 = dist(b.pos, target.pos);
    const speed = Math.min(24, clamp(8 + d0 * 0.75, 9.5, 19) * pace);
    // Good passers play it into the runner's stride; poor ones leave it behind them.
    // Driven, it goes well ahead of them: a through ball.
    const lead = (d0 / speed) * (0.4 + skill * 0.45) * (1 + 1.6 * power);
    const tx = clamp(target.pos.x + target.vel.x * lead, -HALF_L + 0.6, HALF_L - 0.6);
    const tz = clamp(target.pos.z + target.vel.z * lead, -HALF_W + 0.6, HALF_W - 0.6);
    const d = len(tx - b.pos.x, tz - b.pos.z);
    const a = angleOf(tx - b.pos.x, tz - b.pos.z) + err;

    // Chip it over anyone standing in the lane.
    const blocked = this.opponents(p.team).some((o) => {
      const s = segDist(o.pos, b.pos, { x: tx, z: tz });
      return s.d < 0.9 && s.t > 0.12 && s.t < 0.85;
    });
    if (blocked && d > 3) {
      const h = clamp(4 + d * 0.5, 7, 12.5);
      const T = d / h;
      this.kickBall(p, "lob", dirX(a) * h, (GRAVITY * T) / 2, dirZ(a) * h, target);
    } else {
      this.kickBall(p, "pass", dirX(a) * speed, 0, dirZ(a) * speed, target);
    }
    this.sound("kick", 0.45 + 0.4 * power);
    const c = this.humans[p.team];
    if (c) c.user = target;
  }

  /**
   * Shoot at the goal. `aimZ` picks the corner (-1..1 across the goal); null = auto.
   */
  shoot(p: Player, power: number, aimZ: number | null, firstTime = false) {
    if (this.ball.owner !== p) return;
    const b = this.ball;
    const team = p.team;
    const five = this.fiveMode[team] > 0;
    power = clamp(power, 0.1, 1);
    p.start("kick", 0.34, { power });

    const gx = attackX(team) + attackDir(team) * 0.6;
    // Shooting: good finishers go for the corner (posts at ±1.75), hit it harder and miss less.
    const skill = rate(p.stats.shooting);
    const corner = 0.7 + skill * 0.6;
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
    const T = D / h;
    const vy = (y - b.pos.y + 0.5 * GRAVITY * T * T) / T;
    this.kickBall(p, "shot", dirX(a) * h, vy, dirZ(a) * h);
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
      const reach = dd + 2.6;
      const vh = 5.2;
      const T = reach / vh;
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
    if (this.fiveMode[p.team] > 0) return;
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
    u.sprint = pad.sprint && !!stick;
    if (stick) {
      const sp = u.sprint ? u.topSpeed : u.topSpeed * JOG * clamp((tilt - 0.1) / 0.8, 0.15, 1);
      u.want = { x: (pad.move.x / tilt) * sp, z: (pad.move.z / tilt) * sp };
    }
    else if (!b.owner && (b.kick?.target === u || chasing)) {
      const d = len(b.pos.x - u.pos.x, b.pos.z - u.pos.z);
      const sp = chasing ? u.topSpeed : 4;
      u.want = d > 0.4 ? { x: ((b.pos.x - u.pos.x) / d) * sp, z: ((b.pos.z - u.pos.z) / d) * sp } : { x: 0, z: 0 };
    } else u.want = { x: 0, z: 0 };
    u.look = null;
    u.jockeying = !!b.owner && b.owner.team !== u.team && dist(u.pos, b.owner.pos) < 3;

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

  /** Man of the match: goals and style. */
  motm(): Player {
    let best = this.players[0], bs = -1;
    for (const p of this.players) {
      const s = this.style.get(p) ?? 0;
      if (s > bs) { bs = s; best = p; }
    }
    return best;
  }
}
