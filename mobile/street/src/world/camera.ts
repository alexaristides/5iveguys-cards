/**
 * Broadcast-style camera that follows the ball, with close-ups for goals and
 * the team select. In play the ball is always kept inside a safe area of the
 * screen (clear of the scoreboard and the touch controls).
 */
import * as THREE from "three";
import { clamp, damp } from "../math";
import { HALF_L, HALF_W } from "../game/field";
import type { Match } from "../game/match";

export type CamMode = "select" | "match";

/** Where the ball may sit on screen, in normalised device coords (-1..1). */
export const SAFE = { left: -0.74, right: 0.6, bottom: -0.3, top: 0.58 };

export class CameraRig {
  readonly cam: THREE.PerspectiveCamera;
  private pos = new THREE.Vector3(0, 9, 14);
  private look = new THREE.Vector3(0, 0.5, 0);
  private t = 0;
  private v = new THREE.Vector3();
  /** Team select: x along the line of players (the select screen scrolls it). */
  selectX = 0;

  constructor() {
    this.cam = new THREE.PerspectiveCamera(36, 1, 0.1, 900);
  }

  resize(w: number, h: number) {
    const aspect = w / h;
    this.cam.aspect = aspect;
    // Keep roughly the same horizontal view on narrower screens.
    const minHFov = THREE.MathUtils.degToRad(72);
    const vfov = Math.max(THREE.MathUtils.degToRad(34), 2 * Math.atan(Math.tan(minHFov / 2) / aspect));
    this.cam.fov = Math.min(70, THREE.MathUtils.radToDeg(vfov));
    this.cam.updateProjectionMatrix();
  }

  snap() {
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
    this.cam.updateMatrixWorld();
  }

  update(dt: number, mode: CamMode, m: Match | null) {
    this.t += dt;
    const P = new THREE.Vector3();
    const L = new THREE.Vector3();
    let rate = 3.2;
    let follow = false;

    if (mode === "select" || !m) {
      P.set(this.selectX, 1.3, 6.3);
      L.set(this.selectX, 0.68, 0);
      rate = 2.5;
    } else if (m.state === "goal" && m.lastScorer && m.stateT > 0.5) {
      const s = m.lastScorer.pos;
      // Stay inside the cage so the near wall doesn't fill the shot.
      P.set(s.x * 0.8 + Math.sin(this.t * 0.35) * 1.2, 2.1, Math.min(s.z + 4.8, HALF_W - 0.4));
      L.set(s.x, 1.05, s.z);
      rate = 2.2;
    } else if (m.state === "fulltime" || m.state === "over") {
      P.set(Math.sin(this.t * 0.15) * 5, 5.5, 12.5);
      L.set(0, 1, 0);
      rate = 1.2;
    } else if (m.state === "kickoff") {
      P.set(0, 9.5, 14.5);
      L.set(0, 0.4, -0.6);
      rate = 2;
    } else {
      // Follow the ball, leading it a little in the direction it's travelling.
      const b = m.ball.pos, bv = m.ball.vel;
      const fx = clamp(b.x + bv.x * 0.22, -(HALF_L - 4), HALF_L - 4);
      const fz = clamp(b.z + bv.z * 0.15, -HALF_W, HALF_W);
      P.set(fx, 7.6 + Math.min(b.y, 4) * 0.3, 11.4 + fz * 0.4);
      L.set(fx, 0.5, fz * 0.62 - 0.8);
      rate = 4;
      follow = true;
    }
    this.pos.set(damp(this.pos.x, P.x, rate, dt), damp(this.pos.y, P.y, rate, dt), damp(this.pos.z, P.z, rate, dt));
    this.look.set(damp(this.look.x, L.x, rate * 1.3, dt), damp(this.look.y, L.y, rate * 1.3, dt), damp(this.look.z, L.z, rate * 1.3, dt));
    // Scrolling the select line is already eased (and dragged 1:1), so follow it exactly.
    if (mode === "select") {
      this.pos.x = P.x;
      this.look.x = L.x;
    }
    this.snap();
    if (follow && m) this.keepOnScreen(m.ball.pos);
  }

  /**
   * Hard guarantee: if the easing let the ball drift outside the safe area
   * (a hard shot, a long ball), slide the camera so it's back inside.
   */
  private keepOnScreen(ball: THREE.Vector3) {
    const cam = this.cam;
    const v = this.v.copy(ball).applyMatrix4(cam.matrixWorldInverse); // view space
    if (v.z >= -0.5) return;
    const halfH = -v.z * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const halfW = halfH * cam.aspect;
    const nx = v.x / halfW, ny = v.y / halfH;
    const dx = nx > SAFE.right ? nx - SAFE.right : nx < SAFE.left ? nx - SAFE.left : 0;
    const dy = ny > SAFE.top ? ny - SAFE.top : ny < SAFE.bottom ? ny - SAFE.bottom : 0;
    if (!dx && !dy) return;
    // Slide parallel to the screen: exact for anything at the ball's depth.
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const shift = right.multiplyScalar(dx * halfW).addScaledVector(up, dy * halfH);
    this.pos.add(shift);
    this.look.add(shift);
    this.snap();
  }

  /** Where the ball is on screen (normalised device coords), for checks. */
  ballNdc(ball: THREE.Vector3) {
    return this.v.copy(ball).project(this.cam);
  }

  /** Jump straight to a mode's framing (no easing). */
  cut(mode: CamMode, m: Match | null) {
    for (let i = 0; i < 60; i++) this.update(0.1, mode, m);
  }
}
