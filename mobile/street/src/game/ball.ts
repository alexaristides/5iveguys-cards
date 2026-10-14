/**
 * Ball physics for the cage: gravity, bounces, rolling friction, walls on all
 * four sides (except the goal mouths), posts, crossbar and nets.
 */
import * as THREE from "three";
import { BALL_R, GOAL_DEPTH, GOAL_H, GOAL_HALF, GRAVITY, HALF_L, HALF_W, POST_R } from "./field";
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

const WALL_E = 0.72;

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
  owner: Player | null = null;
  lastTouch: Player | null = null;
  kick: KickInfo | null = null;
  /** Set once the ball is over the line, so a goal only counts once. */
  inGoal = false;

  mesh: THREE.Mesh;
  shadow: THREE.Mesh;
  private axis = new THREE.Vector3();
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
    this.owner = null;
    this.kick = null;
    this.inGoal = false;
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  get airborne() { return this.pos.y > BALL_R + 0.05 || this.vel.y > 0.5; }

  /** Free-ball physics for one small step. Returns anything that happened. */
  step(dt: number, out: BallEvent[]) {
    const p = this.pos, v = this.vel;
    v.y -= GRAVITY * dt;
    const drag = 1 - 0.04 * dt;
    v.x *= drag; v.z *= drag;
    p.addScaledVector(v, dt);

    // Ground.
    if (p.y < BALL_R) {
      p.y = BALL_R;
      if (v.y < -1.5) {
        out.push({ type: "bounce", speed: -v.y });
        v.y = -v.y * 0.52;
        v.x *= 0.9; v.z *= 0.9;
      } else {
        v.y = 0;
        const s = Math.hypot(v.x, v.z);
        if (s > 0) {
          const ns = Math.max(0, s - (1.5 + 0.25 * s) * dt);
          v.x *= ns / s; v.z *= ns / s;
        }
      }
    }

    // Side walls (the cage is fully enclosed; treat the fence as infinitely tall).
    if (Math.abs(p.z) > HALF_W - BALL_R) {
      p.z = Math.sign(p.z) * (HALF_W - BALL_R);
      if (Math.sign(v.z) === Math.sign(p.z)) {
        out.push({ type: "wall", speed: Math.abs(v.z) });
        v.z = -v.z * WALL_E;
        v.x *= 0.94;
        if (this.kick) this.kick.walled = true;
      }
    }

    const side = Math.sign(p.x) as 1 | -1;
    const inMouth = Math.abs(p.z) < GOAL_HALF - BALL_R * 0.3 && p.y < GOAL_H - BALL_R * 0.3;
    const pastLine = Math.abs(p.x) > HALF_L - BALL_R;

    if (Math.abs(p.x) > HALF_L) {
      // Inside the goal box: nets soak up the ball.
      const back = HALF_L + GOAL_DEPTH - BALL_R;
      if (Math.abs(p.x) > back) {
        p.x = side * back;
        if (Math.sign(v.x) === side) { out.push({ type: "net", speed: Math.abs(v.x) }); v.x = -v.x * 0.12; v.z *= 0.5; }
      }
      if (Math.abs(p.z) > GOAL_HALF - BALL_R) {
        p.z = Math.sign(p.z) * (GOAL_HALF - BALL_R);
        if (Math.sign(v.z) === Math.sign(p.z)) { v.z = -v.z * 0.15; out.push({ type: "net", speed: Math.abs(v.z) }); }
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
      if (Math.sign(v.x) === side) {
        out.push({ type: "wall", speed: Math.abs(v.x) });
        v.x = -v.x * WALL_E;
        v.z *= 0.94;
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
    const v = this.vel;
    const va = v.x, vb = plane === "xz" ? v.z : v.y;
    const vn = va * nx + vb * ny;
    // Push out of the post.
    const push = minD - d;
    this.pos.x += nx * push;
    if (plane === "xz") this.pos.z += ny * push; else this.pos.y += ny * push;
    if (vn >= 0) return;
    out.push({ type: "post", speed: -vn });
    const e = 0.62;
    const na = va - (1 + e) * vn * nx;
    const nb = vb - (1 + e) * vn * ny;
    v.x = na;
    if (plane === "xz") v.z = nb; else v.y = nb;
  }

  /** Sync the mesh, roll it, and place the blob shadow. */
  render(dt: number) {
    this.mesh.position.copy(this.pos);
    const s = Math.hypot(this.vel.x, this.vel.z);
    if (s > 0.01) {
      this.axis.set(this.vel.z, 0, -this.vel.x).normalize();
      this.q.setFromAxisAngle(this.axis, (s * dt) / BALL_R);
      this.mesh.quaternion.premultiply(this.q);
    }
    this.shadow.position.set(this.pos.x, 0.012, this.pos.z);
    const h = Math.max(0, this.pos.y - BALL_R);
    this.shadow.scale.setScalar(1 + h * 0.35);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, 1 - h * 0.25);
  }
}
