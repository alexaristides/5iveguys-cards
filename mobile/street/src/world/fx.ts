/** Confetti for goals, dust from big tackles, stars over anyone knocked flat, and a glowing trail behind hard shots. */
import * as THREE from "three";
import { glowTexture } from "./arena";

const MAX = 260;

export class Fx {
  private conf: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private next = 0;

  private trail: THREE.Sprite[] = [];
  private trailAt = 0;
  private stars: THREE.Sprite[] = [];

  constructor(scene: THREE.Object3D) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    this.conf = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false }));
    this.conf.frustumCulled = false;
    scene.add(this.conf);
    this.pos.fill(-999);

    const tex = glowTexture();
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.visible = false;
      scene.add(s);
      this.trail.push(s);
    }
    for (let i = 0; i < 4 * 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: "#ffe14d", transparent: true, depthWrite: false }));
      s.scale.setScalar(0.2);
      s.visible = false;
      scene.add(s);
      this.stars.push(s);
    }
  }

  /** Stars circling over the heads of anyone seeing stars (call every frame; [] hides them). */
  dazed(heads: THREE.Vector3[], t: number) {
    this.stars.forEach((s, i) => {
      const h = heads[Math.floor(i / 4)];
      s.visible = !!h;
      if (!h) return;
      const a = t * 5 + (i % 4) * (Math.PI / 2);
      s.position.set(h.x + Math.cos(a) * 0.28, h.y + 0.3 + Math.sin(a * 2) * 0.04, h.z + Math.sin(a) * 0.28);
    });
  }

  /** Burst of particles; `power` < 1 for a small puff (tackle dust). */
  confetti(at: THREE.Vector3, colors: string[], count = 160, power = 1) {
    const c = new THREE.Color();
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      this.pos.set([at.x, at.y + 0.5, at.z], i * 3);
      const a = Math.random() * Math.PI * 2, up = (4 + Math.random() * 6) * power, out = (1 + Math.random() * 4) * Math.sqrt(power);
      this.vel.set([Math.cos(a) * out, up, Math.sin(a) * out], i * 3);
      c.set(colors[n % colors.length]);
      this.col.set([c.r, c.g, c.b], i * 3);
      this.life[i] = (2 + Math.random() * 1.2) * Math.sqrt(power);
    }
  }

  /** Call each frame; `shot` lights up the trail behind the ball. */
  update(dt: number, ball: THREE.Vector3, shot: boolean, color: string) {
    let alive = false;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      alive = true;
      this.life[i] -= dt;
      const j = i * 3;
      this.vel[j + 1] -= 9 * dt;
      this.vel[j] *= 1 - 1.2 * dt;
      this.vel[j + 2] *= 1 - 1.2 * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] = Math.max(0.03, this.pos[j + 1] + this.vel[j + 1] * dt);
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.life[i] <= 0) this.pos[j + 1] = -999;
    }
    if (alive) this.conf.geometry.attributes.position.needsUpdate = true;
    if (alive) this.conf.geometry.attributes.color.needsUpdate = true;

    this.trailAt += dt;
    if (shot && this.trailAt > 0.016) {
      this.trailAt = 0;
      const s = this.trail.pop()!;
      this.trail.unshift(s);
      s.position.copy(ball);
      s.visible = true;
      (s.material as THREE.SpriteMaterial).color.set(color);
    }
    this.trail.forEach((s, i) => {
      if (!s.visible) return;
      const f = 1 - i / this.trail.length;
      s.scale.setScalar(0.55 * f + 0.05);
      (s.material as THREE.SpriteMaterial).opacity = shot ? 0.75 * f : Math.max(0, (s.material as THREE.SpriteMaterial).opacity - dt * 3);
      if ((s.material as THREE.SpriteMaterial).opacity <= 0.01) s.visible = false;
    });
  }
}
