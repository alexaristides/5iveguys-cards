/**
 * Playing online: rooms, picking teams against each other, and keeping the
 * match in step between the two phones (see net/). The room's host runs the
 * match and plays the home side; the guest plays away and draws what the host
 * sends. main.ts calls in here each frame while a room is open.
 */
import { host, send } from "./bridge";
import { getMe, listRooms, signInOnWebsite, type Me } from "./net/api";
import { GAME_VERSION, type GameMsg, type RoomMsg } from "./net/protocol";
import { cleanCode, isCode, Room, RoomError, type RoomEvent } from "./net/room";
import { HostSync, INPUT_RATE, PadSender, RATE, Replica } from "./net/sync";
import { dist } from "./math";
import type { Match, MatchEvent, Pad } from "./game/match";
import type { RosterPlayer } from "./roster";
import { resultNote } from "./ui/hud";
import { OnlineSheet } from "./ui/online";
import type { OnlineDraft, Select } from "./ui/select";

type Side = 0 | 1;
interface Lineup { v: number; home: string[]; away: string[]; ready: [boolean, boolean] }

export interface OnlineHooks {
  select: Select;
  roster: RosterPlayer[];
  /** Start a match with this screen playing `side`; scoreboard shows `labels`. */
  play(home: RosterPlayer[], away: RosterPlayer[], side: Side, labels: [string, string]): Match;
  /** Back to the team select, ending any match. */
  showSelect(): void;
  click(): void;
}

/** A name short enough for a tag or the scoreboard. */
const short = (name: string) => (name.trim().split(/\s+/)[0] || "Player").slice(0, 9).toUpperCase();
const emptyLineup = (): Lineup => ({ v: 0, home: [], away: [], ready: [false, false] });

export class Online {
  room: Room | null = null;
  side: Side = 0;
  /** Host: running the match. Guest: drawing it and sending buttons. */
  hostSync: HostSync | null = null;
  replica: Replica | null = null;
  sender: PadSender | null = null;
  private me: Me | null = null;
  private names: [string, string] = ["", ""];
  private lineup = emptyLineup();
  private n = 0;
  private again: [boolean, boolean] = [false, false];
  private result: HTMLElement | null = null;
  private away = false;
  private epoch = 0;
  /** Host: when the kick-off was last sent (resent if the guest doesn't show). */
  private startSent = 0;
  private draft: OnlineDraft | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private sheet: OnlineSheet;

  constructor(ui: HTMLElement, private inApp: boolean, private hooks: OnlineHooks) {
    this.sheet = new OnlineSheet(ui, inApp, {
      create: () => this.create(),
      join: (code) => this.join(code),
      close: () => { this.stopPolling(); this.sheet.hide(); },
      signIn: () => {
        const url = new URL(location.href);
        signInOnWebsite(url.pathname + url.search).catch(() => this.sheet.menu("Couldn't start sign-in."));
      },
      invite: () => this.invite(),
      copy: () => this.copy(),
      leave: () => { this.leave(); this.open(); },
    });
  }

  get active() { return !!this.room; }
  get opponent() { return this.names[this.side === 0 ? 1 : 0] || "Opponent"; }
  /** How often to send: the direct link takes far more than the relay. */
  get rate() { return this.room?.direct ? RATE.direct : RATE.relay; }
  /** The host's match clock (s), for snapshots. */
  clock() { return (performance.now() - this.epoch) / 1000; }

  // ── Lobby ─────────────────────────────────────────────────────────────────

  /** The Play online sheet (signing in first if need be). */
  async open(error = "") {
    this.sheet.busy("Connecting…");
    try {
      this.me ??= await getMe();
    } catch {
      this.sheet.menu("Couldn't reach 5iveG. Check your connection.");
      return;
    }
    if (!this.me) { this.sheet.signIn(); return; }
    this.sheet.menu(error);
    this.refreshRooms();
    this.stopPolling();
    this.poll = setInterval(() => this.refreshRooms(), 5000);
  }

  /** Opened from an invite link: straight into that room. */
  async invited(raw: string) {
    const code = cleanCode(raw);
    if (!isCode(code)) return;
    this.sheet.busy("Connecting…");
    try {
      this.me ??= await getMe();
    } catch {
      this.sheet.menu("Couldn't reach 5iveG. Check your connection.");
      return;
    }
    if (!this.me) { this.sheet.signIn(); return; }
    this.join(code);
  }

  private refreshRooms() {
    if (!this.sheet.open || this.room) { this.stopPolling(); return; }
    listRooms().then((r) => this.sheet.setRooms(r)).catch(() => {});
  }

  private stopPolling() {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  private async create() {
    this.stopPolling();
    this.sheet.busy("Making a room…");
    try {
      this.enter(await Room.create(this.me!));
      this.sheet.room(this.room!.code);
    } catch {
      this.sheet.menu("Couldn't make a room. Try again.");
    }
  }

  private async join(code: string) {
    this.stopPolling();
    this.sheet.busy(`Joining ${code}…`);
    try {
      const room = await Room.join(this.me!, code);
      this.enter(room);
      this.names[0] = room.opponent?.name ?? "Host";
      room.send({ t: "hello", name: this.me!.user.name, prefs: this.hooks.select.savedPicks(), v: GAME_VERSION });
      this.startDraft();
    } catch (e) {
      const why = e instanceof RoomError ? e.reason : "offline";
      this.sheet.menu(why === "full" ? `Room ${code} is full.` : why === "missing" ? `There's no one in room ${code}.` : "Couldn't join. Check your connection.");
    }
  }

  private enter(room: Room) {
    this.room = room;
    this.side = room.isHost ? 0 : 1;
    this.names = ["", ""];
    this.names[this.side] = this.me!.user.name;
    this.lineup = emptyLineup();
    this.n = 0;
    this.away = false;
    room.on = (e) => this.onRoom(e);
  }

  private inviteUrl() {
    return `${host.api || location.origin}/street?room=${this.room?.code ?? ""}`;
  }

  private invite() {
    const code = this.room?.code;
    if (!code) return;
    const text = `Play me at 5IVE STREET! Room code ${code}`;
    if (this.inApp) send({ type: "share", text, url: this.inviteUrl() });
    else if (navigator.share) navigator.share({ title: "5IVE STREET", text, url: this.inviteUrl() }).catch(() => {});
    else this.copy();
  }

  private copy() {
    const fallback = () => this.sheet.toast(`Room code ${this.room?.code ?? ""}`);
    if (!navigator.clipboard) { fallback(); return; }
    navigator.clipboard.writeText(this.inviteUrl()).then(() => this.sheet.toast("Link copied"), fallback);
  }

  /** Leave the room for good (back to playing the CPU). */
  leave() {
    const room = this.room;
    this.room = null;
    room?.leave();
    this.endMatchSync();
    this.result?.remove();
    this.result = null;
    this.stopPolling();
    this.sheet.hide();
    this.draft = null;
    this.hooks.select.setOnline(null);
    this.hooks.showSelect();
  }

  // ── Room traffic ──────────────────────────────────────────────────────────

  private onRoom(e: RoomEvent) {
    const room = this.room;
    if (!room) return;
    switch (e.type) {
      case "opponent":
        this.setOpponent(e.name);
        if (this.side === 0) {
          // Someone's in: pick teams (their hello brings their name and last picks).
          room.send({ t: "hello", name: this.me!.user.name, v: GAME_VERSION });
          this.startDraft();
          room.connectDirect();
        }
        break;
      case "msg": this.onMsg(e.msg); break;
      case "game": this.onGame(e.msg); break;
      case "link": break; // main.ts shows it from room.direct
      case "away": this.away = e.away; break;
      case "left": this.opponentLeft(); break;
    }
  }

  private onMsg(msg: RoomMsg) {
    const L = this.lineup;
    const host = this.side === 0;
    switch (msg.t) {
      case "hello":
        this.setOpponent(msg.name);
        if ((msg.v ?? 1) !== GAME_VERSION) { this.versionClash(msg.v ?? 1); return; }
        if (host && msg.prefs) {
          const valid = new Set(this.hooks.roster.map((p) => p.key));
          L.away = msg.prefs.filter((k) => valid.has(k) && !L.home.includes(k)).slice(0, 3);
          this.sendLineup();
        } else if (host) this.sendLineup();
        break;
      case "lineup":
        if (!host && msg.v > L.v) {
          this.lineup = { v: msg.v, home: msg.home, away: msg.away, ready: msg.ready };
          this.hooks.select.setTeams(msg.home, msg.away, msg.ready);
        }
        break;
      case "pick":
        if (host) { toggle(L, 1, msg.key, this.hooks.roster); this.sendLineup(); }
        break;
      case "ready":
        if (host) this.setReady(1, msg.on);
        break;
      case "start":
        // (A resent kick-off for the match we're already playing changes nothing.)
        if (!host && !(this.replica && this.n === msg.n)) this.begin(msg.home, msg.away, msg.n);
        break;
      case "again":
        this.again[host ? 1 : 0] = true;
        if (host && this.again[0]) this.hostStart();
        else resultNote(this.result, `${this.opponent} wants a rematch`);
        break;
      case "draft":
        this.backToDraft();
        break;
    }
  }

  private onGame(msg: GameMsg) {
    const now = performance.now() / 1000;
    if (msg.t === "s") this.replica?.receive(msg, now);
    else this.hostSync?.receive(msg, now);
  }

  private setOpponent(name: string) {
    this.names[this.side === 0 ? 1 : 0] = name;
    if (this.draft) {
      this.draft.opponent = name;
      this.draft.labels[this.side === 0 ? 1 : 0] = short(name);
      this.hooks.select.setTeams(this.lineup.home, this.lineup.away, this.lineup.ready);
    }
  }

  /** The other phone has a different version of the game: they can't play each other. */
  private versionClash(theirs: number) {
    const name = this.opponent || "Your opponent";
    this.leave();
    this.open(theirs < GAME_VERSION
      ? `${name} has an older version of 5IVE STREET. They need to update to play you.`
      : `${name} has a newer version of 5IVE STREET. ${this.inApp ? "Update the app" : "Refresh the page"} to play them.`);
  }

  private opponentLeft() {
    const name = this.opponent;
    this.endMatchSync();
    this.result?.remove();
    this.result = null;
    this.draft = null;
    this.hooks.select.setOnline(null);
    this.hooks.showSelect();
    if (this.side === 0 && this.room) {
      // The host's room stays open for someone else (keeping the host's three).
      this.names[1] = "";
      this.lineup = { ...emptyLineup(), home: this.lineup.home };
      this.sheet.room(this.room.code, `${name} left.`);
    } else {
      this.room?.close();
      this.room = null;
      this.open(`${name} left the room.`);
    }
  }

  // ── Picking teams ─────────────────────────────────────────────────────────

  private startDraft() {
    this.sheet.hide();
    const them: Side = this.side === 0 ? 1 : 0;
    const labels: [string, string] = ["YOU", "YOU"];
    labels[them] = short(this.opponent);
    this.draft = {
      side: this.side,
      labels,
      opponent: this.opponent,
      tap: (key) => this.tap(key),
      ready: (on) => this.ready(on),
      leave: () => this.leave(),
    };
    this.hooks.select.setOnline(this.draft);
    this.hooks.showSelect();
    if (this.side === 0) {
      // Start the host off with the three they had, or their last three.
      const valid = new Set(this.hooks.roster.map((p) => p.key));
      const saved = this.hooks.select.savedPicks().filter((k) => valid.has(k));
      if (this.lineup.home.length !== 3) this.lineup.home = saved.length === 3 && new Set(saved).size === 3 ? saved : [];
      this.lineup.away = [];
      this.sendLineup();
    }
  }

  private tap(key: string) {
    const L = this.lineup;
    if (this.side === 0) {
      toggle(L, 0, key, this.hooks.roster);
      this.sendLineup();
    } else {
      // Show it straight away; the host's next lineup has the final word.
      const mine = { ...L, home: [...L.home], away: [...L.away], ready: [...L.ready] as [boolean, boolean] };
      toggle(mine, 1, key, this.hooks.roster);
      this.hooks.select.setTeams(mine.home, mine.away, mine.ready);
      this.room?.send({ t: "pick", key });
    }
  }

  private ready(on: boolean) {
    if (this.side === 0) this.setReady(0, on);
    else {
      this.hooks.select.setTeams(this.lineup.home, this.lineup.away, [this.lineup.ready[0], on]);
      this.room?.send({ t: "ready", on });
    }
  }

  private setReady(side: Side, on: boolean) {
    const L = this.lineup;
    L.ready[side] = on && (side === 0 ? L.home : L.away).length === 3;
    this.sendLineup();
    if (L.ready[0] && L.ready[1] && L.home.length === 3 && L.away.length === 3) this.hostStart();
  }

  /** Host: share the teams as they stand (and show them here). */
  private sendLineup() {
    const L = this.lineup;
    L.v++;
    this.hooks.select.setTeams(L.home, L.away, L.ready);
    this.room?.send({ t: "lineup", v: L.v, home: L.home, away: L.away, ready: L.ready });
  }

  private backToDraft() {
    if (!this.room) return;
    this.endMatchSync();
    this.result?.remove();
    this.result = null;
    this.again = [false, false];
    this.hooks.showSelect();
    if (this.side === 0) {
      this.lineup.ready = [false, false];
      this.sendLineup();
    } else this.hooks.select.setTeams(this.lineup.home, this.lineup.away, [false, false]);
  }

  // ── The match ─────────────────────────────────────────────────────────────

  private hostStart() {
    const room = this.room;
    if (!room) return;
    const L = this.lineup;
    this.n++;
    L.ready = [false, false];
    room.send({ t: "start", n: this.n, home: L.home, away: L.away });
    this.startSent = performance.now();
    if (!room.direct) room.connectDirect();
    this.begin(L.home, L.away, this.n);
  }

  private begin(homeKeys: string[], awayKeys: string[], n: number) {
    const find = (k: string) => this.hooks.roster.find((p) => p.key === k);
    const home = homeKeys.map(find), away = awayKeys.map(find);
    if (home.some((p) => !p) || away.some((p) => !p) || home.length !== 3 || away.length !== 3) return;
    this.n = n;
    this.result?.remove();
    this.result = null;
    this.again = [false, false];
    this.lineup.ready = [false, false];
    this.hooks.select.savePicks(this.side === 0 ? homeKeys : awayKeys);
    const m = this.hooks.play(home as RosterPlayer[], away as RosterPlayer[], this.side, [short(this.names[0]), short(this.names[1])]);
    if (this.side === 0) {
      this.hostSync = new HostSync(m, n);
      this.epoch = performance.now();
    } else {
      m.events.length = 0; // the host's kick-off comes over the wire
      this.replica = new Replica(m, n);
      this.sender = new PadSender();
    }
  }

  private endMatchSync() {
    this.hostSync = null;
    this.replica = null;
    this.sender = null;
  }

  /** Host, each frame: the guest's buttons for the away side. */
  awayPad(m: Match): Pad | undefined {
    const s = this.hostSync;
    if (!s) return undefined;
    if (m.humans[1]) m.humans[1].autoSwitch = s.remote.autoSwitch;
    return s.remote.pad(performance.now() / 1000);
  }

  /** Host, after stepping: pass the frame's events on and send a snapshot when one's due. */
  hostFrame(events: MatchEvent[]) {
    const s = this.hostSync, room = this.room;
    if (!s || !room) return;
    const h = this.clock();
    s.collect(events, h);
    const snap = s.snapshot(h, this.rate);
    if (snap) room.sendGame(snap);
    // Nothing from the guest yet: the kick-off message may have gone astray.
    if (s.remote.silentFor(performance.now() / 1000) === Infinity && performance.now() - this.startSent > 2500 && h < 15) {
      const L = this.lineup;
      this.startSent = performance.now();
      room.send({ t: "start", n: this.n, home: L.home, away: L.away });
    }
  }

  /** Guest, each frame: send our buttons and play the host's match back. Returns the events now due. */
  guestFrame(m: Match, pad: Pad, dt: number, autoSwitch: boolean): MatchEvent[] {
    const r = this.replica, s = this.sender;
    if (!r || !s || !this.room) return [];
    const now = performance.now() / 1000;
    const u = m.user, b = m.ball;
    const onTheBall = b.owner === u || (!b.owner && (b.kick?.target === u || dist(b.pos, u.pos) < 3.5));
    s.take(pad, now, onTheBall);
    s.ack(r.edgeAck);
    const msg = s.message(this.n, pad, r.eventSeen, autoSwitch, now, this.room.direct ? INPUT_RATE.direct : INPUT_RATE.relay);
    if (msg) this.room.sendGame(msg);
    return r.apply(dt, now);
  }

  /** Guest: power rings from our own button timing. */
  charges(): [number, number] {
    const now = performance.now() / 1000;
    return this.sender ? [this.sender.shotCharge(now), this.sender.passCharge(now)] : [0, 0];
  }

  /** What to say across the screen, if anything (connection trouble). */
  banner(m: Match): string | null {
    if (this.away) return `${this.opponent}'s connection dropped…`;
    const now = performance.now() / 1000;
    if (this.replica && m.state !== "over" && now - this.replica.heardAt > 2) return `Waiting for ${this.opponent}…`;
    const quiet = this.hostSync?.remote.silentFor(now) ?? 0;
    if (m.state !== "over" && quiet > 3 && quiet !== Infinity) return `${this.opponent} isn't responding…`;
    return null;
  }

  // ── Full time ─────────────────────────────────────────────────────────────

  /** The full-time sheet is up (rematch waits on both players). */
  ended(sheet: HTMLElement) {
    this.result = sheet;
    if (this.again[this.side === 0 ? 1 : 0]) resultNote(sheet, `${this.opponent} wants a rematch`);
  }

  readonly resultActions = {
    rematch: () => {
      this.hooks.click();
      this.again[this.side] = true;
      this.room?.send({ t: "again" });
      if (this.side === 0 && this.again[1]) this.hostStart();
      else resultNote(this.result, `Waiting for ${this.opponent}…`);
    },
    teams: () => {
      this.room?.send({ t: "draft" });
      this.backToDraft();
    },
    exit: () => this.leave(),
  };
}

/** Tap `key` for `side`: off if it's theirs, on (bumping their oldest of three) if it's free. */
function toggle(L: Lineup, side: Side, key: string, roster: RosterPlayer[]) {
  const mine = side === 0 ? L.home : L.away, theirs = side === 0 ? L.away : L.home;
  if (!roster.some((p) => p.key === key) || theirs.includes(key)) return;
  const i = mine.indexOf(key);
  if (i >= 0) mine.splice(i, 1);
  else {
    if (mine.length >= 3) mine.shift();
    mine.push(key);
  }
  L.ready[side] = false;
}
