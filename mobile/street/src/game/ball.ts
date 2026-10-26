/**
 * Ball physics for the cage: gravity, air drag, spin (curl, dip and float
 * through the Magnus effect), bounces and rolling with friction that trades
 * spin for speed, walls on all four sides (except the goal mouths), posts,
 * crossbar and nets. Also the kick solver: the strike that puts the ball on a
 * spot at a given moment, curl and all.
 */
import * as THREE from "three";
import { clamp } from "../math";
import { BALL_R, DRAG, GOAL_DEPTH, GOAL_H, GOAL_HALF, GRAVITY, HALF_L, HALF_W, MAGNUS, POST_R, rollDecel } from "./field";
import type { Player } from "./player";

export type KickKind = "pass" | "lob" | "shot" | "space" | "panna" | "rainbow" | "loose";

export interface KickInfo {
  by: Player;
  kind: KickKind;
  /** Match time of the kick. */
  t: number;
  target?: Player | null;
  /** Defenders this shot already got past (too quick for them to react). */
  beat?: Player[];
  /** Came back off a post or the crossbar. */
  rebound?: boolean;
  /** Bounced off a wall since the kick (for wall passes). */
  walled: boolean;
  /** Where the kick was taken from (for long-range goals). */
  fromX: number;
  fromZ: number;
}

export type BallEvent =
  | { type: "bounce"; speed: number }
  | { type: "wall"; speed: number }
  | { type: "post"; speed: number }
  | { type: "net"; speed: number }
  | { type: "goal"; side: 1 | -1 };

/** Bounciness and grip of the boards, the posts and the turf. */
const WALL_E = 0.7;
const WALL_MU = 0.25;
const POST_E = 0.62;
const TURF_MU = 0.5;
/** Spin lost per second in the air, and sidespin per second on the ground. */
const AIR_SPIN_LOSS = 0.35;
const GROUND_SIDESPIN_LOSS = 4;

type V3 = THREE.Vector3;

/**
 * Bounce off a surface with outward normal n: restitution `e` along the normal,
 * and friction (up to `mu` × the normal impulse) at the contact point, which
 * turns slip into spin and spin into speed — backspin checks up, topspin skips on.
 * Returns the speed it hit at (0 if it was moving away).
 */
function contact(v: V3, w: V3, nx: number, ny: number, nz: number, e: number, mu: number) {
  const vn = v.x * nx + v.y * ny + v.z * nz;
  if (vn >= 0) return 0;
  const R = BALL_R;
  const rx = -R * nx, ry = -R * ny, rz = -R * nz;
  // Velocity of the contact point (v + w × r), tangential part.
  let ux = v.x + (w.y * rz - w.z * ry), uy = v.y + (w.z * rx - w.x * rz), uz = v.z + (w.x * ry - w.y * rx);
  const un = ux * nx + uy * ny + uz * nz;
  ux -= un * nx; uy -= un * ny; uz -= un * nz;
  const jn = -(1 + e) * vn;
  v.x += jn * nx; v.y += jn * ny; v.z += jn * nz;
  const ut = Math.hypot(ux, uy, uz);
  if (ut > 1e-6) {
    // A hollow ball: taking 0.4 of the slip off the centre leaves it rolling.
    const jt = Math.min(mu * jn, 0.4 * ut);
    const tx = (-ux / ut) * jt, ty = (-uy / ut) * jt, tz = (-uz / ut) * jt;
    v.x += tx; v.y += ty; v.z += tz;
    const k = 1.5 / (R * R); // m / I for a hollow sphere, per unit mass
    w.x += (ry * tz - rz * ty) * k;
    w.y += (rz * tx - rx * tz) * k;
    w.z += (rx * ty - ry * tx) * k;
  }
  return -vn;
}

/**
 * One small step of flight in the open (no walls): gravity, drag and Magnus in
 * the air; bounces and rolling on the ground. Returns how hard it landed (0 if
 * it didn't bounce this step).
 */
export function flight(p: V3, v: V3, w: V3, dt: number): number {
  const grounded = p.y <= BALL_R + 1e-3 && v.y <= 0.01;
  v.y -= GRAVITY * dt;
  if (!grounded) {
    const s = Math.hypot(v.x, v.y, v.z);
    const k = Math.min(1, DRAG * s * dt);
    v.x -= v.x * k; v.y -= v.y * k; v.z -= v.z * k;
    const m = MAGNUS * dt;
    const ax = w.y * v.z - w.z * v.y, ay = w.z * v.x - w.x * v.z, az = w.x * v.y - w.y * v.x;
    v.x += ax * m; v.y += ay * m; v.z += az * m;
    w.multiplyScalar(Math.exp(-AIR_SPIN_LOSS * dt));
  }
  p.addScaledVector(v, dt);
  if (p.y >= BALL_R) return 0;
  p.y = BALL_R;
  if (v.y < -1.2) {
    const hit = -v.y;
    // Harder landings bounce a little less.
    contact(v, w, 0, 1, 0, clamp(0.6 - hit * 0.012, 0.42, 0.6), TURF_MU);
    return hit;
  }
  v.y = 0;
  roll(v, w, dt);
  return 0;
}

/** On the ground: friction pulls it into a clean roll, then the turf slows it down. */
function roll(v: V3, w: V3, dt: number) {
  const R = BALL_R;
  // Slip at the contact point: v + w × (0, -R, 0).
  const ux = v.x + w.z * R, uz = v.z - w.x * R;
  const u = Math.hypot(ux, uz);
  if (u > 1e-4) {
    const dv = Math.min(TURF_MU * GRAVITY * dt, 0.4 * u);
    const tx = (-ux / u) * dv, tz = (-uz / u) * dv;
    v.x += tx; v.z += tz;
    w.x -= (1.5 * tz) / R;
    w.z += (1.5 * tx) / R;
  }
  const s = Math.hypot(v.x, v.z);
  if (s > 1e-6) {
    const f = Math.max(0, s - rollDecel(s) * dt) / s;
    v.x *= f; v.z *= f;
    w.x *= f; w.z *= f;
  } else {
    w.x = 0; w.z = 0;
  }
  w.y *= Math.exp(-GROUND_SIDESPIN_LOSS * dt);
}

/** Spin for a ball rolling cleanly along the ground at velocity (vx, vz). */
export function rollingSpin(vx: number, vz: number, out: V3) {
  return out.set(vz / BALL_R, 0, -vx / BALL_R);
}

const fp = new THREE.Vector3(), fv = new THREE.Vector3(), fw = new THREE.Vector3();

/** Where a ball struck from `from` with velocity `v0` and spin `w0` is after `T` seconds (open field). */
export function flyFor(from: V3, v0: V3, w0: V3, T: number, out = new THREE.Vector3()) {
  fp.copy(from); fv.copy(v0); fw.copy(w0);
  const h = 1 / 240;
  const n = Math.max(1, Math.round(T / h));
  for (let i = 0; i < n; i++) flight(fp, fv, fw, T / n);
  return out.copy(fp);
}

/**
 * The strike that puts the ball at `to` after `T` seconds with spin `w0`: a few
 * rounds of aim, see where it ends up, correct. Curl, dip and drag are all
 * allowed for, so a curler starts out wide and bends back onto the spot.
 */
export function aimKick(from: V3, to: V3, T: number, w0: V3) {
  const v0 = new THREE.Vector3((to.x - from.x) / T, (to.y - from.y) / T + 0.5 * GRAVITY * T, (to.z - from.z) / T);
  const end = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    flyFor(from, v0, w0, T, end);
    const ex = to.x - end.x, ey = to.y - end.y, ez = to.z - end.z;
    if (ex * ex + ey * ey + ez * ez < 1e-4) break;
    v0.x += ex / T; v0.y += ey / T; v0.z += ez / T;
  }
  return v0;
}

function ballGeometry() {
  // Icosphere with dark patches around the 12 icosahedron vertices (classic ball).
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const centres: THREE.Vector3[] = [];
  const p = ico.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i).normalize();
    if (!centres.some((c) => c.distanceTo(v) < 1e-3)) centres.push(v);
  }
  const geo = new THREE.IcosahedronGeometry(BALL_R, 4);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const dark = new THREE.Color("#1d1030");
  const light = new THREE.Color("#f7f7f7");
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const near = centres.some((c) => c.angleTo(v) < 0.3);
    const c = near ? dark : light;
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

function blobTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(0,0,0,0.55)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Ball {
  pos = new THREE.Vector3(0, BALL_R, 0);
  vel = new THREE.Vector3();
  /** Angular velocity (rad/s): sidespin curls it, topspin dips it, backspin floats it. */
  spin = new THREE.Vector3();
  owner: Player | null = null;
  lastTouch: Player | null = null;
  kick: KickInfo | null = null;
  /** Set once the ball is over the line, so a goal only counts once. */
  inGoal = false;

  mesh: THREE.Mesh;
  shadow: THREE.Mesh;
  private axis = new THREE.Vector3();
  private w = new THREE.Vector3();
  private q = new THREE.Quaternion();

  constructor(scene: THREE.Object3D) {
    this.mesh = new THREE.Mesh(ballGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }));
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(BALL_R * 4, BALL_R * 4),
      new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);
  }

  reset(x = 0, z = 0) {
    this.pos.set(x, BALL_R, z);
    this.vel.set(0, 0, 0);
    this.spin.set(0, 0, 0);
    this.owner = null;
    this.kick = null;
    this.inGoal = false;
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  get airborne() { return this.pos.y > BALL_R + 0.05 || this.vel.y > 0.5; }

  /** Ball physics for one small step. Returns anything that happened. */
  step(dt: number, out: BallEvent[]) {
    const p = this.pos, v = this.vel, w = this.spin;
    const landed = flight(p, v, w, dt);
    if (landed) out.push({ type: "bounce", speed: landed });

    // Side walls (the cage is fully enclosed; treat the fence as infinitely tall).
    if (Math.abs(p.z) > HALF_W - BALL_R) {
      const s = Math.sign(p.z);
      p.z = s * (HALF_W - BALL_R);
      const hit = contact(v, w, 0, 0, -s, WALL_E, WALL_MU);
      if (hit) {
        out.push({ type: "wall", speed: hit });
        if (this.kick) this.kick.walled = true;
      }
    }

    const side = Math.sign(p.x) as 1 | -1;
    const inMouth = Math.abs(p.z) < GOAL_HALF - BALL_R * 0.3 && p.y < GOAL_H - BALL_R * 0.3;
    const pastLine = Math.abs(p.x) > HALF_L - BALL_R;

    if (Math.abs(p.x) > HALF_L) {
      // Inside the goal box: nets soak up the ball (and its spin).
      const back = HALF_L + GOAL_DEPTH - BALL_R;
      if (Math.abs(p.x) > back) {
        p.x = side * back;
        if (Math.sign(v.x) === side) { out.push({ type: "net", speed: Math.abs(v.x) }); v.x = -v.x * 0.12; v.z *= 0.5; w.multiplyScalar(0.3); }
      }
      if (Math.abs(p.z) > GOAL_HALF - BALL_R) {
        p.z = Math.sign(p.z) * (GOAL_HALF - BALL_R);
        if (Math.sign(v.z) === Math.sign(p.z)) { v.z = -v.z * 0.15; w.multiplyScalar(0.5); out.push({ type: "net", speed: Math.abs(v.z) }); }
      }
      if (p.y > GOAL_H - BALL_R) {
        p.y = GOAL_H - BALL_R;
        if (v.y > 0) v.y = -v.y * 0.15;
      }
      if (!this.inGoal && Math.abs(p.x) > HALF_L + BALL_R) {
        this.inGoal = true;
        out.push({ type: "goal", side });
      }
    } else if (pastLine && !inMouth) {
      // End wall either side of the goal, and the fence above the crossbar.
      p.x = side * (HALF_L - BALL_R);
      const hit = contact(v, w, -side, 0, 0, WALL_E, WALL_MU);
      if (hit) {
        out.push({ type: "wall", speed: hit });
        if (this.kick) this.kick.walled = true;
      }
    }

    // Posts (vertical) and crossbar (horizontal, along z).
    for (const gx of [-HALF_L, HALF_L]) {
      if (Math.abs(p.x - gx) > 0.5) continue;
      for (const gz of [-GOAL_HALF, GOAL_HALF]) {
        if (p.y > GOAL_H + BALL_R) continue;
        this.collideCircle(p.x - gx, p.z - gz, "xz", out);
      }
      if (Math.abs(p.z) < GOAL_HALF) this.collideCircle(p.x - gx, p.y - GOAL_H, "xy", out);
    }
  }

  private collideCircle(dx: number, dy: number, plane: "xz" | "xy", out: BallEvent[]) {
    const minD = BALL_R + POST_R;
    const d2 = dx * dx + dy * dy;
    if (d2 >= minD * minD || d2 === 0) return;
    const d = Math.sqrt(d2);
    const nx = dx / d, ny = dy / d;
    // Push out of the post.
    const push = minD - d;
    this.pos.x += nx * push;
    if (plane === "xz") this.pos.z += ny * push; else this.pos.y += ny * push;
    const hit = plane === "xz"
      ? contact(this.vel, this.spin, nx, 0, ny, POST_E, 0.2)
      : contact(this.vel, this.spin, nx, ny, 0, POST_E, 0.2);
    if (hit) out.push({ type: "post", speed: hit });
  }

  /** Sync the mesh, spin it, and place the blob shadow. */
  render(dt: number) {
    this.mesh.position.copy(this.pos);
    // Rolling on the ground (works without spin from the network too); spinning in the air.
    const w = this.airborne ? this.w.copy(this.spin) : rollingSpin(this.vel.x, this.vel.z, this.w).setY(this.spin.y);
    const a = w.length();
    if (a > 0.05) {
      this.axis.copy(w).divideScalar(a);
      this.q.setFromAxisAngle(this.axis, a * dt);
      this.mesh.quaternion.premultiply(this.q);
    }
    this.shadow.position.set(this.pos.x, 0.012, this.pos.z);
    const h = Math.max(0, this.pos.y - BALL_R);
    this.shadow.scale.setScalar(1 + h * 0.35);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, 1 - h * 0.25);
  }
}
