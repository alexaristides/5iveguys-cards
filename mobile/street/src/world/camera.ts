/** Broadcast-style camera that follows play, with close-ups for goals and the team select. */
import * as THREE from "three";
import { clamp, damp } from "../math";
import { HALF_W } from "../game/field";
import type { Match } from "../game/match";

export type CamMode = "select" | "match";

export class CameraRig {
  readonly cam: THREE.PerspectiveCamera;
  private pos = new THREE.Vector3(0, 9, 14);
  private look = new THREE.Vector3(0, 0.5, 0);
  private t = 0;

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
  }

  update(dt: number, mode: CamMode, m: Match | null) {
    this.t += dt;
    const P = new THREE.Vector3();
    const L = new THREE.Vector3();
    let rate = 3.2;

    if (mode === "select" || !m) {
      P.set(0, 1.3, 6.3);
      L.set(0, 0.78, 0);
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
      const b = m.ball.pos;
      const u = m.user.pos;
      const fx = clamp(b.x * 0.8 + u.x * 0.2, -5, 5);
      const fz = clamp(b.z, -HALF_W, HALF_W);
      P.set(fx, 7.7 + b.y * 0.15, 11.6 + fz * 0.22);
      L.set(fx, 0.5, fz * 0.45 - 0.9);
    }
    this.pos.set(damp(this.pos.x, P.x, rate, dt), damp(this.pos.y, P.y, rate, dt), damp(this.pos.z, P.z, rate, dt));
    this.look.set(damp(this.look.x, L.x, rate * 1.3, dt), damp(this.look.y, L.y, rate * 1.3, dt), damp(this.look.z, L.z, rate * 1.3, dt));
    this.snap();
  }

  /** Jump straight to a mode's framing (no easing). */
  cut(mode: CamMode, m: Match | null) {
    for (let i = 0; i < 60; i++) this.update(0.1, mode, m);
  }
}
