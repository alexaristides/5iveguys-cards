/**
 * Keeping the guest's screen in step with the host's match.
 *
 * Host: `HostSync` packs the match into snapshots (with the events the guest
 * hasn't acknowledged) and turns the guest's inputs into a Pad for the away side.
 *
 * Guest: `Replica` buffers snapshots and plays them back a little behind the
 * host (just enough to always have the next one), interpolating everything the
 * renderer reads, and hands out the match events as their moment comes round.
 * `PadSender` turns the guest's buttons into inputs.
 */
import { clamp, wrapAngle } from "../math";
import { BALL_R } from "../game/field";
import { IDLE_PAD, type Match, type MatchEvent, type Pad, type Scorer } from "../game/match";
import type { KickInfo } from "../game/ball";
import type { Action, Player } from "../game/player";
import { ACTIONS, Edge, KICKS, MOODS, r2, r3, STATES, type Inp, type Snap, type WireEvent } from "./protocol";

/** Snapshot intervals (s) over the direct link and through the relay. */
export const RATE = { direct: 1 / 30, relay: 1 / 8 };
/** Input intervals (s): the guest's stick goes every frame when it can (it's small). */
export const INPUT_RATE = { direct: 1 / 60, relay: 1 / 8 };
/** Most events kept waiting for the guest (a long drop-out loses the oldest sounds); keeps a snapshot well under Pusher's 10 KB. */
const OUTBOX = 50;

const idx = (m: Match, p: Player | null | undefined) => (p ? m.players.indexOf(p) : -1);

// ── Host ─────────────────────────────────────────────────────────────────────

export class HostSync {
  readonly remote = new RemotePad();
  private outbox: WireEvent[] = [];
  private eventId = 0;
  private lastSnap = -Infinity;

  constructor(private m: Match, readonly n: number) {}

  /** Queue this frame's events for the guest (call before they're cleared). */
  collect(events: MatchEvent[], h: number) {
    const m = this.m;
    for (const e of events) {
      let w: Record<string, unknown>;
      if (e.type === "goal") w = { type: "goal", team: e.team, scorer: idx(m, e.scorer), og: e.og, label: e.label, rec: m.scorers[m.scorers.length - 1] };
      else if (e.type === "end") w = { type: "end", motm: idx(m, m.motm()) };
      else w = { ...e };
      this.outbox.push([++this.eventId, r3(h), w]);
    }
    if (this.outbox.length > OUTBOX) this.outbox.splice(0, this.outbox.length - OUTBOX);
  }

  receive(inp: Inp, now: number) {
    if (inp.n === this.n) this.remote.receive(inp, now);
  }

  /** A snapshot if one is due at host time `h`. */
  snapshot(h: number, interval: number): Snap | null {
    if (h - this.lastSnap < interval * 0.85) return null;
    this.lastSnap = h;
    const m = this.m, b = m.ball, k = b.kick;
    const ack = this.remote.eventAck;
    this.outbox = this.outbox.filter(([id]) => id > ack);
    return {
      t: "s", n: this.n, h: r3(h), r: interval,
      g: [
        STATES.indexOf(m.state), r2(m.stateT), r2(m.clock), m.score[0], m.score[1], m.goldenGoal ? 1 : 0,
        r2(m.meter[0]), r2(m.meter[1]), r2(m.fiveMode[0]), r2(m.fiveMode[1]),
        idx(m, m.humans[0]?.user), idx(m, m.humans[1]?.user), idx(m, b.owner), idx(m, m.lastScorer),
        k ? KICKS.indexOf(k.kind) : -1, idx(m, k?.by), idx(m, k?.target),
      ],
      b: [r3(b.pos.x), r3(b.pos.y), r3(b.pos.z), r2(b.vel.x), r2(b.vel.y), r2(b.vel.z)],
      p: m.players.map((p) => {
        const a = p.action;
        const flags = (p.sprinting ? 1 : 0) | (p.winded ? 2 : 0) | (p.jockeying ? 4 : 0) | (p.glow ? 8 : 0);
        return [
          r2(p.pos.x), r2(p.pos.z), r2(p.vel.x), r2(p.vel.z), r2(p.facing), r2(p.air), flags, r2(p.stamina),
          MOODS.indexOf(p.mood), r2(p.moodT),
          ...(a ? [ACTIONS.indexOf(a.kind), r2(a.t), r2(a.dur), r2(a.power ?? 0.5), a.flip ?? 1] : [-1]),
        ];
      }),
      e: this.outbox,
      a: this.remote.edgeAck,
    };
  }
}

/** The guest's buttons, as the away side's Pad: one press or release per frame, in order. */
export class RemotePad {
  edgeAck = 0;
  eventAck = 0;
  private move = { x: 0, z: 0 };
  private flags = 8; // auto switch on until we hear otherwise
  private seq = -1;
  private heardAt = -Infinity;
  private queue: [Edge, number | undefined][] = [];

  receive(inp: Inp, now: number) {
    for (const [id, edge, held] of inp.e) {
      if (id > this.edgeAck) { this.queue.push([edge, held]); this.edgeAck = id; }
    }
    this.eventAck = Math.max(this.eventAck, inp.k);
    if (inp.q > this.seq) {
      this.seq = inp.q;
      this.move = { x: inp.m[0], z: inp.m[1] };
      this.flags = inp.f;
      this.heardAt = now;
    }
  }

  get autoSwitch() { return (this.flags & 8) !== 0; }
  /** Seconds since the guest was last heard from (Infinity: not yet this match). */
  silentFor(now: number) { return now - this.heardAt; }

  /** Pad for this frame. Without word from the guest for a moment, let go of the stick. */
  pad(now: number): Pad {
    const live = now - this.heardAt < 0.6;
    const pad: Pad = {
      ...IDLE_PAD,
      move: live ? this.move : { x: 0, z: 0 },
      sprint: live && (this.flags & 1) !== 0,
      passHeld: (this.flags & 2) !== 0,
      shootHeld: (this.flags & 4) !== 0,
    };
    const next = this.queue.shift();
    if (next) {
      const [edge, held] = next;
      if (edge === Edge.PassDown) pad.passDown = true;
      else if (edge === Edge.PassUp) { pad.passUp = true; pad.passHeldFor = held; }
      else if (edge === Edge.ShootDown) pad.shootDown = true;
      else if (edge === Edge.ShootUp) { pad.shootUp = true; pad.shootHeldFor = held; }
      else pad.skill = true;
    }
    return pad;
  }
}

// ── Guest ────────────────────────────────────────────────────────────────────

const SHOT_CHARGE = 0.85, PASS_TAP = 0.15, PASS_CHARGE = 0.6;

/** The guest's buttons going out. Presses are resent until the host has them. */
export class PadSender {
  private seq = 0;
  private edgeId = 0;
  private unacked: [number, Edge, number?][] = [];
  private pressedAt = { pass: 0, shoot: 0 };
  /** When a press that will charge (made on the ball) went down, for the power rings. */
  private chargeAt: { pass: number | null; shoot: number | null } = { pass: null, shoot: null };
  private lastSent = -Infinity;
  private fresh = false;

  /** Take this frame's buttons. `onTheBall`: a press now would charge a pass/shot. */
  take(pad: Pad, now: number, onTheBall: boolean) {
    const edge = (e: Edge, held?: number) => {
      this.unacked.push(held === undefined ? [++this.edgeId, e] : [++this.edgeId, e, r3(held)]);
      this.fresh = true;
    };
    if (pad.passDown) { edge(Edge.PassDown); this.pressedAt.pass = now; this.chargeAt.pass = onTheBall ? now : null; }
    if (pad.passUp) { edge(Edge.PassUp, now - this.pressedAt.pass); this.chargeAt.pass = null; }
    if (pad.shootDown) { edge(Edge.ShootDown); this.pressedAt.shoot = now; this.chargeAt.shoot = onTheBall ? now : null; }
    if (pad.shootUp) { edge(Edge.ShootUp, now - this.pressedAt.shoot); this.chargeAt.shoot = null; }
    if (pad.skill) edge(Edge.Skill);
  }

  ack(edgeAck: number) {
    if (this.unacked.length && this.unacked[0][0] <= edgeAck) this.unacked = this.unacked.filter(([id]) => id > edgeAck);
  }

  shotCharge(now: number) { return this.chargeAt.shoot === null ? 0 : Math.min(1, (now - this.chargeAt.shoot) / SHOT_CHARGE); }
  passCharge(now: number) { return this.chargeAt.pass === null ? 0 : clamp((now - this.chargeAt.pass - PASS_TAP) / PASS_CHARGE, 0, 1); }

  /** An input to send now, if one is due (a new press goes straight away, within reason). */
  message(n: number, pad: Pad, eventAck: number, autoSwitch: boolean, now: number, interval: number): Inp | null {
    const since = now - this.lastSent;
    if (since < interval * 0.85 && !(this.fresh && since > Math.min(interval, 0.05))) return null;
    this.lastSent = now;
    this.fresh = false;
    const flags = (pad.sprint ? 1 : 0) | (pad.passHeld ? 2 : 0) | (pad.shootHeld ? 4 : 0) | (autoSwitch ? 8 : 0);
    return { t: "i", n, q: ++this.seq, m: [r2(pad.move.x), r2(pad.move.z)], f: flags, e: this.unacked, k: eventAck };
  }
}

/** The guest's copy of the match, played back from the host's snapshots. */
export class Replica {
  /** Highest event id taken in (acknowledged back to the host). */
  eventSeen = 0;
  /** Highest button press the host has applied. */
  edgeAck = 0;
  /** Local time the last snapshot arrived. */
  heardAt = 0;
  private snaps: Snap[] = [];
  /** Host clock minus ours, from the quickest recent snapshots: [arrival, sample]. */
  private samples: [number, number][] = [];
  private jitter = 0.02;
  private interval = RATE.direct;
  private renderT: number | null = null;
  private due: WireEvent[] = [];
  private action: Action[] = [];
  private kick: KickInfo | null = null;
  private kickKey = "";

  constructor(private m: Match, readonly n: number) {
    this.heardAt = performance.now() / 1000;
  }

  receive(s: Snap, now: number) {
    if (s.n !== this.n) return;
    this.heardAt = now;
    this.interval = s.r;
    this.edgeAck = Math.max(this.edgeAck, s.a);
    for (const w of s.e) {
      if (w[0] > this.eventSeen) { this.due.push(w); this.eventSeen = w[0]; }
    }
    // Clock: the least delayed arrival over the last few seconds is the best guess.
    const sample = s.h - now;
    this.samples.push([now, sample]);
    while (this.samples.length && this.samples[0][0] < now - 3) this.samples.shift();
    const best = Math.max(...this.samples.map(([, v]) => v));
    this.jitter += (best - sample - this.jitter) * 0.1;
    // Keep them in host-time order (the direct link doesn't promise order).
    if (this.renderT !== null && s.h < this.renderT - 1) return;
    let i = this.snaps.length;
    while (i > 0 && this.snaps[i - 1].h > s.h) i--;
    if (this.snaps[i - 1]?.h === s.h) return;
    this.snaps.splice(i, 0, s);
    if (this.snaps.length > 60) this.snaps.shift();
  }

  /** How far behind the host we play: one snapshot gap plus the network's wobble. */
  get delay() { return clamp(this.interval + 2.5 * this.jitter + 0.01, 0.04, 0.45); }

  /** Copy the moment `delay` behind the host into the match, and return the events now due. */
  apply(dt: number, now: number): MatchEvent[] {
    const S = this.snaps;
    if (!S.length || !this.samples.length) return [];
    const target = now + Math.max(...this.samples.map(([, v]) => v)) - this.delay;
    if (this.renderT === null || Math.abs(target - this.renderT) > 0.5) this.renderT = target;
    else this.renderT += dt + (target - this.renderT) * Math.min(1, dt * 3);
    const rt = this.renderT;

    while (S.length > 2 && S[1].h <= rt) S.shift();
    const a = S[0];
    const b = S.length > 1 && rt > a.h ? S[1] : a;
    const k = b === a ? 0 : clamp((rt - a.h) / (b.h - a.h), 0, 1);
    // Past the newest snapshot: carry things on a touch (a late packet), then hold.
    const ahead = b === a ? clamp(rt - a.h, 0, 0.1) : Math.max(0, Math.min(0.1, rt - b.h));
    const d = k < 0.5 ? a : b;
    const lerp = (x: number, y: number) => x + (y - x) * k;
    const m = this.m, P = m.players;
    const at = (i: number) => (i >= 0 ? P[i] ?? null : null);

    const [ga, gb, gd] = [a.g, b.g, d.g];
    const state = STATES[gd[0]] ?? "play";
    m.stateT = ga[0] === gb[0] ? lerp(ga[1], gb[1]) : gd[1];
    m.state = state;
    m.clock = lerp(ga[2], gb[2]);
    m.score[0] = gd[3];
    m.score[1] = gd[4];
    m.goldenGoal = gd[5] === 1;
    m.meter[0] = lerp(ga[6], gb[6]);
    m.meter[1] = lerp(ga[7], gb[7]);
    m.fiveMode[0] = lerp(ga[8], gb[8]);
    m.fiveMode[1] = lerp(ga[9], gb[9]);
    const u0 = at(gd[10]), u1 = at(gd[11]);
    if (u0 && m.humans[0]) m.humans[0].user = u0;
    if (u1 && m.humans[1]) m.humans[1].user = u1;
    m.lastScorer = at(gd[13]);

    const ball = m.ball;
    const [ba, bb] = [a.b, b.b];
    ball.vel.set(lerp(ba[3], bb[3]), lerp(ba[4], bb[4]), lerp(ba[5], bb[5]));
    ball.pos.set(lerp(ba[0], bb[0]) + ball.vel.x * ahead, Math.max(BALL_R, lerp(ba[1], bb[1]) + ball.vel.y * ahead), lerp(ba[2], bb[2]) + ball.vel.z * ahead);
    ball.owner = at(gd[12]);
    const key = `${gd[14]}|${gd[15]}|${gd[16]}`;
    if (key !== this.kickKey) {
      this.kickKey = key;
      const by = at(gd[15]);
      this.kick = gd[14] >= 0 && by
        ? { by, kind: KICKS[gd[14]], t: m.t, target: at(gd[16]), walled: false, fromX: ball.pos.x, fromZ: ball.pos.z }
        : null;
    }
    ball.kick = this.kick;

    P.forEach((p, i) => {
      const A = a.p[i], B = b.p[i], D = d.p[i];
      if (!A || !B || !D) return;
      p.vel.x = lerp(A[2], B[2]);
      p.vel.z = lerp(A[3], B[3]);
      p.pos.x = lerp(A[0], B[0]) + p.vel.x * ahead;
      p.pos.z = lerp(A[1], B[1]) + p.vel.z * ahead;
      p.facing = A[4] + wrapAngle(B[4] - A[4]) * k;
      p.air = Math.max(0, lerp(A[5], B[5]));
      p.sprinting = (D[6] & 1) !== 0;
      p.winded = (D[6] & 2) !== 0;
      p.jockeying = (D[6] & 4) !== 0;
      p.glow = (D[6] & 8) !== 0;
      p.stamina = lerp(A[7], B[7]);
      p.mood = MOODS[D[8]] ?? "play";
      p.moodT = A[8] === B[8] ? lerp(A[9], B[9]) : D[9];
      if (D[10] < 0) p.action = null;
      else {
        const act = (this.action[i] ??= { kind: "kick", t: 0, dur: 1 });
        act.kind = ACTIONS[D[10]];
        act.t = A[10] === B[10] && B[11] >= A[11] ? lerp(A[11], B[11]) : D[11];
        act.dur = D[12];
        act.power = D[13];
        act.flip = D[14];
        p.action = act;
      }
      // Legs: the same stride rule as Player.move.
      const sp = p.speed;
      p.runPhase += (sp * dt * Math.PI * 2) / (1.4 + 0.38 * sp);
    });
    m.t += dt;

    // Events whose moment has come.
    const out: MatchEvent[] = [];
    while (this.due.length && this.due[0][1] <= rt) {
      const ev = this.decode(this.due.shift()![2]);
      if (ev) out.push(ev);
    }
    return out;
  }

  private decode(w: Record<string, unknown>): MatchEvent | null {
    const m = this.m;
    const at = (i: unknown) => (typeof i === "number" && i >= 0 ? m.players[i] ?? null : null);
    switch (w.type) {
      case "goal":
        if (w.rec) m.scorers.push(w.rec as Scorer);
        return { type: "goal", team: w.team as 0 | 1, scorer: at(w.scorer), og: !!w.og, label: w.label as string | undefined };
      case "end":
        return { type: "end", motm: at(w.motm) ?? undefined };
      default:
        return w as unknown as MatchEvent;
    }
  }
}
