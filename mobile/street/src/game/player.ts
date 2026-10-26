/**
 * A footballer on the pitch: movement, the action they're doing (kick,
 * tackle, trick…), and turning that into an animated 3D model.
 */
import type * as THREE from "three";
import { angleOf, clamp, dirX, dirZ, len, turnToward, wrapAngle, type V2 } from "../math";
import type { PlayerModel } from "../rig/model";
import {
  Animator, barge, celebrate, cheer, dejected, flick, floored, idle, jockey, kick, kungfu, panna, roulette, run, slide,
  stepover, stumble,
} from "../rig/pose";
import type { Celebration, RosterPlayer, Stats } from "../roster";
import { HALF_L, HALF_W } from "./field";

export type ActionKind =
  | "kick" | "stepover" | "roulette" | "flick" | "panna" | "stumble"
  // Tackles (there are no fouls), and being on the end of one.
  | "barge" | "slide" | "kungfu" | "floored";

export const TACKLE_KINDS: readonly ActionKind[] = ["barge", "slide", "kungfu"];

export interface Action {
  kind: ActionKind;
  t: number;
  dur: number;
  /** Kick power 0..1 (animation only). */
  power?: number;
  /** Sideways shift during a trick (metres, + = player's left). */
  shift?: number;
  /** Direction a tackle turns into. */
  aim?: number;
  /** Everyone this tackle has already been through. */
  hit?: Player[];
  /** Floored: lands on their back (1) or face down (-1). */
  flip?: number;
}

export type Mood = "play" | "celebrate" | "cheer" | "dejected" | "idle";

export const PLAYER_R = 0.38;
/** Running speed without sprint, as a share of sprint speed. */
export const JOG = 0.8;

/** A stat on a 0..1 scale (40 → 0, 99 → 1), for turning stats into abilities. */
export const rate = (stat: number) => clamp((stat - 40) / 59, 0, 1);

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
  /** When they last bumped into someone (match time). */
  bumpedAt = -Infinity;
  /** Dribbling: when the next touch is due, and when the last one was. */
  touchAt = 0;
  lastTouchT = -Infinity;
  /** Time spent pressing the ball carrier, for pokes. */
  pressure = 0;
  /** Wants to sprint this step (sprint button, or the AI). */
  sprint = false;
  /** Actually sprinting: wanted it, has the legs, and is going faster than a run. */
  sprinting = false;
  /** Sprint left in the tank, 0..1. Empty = winded until it's back to a third. */
  stamina = 1;
  winded = false;
  /** Height off the ground (flying kicks, being sent flying) and its vertical speed. */
  air = 0;
  vy = 0;

  mood: Mood = "play";
  moodT = 0;
  runPhase = Math.random() * 6;
  jockeying = false;
  glow = false;

  // Derived from stats.
  /** Sprint speed (m/s); without sprint they run at `JOG` of this. */
  readonly topSpeed: number;
  readonly accel: number;
  readonly turnRate: number;
  /** Top speed with the ball, as a share of top speed without it. */
  readonly dribbleSpeed: number;
  /** Seconds of flat-out sprint on a full tank. */
  readonly sprintSeconds: number;
  /** Tank refilled per second when not sprinting. */
  readonly recovery: number;
  /** Braking (m/s²): stopping and planting to cut back. */
  readonly brake: number;
  /** Cornering grip (m/s² sideways): how tight they can turn at speed. */
  readonly grip: number;
  /** Sideways acceleration this step (m/s², + = turning left), for leaning into turns. */
  lean = 0;
  /** The goal celebration they're doing (picked by the match for each goal). */
  celebration: Celebration;

  constructor(info: RosterPlayer, team: 0 | 1, model: PlayerModel) {
    this.info = info;
    this.stats = info.stats;
    this.team = team;
    this.model = model;
    this.anim = new Animator(this.model);
    const s = this.stats;
    // Pace: real sprint speeds, 6.6 m/s (pace 70) to 7.0 m/s (pace 92), and the burst off the mark.
    this.topSpeed = 5.95 + rate(s.pace) * 1.2;
    this.accel = 9.5 + rate(s.pace) * 3.5;
    // Dribbling: radians per second (a 180° turn in about a third of a second) and
    // how little the ball slows them down.
    this.turnRate = 5.6 + rate(s.dribbling) * 3;
    this.dribbleSpeed = 0.85 + rate(s.dribbling) * 0.1;
    // Physical: how long they can sprint for, and how quickly they get it back.
    this.sprintSeconds = 3.5 + rate(s.physical) * 4;
    this.recovery = 0.12 + rate(s.physical) * 0.08;
    // Braking and cornering: quick feet (dribbling) and a burst (pace) stop and turn sharper.
    this.brake = 15 + rate(s.pace) * 4 + rate(s.dribbling) * 2;
    this.grip = 16 + rate(s.dribbling) * 4;
    this.celebration = info.celebration;
  }

  get name() { return this.info.name; }
  get speed() { return len(this.vel.x, this.vel.z); }
  get busy() { return this.action !== null && this.action.kind !== "kick"; }

  start(kind: ActionKind, dur: number, extra: Partial<Action> = {}) {
    this.action = { kind, t: 0, dur, ...extra };
  }

  canControl(now: number) {
    // Not while knocked down, stumbling, or mid slide/flying kick (a barge can take it).
    const k = this.action?.kind;
    return now >= this.noControlUntil && k !== "stumble" && k !== "floored" && k !== "slide" && k !== "kungfu" && this.mood === "play";
  }

  /** Integrate movement toward `want`. `speedMul` scales top speed (dribbling, 5IVE MODE…). */
  move(dt: number, now: number, speedMul: number, withBall: boolean) {
    const a = this.action;
    const sprint = this.sprint && !this.winded;
    const run = this.topSpeed * speedMul;
    let top = run * (sprint ? 1 : JOG) * (now < this.burstUntil ? 1.15 : 1);
    let accel = this.accel;
    let wantX = this.want.x, wantZ = this.want.z;

    if (a) {
      a.t += dt;
      const k = a.t / a.dur;
      switch (a.kind) {
        case "barge": {
          // Shoulder down and charge.
          if (a.aim !== undefined) this.facing = turnToward(this.facing, a.aim, 12 * dt);
          const go = k < 0.55 ? 1 : 0.2;
          wantX = dirX(this.facing) * 7.5 * go;
          wantZ = dirZ(this.facing) * 7.5 * go;
          top = 8;
          accel = 40;
          break;
        }
        case "slide": {
          // Feet first along the ground, fading out, then back up.
          if (a.aim !== undefined && k < 0.15) this.facing = turnToward(this.facing, a.aim, 12 * dt);
          const go = k < 0.65 ? 1 - k / 0.65 : 0;
          wantX = dirX(this.facing) * 10 * go;
          wantZ = dirZ(this.facing) * 10 * go;
          top = 10;
          accel = k < 0.12 ? 60 : 16;
          break;
        }
        case "kungfu": {
          // Leap in feet first, land on your back, get up.
          if (a.aim !== undefined && k < 0.12) this.facing = turnToward(this.facing, a.aim, 12 * dt);
          const flying = this.air > 0 || k < 0.1;
          wantX = flying ? dirX(this.facing) * 7.5 : 0;
          wantZ = flying ? dirZ(this.facing) * 7.5 : 0;
          top = 8;
          accel = flying ? 40 : 14;
          break;
        }
        case "floored":
          // Sent flying: carried by the hit through the air, then skidding to a stop.
          wantX = 0;
          wantZ = 0;
          accel = this.air > 0 ? 0 : 10;
          break;
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
    // Tricks, tackles and tumbles steer themselves; so does shuffling side-on (jockeying) and
    // setting off from a standstill. Otherwise people run like people: see `steer`.
    const scripted = !!a && a.kind !== "kick";
    if (scripted || (this.jockeying && !this.sprint)) {
      const dx = wantX - this.vel.x, dz = wantZ - this.vel.z;
      const dl = len(dx, dz);
      const step = (scripted ? accel : Math.max(accel, this.brake * (wl < 0.2 ? 1 : 0))) * dt;
      if (dl <= step) { this.vel.x = wantX; this.vel.z = wantZ; }
      else { this.vel.x += (dx / dl) * step; this.vel.z += (dz / dl) * step; }
      this.lean = 0;
    } else this.lean = this.locomote(this.vel, wantX, wantZ, run, accel, dt, withBall, this.sprinting);

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.x = clamp(this.pos.x, -HALF_L + 0.3, HALF_L - 0.3);
    this.pos.z = clamp(this.pos.z, -HALF_W + 0.3, HALF_W - 0.3);
    if (this.air > 0 || this.vy > 0) {
      this.vy -= 16 * dt;
      this.air = Math.max(0, this.air + this.vy * dt);
      if (this.air === 0) this.vy = 0;
    }

    // The tank empties while going faster than a run and refills otherwise (quicker stood still).
    const sp = this.speed;
    this.sprinting = sprint && !a && sp > run * JOG * 1.02;
    if (this.sprinting) this.stamina = Math.max(0, this.stamina - dt / this.sprintSeconds);
    else this.stamina = Math.min(1, this.stamina + dt * this.recovery * (sp < 2 ? 1.5 : 1));
    if (this.stamina <= 0) this.winded = true;
    else if (this.winded && this.stamina >= 0.33) this.winded = false;

    // Face where we're running (the run already turns at a human rate); side-on to the ball when
    // jockeying; toward `look` when stood still; held during tricks and tackles.
    const locked = a && a.kind !== "kick";
    if (!locked) {
      const rate = (withBall ? this.turnRate * 0.9 : this.turnRate * 1.3) * dt;
      const shuffle = this.jockeying && !this.sprint && this.look !== null;
      if (shuffle) this.facing = turnToward(this.facing, this.look!, rate);
      // Running, the body follows the run closely (the run itself turns at a human rate).
      else if (sp > 1.2 && len(wantX, wantZ) > 0.3) this.facing = turnToward(this.facing, angleOf(this.vel.x, this.vel.z), rate * (sp > 3 ? 2.5 : 1));
      else if (this.look !== null) this.facing = turnToward(this.facing, this.look, rate * 0.7);
    }
    // One cycle = two steps. Longer strides as speed rises, so the feet match the
    // ground: ~1.5 steps/s walking, ~2.4 jogging, ~3.4 sprinting.
    this.runPhase += (sp * dt * Math.PI * 2) / (1.4 + 0.38 * sp);
  }

  /**
   * Running on two legs, not skating: the run has a heading that turns only as
   * fast as their grip allows at that speed (tighter when slower), they ease off
   * into tight turns, and anything sharper than about 110° means planting a foot
   * and braking before going the new way. Speeding up tails off near top speed.
   * From (nearly) standing they just set off the way they want. Updates `vel`;
   * returns the sideways acceleration (+ = turning left).
   */
  private locomote(vel: V2, wantX: number, wantZ: number, runSp: number, accel: number, dt: number, withBall: boolean, sprinting: boolean) {
    const sp = len(vel.x, vel.z);
    const wl = len(wantX, wantZ);
    if (sp < 0.8) {
      const dx = wantX - vel.x, dz = wantZ - vel.z;
      const dl = len(dx, dz);
      const step = Math.max(accel, wl < 0.2 ? this.brake : 0) * dt;
      if (dl <= step) { vel.x = wantX; vel.z = wantZ; }
      else { vel.x += (dx / dl) * step; vel.z += (dz / dl) * step; }
      return 0;
    }
    const h0 = angleOf(vel.x, vel.z);
    let h = h0;
    const turn = wl > 0.2 ? wrapAngle(angleOf(wantX, wantZ) - h) : 0;
    const grip = this.grip * (withBall ? 0.85 : 1) * (sprinting ? 0.9 : 1);
    const maxTurn = Math.min(this.turnRate * 1.25, grip / sp) * dt;
    let next: number;
    if (wl < 0.2 || Math.abs(turn) > 1.9) {
      // Stop, or plant and cut back: brake hard (and start turning once slow).
      next = Math.max(0, sp - this.brake * dt);
      h += clamp(turn, -maxTurn, maxTurn);
    } else {
      h += clamp(turn, -maxTurn, maxTurn);
      const target = wl * (1 - 0.3 * clamp(Math.abs(turn) / 1.6, 0, 1));
      next = target > sp
        ? Math.min(target, sp + accel * (1.25 - 0.6 * Math.min(1, sp / runSp)) * dt)
        : Math.max(target, sp - this.brake * dt);
    }
    vel.x = dirX(h) * next;
    vel.z = dirZ(h) * next;
    return (wrapAngle(h - h0) / Math.max(dt, 1e-4)) * sp;
  }

  /**
   * Where they'll be in `T` seconds, and how they'll be moving, if they keep
   * wanting what they want now (the dribble uses it to knock the ball into their path).
   */
  predict(T: number, now: number, speedMul: number, withBall: boolean) {
    const sprint = this.sprint && !this.winded;
    const runSp = this.topSpeed * speedMul;
    const top = runSp * (sprint ? 1 : JOG) * (now < this.burstUntil ? 1.15 : 1);
    let wantX = this.want.x, wantZ = this.want.z;
    const wl = len(wantX, wantZ);
    if (wl > top) { wantX *= top / wl; wantZ *= top / wl; }
    const vel = { x: this.vel.x, z: this.vel.z };
    let x = this.pos.x, z = this.pos.z;
    const n = Math.max(1, Math.ceil(T * 30));
    const h = T / n;
    for (let i = 0; i < n; i++) {
      this.locomote(vel, wantX, wantZ, runSp, this.accel, h, withBall, this.sprinting);
      x = clamp(x + vel.x * h, -HALF_L + 0.3, HALF_L - 0.3);
      z = clamp(z + vel.z * h, -HALF_W + 0.3, HALF_W - 0.3);
    }
    return { x, z, vx: vel.x, vz: vel.z };
  }

  /** Pose the model for this frame. */
  render(dt: number, t: number, ball: THREE.Vector3) {
    const p = this.anim.target;
    const a = this.action;
    const s = clamp(this.speed / 7, 0, 1);
    const yaw = this.facing;

    if (this.mood === "celebrate") celebrate(p, this.celebration, this.moodT, this.runPhase, s);
    else if (this.mood === "cheer") cheer(p, this.moodT);
    else if (this.mood === "dejected") dejected(p, this.moodT);
    else if (a) {
      const k = clamp(a.t / a.dur, 0, 1);
      switch (a.kind) {
        case "kick": kick(p, k, a.power ?? 0.5); break;
        case "barge": barge(p, k); break;
        case "slide": slide(p, k); break;
        case "kungfu": kungfu(p, k); break;
        case "floored": floored(p, k, a.flip ?? 1); break;
        case "stepover": stepover(p, k); break;
        case "roulette": roulette(p, k); break;
        case "flick": flick(p, k); break;
        case "panna": panna(p, k); break;
        case "stumble": stumble(p, k); break;
      }
    } else if (this.jockeying && s < 0.75) jockey(p, this.runPhase, s);
    else if (s > 0.05) {
      run(p, this.runPhase, s, false);
      // Lean into the turn (the body pivots at the feet).
      this.leanT += (clamp(-this.lean * 0.022, -0.32, 0.32) - this.leanT) * Math.min(1, dt * 10);
      p.tilt(0, 0, this.leanT);
    } else idle(p, t + this.runPhase);

    // Look at the ball.
    if (this.mood === "play" && a?.kind !== "floored") {
      const toBall = angleOf(ball.x - this.pos.x, ball.z - this.pos.z) - yaw;
      const wrapped = Math.atan2(Math.sin(toBall), Math.cos(toBall));
      p.y("neck", clamp(wrapped, -1.0, 1.0) * 0.8);
    }

    const rate = a?.kind === "kick" || (a && TACKLE_KINDS.includes(a.kind)) ? 30 : a?.kind === "floored" ? 22 : 14;
    this.anim.update(dt, rate);
    const root = this.model.root;
    root.position.set(this.pos.x, this.air, this.pos.z);
    root.rotation.y = yaw;
    if (this.glow !== this.lastGlow) { this.model.setGlow(this.glow); this.lastGlow = this.glow; }
  }
  private lastGlow = false;
  private leanT = 0;
}
