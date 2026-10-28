/**
 * Team select: the whole squad stands in a line on the pitch in 3D. Drag (or
 * use the arrows) to walk along the line, and tap players to pick three for
 * your side (purple home kit) and three for the CPU (black kit). Picked
 * players step forward; everyone else waits on the bench.
 *
 * Online, each person picks three for their own side from the same squad (the
 * room's host settles who got a player first) and says when they're ready.
 */
import * as THREE from "three";
import { DIFFICULTIES, type Difficulty } from "../game/match";
import { KITS } from "../rig/kits";
import type { PlayerModel } from "../rig/model";
import { Animator, cheer, idle } from "../rig/pose";
import { overall, type RosterPlayer } from "../roster";

const PICK_KEY = "street.pick";
const CPU_KEY = "street.cpu";
const DIFF_KEY = "street.difficulty";
const SPACING = 1.42;
/** How far picked players step out of the line toward the camera. */
const STEP_OUT = 0.45;
/** Camera distance from the line (matches CameraRig's select framing). */
const VIEW_DIST = 6.3;
/** Top speed of a flick along the line (m/s). */
const MAX_FLING = 14;

type Side = 0 | 1;
const SIDE_LABEL: [string, string] = ["YOU", "CPU"];

/** Picking online against someone else. */
export interface OnlineDraft {
  /** The side this screen picks for (the host is home). */
  side: Side;
  /** Tag labels for the two sides, e.g. ["YOU", "ALEX"]. */
  labels: [string, string];
  /** The other person's name. */
  opponent: string;
  /** A player was tapped (the host decides what happens). */
  tap(key: string): void;
  ready(on: boolean): void;
  leave(): void;
}

interface Slot {
  p: RosterPlayer;
  model: PlayerModel;
  anim: Animator;
  hit: THREE.Mesh;
  ring: THREE.Mesh;
  tag: HTMLElement;
  x: number;
  side: Side | null;
  /** Eased step out of the line (0..1). */
  out: number;
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

function tagHtml(p: RosterPlayer) {
  const s = p.stats;
  // Their two best attributes.
  const best = (Object.entries({ PAC: s.pace, SHO: s.shooting, PAS: s.passing, DRI: s.dribbling, DEF: s.defending, PHY: s.physical }) as [string, number][])
    .sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} <b>${v}</b>`).join(" · ");
  return `
    <div class="nm">${p.name}</div>
    <span class="ovr">${overall(s)}</span><span class="side"></span>
    <div class="best">${best}</div>`;
}

export class Select {
  readonly root: HTMLElement;
  /** Camera x along the line; CameraRig frames the select screen around it. */
  viewX = 0;
  /** Dev: keep every model visible (the face sheet renders them all). */
  cull = true;
  private slots: Slot[] = [];
  /** Picks per side in the order they were made; the oldest is bumped when a fourth is tapped. */
  private order: [Slot[], Slot[]] = [[], []];
  /** Which side taps currently fill. */
  private picking: Side = 0;
  private diff: Difficulty;
  private play: HTMLButtonElement;
  private exit: HTMLButtonElement;
  private exitLabel: string;
  private hint: HTMLElement;
  private online: OnlineDraft | null = null;
  private ready: [boolean, boolean] = [false, false];
  /** A short message in place of the hint (e.g. that player's taken). */
  private note: { text: string; until: number } | null = null;
  private sideBtns: HTMLButtonElement[] = [];
  private arrows: HTMLButtonElement[];
  private ray = new THREE.Raycaster();
  private t = 0;
  private active = false;
  private targetX = 0;
  private vel = 0;
  private drag: { id: number; x0: number; y0: number; view0: number; moved: boolean; lastX: number; lastT: number } | null = null;

  constructor(
    parent: HTMLElement,
    roster: RosterPlayer[],
    models: Map<string, PlayerModel>,
    private camera: THREE.PerspectiveCamera,
    inApp: boolean,
    private onPlay: (home: RosterPlayer[], away: RosterPlayer[], d: Difficulty) => void,
    onExit: () => void,
    private onTap: () => void,
    onOnline: () => void,
    onStory: () => void,
  ) {
    this.root = document.createElement("div");
    this.root.className = "layer hidden";
    this.root.id = "select";
    this.root.innerHTML = `
      <div class="title">
        <div class="logo display">5IVE STREET<small>3V3 · PICK YOUR SQUAD</small></div>
        <div class="seg sides"></div>
        <div style="display:flex;gap:10px;align-items:center">
          <div class="hint"></div>
          <button class="btn ghost exit" style="padding:8px 14px;font-size:15px">${inApp ? "Exit" : "Back"}</button>
        </div>
      </div>
      <div class="tags"></div>
      <button class="arrow prev" aria-label="Previous players">‹</button>
      <button class="arrow next" aria-label="More players">›</button>
      <div class="bar">
        <div class="seg diff"></div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn ghost go-story" style="padding:10px 14px;font-size:15px">Story</button>
          <button class="btn ghost go-online" style="padding:10px 14px;font-size:15px">Online</button>
          <button class="btn ghost random" style="padding:10px 14px;font-size:15px">Random CPU</button>
          <button class="btn play">Play</button>
        </div>
      </div>`;
    parent.appendChild(this.root);
    this.hint = this.root.querySelector(".hint")!;
    this.play = this.root.querySelector(".play")!;
    this.arrows = [this.root.querySelector(".prev")!, this.root.querySelector(".next")!];
    this.exit = this.root.querySelector(".exit")!;
    this.exitLabel = inApp ? "Exit" : "Back";
    this.exit.addEventListener("click", () => (this.online ? this.online.leave() : onExit()));
    this.root.querySelector(".go-online")!.addEventListener("click", () => { onTap(); onOnline(); });
    this.root.querySelector(".go-story")!.addEventListener("click", () => { onTap(); onStory(); });

    const savedDiff = load<string>(DIFF_KEY, "pro");
    this.diff = DIFFICULTIES.find((d) => d.id === savedDiff) ?? DIFFICULTIES[1];
    const seg = this.root.querySelector(".diff")!;
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

    const sides = this.root.querySelector(".sides")!;
    for (const side of [0, 1] as Side[]) {
      const b = document.createElement("button");
      b.className = side === 0 ? "home" : "away";
      b.addEventListener("click", () => {
        if (this.online) return;
        this.picking = side;
        onTap();
        this.refresh();
      });
      sides.appendChild(b);
      this.sideBtns.push(b);
    }

    const tags = this.root.querySelector(".tags")!;
    const n = roster.length;
    roster.forEach((p, i) => {
      const model = models.get(p.key)!;
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 1;
      hit.userData.slot = i;
      model.root.add(hit);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.52, 40),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      ring.visible = false;
      model.root.add(ring);
      const tag = document.createElement("div");
      tag.className = "tag display";
      tag.innerHTML = tagHtml(p);
      tags.appendChild(tag);
      this.slots.push({ p, model, anim: new Animator(model), hit, ring, tag, x: (i - (n - 1) / 2) * SPACING, side: null, out: 0, hop: 0 });
    });

    this.restoreSaved();

    this.root.addEventListener("pointerdown", (e) => this.down(e));
    this.root.addEventListener("pointermove", (e) => this.move(e));
    this.root.addEventListener("pointerup", (e) => this.up(e));
    this.root.addEventListener("pointercancel", () => { this.drag = null; });
    // Trackpads and mouse wheels scroll the line too (development in a browser).
    this.root.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.targetX = this.clampX(this.targetX + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * this.metresPerPx());
      this.vel = 0;
    }, { passive: false });
    this.arrows.forEach((b, i) => b.addEventListener("click", () => {
      onTap();
      this.vel = 0;
      this.targetX = this.clampX(this.targetX + (i ? 1 : -1) * this.viewWidth() * 0.75);
    }));
    this.root.querySelector(".random")!.addEventListener("click", () => {
      onTap();
      this.randomCpu();
    });
    this.play.addEventListener("click", () => {
      if (this.online) {
        onTap();
        this.online.ready(!this.ready[this.online.side]);
        return;
      }
      const [home, away] = this.order;
      if (home.length !== 3 || away.length !== 3) return;
      save(PICK_KEY, home.map((s) => s.p.key));
      save(CPU_KEY, away.map((s) => s.p.key));
      this.onPlay(home.map((s) => s.p), away.map((s) => s.p), this.diff);
    });
  }

  // ── Picking ───────────────────────────────────────────────────────────────

  /** The last teams played (falling back to the first six in the line-up). */
  private restoreSaved() {
    for (const s of this.slots) s.side = null;
    this.order = [[], []];
    const byKey = new Map(this.slots.map((s) => [s.p.key, s]));
    const restore = (key: string, fallback: Slot[]) => {
      const keys = load<string[]>(key, []);
      const picked = keys.map((k) => byKey.get(k)).filter((s): s is Slot => !!s);
      return picked.length === 3 && new Set(picked).size === 3 ? picked : fallback;
    };
    const home = restore(PICK_KEY, this.slots.slice(0, 3));
    let away = restore(CPU_KEY, this.slots.slice(3, 6)).filter((s) => !home.includes(s));
    if (away.length !== 3) away = this.slots.filter((s) => !home.includes(s)).slice(0, 3);
    for (const s of home) this.assign(s, 0);
    for (const s of away) this.assign(s, 1);
    this.picking = 0;
  }

  /** Your last three (to start an online draft with). */
  savedPicks(): string[] {
    return load<string[]>(PICK_KEY, []);
  }

  /** Remember the three you played online with, for next time. */
  savePicks(keys: string[]) {
    if (keys.length === 3) save(PICK_KEY, keys);
  }

  /** Switch to picking online against someone (null: back to playing the CPU). */
  setOnline(d: OnlineDraft | null) {
    this.online = d;
    this.ready = [false, false];
    this.note = null;
    this.root.classList.toggle("online", !!d);
    this.exit.textContent = d ? "Leave" : this.exitLabel;
    if (d) {
      this.picking = d.side;
      this.setTeams([], [], [false, false]);
    } else {
      this.restoreSaved();
      this.refresh();
    }
  }

  /** Online: the teams as the host has them. */
  setTeams(home: string[], away: string[], ready: [boolean, boolean]) {
    const byKey = new Map(this.slots.map((s) => [s.p.key, s]));
    const was = new Map(this.slots.map((s) => [s, s.side]));
    for (const s of this.slots) s.side = null;
    this.order = [[], []];
    ([home, away] as const).forEach((keys, side) => {
      for (const k of keys) {
        const s = byKey.get(k);
        if (!s || s.side !== null) continue;
        s.side = side as Side;
        this.order[side].push(s);
        if (was.get(s) !== side) s.hop = 0.9;
      }
    });
    this.ready = ready;
    this.refresh();
  }

  /** Online: the players picked for each side, by key. */
  teams(): [string[], string[]] {
    return [this.order[0].map((s) => s.p.key), this.order[1].map((s) => s.p.key)];
  }

  /** Online: show who you're playing (scroll to their picks). */
  lookAt(side: Side) {
    const o = this.order[side];
    if (!o.length) return;
    this.targetX = this.clampX(o.reduce((a, s) => a + s.x, 0) / o.length);
    this.vel = 0;
  }

  flash(text: string) {
    this.note = { text, until: performance.now() + 1800 };
    this.refresh();
  }

  /** Put a player on a side (or the bench), bumping that side's oldest pick if it's full. */
  private assign(s: Slot, side: Side | null) {
    if (s.side !== null) this.order[s.side] = this.order[s.side].filter((x) => x !== s);
    if (side !== null && this.order[side].length >= 3) {
      const out = this.order[side].shift()!;
      out.side = null;
    }
    s.side = side;
    if (side !== null) this.order[side].push(s);
  }

  private tap(i: number) {
    const s = this.slots[i];
    if (this.online) {
      const mine = this.online.side;
      if (s.side !== null && s.side !== mine) this.flash(`${this.online.opponent} has ${s.p.name}`);
      else this.online.tap(s.p.key);
      return;
    }
    const side = this.picking;
    this.assign(s, s.side === side ? null : side);
    if (s.side !== null) s.hop = 0.9;
    // Once your three are in, move on to the CPU's (and back if the CPU's are done first).
    const other: Side = side === 0 ? 1 : 0;
    if (s.side === side && this.order[side].length === 3 && this.order[other].length < 3) this.picking = other;
    this.refresh();
  }

  private randomCpu() {
    const pool = this.slots.filter((s) => s.side !== 0);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (const s of [...this.order[1]]) this.assign(s, null);
    for (const s of pool.slice(0, 3)) {
      this.assign(s, 1);
      s.hop = 0.9;
    }
    if (this.order[0].length < 3) this.picking = 0;
    this.refresh();
    // Show who you're playing.
    this.targetX = this.clampX(this.order[1].reduce((a, s) => a + s.x, 0) / 3);
    this.vel = 0;
  }

  /** Stats changed (fan ratings arrived on the website): redraw the name tags. */
  refreshStats() {
    for (const s of this.slots) s.tag.innerHTML = tagHtml(s.p);
    this.refresh();
  }

  private refresh() {
    const counts = this.order.map((o) => o.length);
    const ready = counts[0] === 3 && counts[1] === 3;
    const labels = this.online?.labels ?? SIDE_LABEL;
    this.play.disabled = !ready;
    this.sideBtns.forEach((b, side) => {
      b.textContent = `${labels[side]} ${counts[side]}/3${this.online && this.ready[side] ? " ✓" : ""}`;
      b.classList.toggle("on", side === this.picking);
    });
    if (this.online) {
      // Your three, then ready; the match starts once you both are.
      const me = this.online.side, them: Side = me === 0 ? 1 : 0;
      const opp = this.online.opponent;
      this.play.disabled = counts[me] !== 3;
      this.play.textContent = this.ready[me] ? "Ready ✓" : "Ready";
      this.play.classList.toggle("on", this.ready[me]);
      this.hint.textContent = this.note && this.note.until > performance.now() ? this.note.text
        : counts[me] < 3 ? `Pick ${3 - counts[me]} more · ${opp} picks from the same squad`
        : !this.ready[me] ? "Tap Ready when you're happy"
        : counts[them] < 3 || !this.ready[them] ? `Waiting for ${opp}…` : "Kick off!";
    } else {
      this.play.textContent = "Play";
      this.play.classList.remove("on");
      // Point at the side that still needs players, preferring the one being picked.
      const need: Side = counts[this.picking] < 3 ? this.picking : this.picking === 0 ? 1 : 0;
      this.hint.textContent = ready ? "Tap to swap players" : `Pick ${3 - counts[need]} more for ${need === 0 ? "you" : "the CPU"}`;
    }
    for (const s of this.slots) {
      s.tag.classList.toggle("home", s.side === 0);
      s.tag.classList.toggle("away", s.side === 1);
      s.tag.classList.toggle("bench", s.side === null);
      (s.tag.querySelector(".side") as HTMLElement).textContent = s.side === null ? "" : labels[s.side];
      s.model.setKit(s.side === 1 ? "black" : "home");
      s.ring.visible = s.side !== null;
      if (s.side !== null) (s.ring.material as THREE.MeshBasicMaterial).color.set(s.side === 0 ? KITS.home.hud : KITS.black.hud);
    }
  }

  // ── Scrolling the line ────────────────────────────────────────────────────

  /** Width of the line in view at the players' depth (metres). */
  private viewWidth() {
    const halfV = THREE.MathUtils.degToRad(this.camera.fov / 2);
    return 2 * VIEW_DIST * Math.tan(halfV) * this.camera.aspect;
  }
  private metresPerPx() {
    return this.viewWidth() / innerWidth;
  }
  private clampX(x: number) {
    const ends = this.slots.length ? this.slots[this.slots.length - 1].x : 0;
    const room = Math.max(0, ends - this.viewWidth() / 2 + SPACING * 0.75);
    return THREE.MathUtils.clamp(x, -room, room);
  }

  private down(e: PointerEvent) {
    if ((e.target as HTMLElement).closest("button")) return;
    this.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, view0: this.targetX, moved: false, lastX: e.clientX, lastT: performance.now() };
    this.vel = 0;
  }

  private move(e: PointerEvent) {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 10) d.moved = true;
    if (!d.moved) return;
    const now = performance.now();
    const k = this.metresPerPx();
    this.targetX = this.clampX(d.view0 - (e.clientX - d.x0) * k);
    this.viewX = this.targetX;
    const dt = Math.max(1, now - d.lastT) / 1000;
    this.vel = THREE.MathUtils.clamp(THREE.MathUtils.lerp(this.vel, (-(e.clientX - d.lastX) * k) / dt, 0.5), -MAX_FLING, MAX_FLING);
    d.lastX = e.clientX;
    d.lastT = now;
  }

  private up(e: PointerEvent) {
    const d = this.drag;
    this.drag = null;
    if (!d || d.id !== e.pointerId) return;
    if (d.moved) return; // fling: `update` carries on with the velocity
    this.vel = 0;
    const i = this.pickAt(e.clientX, e.clientY);
    if (i === null) return;
    this.onTap();
    this.tap(i);
  }

  private pickAt(x: number, y: number): number | null {
    const ndc = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hits = this.ray.intersectObjects(this.slots.filter((s) => s.model.root.visible).map((s) => s.hit), false);
    return hits.length ? (hits[0].object.userData.slot as number) : null;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  show() {
    this.active = true;
    this.root.classList.remove("hidden");
    this.slots.forEach((s, i) => {
      s.out = s.side === null ? 0 : 1;
      s.model.root.visible = true;
      s.model.root.position.set(s.x, 0, s.out * STEP_OUT);
      s.model.root.rotation.set(0, 0, 0);
      s.model.setGlow(false);
      s.hit.visible = true;
      idle(s.anim.target, i);
      s.anim.snap();
    });
    // Start on your team.
    const mine = this.order[this.online?.side ?? 0];
    this.targetX = this.viewX = this.clampX(mine.length ? mine.reduce((a, s) => a + s.x, 0) / mine.length : 0);
    this.vel = 0;
    this.refresh();
  }

  hide() {
    this.active = false;
    this.root.classList.add("hidden");
    for (const s of this.slots) {
      s.hit.visible = false;
      s.ring.visible = false;
    }
  }

  update(dt: number) {
    if (!this.active) return;
    this.t += dt;

    // Fling, then ease toward the target.
    if (!this.drag && Math.abs(this.vel) > 0.01) {
      this.targetX = this.clampX(this.targetX + this.vel * dt);
      this.vel *= Math.exp(-5 * dt);
    }
    if (!this.drag) this.viewX += (this.targetX - this.viewX) * (1 - Math.exp(-9 * dt));
    if (this.note && this.note.until <= performance.now()) { this.note = null; this.refresh(); }
    const half = this.viewWidth() / 2;
    this.arrows[0].classList.toggle("hidden", this.targetX <= this.clampX(-Infinity) + 0.05);
    this.arrows[1].classList.toggle("hidden", this.targetX >= this.clampX(Infinity) - 0.05);

    const v = new THREE.Vector3();
    for (const [i, s] of this.slots.entries()) {
      // Only animate and draw the players near the view.
      const near = !this.cull || Math.abs(s.x - this.viewX) < half + 1.2;
      s.model.root.visible = near;
      s.tag.classList.toggle("hidden", !near);
      if (!near) continue;
      s.out += ((s.side === null ? 0 : 1) - s.out) * (1 - Math.exp(-8 * dt));
      s.model.root.position.z = s.out * STEP_OUT;
      if (s.hop > 0) { s.hop -= dt; cheer(s.anim.target, 0.9 - s.hop); }
      else idle(s.anim.target, this.t + i * 1.3);
      // Turn a little toward the camera.
      s.model.root.rotation.y = -(s.x - this.viewX) * 0.06;
      s.anim.update(dt, 10);
      v.set(s.x, -0.05, 0.3 + s.model.root.position.z).project(this.camera);
      s.tag.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
      s.tag.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
    }
  }
}
