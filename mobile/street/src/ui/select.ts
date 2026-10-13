/**
 * Team select: the six players stand on the pitch in 3D. Tap three for your
 * side (they switch to the purple home kit); the rest play for the CPU in black.
 */
import * as THREE from "three";
import { DIFFICULTIES, type Difficulty } from "../game/match";
import type { PlayerModel } from "../rig/model";
import { Animator, cheer, idle } from "../rig/pose";
import { overall, type RosterPlayer } from "../roster";

const PICK_KEY = "street.pick";
const DIFF_KEY = "street.difficulty";
const SPACING = 1.42;

interface Slot {
  p: RosterPlayer;
  model: PlayerModel;
  anim: Animator;
  hit: THREE.Mesh;
  tag: HTMLElement;
  home: boolean;
  hop: number;
}

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

export class Select {
  readonly root: HTMLElement;
  private slots: Slot[] = [];
  /** Home picks in the order they were made; the oldest is bumped when a fourth is tapped. */
  private order: Slot[] = [];
  private diff: Difficulty;
  private play: HTMLButtonElement;
  private hint: HTMLElement;
  private ray = new THREE.Raycaster();
  private t = 0;
  private active = false;

  constructor(
    parent: HTMLElement,
    roster: RosterPlayer[],
    models: Map<string, PlayerModel>,
    private camera: THREE.Camera,
    inApp: boolean,
    private onPlay: (home: RosterPlayer[], away: RosterPlayer[], d: Difficulty) => void,
    onExit: () => void,
    onTap: () => void,
  ) {
    this.root = document.createElement("div");
    this.root.className = "layer hidden";
    this.root.id = "select";
    this.root.innerHTML = `
      <div class="title">
        <div class="logo display">5IVE STREET<small>3V3 · PICK YOUR SQUAD</small></div>
        <div style="display:flex;gap:10px;align-items:center">
          <div class="hint"></div>
          ${inApp ? `<button class="btn ghost exit" style="padding:8px 14px;font-size:15px">Exit</button>` : ""}
        </div>
      </div>
      <div class="tags"></div>
      <div class="bar">
        <div class="seg"></div>
        <button class="btn play">Play</button>
      </div>`;
    parent.appendChild(this.root);
    this.hint = this.root.querySelector(".hint")!;
    this.play = this.root.querySelector(".play")!;
    this.root.querySelector(".exit")?.addEventListener("click", onExit);

    const savedDiff = load<string>(DIFF_KEY, "pro");
    this.diff = DIFFICULTIES.find((d) => d.id === savedDiff) ?? DIFFICULTIES[1];
    const seg = this.root.querySelector(".seg")!;
    for (const d of DIFFICULTIES) {
      const b = document.createElement("button");
      b.textContent = d.label;
      b.classList.toggle("on", d === this.diff);
      b.addEventListener("click", () => {
        this.diff = d;
        save(DIFF_KEY, d.id);
        seg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
        onTap();
      });
      seg.appendChild(b);
    }

    const picked = load<string[]>(PICK_KEY, roster.slice(0, 3).map((p) => p.key));
    const tags = this.root.querySelector(".tags")!;
    roster.forEach((p, i) => {
      const model = models.get(p.key)!;
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 1;
      hit.userData.slot = i;
      model.root.add(hit);
      const tag = document.createElement("div");
      tag.className = "tag display";
      const s = p.stats;
      // Their two best attributes.
      const best = (Object.entries({ PAC: s.pace, SHO: s.shooting, PAS: s.passing, DRI: s.dribbling, DEF: s.defending, PHY: s.physical }) as [string, number][])
        .sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} <b>${v}</b>`).join(" · ");
      tag.innerHTML = `
        <div class="nm">${p.name}</div>
        <span class="ovr">${overall(s)}</span><span class="side"></span>
        <div class="best">${best}</div>`;
      tags.appendChild(tag);
      this.slots.push({ p, model, anim: new Animator(model), hit, tag, home: picked.includes(p.key), hop: 0 });
    });
    if (this.slots.filter((s) => s.home).length !== 3) this.slots.forEach((s, i) => { s.home = i < 3; });
    this.order = this.slots.filter((s) => s.home);

    this.root.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const i = this.pick(e.clientX, e.clientY);
      if (i === null) return;
      onTap();
      this.toggle(i);
    });
    this.play.addEventListener("click", () => {
      const home = this.slots.filter((s) => s.home).map((s) => s.p);
      if (home.length !== 3) return;
      save(PICK_KEY, home.map((p) => p.key));
      this.onPlay(home, this.slots.filter((s) => !s.home).map((s) => s.p), this.diff);
    });
  }

  private pick(x: number, y: number): number | null {
    const ndc = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hits = this.ray.intersectObjects(this.slots.map((s) => s.hit), false);
    return hits.length ? (hits[0].object.userData.slot as number) : null;
  }

  private toggle(i: number) {
    const s = this.slots[i];
    if (!s.home && this.order.length >= 3) {
      const out = this.order.shift()!;
      out.home = false;
      out.model.setKit("black");
    }
    s.home = !s.home;
    this.order = s.home ? [...this.order, s] : this.order.filter((x) => x !== s);
    s.model.setKit(s.home ? "home" : "black");
    s.hop = 0.9;
    this.refresh();
  }

  private refresh() {
    const n = this.slots.filter((s) => s.home).length;
    this.play.disabled = n !== 3;
    this.hint.textContent = n === 3 ? "Tap a player to swap sides" : `Pick ${3 - n} more`;
    for (const s of this.slots) {
      s.tag.classList.toggle("home", s.home);
      s.tag.classList.toggle("away", !s.home);
      (s.tag.querySelector(".side") as HTMLElement).textContent = s.home ? "YOU" : "CPU";
    }
  }

  show() {
    this.active = true;
    this.root.classList.remove("hidden");
    const n = this.slots.length;
    this.slots.forEach((s, i) => {
      s.model.root.visible = true;
      s.model.root.position.set((i - (n - 1) / 2) * SPACING, 0, 0);
      s.model.root.rotation.set(0, 0, 0);
      s.model.setKit(s.home ? "home" : "black");
      s.model.setGlow(false);
      s.hit.visible = true;
      idle(s.anim.target, i);
      s.anim.snap();
    });
    this.refresh();
  }

  hide() {
    this.active = false;
    this.root.classList.add("hidden");
    for (const s of this.slots) s.hit.visible = false;
  }

  update(dt: number) {
    if (!this.active) return;
    this.t += dt;
    const v = new THREE.Vector3();
    for (const [i, s] of this.slots.entries()) {
      if (s.hop > 0) { s.hop -= dt; cheer(s.anim.target, 0.9 - s.hop); }
      else idle(s.anim.target, this.t + i * 1.3);
      // Turn a little toward the camera's centre.
      s.model.root.rotation.y = -s.model.root.position.x * 0.06;
      s.anim.update(dt, 10);
      v.set(s.model.root.position.x, -0.05, 0.3).project(this.camera);
      s.tag.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
      s.tag.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
    }
  }
}
