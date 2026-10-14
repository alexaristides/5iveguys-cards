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
import { Player, PLAYER_R } from "./player";

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

export interface Pad {
  /** World-space stick, length 0..1 (+x = right of screen, +z = toward the camera). */
  move: V2;
  pass: boolean;
  shootDown: boolean;
  shootHeld: boolean;
  shootUp: boolean;
  skill: boolean;
}

export type Sound = "kick" | "bigkick" | "wall" | "post" | "net" | "bounce" | "tackle" | "trick" | "whistle" | "whistleEnd" | "cheer" | "ooh" | "meter";

export type MatchEvent =
  | { type: "sound"; name: Sound; v: number }
  | { type: "haptic"; style: "light" | "medium" | "heavy" | "success" | "error" }
  | { type: "style"; team: 0 | 1; text: string }
  | { type: "goal"; team: 0 | 1; scorer: Player | null; og: boolean; label?: string }
  | { type: "fiveMode"; team: 0 | 1 }
  | { type: "kickoff" }
  | { type: "end" };

export type MatchState = "kickoff" | "play" | "goal" | "fulltime" | "over";

export interface Scorer { team: 0 | 1; name: string; og: boolean; second: number }

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
  readonly userTeam: 0 | 1 = 0;
  user: Player;
  lastScorer: Player | null = null;
  events: MatchEvent[] = [];
  /** Style points per player, for the man of the match. */
  style = new Map<Player, number>();

  /** Both teams AI-driven (demo / balance testing). */
  autopilot = false;
  /** Stats for balancing. */
  log = { goalDist: [] as number[], shots: [0, 0], blocks: [0, 0], tackles: [0, 0], pokes: [0, 0], tricks: [0, 0], passes: [0, 0], possession: [0, 0] };

  /** When the shoot button went down (charging), or null. */
  chargeStart: number | null = null;
  /** First-time pass/shot queued before the ball arrived. */
  private buffered: { kind: "pass" | "shot"; power: number; until: number } | null = null;
  private kickoffTeam: 0 | 1 = 0;
  private possessionTeam: 0 | 1 | null = null;
  private graceUntil = 0;
  private lastSwitch = 0;
  private ai: [TeamAI, TeamAI];
  private ballEvents: BallEvent[] = [];

  constructor(
    scene: THREE.Object3D,
    home: RosterPlayer[],
    away: RosterPlayer[],
    readonly difficulty: Difficulty,
    model: (p: RosterPlayer) => PlayerModel,
  ) {
    this.teams = [
      home.map((r) => new Player(r, 0, model(r))),
      away.map((r) => new Player(r, 1, model(r))),
    ];
    this.players = [...this.teams[0], ...this.teams[1]];
    this.ball = new Ball(scene);
    this.user = this.teams[0][0];
    this.ai = [new TeamAI(this, 0), new TeamAI(this, 1)];
    for (const p of this.players) this.style.set(p, 0);
    this.setupKickoff(Math.random() < 0.5 ? 0 : 1);
  }

  emit(e: MatchEvent) { this.events.push(e); }
  sound(name: Sound, v = 1) { this.emit({ type: "sound", name, v }); }

  isUser(p: Player) { return p === this.user; }
  opponents(team: 0 | 1) { return this.teams[team === 0 ? 1 : 0]; }
  get possession() { return this.ball.owner?.team ?? null; }
  speedMul(p: Player) {
    const cpu = p.team !== this.userTeam ? this.difficulty.speed : 1;
    return cpu * (this.fiveMode[p.team] > 0 ? 1.08 : 1);
  }

  // ── Flow ──────────────────────────────────────────────────────────────────

  private setupKickoff(team: 0 | 1) {
    this.kickoffTeam = team;
    this.state = "kickoff";
    this.stateT = 0;
    this.ball.reset(0, 0);
    this.buffered = null;
    this.chargeStart = null;
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
    if (team === this.userTeam) this.user = kicker;
    else this.user = this.nearestTo(this.teams[this.userTeam], this.ball.pos);
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

  step(dt: number, pad: Pad) {
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
        this.play(dt, pad);
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
    this.emit({ type: "haptic", style: h > a ? "success" : h < a ? "error" : "medium" });
  }

  private celebrate(dt: number) {
    for (const p of this.players) {
      p.moodT += dt;
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

  private play(dt: number, pad: Pad) {
    if (!this.autopilot) this.userControl(pad);
    const pt = this.possession;
    if (pt !== null) this.log.possession[pt] += dt;
    this.ai[0].update(dt);
    this.ai[1].update(dt);

    for (const p of this.players) {
      const withBall = this.ball.owner === p;
      p.move(dt, this.t, this.speedMul(p) * (withBall ? 0.9 : 1), withBall);
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

    if (p.team === this.userTeam) {
      this.user = p;
      if (prevTeam !== null && prevTeam !== p.team) this.emit({ type: "haptic", style: "light" });
      // A first-time pass or shot queued before the ball arrived.
      const q = this.buffered;
      this.buffered = null;
      if (q && this.t <= q.until) {
        if (q.kind === "shot") this.shoot(p, q.power, null, true);
        else this.pass(p, this.pickPassTarget(p, null), null);
      }
    } else if (prevTeam === this.userTeam && this.ball.owner) {
      // Lost it: give the user the defender nearest the ball.
      const u = this.nearestTo(this.teams[this.userTeam], this.ball.pos);
      if (u !== this.user && dist(u.pos, this.ball.pos) + 1.5 < dist(this.user.pos, this.ball.pos)) this.user = u;
    }
  }

  private placeBallAtFeet(dt: number) {
    const o = this.ball.owner;
    if (!o) return;
    const b = this.ball;
    const a = o.action;
    const s = o.speed;
    let reach = 0.42 + 0.03 * s + (0.05 + 0.1 * (0.5 + 0.5 * Math.sin(o.runPhase))) * Math.min(1, s / 6);
    if (a?.kind === "roulette") reach = 0.22;
    if (a?.kind === "stepover") reach = 0.36;
    if (a?.kind === "kick") reach = 0.4;
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
    this.buffered = null;
    this.chargeStart = null;

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
    this.emit({ type: "haptic", style: team === this.userTeam ? "success" : "heavy" });
  }

  // ── Control and contests ─────────────────────────────────────────────────

  private tryControl() {
    const b = this.ball;
    if (b.pos.y > 1.7) return;
    const ballSpeed = b.speed;
    let best: Player | null = null, bestD = Infinity;
    const shot = b.kick?.kind === "shot" ? b.kick.by.team : null;
    for (const p of this.players) {
      if (!p.canControl(this.t)) continue;
      const d = len(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      // More reach for the intended receiver, and for defenders throwing a body/leg at a shot.
      const reach = CONTROL_R + (b.kick?.target === p ? 0.15 : 0) + (b.pos.y > 0.9 ? -0.15 : 0)
        + (shot !== null && shot !== p.team && b.pos.y < 1.9 ? 0.2 : 0);
      if (d < reach && d < bestD) { best = p; bestD = d; }
    }
    if (!best) return;
    const p = best;
    const rel = len(b.vel.x - p.vel.x, b.vel.z - p.vel.z);
    const kick = b.kick;
    const intended = kick?.target === p || (kick?.by.team === p.team && kick.kind !== "shot");

    // Hard shots get blocked, not controlled.
    if (kick?.kind === "shot" && kick.by.team !== p.team && rel > 12) {
      this.deflect(p, 0.35);
      this.log.blocks[p.team]++;
      this.addStyle(p, "BLOCKED!", 0.06, 80);
      this.sound("tackle", 0.7);
      return;
    }
    let chance = intended ? 0.97 : clamp(1.15 - rel / 22 + (p.stats.dribbling - 70) / 200, 0.3, 1);
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
      const near = len(b.pos.x - d.pos.x, b.pos.z - d.pos.z) < 0.78 && d.action?.kind !== "stumble";
      if (!near) { d.pressure = Math.max(0, d.pressure - dt); continue; }
      d.pressure += dt;
      if (d.pressure < 0.25) continue;
      // Shielding: defender behind the carrier has a much harder time.
      const toD = angleOf(d.pos.x - o.pos.x, d.pos.z - o.pos.z);
      const behind = Math.abs(wrapAngle(toD - o.facing)) > 2.0;
      const cpuMul = d.team !== this.userTeam ? this.difficulty.steal : 1;
      let rate = 0.9 * clamp(0.55 + (d.stats.defending - o.stats.dribbling) / 90 + (d.stats.physical - o.stats.physical) / 250, 0.12, 1.2);
      rate *= (behind ? 0.4 : 1) * cpuMul * (this.fiveMode[o.team] > 0 ? 0.5 : 1);
      if (Math.random() < rate * dt) {
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

  /** Resolve lunging tackles. */
  private tackles() {
    const b = this.ball;
    for (const p of this.players) {
      const a = p.action;
      if (a?.kind !== "tackle" || a.t < 0.06 || a.t > 0.32 || a.resolved) continue;
      const fx = p.pos.x + dirX(p.facing) * 0.62, fz = p.pos.z + dirZ(p.facing) * 0.62;
      const reach = len(b.pos.x - fx, b.pos.z - fz);
      if (reach > 0.6 || b.pos.y > 0.8) continue;
      a.resolved = true;
      const o = b.owner;
      if (!o) {
        if (p.canControl(this.t)) this.giveBall(p);
        continue;
      }
      if (o.team === p.team) continue;
      if (this.t < o.invulnUntil) {
        p.start("stumble", 0.6);
        this.addStyle(o, "SKILLED HIM!", 0.1, 150);
        continue;
      }
      const toP = angleOf(p.pos.x - o.pos.x, p.pos.z - o.pos.z);
      const fromBehind = Math.abs(wrapAngle(toP - o.facing)) > 2.2;
      const cpuMul = p.team !== this.userTeam ? this.difficulty.steal : 1;
      const chance = clamp(0.62 + (p.stats.defending - o.stats.dribbling) / 140 - (fromBehind ? 0.25 : 0), 0.15, 0.95) * Math.min(1.15, cpuMul);
      if (Math.random() < chance) {
        o.start("stumble", 0.45);
        o.noControlUntil = this.t + 0.5;
        if (Math.random() < 0.5) this.giveBall(p);
        else {
          b.owner = null;
          b.vel.set(dirX(p.facing) * 4 + gauss(), 0.4, dirZ(p.facing) * 4 + gauss());
          b.lastTouch = p;
          b.kick = { by: p, kind: "loose", t: this.t, walled: false, fromX: b.pos.x, fromZ: b.pos.z };
        }
        this.log.tackles[p.team]++;
        this.addStyle(p, "TACKLE", 0.04, 60);
        this.sound("tackle", 1);
        if (p.team === this.userTeam || o.team === this.userTeam) this.emit({ type: "haptic", style: "medium" });
      } else {
        p.start("stumble", 0.5);
      }
    }
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

  pass(p: Player, target: Player | null, dir: V2 | null) {
    if (this.ball.owner !== p) return;
    const b = this.ball;
    this.log.passes[p.team]++;
    p.start("kick", 0.26, { power: 0.3 });
    const err = gauss() * (1 - p.stats.passing / 100) * 0.09;

    if (!target) {
      // Pass into space along the stick — off the wall if you like.
      const a = (dir && len(dir.x, dir.z) > 0.3 ? angleOf(dir.x, dir.z) : p.facing) + err;
      this.kickBall(p, "space", dirX(a) * 13, 0, dirZ(a) * 13);
      this.sound("kick", 0.45);
      return;
    }
    const d0 = dist(b.pos, target.pos);
    const speed = clamp(8 + d0 * 0.75, 9.5, 19);
    const lead = (d0 / speed) * 0.75;
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
    this.sound("kick", 0.45);
    if (p.team === this.userTeam) this.user = target;
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
    let z: number;
    if (aimZ !== null && Math.abs(aimZ) > 0.25) z = Math.sign(aimZ) * 1.2;
    else {
      // Away from the nearest defender to goal.
      const keeper = this.nearestTo(this.opponents(team), { x: attackX(team), z: 0 });
      z = keeper.pos.z > b.pos.z * 0.2 ? -1.0 : 1.0;
      z += gauss() * 0.3;
    }
    const D = len(gx - b.pos.x, z - b.pos.z);
    const h = 13 + power * 15 + (five ? 4 : 0) + (firstTime ? 1.5 : 0);
    let y = 0.25 + power * 0.95;
    const cpuAim = team !== this.userTeam ? this.difficulty.aim : 1;
    const skill = p.stats.shooting / 100;
    // Spread (1σ, radians / metres): worse from distance, with power, and for weaker shooters.
    let sAng = (0.012 + (1 - skill) * 0.08 + Math.max(0, D - 6) * 0.004 + power ** 3 * 0.025) * cpuAim;
    let sY = (0.1 + power * power * 0.4 + Math.max(0, D - 10) * 0.025) * cpuAim;
    if (five) { sAng *= 0.5; sY *= 0.5; }
    const a = angleOf(gx - b.pos.x, z - b.pos.z) + normal() * sAng;
    y = clamp(y + normal() * sY, 0.15, GOAL_H + 1.5);
    const T = D / h;
    const vy = (y - b.pos.y + 0.5 * GRAVITY * T * T) / T;
    this.kickBall(p, "shot", dirX(a) * h, vy, dirZ(a) * h);
    this.log.shots[team]++;
    this.sound("bigkick", 0.6 + power * 0.4);
    if (team === this.userTeam) this.emit({ type: "haptic", style: power > 0.7 ? "heavy" : "medium" });
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

  tackle(p: Player) {
    if (this.t < p.tackleReadyAt || p.busy) return;
    p.tackleReadyAt = this.t + 0.85;
    // Aim the lunge at the ball if it's close (turned into over the first frames, not snapped).
    const b = this.ball;
    const aim = len(b.pos.x - p.pos.x, b.pos.z - p.pos.z) < 3.2
      ? p.facing + clamp(wrapAngle(angleOf(b.pos.x - p.pos.x, b.pos.z - p.pos.z) - p.facing), -0.9, 0.9)
      : undefined;
    p.start("tackle", 0.42, { aim });
    this.sound("kick", 0.15);
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

  // ── User ──────────────────────────────────────────────────────────────────

  private userControl(pad: Pad) {
    const u = this.user;
    const b = this.ball;
    const stick = len(pad.move.x, pad.move.z) > 0.2 ? pad.move : null;
    const hasBall = b.owner === u;

    // Movement. With no input, a receiver drifts onto a pass, and after a panna or
    // rainbow flick you chase your own ball.
    const chasing = !b.owner && b.kick?.by === u && (b.kick.kind === "panna" || b.kick.kind === "rainbow");
    if (stick) u.want = { x: pad.move.x * u.topSpeed, z: pad.move.z * u.topSpeed };
    else if (!b.owner && (b.kick?.target === u || chasing)) {
      const d = len(b.pos.x - u.pos.x, b.pos.z - u.pos.z);
      const sp = chasing ? u.topSpeed : 4;
      u.want = d > 0.4 ? { x: ((b.pos.x - u.pos.x) / d) * sp, z: ((b.pos.z - u.pos.z) / d) * sp } : { x: 0, z: 0 };
    } else u.want = { x: 0, z: 0 };
    u.look = null;
    u.jockeying = !!b.owner && b.owner.team !== u.team && dist(u.pos, b.owner.pos) < 3;

    const aimZ = stick ? pad.move.z : null;

    if (pad.shootDown) this.chargeStart = this.t;
    const released = pad.shootUp && this.chargeStart !== null;
    const power = released ? clamp((this.t - this.chargeStart!) / 0.85, 0.12, 1) : 0;
    if (pad.shootUp) this.chargeStart = null;

    if (hasBall) {
      if (u.action?.kind === "kick") return;
      if (pad.pass) this.pass(u, this.pickPassTarget(u, stick), stick);
      else if (released) this.shoot(u, power, aimZ);
      else if (pad.skill) this.trick(u);
      return;
    }

    const ourBall = b.owner?.team === u.team;
    const comingToUs = !b.owner && (b.kick?.target === u || len(b.pos.x - u.pos.x, b.pos.z - u.pos.z) < 3.5);
    if (comingToUs && (pad.pass || released)) {
      // Queue a first-time pass/shot for when it arrives.
      this.buffered = { kind: pad.pass ? "pass" : "shot", power: released ? power : 0.6, until: this.t + 0.6 };
      return;
    }
    if (pad.pass && !ourBall) this.switchPlayer();
    if (pad.shootDown && !ourBall && !comingToUs) this.tackle(u);
  }

  switchPlayer() {
    const b = this.ball;
    const mates = this.teams[this.userTeam];
    // Nearest to the ball, or the next one if pressed again quickly.
    const sorted = [...mates].sort((a, c) => dist(a.pos, b.pos) - dist(c.pos, b.pos));
    let next = sorted[0] === this.user ? sorted[1] : sorted[0];
    if (this.t - this.lastSwitch < 0.6) next = sorted[(sorted.indexOf(this.user) + 1) % sorted.length];
    this.lastSwitch = this.t;
    this.user = next;
    this.emit({ type: "haptic", style: "light" });
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
