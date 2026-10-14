/** In-match HUD, pause menu and the full-time screen (DOM over the canvas). */
import type { Match } from "../game/match";
import type { Player } from "../game/player";
import { KITS, type KitId } from "../rig/kits";

const el = (html: string) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};

const fmtClock = (s: number) => {
  const c = Math.max(0, Math.ceil(s));
  return `${Math.floor(c / 60)}:${String(c % 60).padStart(2, "0")}`;
};

export class Hud {
  readonly root: HTMLElement;
  private hg: HTMLElement;
  private ag: HTMLElement;
  private clock: HTMLElement;
  private mh: HTMLElement;
  private ma: HTMLElement;
  private onball: HTMLElement;
  private me: HTMLElement;
  private meLabel: HTMLElement;
  private meTank: HTMLElement;
  private meName = "";
  private last = "";

  constructor(parent: HTMLElement, kits: [KitId, KitId], onPause: () => void) {
    this.root = el(`
      <div class="layer" id="hud">
        <button class="pause" aria-label="Pause">II</button>
        <div class="score display">
          <div class="team home"><span>${KITS[kits[0]].label}</span><span class="goals" data-h>0</span></div>
          <div class="clock" data-c>3:00</div>
          <div class="team away"><span class="goals" data-a>0</span><span>${KITS[kits[1]].label}</span></div>
        </div>
        <div class="meters"><div class="meter" data-mh><i></i></div><div class="meter away" data-ma><i></i></div></div>
        <div class="onball display hidden"></div>
        <div class="me display hidden"><span></span><i class="tank"><b></b></i></div>
      </div>`);
    parent.appendChild(this.root);
    this.hg = this.root.querySelector("[data-h]")!;
    this.ag = this.root.querySelector("[data-a]")!;
    this.clock = this.root.querySelector("[data-c]")!;
    this.mh = this.root.querySelector("[data-mh]")!;
    this.ma = this.root.querySelector("[data-ma]")!;
    this.onball = this.root.querySelector(".onball")!;
    this.me = this.root.querySelector(".me")!;
    this.meLabel = this.me.querySelector("span")!;
    this.meTank = this.me.querySelector(".tank")!;
    this.root.querySelector(".pause")!.addEventListener("click", onPause);
  }

  update(m: Match) {
    const owner = m.ball.owner;
    const key = `${m.score[0]}|${m.score[1]}|${Math.ceil(m.clock)}|${m.goldenGoal}|${m.meter[0].toFixed(2)}|${m.meter[1].toFixed(2)}|${m.fiveMode[0] > 0}|${m.fiveMode[1] > 0}|${owner?.name}`;
    if (key === this.last) return;
    this.last = key;
    this.hg.textContent = String(m.score[0]);
    this.ag.textContent = String(m.score[1]);
    this.clock.textContent = m.goldenGoal ? `GG ${fmtClock(m.clock)}` : fmtClock(m.clock);
    this.clock.classList.toggle("gg", m.goldenGoal);
    const meter = (node: HTMLElement, i: 0 | 1) => {
      const on = m.fiveMode[i] > 0;
      (node.firstElementChild as HTMLElement).style.width = `${(on ? 1 : m.meter[i]) * 100}%`;
      node.classList.toggle("full", on);
    };
    meter(this.mh, 0);
    meter(this.ma, 1);
    if (owner) {
      this.onball.classList.remove("hidden");
      this.onball.textContent = owner.name;
      this.onball.className = `onball display ${owner.team === 0 ? "home" : "away"}`;
    } else this.onball.classList.add("hidden");
  }

  /** Name tag over the player you control (screen position in CSS px), or null to hide. Shows their stamina when it isn't full. */
  meTag(name: string | null, x = 0, y = 0, stamina = 1, winded = false) {
    if (!name) { this.me.classList.add("hidden"); return; }
    if (name !== this.meName) { this.meLabel.textContent = name; this.meName = name; }
    this.me.classList.remove("hidden");
    this.meTank.classList.toggle("hidden", stamina > 0.995);
    this.meTank.classList.toggle("winded", winded);
    (this.meTank.firstElementChild as HTMLElement).style.width = `${(stamina * 100).toFixed(0)}%`;
    this.me.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
  }

  /** Big centre text (GOAL!, 5IVE MODE…). */
  popup(text: string, sub = "", gold = false) {
    const p = el(`<div class="pop display anim"><div class="big ${gold ? "gold" : ""}"></div><div class="small"></div></div>`);
    p.querySelector(".big")!.textContent = text;
    p.querySelector(".small")!.textContent = sub;
    this.root.appendChild(p);
    setTimeout(() => p.remove(), 1700);
  }

  /** Small rising style callout (PANNA!, ROULETTE…). */
  style(text: string, team: 0 | 1) {
    const s = el(`<div class="style display anim ${team === 0 ? "home" : "away"}"></div>`);
    s.textContent = text;
    this.root.appendChild(s);
    setTimeout(() => s.remove(), 1250);
  }

  countdown(text: string) {
    const c = el(`<div class="count display"></div>`);
    c.textContent = text;
    this.root.appendChild(c);
    setTimeout(() => c.remove(), 900);
  }

  /** One-time controls tip on a player's first match. */
  firstMatchTip() {
    const KEY = "street.tipSeen.redcard";
    try {
      if (localStorage.getItem(KEY)) return;
      localStorage.setItem(KEY, "1");
    } catch { /* storage unavailable: show it anyway */ }
    const keyboard = matchMedia("(hover: hover) and (pointer: fine)").matches;
    const tip = el(keyboard
      ? `<div class="tip"><b>WASD</b>/arrows move · hold <b>Shift</b> to sprint · <b>J</b> pass/switch · <b>K</b> or <b>Space</b> shoot/tackle (hold either for power) · <b>L</b> skill · <b>P</b> pause</div>`
      : `<div class="tip">Push the stick right out to <b>sprint</b> · hold <b>Pass</b> or <b>Shoot</b> for power · <b>Tackle</b> hard, there are no fouls</div>`);
    this.root.appendChild(tip);
    setTimeout(() => tip.classList.add("out"), 7000);
    setTimeout(() => tip.remove(), 7600);
  }

  setVisible(on: boolean) { this.root.classList.toggle("hidden", !on); }
  destroy() { this.root.remove(); }
}

export function pauseSheet(
  parent: HTMLElement,
  muted: boolean,
  autoSwitch: boolean,
  actions: { resume(): void; restart(): void; quit(): void; mute(m: boolean): void; autoSwitch(on: boolean): void },
) {
  const autoLabel = (on: boolean) => `Auto switch ${on ? "on" : "off"}`;
  const s = el(`
    <div class="layer"><div class="sheet"><div class="panel">
      <h2 class="display">Paused</h2>
      <div class="row"><button class="btn" data-r>Resume</button></div>
      <div class="row">
        <button class="btn ghost" data-s>Restart</button>
        <button class="btn ghost" data-q>Change teams</button>
        <button class="btn ghost" data-m>${muted ? "Sound off" : "Sound on"}</button>
        <button class="btn ghost" data-auto>${autoLabel(autoSwitch)}</button>
      </div>
      <p style="color:#a1a1aa;font-size:12px;margin:14px 0 0">Stick: half push to walk, right out to sprint (the ring is your stamina) · Pass (hold to drive it through) / Switch · Shoot (hold for power) / Tackle: anything goes, no fouls · Skill: auto trick · Auto switch hands you the defender nearest the ball when yours is out of the play</p>
    </div></div></div>`);
  parent.appendChild(s);
  const close = (fn: () => void) => () => { s.remove(); fn(); };
  s.querySelector("[data-r]")!.addEventListener("click", close(actions.resume));
  s.querySelector("[data-s]")!.addEventListener("click", close(actions.restart));
  s.querySelector("[data-q]")!.addEventListener("click", close(actions.quit));
  const mb = s.querySelector("[data-m]") as HTMLElement;
  let m = muted;
  mb.addEventListener("click", () => { m = !m; mb.textContent = m ? "Sound off" : "Sound on"; actions.mute(m); });
  const ab = s.querySelector("[data-auto]") as HTMLElement;
  let a = autoSwitch;
  ab.addEventListener("click", () => { a = !a; ab.textContent = autoLabel(a); actions.autoSwitch(a); });
  return s;
}

export function resultSheet(
  parent: HTMLElement,
  m: Match,
  motm: Player,
  inApp: boolean,
  actions: { rematch(): void; teams(): void; exit(): void },
) {
  const [h, a] = m.score;
  const title = h > a ? "YOU WIN" : h < a ? "YOU LOSE" : "DRAW";
  const list = (team: 0 | 1) => m.scorers.filter((s) => s.team === team)
    .map((s) => `${s.name}${s.og ? " (OG)" : ""} ${Math.floor(s.second / 60)}:${String(s.second % 60).padStart(2, "0")}`).join("<br>");
  const s = el(`
    <div class="layer"><div class="sheet"><div class="panel">
      <div class="display" style="font-size:14px;color:#a1a1aa;letter-spacing:.12em">FULL TIME</div>
      <h2 class="display">${title}</h2>
      <div class="final display"><span class="h">${h}</span><span style="color:#71717a">–</span><span class="a">${a}</span></div>
      <div class="scorers"><div>${list(0)}</div><div>${list(1)}</div></div>
      <div class="motm">Man of the match: <b></b></div>
      <div class="row">
        <button class="btn" data-r>Rematch</button>
        <button class="btn ghost" data-t>Change teams</button>
        <button class="btn ghost" data-x>${inApp ? "Exit" : "Back"}</button>
      </div>
    </div></div></div>`);
  s.querySelector(".motm b")!.textContent = motm.name;
  parent.appendChild(s);
  const close = (fn: () => void) => () => { s.remove(); fn(); };
  s.querySelector("[data-r]")!.addEventListener("click", close(actions.rematch));
  s.querySelector("[data-t]")!.addEventListener("click", close(actions.teams));
  s.querySelector("[data-x]")?.addEventListener("click", close(actions.exit));
  return s;
}
