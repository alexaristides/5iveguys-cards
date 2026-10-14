/**
 * Touch controls (floating stick on the left half, buttons bottom-right) and
 * keyboard for desktop: WASD/arrows, Shift sprint (hold), J pass/switch and K or
 * Space shoot/tackle (hold either to power up), L skill.
 *
 * The stick is analogue: a half push walks, further runs, and pushed right out
 * to the rim it sprints (the ring round it is the stamina).
 */
import type { Pad } from "../game/match";

/** Stick radius (px), and how far out (share of it) sprinting starts and stops. */
const R = 52;
const SPRINT_ON = 0.92;
const SPRINT_OFF = 0.8;

export class Input {
  private stick = { x: 0, y: 0 };
  private stickSprint = false;
  private stickId: number | null = null;
  private origin = { x: 0, y: 0 };
  private keys = new Set<string>();
  private edges = { passDown: false, passUp: false, shootDown: false, shootUp: false, skill: false };
  private passHeld = false;
  private shootHeld = false;
  private enabled = false;

  readonly root: HTMLElement;
  private zone: HTMLElement;
  private base: HTMLElement;
  private knob: HTMLElement;
  private tank: SVGCircleElement;
  readonly buttons: HTMLElement;
  private bShoot: HTMLElement;
  private bPass: HTMLElement;
  private bSkill: HTMLElement;
  private shootRing: SVGCircleElement;
  private passRing: SVGCircleElement;

  constructor(parent: HTMLElement, private onPress: () => void) {
    const ring = (color: string, full = false) =>
      `<svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" fill="none" stroke="${color}" stroke-width="6" stroke-dasharray="${full ? 296 : 0} 296" stroke-linecap="round" transform="rotate(-90 50 50)"/></svg>`;
    this.root = document.createElement("div");
    this.root.className = "layer";
    this.root.innerHTML = `
      <div id="stickzone"><div class="stick idle">${ring("#4ade80", true)}<i></i></div></div>
      <div id="buttons">
        <button class="pad display" id="b-skill">Skill</button>
        <button class="pad display" id="b-pass"><span>Pass</span>${ring("#93c5fd")}</button>
        <button class="pad display" id="b-shoot"><span>Shoot</span>${ring("#fde68a")}</button>
      </div>`;
    parent.appendChild(this.root);
    const q = <T extends Element>(s: string) => this.root.querySelector(s) as T;
    this.zone = q("#stickzone");
    this.base = q(".stick");
    this.knob = q(".stick i");
    this.tank = q(".stick circle");
    this.buttons = q("#buttons");
    this.bShoot = q("#b-shoot");
    this.bPass = q("#b-pass");
    this.bSkill = q("#b-skill");
    this.shootRing = q("#b-shoot circle");
    this.passRing = q("#b-pass circle");
    this.resetStick();

    // iOS ignores user-scalable=no and touch-action for its own gestures: a double
    // tap zooms the page, two thumbs down reads as a pinch, and a long press wants to
    // select. Any of those cancels the touch (dropping the stick or a held button).
    // Cancelling the touch events stops them; the pointer events we use still arrive.
    const block = (e: Event) => { if (e.cancelable) e.preventDefault(); };
    for (const el of [this.zone, this.buttons]) {
      for (const type of ["touchstart", "touchmove", "touchend"]) el.addEventListener(type, block, { passive: false });
    }
    for (const type of ["gesturestart", "gesturechange", "dblclick"]) document.addEventListener(type, block, { passive: false });

    this.zone.addEventListener("pointerdown", (e) => {
      if (this.stickId !== null) return;
      this.stickId = e.pointerId;
      this.zone.setPointerCapture(e.pointerId);
      const r = this.zone.getBoundingClientRect();
      this.origin = { x: e.clientX, y: e.clientY };
      this.base.style.left = `${e.clientX - r.left}px`;
      this.base.style.top = `${e.clientY - r.top}px`;
      this.base.classList.remove("idle");
      this.moveStick(e.clientX, e.clientY);
      this.onPress();
    });
    this.zone.addEventListener("pointermove", (e) => {
      if (e.pointerId === this.stickId) this.moveStick(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.stick = { x: 0, y: 0 };
      this.stickSprint = false;
      this.resetStick();
    };
    this.zone.addEventListener("pointerup", end);
    this.zone.addEventListener("pointercancel", end);

    const bind = (el: HTMLElement, down: () => void, up?: () => void) => {
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add("down");
        this.onPress();
        if (this.enabled) down();
      });
      const release = () => { el.classList.remove("down"); if (this.enabled) up?.(); };
      el.addEventListener("pointerup", release);
      el.addEventListener("pointercancel", release);
    };
    const passDown = () => { this.edges.passDown = true; this.passHeld = true; };
    const passUp = () => { if (this.passHeld) this.edges.passUp = true; this.passHeld = false; };
    const shootDown = () => { this.edges.shootDown = true; this.shootHeld = true; };
    const shootUp = () => { if (this.shootHeld) this.edges.shootUp = true; this.shootHeld = false; };
    bind(this.bPass, passDown, passUp);
    bind(this.bSkill, () => { this.edges.skill = true; });
    bind(this.bShoot, shootDown, shootUp);

    addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (!this.enabled) return;
      if (k === "j") passDown();
      if (k === "l") this.edges.skill = true;
      if (k === "k" || k === " ") shootDown();
    });
    addEventListener("keyup", (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === "j") passUp();
      if (k === "k" || k === " ") shootUp();
    });
    addEventListener("blur", () => { this.keys.clear(); this.shootHeld = false; this.passHeld = false; });
  }

  private resetStick() {
    const r = this.zone.getBoundingClientRect();
    this.base.style.left = `${Math.max(90, r.width * 0.22)}px`;
    this.base.style.top = `${Math.max(120, r.height - 110)}px`;
    this.base.classList.add("idle");
    this.knob.style.transform = "";
  }

  private moveStick(x: number, y: number) {
    let dx = x - this.origin.x, dy = y - this.origin.y;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // How far it's pushed (0..1, small dead zone); out at the rim it sprints.
    const m = Math.min(1, d / R);
    const tilt = m < 0.15 ? 0 : m;
    this.stick = tilt ? { x: (dx / d) * tilt, y: (dy / d) * tilt } : { x: 0, y: 0 };
    this.stickSprint = m >= (this.stickSprint ? SPRINT_OFF : SPRINT_ON);
  }

  /** Hide the controls without disabling them (celebrations, kick-off). */
  setVisible(on: boolean) {
    this.root.style.opacity = on ? "" : "0";
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.root.classList.toggle("hidden", !on);
    if (!on) {
      this.stick = { x: 0, y: 0 };
      this.stickSprint = false;
      this.stickId = null;
      this.shootHeld = false;
      this.passHeld = false;
      this.resetStick();
    }
  }

  /** Attack (has ball) vs defend button labels. */
  setMode(attacking: boolean) {
    this.buttons.classList.toggle("def", !attacking);
    (this.bPass.firstChild as HTMLElement).textContent = attacking ? "Pass" : "Switch";
    (this.bShoot.firstChild as HTMLElement).textContent = attacking ? "Shoot" : "Tackle";
  }

  /**
   * Stamina of the player you control, as the ring round the stick (shown once it
   * isn't full; amber when winded). The stick glows while they're sprinting.
   */
  setStamina(f: number, winded: boolean, sprinting: boolean) {
    this.tank.setAttribute("stroke-dasharray", `${(f * 296).toFixed(0)} 296`);
    this.tank.setAttribute("stroke", winded ? "#f59e0b" : "#4ade80");
    this.base.classList.toggle("tired", f < 0.995);
    this.base.classList.toggle("sprint", sprinting);
  }

  /** Power rings: how long Shoot / Pass have been held (0..1). */
  setCharge(shot: number, pass: number) {
    this.shootRing.setAttribute("stroke-dasharray", `${(shot * 296).toFixed(0)} 296`);
    this.passRing.setAttribute("stroke-dasharray", `${(pass * 296).toFixed(0)} 296`);
  }

  read(): Pad {
    let x = this.stick.x, y = this.stick.y;
    const k = this.keys;
    const kx = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
    const ky = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0);
    const keyboard = kx !== 0 || ky !== 0;
    if (keyboard) { const l = Math.hypot(kx, ky); x = kx / l; y = ky / l; }
    const pad: Pad = {
      move: { x, z: y },
      passDown: this.edges.passDown,
      passHeld: this.passHeld,
      passUp: this.edges.passUp,
      shootDown: this.edges.shootDown,
      shootHeld: this.shootHeld,
      shootUp: this.edges.shootUp,
      skill: this.edges.skill,
      sprint: keyboard ? k.has("shift") : this.stickSprint,
    };
    this.edges = { passDown: false, passUp: false, shootDown: false, shootUp: false, skill: false };
    return pad;
  }
}
