/**
 * Touch controls (floating stick on the left half, buttons bottom-right) and
 * keyboard for desktop: WASD/arrows, Shift sprint (hold), J pass/switch, K or
 * Space shoot/tackle (hold to power up), L skill.
 */
import type { Pad } from "../game/match";

export class Input {
  private stick = { x: 0, y: 0 };
  private stickId: number | null = null;
  private origin = { x: 0, y: 0 };
  private keys = new Set<string>();
  private edges = { pass: false, shootDown: false, shootUp: false, skill: false };
  private shootHeld = false;
  private sprintHeld = false;
  private enabled = false;

  readonly root: HTMLElement;
  private zone: HTMLElement;
  private base: HTMLElement;
  private knob: HTMLElement;
  readonly buttons: HTMLElement;
  private bShoot: HTMLElement;
  private bPass: HTMLElement;
  private bSkill: HTMLElement;
  private bSprint: HTMLElement;
  private ring: HTMLElement;
  private tank: SVGCircleElement;

  constructor(parent: HTMLElement, private onPress: () => void) {
    this.root = document.createElement("div");
    this.root.className = "layer";
    this.root.innerHTML = `
      <div id="stickzone"><div class="stick idle"><i></i></div></div>
      <div id="buttons">
        <button class="pad display" id="b-sprint"><span>Sprint</span><svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" fill="none" stroke="#4ade80" stroke-width="6" stroke-dasharray="296 296" stroke-linecap="round" transform="rotate(-90 50 50)"/></svg></button>
        <button class="pad display" id="b-skill">Skill</button>
        <button class="pad display" id="b-pass">Pass</button>
        <button class="pad display" id="b-shoot"><span>Shoot</span><svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" fill="none" stroke="#fde68a" stroke-width="6" stroke-dasharray="0 296" stroke-linecap="round" transform="rotate(-90 50 50)"/></svg></button>
      </div>`;
    parent.appendChild(this.root);
    const q = <T extends HTMLElement>(s: string) => this.root.querySelector(s) as T;
    this.zone = q("#stickzone");
    this.base = q(".stick");
    this.knob = q(".stick i");
    this.buttons = q("#buttons");
    this.bShoot = q("#b-shoot");
    this.bPass = q("#b-pass");
    this.bSkill = q("#b-skill");
    this.bSprint = q("#b-sprint");
    this.ring = q("#b-shoot .ring");
    this.tank = this.root.querySelector("#b-sprint circle") as SVGCircleElement;
    this.resetStick();

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
    bind(this.bPass, () => { this.edges.pass = true; });
    bind(this.bSkill, () => { this.edges.skill = true; });
    bind(this.bSprint, () => { this.sprintHeld = true; }, () => { this.sprintHeld = false; });
    bind(this.bShoot, () => { this.edges.shootDown = true; this.shootHeld = true; }, () => {
      if (this.shootHeld) this.edges.shootUp = true;
      this.shootHeld = false;
    });

    addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (!this.enabled) return;
      if (k === "j") this.edges.pass = true;
      if (k === "l") this.edges.skill = true;
      if (k === "k" || k === " ") { this.edges.shootDown = true; this.shootHeld = true; }
    });
    addEventListener("keyup", (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if ((k === "k" || k === " ") && this.shootHeld) { this.edges.shootUp = true; this.shootHeld = false; }
    });
    addEventListener("blur", () => { this.keys.clear(); this.shootHeld = false; this.sprintHeld = false; });
  }

  private resetStick() {
    const r = this.zone.getBoundingClientRect();
    this.base.style.left = `${Math.max(90, r.width * 0.22)}px`;
    this.base.style.top = `${Math.max(120, r.height - 110)}px`;
    this.base.classList.add("idle");
    this.knob.style.transform = "";
  }

  private moveStick(x: number, y: number) {
    const R = 52;
    let dx = x - this.origin.x, dy = y - this.origin.y;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.min(1, d / R);
    this.stick = d > 4 ? { x: (dx / Math.max(d, 1)) * (m < 0.18 ? 0 : Math.min(1, m * 1.15)), y: (dy / Math.max(d, 1)) * (m < 0.18 ? 0 : Math.min(1, m * 1.15)) } : { x: 0, y: 0 };
  }

  /** Hide the controls without disabling them (celebrations, kick-off). */
  setVisible(on: boolean) {
    this.root.style.opacity = on ? "" : "0";
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.root.classList.toggle("hidden", !on);
    if (!on) { this.stick = { x: 0, y: 0 }; this.stickId = null; this.shootHeld = false; this.sprintHeld = false; this.resetStick(); }
  }

  /** Attack (has ball) vs defend button labels. */
  setMode(attacking: boolean) {
    this.buttons.classList.toggle("def", !attacking);
    this.bPass.textContent = attacking ? "Pass" : "Switch";
    (this.bShoot.firstChild as HTMLElement).textContent = attacking ? "Shoot" : "Tackle";
  }

  /** Stamina of the player you control, round the Sprint button (amber when winded). */
  setStamina(f: number, winded: boolean) {
    this.tank.setAttribute("stroke-dasharray", `${(f * 296).toFixed(0)} 296`);
    this.tank.setAttribute("stroke", winded ? "#f59e0b" : "#4ade80");
    this.bSprint.classList.toggle("winded", winded);
  }

  setCharge(f: number) {
    const c = this.ring.querySelector("circle")!;
    c.setAttribute("stroke-dasharray", `${(f * 296).toFixed(0)} 296`);
  }

  read(): Pad {
    let x = this.stick.x, y = this.stick.y;
    const k = this.keys;
    const kx = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
    const ky = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0);
    if (kx || ky) { const l = Math.hypot(kx, ky); x = kx / l; y = ky / l; }
    const pad: Pad = {
      move: { x, z: y },
      pass: this.edges.pass,
      shootDown: this.edges.shootDown,
      shootHeld: this.shootHeld,
      shootUp: this.edges.shootUp,
      skill: this.edges.skill,
      sprint: this.sprintHeld || k.has("shift"),
    };
    this.edges = { pass: false, shootDown: false, shootUp: false, skill: false };
    return pad;
  }
}
