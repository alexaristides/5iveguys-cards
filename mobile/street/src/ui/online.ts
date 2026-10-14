/**
 * Play online: the sheet over the team select for making or joining a room,
 * and waiting in one for a friend.
 */
import type { OpenRoom } from "../net/api";
import { cleanCode, isCode } from "../net/room";

const el = (html: string) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface LobbyActions {
  create(): void;
  join(code: string): void;
  close(): void;
  signIn(): void;
  invite(): void;
  copy(): void;
  leave(): void;
}

export class OnlineSheet {
  readonly root: HTMLElement;
  private panel: HTMLElement;
  private rooms: OpenRoom[] = [];
  private view: "menu" | "room" | "busy" | "signin" = "menu";

  constructor(parent: HTMLElement, private inApp: boolean, private act: LobbyActions) {
    this.root = el(`<div class="layer hidden" id="online"><div class="sheet"><div class="panel online"></div></div></div>`);
    this.panel = this.root.querySelector(".panel")!;
    parent.appendChild(this.root);
  }

  get open() { return !this.root.classList.contains("hidden"); }

  hide() { this.root.classList.add("hidden"); }

  /** Make a room, type a code, or pick an open room. */
  menu(error = "") {
    this.view = "menu";
    this.root.classList.remove("hidden");
    this.panel.innerHTML = `
      <div class="head"><h2 class="display">Play online</h2><button class="x" aria-label="Close">✕</button></div>
      <p class="sub">3v3 against a friend: you each pick three from the squad and run your side.</p>
      <div class="row tight">
        <button class="btn" data-create>Create a room</button>
        <form class="code"><input maxlength="5" placeholder="CODE" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="go" /><button class="btn ghost" type="submit">Join</button></form>
      </div>
      <p class="err">${esc(error)}</p>
      <div class="label">Open rooms</div>
      <div class="rooms"></div>`;
    this.panel.querySelector(".x")!.addEventListener("click", () => this.act.close());
    this.panel.querySelector("[data-create]")!.addEventListener("click", () => this.act.create());
    const input = this.panel.querySelector("input")!;
    input.addEventListener("input", () => { input.value = cleanCode(input.value).slice(0, 5); });
    this.panel.querySelector("form")!.addEventListener("submit", (e) => {
      e.preventDefault();
      const code = cleanCode(input.value);
      input.blur();
      if (isCode(code)) this.act.join(code);
      else this.error("Room codes are 5 letters and numbers");
    });
    this.drawRooms();
  }

  setRooms(rooms: OpenRoom[]) {
    this.rooms = rooms;
    if (this.view === "menu") this.drawRooms();
  }

  private drawRooms() {
    const box = this.panel.querySelector(".rooms");
    if (!box) return;
    box.innerHTML = this.rooms.length
      ? this.rooms.map((r) => `
          <button class="room" data-code="${r.code}">
            ${r.host.image ? `<img src="${esc(r.host.image)}" alt="" referrerpolicy="no-referrer" />` : `<i></i>`}
            <span><b>${esc(r.host.name)}</b><small>Room ${r.code}</small></span>
            <em>Join ›</em>
          </button>`).join("")
      : `<p class="sub">No open rooms right now. Create one and invite a friend.</p>`;
    box.querySelectorAll<HTMLElement>(".room").forEach((b) => b.addEventListener("click", () => this.act.join(b.dataset.code!)));
  }

  error(text: string) {
    const e = this.panel.querySelector(".err");
    if (e) e.textContent = text;
  }

  /** Connecting, joining… */
  busy(text: string) {
    this.view = "busy";
    this.root.classList.remove("hidden");
    this.panel.innerHTML = `<h2 class="display">${esc(text)}</h2><div class="spin"></div>`;
  }

  /** In a room on your own, waiting for someone to join. */
  room(code: string, note = "") {
    this.view = "room";
    this.root.classList.remove("hidden");
    this.panel.innerHTML = `
      <div class="display" style="font-size:14px;color:#a1a1aa;letter-spacing:.12em">ROOM CODE</div>
      <div class="bigcode display">${code}</div>
      <p class="sub">${note ? `${esc(note)} ` : ""}Waiting for a player… Send a friend the code or the link.</p>
      <div class="row">
        <button class="btn" data-invite>Invite a friend</button>
        <button class="btn ghost" data-copy>Copy link</button>
        <button class="btn ghost" data-leave>Close room</button>
      </div>`;
    this.panel.querySelector("[data-invite]")!.addEventListener("click", () => this.act.invite());
    this.panel.querySelector("[data-copy]")!.addEventListener("click", () => this.act.copy());
    this.panel.querySelector("[data-leave]")!.addEventListener("click", () => this.act.leave());
  }

  toast(text: string) {
    const t = el(`<div class="toast display"></div>`);
    t.textContent = text;
    this.root.parentElement?.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  /** Not signed in. */
  signIn() {
    this.view = "signin";
    this.root.classList.remove("hidden");
    this.panel.innerHTML = `
      <div class="head"><h2 class="display">Play online</h2><button class="x" aria-label="Close">✕</button></div>
      <p class="sub">${this.inApp ? "Sign in to the app to play your friends online." : "Sign in to play your friends online. You'll come straight back here."}</p>
      ${this.inApp ? "" : `<div class="row"><button class="btn" data-signin>Sign in with Google</button></div>`}`;
    this.panel.querySelector(".x")!.addEventListener("click", () => this.act.close());
    this.panel.querySelector("[data-signin]")?.addEventListener("click", () => this.act.signIn());
  }
}
