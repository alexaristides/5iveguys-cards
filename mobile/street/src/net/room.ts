/**
 * A room for two: a Pusher presence channel named after a 5-character code
 * (like the PvP lobbies on the website, but nothing is stored: the room exists
 * while someone is in it). Presence tells each side when the other arrives or
 * drops; messages go through the website's relay, and the match itself over a
 * direct WebRTC link once one is up.
 */
import Pusher, { type Members, type PresenceChannel } from "pusher-js";
import { apiBase, authHeaders, relay, type Me } from "./api";
import { Peer } from "./peer";
import type { GameMsg, RoomMsg } from "./protocol";
import { host } from "../bridge";

/** No 0/O or 1/I/L, so a code read out loud or off a screen can't be misread. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CHANNEL = (code: string) => `presence-street-${code}`;
/** How long a dropped connection gets to come back before the other player counts as gone. */
const GRACE_MS = 12000;

export const newCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const isCode = (s: string) => s.length === 5 && [...s].every((c) => ALPHABET.includes(c));

export type RoomEvent =
  /** The other player is in (name from presence; their hello may update it). */
  | { type: "opponent"; name: string }
  | { type: "msg"; msg: RoomMsg }
  | { type: "game"; msg: GameMsg }
  /** The direct link came up (true) or isn't available (false): the relay carries the match. */
  | { type: "link"; direct: boolean }
  /** Their connection dropped (true) or came back (false). */
  | { type: "away"; away: boolean }
  /** They left (or didn't come back). */
  | { type: "left" };

export class RoomError extends Error {
  constructor(readonly reason: "full" | "missing" | "offline") { super(reason); }
}

let pusher: Pusher | null = null;
function client(me: Me) {
  pusher ??= new Pusher(me.pusher.key, {
    cluster: me.pusher.cluster,
    channelAuthorization: {
      // Our own request so the app's token goes along and a full room shows as such.
      customHandler: ({ socketId, channelName }, cb) => {
        fetch(`${apiBase()}/api/pusher/auth`, {
          method: "POST",
          headers: { ...authHeaders(), "content-type": "application/x-www-form-urlencoded" },
          credentials: host.token ? "omit" : "same-origin",
          body: new URLSearchParams({ socket_id: socketId, channel_name: channelName }).toString(),
        })
          .then(async (res) => {
            if (!res.ok) throw new RoomError(res.status === 403 ? "full" : "offline");
            cb(null, await res.json());
          })
          .catch((e: Error) => cb(e, null));
      },
      // Unused with a custom handler, but required by the typings.
      endpoint: "",
      transport: "ajax",
    },
  });
  return pusher;
}

export class Room {
  opponent: { id: string; name: string } | null = null;
  /** The match goes over the direct link. */
  direct = false;
  on: (e: RoomEvent) => void = () => {};
  private peer: Peer | null = null;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  /** Messages that beat their sender's arrival in the room (presence), held until it comes. */
  private early: { from: string; msg: RoomMsg | GameMsg }[] = [];

  private constructor(readonly me: Me, readonly code: string, readonly isHost: boolean, private channel: PresenceChannel) {
    channel.bind("msg", (d: { from: string; msg: RoomMsg | GameMsg }) => this.receive(d.from, d.msg));
    channel.bind("pusher:member_added", (m: { id: string; info?: { name?: string } }) => {
      if (this.opponent && m.id !== this.opponent.id) return;
      if (this.opponent) {
        // Back within the grace period.
        if (this.graceTimer) { clearTimeout(this.graceTimer); this.graceTimer = null; this.on({ type: "away", away: false }); }
        return;
      }
      this.opponent = { id: m.id, name: m.info?.name ?? "Player" };
      this.on({ type: "opponent", name: this.opponent.name });
      const early = this.early.filter((e) => e.from === m.id);
      this.early = [];
      for (const e of early) this.dispatch(e.msg);
    });
    channel.bind("pusher:member_removed", (m: { id: string }) => {
      if (!this.opponent || m.id !== this.opponent.id || this.graceTimer) return;
      this.on({ type: "away", away: true });
      this.graceTimer = setTimeout(() => this.gone(), GRACE_MS);
    });
  }

  /** Make a room with a fresh code and wait in it. */
  static async create(me: Me): Promise<Room> {
    for (let i = 0; i < 4; i++) {
      const code = newCode();
      const { channel, members } = await subscribe(me, code);
      if (members.count === 1) return new Room(me, code, true, channel);
      client(me).unsubscribe(CHANNEL(code)); // someone's already using that code
    }
    throw new RoomError("offline");
  }

  /** Join someone's room by its code. */
  static async join(me: Me, code: string): Promise<Room> {
    const { channel, members } = await subscribe(me, code);
    let other: { id: string; name: string } | null = null;
    members.each((m: { id: string; info?: { name?: string } }) => {
      if (m.id !== me.user.id) other = { id: m.id, name: m.info?.name ?? "Player" };
    });
    if (!other) {
      client(me).unsubscribe(CHANNEL(code));
      throw new RoomError("missing");
    }
    if (members.count > 2) {
      // Someone else got in at the same moment.
      client(me).unsubscribe(CHANNEL(code));
      throw new RoomError("full");
    }
    const room = new Room(me, code, false, channel);
    room.opponent = other;
    return room;
  }

  /** Reliable room message (picks, ready, kick-off…). */
  send(msg: RoomMsg) {
    const go = () => relay(this.me, this.code, client(this.me).connection.socket_id, msg, msg.t === "bye");
    go().catch(() => setTimeout(() => go().catch(() => {}), 400));
  }

  /** Match traffic: the direct link if it's up, else the relay. */
  sendGame(msg: GameMsg) {
    if (this.peer?.send(JSON.stringify(msg))) return;
    relay(this.me, this.code, client(this.me).connection.socket_id, msg).catch(() => {});
  }

  /** Host: set up the direct link (again, if it dropped). */
  connectDirect() {
    if (!this.isHost || !Peer.supported || this.peer) return;
    this.peer = this.newPeer();
    this.peer.offer().catch(() => this.peer?.close());
  }

  /** Leave for good, telling the other player first. */
  leave() {
    if (this.closed) return;
    if (this.opponent) this.send({ t: "bye" });
    this.close();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.peer?.close();
    this.channel.unbind_all();
    const p = pusher;
    // Give the goodbye a moment to get out before the socket closes.
    setTimeout(() => {
      p?.unsubscribe(CHANNEL(this.code));
      if (p && p === pusher && p.allChannels().length === 0) { p.disconnect(); pusher = null; }
    }, 600);
  }

  private gone() {
    this.graceTimer = null;
    this.opponent = null;
    this.peer?.close();
    this.peer = null;
    this.on({ type: "left" });
  }

  private newPeer() {
    const peer: Peer = new Peer(
      (s) => this.send({ t: "rtc", s }),
      (data) => { try { this.dispatch(JSON.parse(data) as GameMsg); } catch { /* garbled */ } },
      (open) => {
        if (open === this.direct) return;
        this.direct = open;
        if (!open && this.peer === peer) this.peer = null;
        this.on({ type: "link", direct: open });
      },
    );
    return peer;
  }

  private receive(from: string, msg: RoomMsg | GameMsg) {
    if (this.closed || from === this.me.user.id) return;
    if (!this.opponent) {
      // Only someone actually in the room can be the opponent: hold their first
      // words until presence says they've arrived.
      if (this.early.length < 20) this.early.push({ from, msg });
      return;
    }
    if (from === this.opponent.id) this.dispatch(msg);
  }

  private dispatch(msg: RoomMsg | GameMsg) {
    switch (msg.t) {
      case "s":
      case "i":
        this.on({ type: "game", msg });
        return;
      case "rtc":
        if (!this.isHost && msg.s.kind === "offer") {
          this.peer?.close();
          this.peer = Peer.supported ? this.newPeer() : null;
        }
        this.peer?.handle(msg.s);
        return;
      case "bye":
        if (this.graceTimer) clearTimeout(this.graceTimer);
        this.gone();
        return;
      case "hello":
        if (this.opponent) this.opponent.name = msg.name;
        this.on({ type: "msg", msg });
        return;
      default:
        this.on({ type: "msg", msg });
    }
  }
}

function subscribe(me: Me, code: string): Promise<{ channel: PresenceChannel; members: Members }> {
  const p = client(me);
  return new Promise((resolve, reject) => {
    const channel = p.subscribe(CHANNEL(code)) as PresenceChannel;
    const t = setTimeout(() => { cleanup(); p.unsubscribe(CHANNEL(code)); reject(new RoomError("offline")); }, 12000);
    const ok = (members: Members) => { cleanup(); resolve({ channel, members }); };
    // pusher-js passes our auth error on as its message.
    const fail = (e: { status?: number; error?: unknown }) => {
      cleanup();
      p.unsubscribe(CHANNEL(code));
      const full = e?.status === 403 || e?.error === "full" || (e?.error instanceof RoomError && e.error.reason === "full");
      reject(new RoomError(full ? "full" : "offline"));
    };
    const cleanup = () => {
      clearTimeout(t);
      channel.unbind("pusher:subscription_succeeded", ok);
      channel.unbind("pusher:subscription_error", fail);
    };
    channel.bind("pusher:subscription_succeeded", ok);
    channel.bind("pusher:subscription_error", fail);
  });
}
