/**
 * A footballer on the pitch: movement, the action they're doing (kick,
 * tackle, trick…), and turning that into an animated 3D model.
 */
import type * as THREE from "three";
import { angleOf, clamp, dirX, dirZ, len, turnToward, type V2 } from "../math";
import type { PlayerModel } from "../rig/model";
import {
  Animator, celebrate, cheer, dejected, flick, idle, jockey, kick, panna, roulette, run, stepover, stumble, tackle,
} from "../rig/pose";
import type { RosterPlayer, Stats } from "../roster";
import { HALF_L, HALF_W } from "./field";

export type ActionKind =
  | "kick" | "tackle" | "stepover" | "roulette" | "flick" | "panna" | "stumble";

export interface Action {
  kind: ActionKind;
  t: number;
  dur: number;
  /** Kick power 0..1 (animation only). */
  power?: number;
  /** Sideways shift during a trick (metres, + = player's left). */
  shift?: number;
  /** A tackle that has already hit or missed. */
  resolved?: boolean;
}

export type Mood = "play" | "celebrate" | "cheer" | "dejected" | "idle";

export const PLAYER_R = 0.38;

export class Player {
  readonly info: RosterPlayer;
  readonly stats: Stats;
  readonly team: 0 | 1;
  readonly model: PlayerModel;
  readonly anim: Animator;

  pos: V2 = { x: 0, z: 0 };
  vel: V2 = { x: 0, z: 0 };
  facing = 0;
  /** Desired velocity set by the user's stick or the AI each step. */
  want: V2 = { x: 0, z: 0 };
  /** Face this way while standing (e.g. toward the ball). */
  look: number | null = null;

  action: Action | null = null;
  /** Can't take control of the ball before this time (just kicked it, beaten…). */
  noControlUntil = 0;
  tackleReadyAt = 0;
  trickReadyAt = 0;
  /** Immune to tackles and pokes (mid-trick). */
  invulnUntil = 0;
  /** Short speed boost after beating a man. */
  burstUntil = 0;
  /** Time spent pressing the ball carrier, for pokes. */
  pressure = 0;

  mood: Mood = "play";
  moodT = 0;
  runPhase = Math.random() * 6;
  jockeying = false;
  glow = false;

  // Derived from stats.
  readonly topSpeed: number;
  readonly accel: number;
  readonly turnRate: number;

  constructor(info: RosterPlayer, team: 0 | 1, model: PlayerModel) {
    this.info = info;
    this.stats = info.stats;
    this.team = team;
    this.model = model;
    this.anim = new Animator(this.model);
    const s = this.stats;
    this.topSpeed = 5.6 + (s.pace / 100) * 2.6;
    this.accel = 13 + (s.pace / 100) * 6;
    this.turnRate = 7 + (s.dribbling / 100) * 6;
  }

  get name() { return this.info.name; }
  get speed() { return len(this.vel.x, this.vel.z); }
  get busy() { return this.action !== null && this.action.kind !== "kick"; }

  start(kind: ActionKind, dur: number, extra: Partial<Action> = {}) {
    this.action = { kind, t: 0, dur, ...extra };
  }

  canControl(now: number) {
    return now >= this.noControlUntil && this.action?.kind !== "stumble" && this.mood === "play";
  }

  /** Integrate movement toward `want`. `speedMul` scales top speed (dribbling, 5IVE MODE…). */
  move(dt: number, now: number, speedMul: number, withBall: boolean) {
    const a = this.action;
    let top = this.topSpeed * speedMul * (now < this.burstUntil ? 1.15 : 1);
    let accel = this.accel;
    let wantX = this.want.x, wantZ = this.want.z;

    if (a) {
      a.t += dt;
      const k = a.t / a.dur;
      switch (a.kind) {
        case "tackle": {
          // Lunge forward, then recover.
          const lunge = k < 0.55 ? 1 : 0.15;
          wantX = dirX(this.facing) * 7 * lunge;
          wantZ = dirZ(this.facing) * 7 * lunge;
          top = 7.5;
          accel = 40;
          break;
        }
        case "stumble":
          wantX = this.vel.x * 0.3;
          wantZ = this.vel.z * 0.3;
          break;
        case "stepover":
        case "roulette":
        case "panna": {
          // Carry on forward with a sideways shift around the defender.
          const side = a.shift ?? 0;
          const fwd = a.kind === "roulette" ? 2.2 : a.kind === "panna" ? 4.5 : 3;
          const sx = dirZ(this.facing), sz = -dirX(this.facing); // player's left (+x local)
          const lat = (side / a.dur) * 1.6 * Math.sin(Math.PI * k);
          wantX = dirX(this.facing) * fwd + sx * lat;
          wantZ = dirZ(this.facing) * fwd + sz * lat;
          accel = 30;
          break;
        }
        case "flick":
          wantX = dirX(this.facing) * 3.5;
          wantZ = dirZ(this.facing) * 3.5;
          break;
        case "kick":
          // Slow down while striking.
          wantX *= 0.45;
          wantZ *= 0.45;
          break;
      }
      if (a.t >= a.dur) this.action = null;
    }

    const wl = len(wantX, wantZ);
    if (wl > top) { wantX *= top / wl; wantZ *= top / wl; }
    const dx = wantX - this.vel.x, dz = wantZ - this.vel.z;
    const dl = len(dx, dz);
    const step = accel * dt;
    if (dl <= step) { this.vel.x = wantX; this.vel.z = wantZ; }
    else { this.vel.x += (dx / dl) * step; this.vel.z += (dz / dl) * step; }

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.x = clamp(this.pos.x, -HALF_L + 0.3, HALF_L - 0.3);
    this.pos.z = clamp(this.pos.z, -HALF_W + 0.3, HALF_W - 0.3);

    // Face where we're going (slower to turn with the ball); hold facing during tricks/tackles.
    const sp = this.speed;
    const locked = a && a.kind !== "kick";
    if (!locked) {
      const rate = (withBall ? this.turnRate * 0.75 : this.turnRate * 1.3) * dt;
      if (sp > 0.6 && len(wantX, wantZ) > 0.3) this.facing = turnToward(this.facing, angleOf(this.vel.x, this.vel.z), rate);
      else if (this.look !== null) this.facing = turnToward(this.facing, this.look, rate * 0.7);
    }
    this.runPhase += (sp * dt * Math.PI * 2) / (1.25 + 0.12 * sp);
  }

  /** Pose the model for this frame. */
  render(dt: number, t: number, ball: THREE.Vector3) {
    const p = this.anim.target;
    const a = this.action;
    const s = clamp(this.speed / 7.5, 0, 1);
    const yaw = this.facing;

    if (this.mood === "celebrate") celebrate(p, this.info.celebration, this.moodT, this.runPhase, s);
    else if (this.mood === "cheer") cheer(p, this.moodT);
    else if (this.mood === "dejected") dejected(p, this.moodT);
    else if (a) {
      const k = clamp(a.t / a.dur, 0, 1);
      switch (a.kind) {
        case "kick": kick(p, k, a.power ?? 0.5); break;
        case "tackle": tackle(p, k); break;
        case "stepover": stepover(p, k); break;
        case "roulette": roulette(p, k); break;
        case "flick": flick(p, k); break;
        case "panna": panna(p, k); break;
        case "stumble": stumble(p, k); break;
      }
    } else if (this.jockeying && s < 0.75) jockey(p, this.runPhase, s);
    else if (s > 0.05) run(p, this.runPhase, s, false);
    else idle(p, t + this.runPhase);

    // Look at the ball.
    if (this.mood === "play") {
      const toBall = angleOf(ball.x - this.pos.x, ball.z - this.pos.z) - yaw;
      const wrapped = Math.atan2(Math.sin(toBall), Math.cos(toBall));
      p.y("neck", clamp(wrapped, -1.0, 1.0) * 0.8);
    }

    const rate = a?.kind === "kick" || a?.kind === "tackle" ? 30 : 14;
    this.anim.update(dt, rate);
    const root = this.model.root;
    root.position.set(this.pos.x, 0, this.pos.z);
    root.rotation.y = yaw;
    if (this.glow !== this.lastGlow) { this.model.setGlow(this.glow); this.lastGlow = this.glow; }
  }
  private lastGlow = false;
}
