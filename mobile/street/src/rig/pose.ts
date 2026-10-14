/**
 * Procedural animation. Every frame a player's state produces a target `Pose`
 * (joint rotations + body offsets) and the `Animator` eases the rig toward it,
 * so switching between running, kicking and celebrating blends smoothly.
 *
 * Sign conventions (see model.ts axes):
 *   hip.x  < 0 → leg forward       knee.x > 0 → shin bends back
 *   shoulder.x < 0 → arm forward   elbow.x < 0 → forearm bends forward
 *   shoulder.z: + lifts the left arm out, − lifts the right arm out
 *   spine.x > 0 → lean forward     neck.x > 0 → look down
 */
import { clamp, damp, smooth } from "../math";
import type { Celebration } from "../roster";
import type { Joints, PlayerModel } from "./model";

const JOINTS = [
  "pelvis", "spine", "neck", "lShoulder", "lElbow", "rShoulder", "rElbow",
  "lHip", "lKnee", "lAnkle", "rHip", "rKnee", "rAnkle",
] as const satisfies readonly (keyof Joints)[];
type J = (typeof JOINTS)[number];
const IDX = Object.fromEntries(JOINTS.map((j, i) => [j, i * 3])) as Record<J, number>;
const LIFT = JOINTS.length * 3;
const TILT = LIFT + 1; // body rotation x, y, z
const YAW = TILT + 3; // extra spin (roulette, siuu) — not eased
const N = YAW + 1;

export class Pose {
  v = new Float32Array(N);
  reset() { this.v.fill(0); return this; }
  set(j: J, x: number, y = 0, z = 0) { const i = IDX[j]; this.v[i] = x; this.v[i + 1] = y; this.v[i + 2] = z; return this; }
  x(j: J, x: number) { this.v[IDX[j]] = x; return this; }
  y(j: J, y: number) { this.v[IDX[j] + 1] = y; return this; }
  z(j: J, z: number) { this.v[IDX[j] + 2] = z; return this; }
  addX(j: J, x: number) { this.v[IDX[j]] += x; return this; }
  lift(h: number) { this.v[LIFT] = h; return this; }
  tilt(x: number, y = 0, z = 0) { this.v[TILT] = x; this.v[TILT + 1] = y; this.v[TILT + 2] = z; return this; }
  yaw(a: number) { this.v[YAW] = a; return this; }
}

/** Piecewise-smooth keyframes: [[t0, v0], [t1, v1], …] sampled at t. */
export function key(t: number, frames: [number, number][]) {
  if (t <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1] = frames[i];
    if (t <= t1) {
      const [t0, v0] = frames[i - 1];
      return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0 || 1));
    }
  }
  return frames[frames.length - 1][1];
}

export class Animator {
  cur = new Pose();
  target = new Pose();
  constructor(private model: PlayerModel) {}

  /** Ease toward `target` (rate ≈ 1/seconds) and write the result into the rig. */
  update(dt: number, rate = 16) {
    const c = this.cur.v, t = this.target.v;
    for (let i = 0; i < YAW; i++) c[i] = damp(c[i], t[i], rate, dt);
    c[YAW] = t[YAW];
    const j = this.model.joints;
    for (const name of JOINTS) {
      const i = IDX[name];
      j[name].rotation.set(c[i], c[i + 1], c[i + 2]);
    }
    this.model.body.position.y = c[LIFT];
    this.model.body.rotation.set(c[TILT], c[TILT + 1] + c[YAW], c[TILT + 2]);
  }

  snap() { this.cur.v.set(this.target.v); this.update(0); }
}

// ── Base poses ──────────────────────────────────────────────────────────────

export function idle(p: Pose, t: number) {
  const breathe = Math.sin(t * 2.2) * 0.015;
  p.reset()
    .x("spine", 0.03 + breathe).x("neck", -0.03 - breathe)
    .set("lShoulder", 0.05, 0, 0.12).set("rShoulder", 0.05, 0, -0.12)
    .x("lElbow", -0.25).x("rElbow", -0.25)
    .set("lHip", -0.05, 0, 0.05).set("rHip", 0.05, 0, -0.05)
    .x("lKnee", 0.12).x("rKnee", 0.12).x("lAnkle", -0.07).x("rAnkle", -0.07)
    .lift(-0.01 + breathe * 0.3);
}

/**
 * Running / dribbling cycle. `phase` advances with distance travelled; `s` is
 * speed 0..1 of top speed.
 */
export function run(p: Pose, phase: number, s: number, dribbling: boolean) {
  const sw = Math.sin(phase);
  const cw = Math.cos(phase);
  const legAmp = 0.22 + 0.62 * s;
  const kneeAmp = 0.35 + 1.05 * s;
  const armAmp = 0.18 + 0.55 * s;
  const lean = 0.06 + 0.24 * s + (dribbling ? 0.08 : 0);
  p.reset()
    .set("pelvis", 0, 0.14 * s * sw, 0)
    .set("spine", lean, -0.24 * s * sw, 0)
    .x("neck", -lean * 0.7 + (dribbling ? 0.28 : 0))
    .set("lHip", -sw * legAmp, 0, 0.03).set("rHip", sw * legAmp, 0, -0.03)
    .x("lKnee", 0.12 + kneeAmp * Math.max(0, cw)).x("rKnee", 0.12 + kneeAmp * Math.max(0, -cw))
    .x("lAnkle", -0.1 + 0.35 * s * Math.max(0, cw)).x("rAnkle", -0.1 + 0.35 * s * Math.max(0, -cw))
    .set("lShoulder", sw * armAmp, 0, 0.1).set("rShoulder", -sw * armAmp, 0, -0.1)
    .x("lElbow", -0.45 - 0.85 * s).x("rElbow", -0.45 - 0.85 * s)
    .lift(-0.035 * s - (dribbling ? 0.03 : 0) + 0.035 * s * Math.cos(phase * 2));
}

/** Defensive stance: low, side-on, arms out, shuffling. */
export function jockey(p: Pose, phase: number, s: number) {
  const sw = Math.sin(phase) * s;
  p.reset()
    .set("spine", 0.32, 0, 0).x("neck", -0.2)
    .set("lHip", -0.35 - sw * 0.25, 0, 0.22).set("rHip", -0.35 + sw * 0.25, 0, -0.22)
    .x("lKnee", 0.65).x("rKnee", 0.65).x("lAnkle", -0.25).x("rAnkle", -0.25)
    .set("lShoulder", -0.3, 0, 0.45).set("rShoulder", -0.3, 0, -0.45)
    .x("lElbow", -0.6).x("rElbow", -0.6)
    .lift(-0.1);
}

// ── Actions (t runs 0 → 1 over the action) ──────────────────────────────────

/** Strike with the right foot. `power` 0..1 exaggerates the swing. */
export function kick(p: Pose, t: number, power: number) {
  const back = 0.5 + 0.6 * power;
  const thru = 0.7 + 0.6 * power;
  p.reset()
    .x("spine", key(t, [[0, 0.1], [0.35, 0.18], [0.55, -0.12 * power], [1, 0.05]]))
    .x("neck", key(t, [[0, 0.25], [0.5, 0.35], [1, 0.1]]))
    .x("rHip", key(t, [[0, 0], [0.35, back], [0.55, -thru], [0.75, -thru * 0.9], [1, 0]]))
    .x("rKnee", key(t, [[0, 0.2], [0.35, 1.5], [0.55, 0.1], [1, 0.2]]))
    .x("rAnkle", key(t, [[0, 0], [0.4, 0.4], [0.6, 0.5], [1, 0]]))
    .set("lHip", -0.15, 0, 0.08).x("lKnee", 0.3)
    .set("lShoulder", key(t, [[0, 0], [0.5, -0.5], [1, 0]]), 0, key(t, [[0, 0.3], [0.45, 1.0], [1, 0.3]]))
    .set("rShoulder", key(t, [[0, 0], [0.4, -0.5], [0.6, 0.6], [1, 0]]), 0, -0.4)
    .x("lElbow", -0.3).x("rElbow", -0.4)
    .lift(key(t, [[0, -0.03], [0.5, -0.07], [1, -0.02]]));
}

// ── Tackles (no fouls) ──────────────────────────────────────────────────────
// The body pivots at the feet, so tilting it back lays the player down with
// their feet where they were.

/** Shoulder charge: head down, leaning into the shoulder. */
export function barge(p: Pose, t: number) {
  const go = key(t, [[0, 0], [0.2, 1], [0.6, 1], [1, 0]]);
  p.reset()
    .x("spine", 0.45 * go).x("neck", -0.2 * go)
    .set("lHip", -0.6 * go, 0, 0.05).x("lKnee", 0.5 * go).x("rHip", 0.4 * go).x("rKnee", 0.6 * go)
    .set("lShoulder", -0.4, 0, 0.15).x("lElbow", -1.6 * go)
    .set("rShoulder", 0.3 * go, 0, -0.2).x("rElbow", -0.8)
    .tilt(0.1 * go, 0, -0.38 * go)
    .lift(-0.08 * go);
}

/** Slide tackle: down on one hip, lead leg out along the ground, then back up. */
export function slide(p: Pose, t: number) {
  const down = key(t, [[0, 0], [0.12, 1], [0.72, 1], [1, 0]]);
  p.reset()
    .x("spine", 0.35 * down).x("neck", 0.35 * down)
    .set("lHip", -0.75 * down, 0, 0.08).x("lKnee", 0.05).x("lAnkle", -0.35 * down)
    .set("rHip", -0.2 * down, 0, -0.1).x("rKnee", 1.6 * down)
    .set("lShoulder", -0.6 * down, 0, 0.9 * down).x("lElbow", -0.3)
    .set("rShoulder", 0.9 * down, 0, -0.5 * down).x("rElbow", -0.2)
    .tilt(-1.05 * down, 0, 0.18 * down)
    .lift(0.06 * down);
}

/** Flying two-footed kung-fu kick, landing flat on your back, then up again. */
export function kungfu(p: Pose, t: number) {
  const fly = key(t, [[0, 0], [0.12, 1], [0.38, 1], [0.48, 0]]);
  const flat = key(t, [[0.38, 0], [0.5, 1], [0.78, 1], [1, 0]]);
  const legs = Math.max(fly, 0.4 * flat);
  p.reset()
    .x("spine", 0.3 * fly + 0.2 * flat).x("neck", 0.4 * fly + 0.5 * flat)
    .set("lHip", -1.25 * legs, 0, 0.1).set("rHip", -1.1 * legs, 0, -0.1)
    .x("lKnee", 0.1).x("rKnee", 0.25 * fly)
    .x("lAnkle", -0.4 * fly).x("rAnkle", -0.4 * fly)
    .set("lShoulder", -0.5 * fly, 0, 1.3 * fly + 0.9 * flat).set("rShoulder", -0.5 * fly, 0, -1.3 * fly - 0.9 * flat)
    .x("lElbow", -0.4).x("rElbow", -0.4)
    .tilt(-0.95 * fly - 1.45 * flat, 0, 0)
    .lift(0.12 * flat);
}

/**
 * Sent flying by a tackle: spinning through the air with arms and legs going,
 * flat out on the ground (on their back, or face down if `flip` is -1), then up.
 */
export function floored(p: Pose, t: number, flip: number) {
  const air = key(t, [[0, 0.3], [0.08, 1], [0.24, 1], [0.32, 0]]);
  const flat = key(t, [[0.2, 0], [0.32, 1], [0.74, 1], [0.95, 0]]);
  const flail = Math.sin(t * 60) * air;
  const twitch = flat * Math.max(0, Math.sin(t * 9)) * 0.25;
  p.reset()
    .x("spine", -0.2 * air + 0.1 * flat).x("neck", -0.4 * air - 0.2 * flat * flip)
    .set("lShoulder", -1.6 * air + flail, 0, 1.2 * air + 1.4 * flat).set("rShoulder", -1.4 * air - flail, 0, -1.2 * air - 1.4 * flat)
    .x("lElbow", -0.6 * air - 0.3 * flat).x("rElbow", -0.6 * air - 0.3 * flat)
    .set("lHip", -0.9 * air + 0.5 * flail, 0, 0.35 * flat).set("rHip", -0.3 * air - 0.5 * flail, 0, -0.35 * flat)
    .x("lKnee", 0.8 * air + twitch).x("rKnee", 0.4 * air + 0.3 * flat)
    .tilt(-flip * (1.1 * air + 1.5 * flat), 0, 0.3 * air)
    .lift(0.1 * flat)
    // A spin or two in the air (whole turns, so it ends facing the same way).
    .yaw(Math.PI * 2 * smooth(clamp(t / 0.3, 0, 1)));
}

export function stepover(p: Pose, t: number) {
  const circle = Math.sin(t * Math.PI);
  p.reset()
    .x("spine", 0.22).x("neck", 0.3).y("pelvis", 0.35 * circle)
    .set("rHip", -0.55 * circle, 0, key(t, [[0, -0.1], [0.5, 0.45], [1, -0.05]]))
    .x("rKnee", 0.35 + 0.7 * circle)
    .set("lHip", 0.05, 0, 0.12).x("lKnee", 0.35)
    .set("lShoulder", -0.2, 0, 0.55).set("rShoulder", -0.1, 0, -0.45)
    .x("lElbow", -0.6).x("rElbow", -0.6)
    .tilt(0, 0, -0.16 * circle)
    .lift(-0.07);
}

/** 360° drag-back spin: the body turns a full circle over the action. */
export function roulette(p: Pose, t: number) {
  const s = Math.sin(t * Math.PI);
  p.reset()
    .x("spine", 0.2).x("neck", 0.25)
    .set("lHip", -0.3 * s, 0, 0.18).set("rHip", 0.25 * s, 0, -0.18)
    .x("lKnee", 0.5).x("rKnee", 0.45 + 0.5 * s)
    .set("lShoulder", -0.2, 0, 0.75 * s + 0.2).set("rShoulder", -0.2, 0, -0.75 * s - 0.2)
    .x("lElbow", -0.5).x("rElbow", -0.5)
    .lift(-0.08)
    .yaw(-Math.PI * 2 * smooth(t));
}

/** Rainbow flick: heel kicks the ball up over the head. */
export function flick(p: Pose, t: number) {
  p.reset()
    .x("spine", key(t, [[0, 0.2], [0.4, 0.35], [1, 0.1]])).x("neck", -0.1)
    .x("rHip", key(t, [[0, 0], [0.25, -0.35], [0.5, 0.45], [1, 0]]))
    .x("rKnee", key(t, [[0, 0.3], [0.5, 1.9], [1, 0.2]]))
    .x("lKnee", 0.35).set("lHip", -0.1, 0, 0.1)
    .set("lShoulder", -0.3, 0, 0.8).set("rShoulder", -0.3, 0, -0.8)
    .x("lElbow", -0.5).x("rElbow", -0.5)
    .lift(key(t, [[0, -0.05], [0.5, 0.06], [1, -0.03]]));
}

/** Panna (nutmeg): short poke forward, then sidestep round the defender. */
export function panna(p: Pose, t: number) {
  p.reset()
    .x("spine", 0.28).x("neck", 0.3)
    .x("rHip", key(t, [[0, 0], [0.3, -0.65], [0.6, 0.1], [1, 0]])).x("rKnee", key(t, [[0, 0.3], [0.3, 0.15], [1, 0.4]]))
    .set("lHip", -0.15, 0, 0.25).x("lKnee", 0.5)
    .set("lShoulder", -0.3, 0, 0.6).set("rShoulder", -0.1, 0, -0.5)
    .x("lElbow", -0.6).x("rElbow", -0.6)
    .tilt(0, 0, key(t, [[0, 0], [0.4, 0.2], [1, 0]]))
    .lift(-0.08);
}

export function stumble(p: Pose, t: number) {
  const w = Math.sin(t * Math.PI);
  p.reset()
    .x("spine", 0.25 + 0.5 * w).x("neck", -0.3 * w)
    .set("lShoulder", -1.2 * w, 0, 0.6).set("rShoulder", -0.6 * w, 0, -0.9 * w)
    .x("lElbow", -0.3).x("rElbow", -0.5)
    .x("lHip", -0.5 * w).x("lKnee", 0.6).x("rHip", 0.3 * w).x("rKnee", 0.5)
    .lift(-0.12 * w);
}

export function dejected(p: Pose, t: number) {
  p.reset()
    .x("spine", 0.85 + 0.03 * Math.sin(t * 1.5)).x("neck", -0.25)
    .set("lHip", -0.45, 0, 0.12).set("rHip", -0.45, 0, -0.12)
    .x("lKnee", 0.55).x("rKnee", 0.55)
    .set("lShoulder", -0.95, 0, 0.12).set("rShoulder", -0.95, 0, -0.12)
    .x("lElbow", -0.35).x("rElbow", -0.35)
    .lift(-0.07);
}

export function cheer(p: Pose, t: number) {
  const hop = Math.max(0, Math.sin(t * 7));
  p.reset()
    .x("spine", -0.1).x("neck", -0.3)
    .set("lShoulder", -2.7, 0, 0.35).set("rShoulder", -2.7, 0, -0.35)
    .x("lElbow", -0.2).x("rElbow", -0.2)
    .x("lKnee", 0.3 * (1 - hop)).x("rKnee", 0.3 * (1 - hop))
    .lift(0.18 * hop - 0.03);
}

/**
 * Goal celebrations. `t` is seconds since the goal; the scorer is running
 * (`runPhase`, `s`) for the first part and the legs come from `run`.
 */
export function celebrate(p: Pose, kind: Celebration, t: number, runPhase: number, s: number) {
  switch (kind) {
    case "airplane": {
      run(p, runPhase, s, false);
      p.set("lShoulder", 0, 0, 1.45).set("rShoulder", 0, 0, -1.45).x("lElbow", 0).x("rElbow", 0)
        .tilt(0, 0, 0.32 * Math.sin(t * 1.6)).x("neck", -0.15);
      return;
    }
    case "kneeSlide": {
      if (t < 0.9) { run(p, runPhase, s, false); return; }
      p.reset()
        .set("lHip", 0, 0, 0.12).set("rHip", 0, 0, -0.12)
        .x("lKnee", 1.57).x("rKnee", 1.57).x("lAnkle", 0.6).x("rAnkle", 0.6)
        .x("spine", -0.38).x("neck", -0.45)
        .set("lShoulder", -2.5, 0, 0.6).set("rShoulder", -2.5, 0, -0.6)
        .x("lElbow", -0.3).x("rElbow", -0.3)
        .lift(-0.44);
      return;
    }
    case "flex": {
      if (t < 0.7) { run(p, runPhase, s, false); return; }
      const pump = 0.25 * Math.max(0, Math.sin((t - 0.7) * 6));
      p.reset()
        .set("lHip", 0, 0, 0.16).set("rHip", 0, 0, -0.16).x("lKnee", 0.15).x("rKnee", 0.15)
        .x("spine", -0.12).x("neck", -0.2)
        .set("lShoulder", 0, 0, 1.45).set("rShoulder", 0, 0, -1.45)
        .set("lElbow", 0, 0, 1.75 + pump).set("rElbow", 0, 0, -1.75 - pump)
        .lift(-0.02);
      return;
    }
    case "siuu": {
      if (t < 0.7) { run(p, runPhase, s, false); return; }
      const jt = clamp((t - 0.7) / 0.55, 0, 1);
      if (jt < 1) {
        p.reset()
          .set("lShoulder", -1.6, 0, 0.5).set("rShoulder", -1.6, 0, -0.5)
          .x("lKnee", 0.6 * Math.sin(jt * Math.PI)).x("rKnee", 0.6 * Math.sin(jt * Math.PI))
          .lift(0.55 * Math.sin(jt * Math.PI))
          .yaw(Math.PI * smooth(jt));
        return;
      }
      p.reset()
        .set("lHip", 0, 0, 0.3).set("rHip", 0, 0, -0.3).x("lKnee", 0.35).x("rKnee", 0.35)
        .x("spine", -0.18).x("neck", -0.35)
        .set("lShoulder", 0.35, 0, 0.55).set("rShoulder", 0.35, 0, -0.55)
        .lift(-0.08).yaw(Math.PI);
      return;
    }
    case "fistPump": {
      if (t < 0.6) { run(p, runPhase, s, false); return; }
      const pump = Math.sin((t - 0.6) * 9);
      p.reset()
        .set("lHip", -0.2, 0, 0.15).set("rHip", -0.2, 0, -0.15).x("lKnee", 0.45).x("rKnee", 0.45)
        .x("spine", 0.15).x("neck", -0.25)
        .set("rShoulder", -0.6 - 0.5 * pump, 0, -0.25).x("rElbow", -1.9)
        .set("lShoulder", 0.1, 0, 0.6).x("lElbow", -0.6)
        .lift(-0.08);
      return;
    }
    case "pointUp": {
      run(p, runPhase, s * 0.6, false);
      p.set("lShoulder", -2.85, 0, 0.25).set("rShoulder", -2.85, 0, -0.25)
        .x("lElbow", -0.15).x("rElbow", -0.15).x("neck", -0.5).x("spine", -0.05);
      return;
    }
  }
}
