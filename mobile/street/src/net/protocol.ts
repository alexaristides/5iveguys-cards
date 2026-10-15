/**
 * Messages between the two players in a room. The host (who made the room)
 * runs the match; the guest sends its buttons and draws what the host sends.
 *
 * Room messages go through the website (reliable, a few a second at most).
 * Snapshots and inputs go over the direct link when there is one (unreliable,
 * ~30 a second) and through the website when there isn't (~8 a second), so they
 * carry everything since the other side last acknowledged: lost or out-of-order
 * packets don't lose a goal, a sound or a button press.
 */
import type { PeerSignal } from "./peer";

export type RoomMsg =
  /** Guest → host on joining (their name and last picks); host → guest in reply. */
  | { t: "hello"; name: string; prefs?: string[] }
  /** Host → guest: the teams being picked (the host settles any clash). */
  | { t: "lineup"; v: number; home: string[]; away: string[]; ready: [boolean, boolean] }
  /** Guest → host: tap a player (on or off the guest's side). */
  | { t: "pick"; key: string }
  | { t: "ready"; on: boolean }
  /** Host → guest: kick off match `n` with these teams. */
  | { t: "start"; n: number; home: string[]; away: string[] }
  /** Either way: rematch please. */
  | { t: "again" }
  /** Either way: back to picking teams. */
  | { t: "draft" }
  | { t: "rtc"; s: PeerSignal }
  | { t: "bye" };

/** Host → guest, many times a second during a match. */
export interface Snap {
  t: "s";
  /** Match number (snapshots from an earlier match are dropped). */
  n: number;
  /** Host's clock (s) and how often it's sending (s). */
  h: number;
  r: number;
  /** Match: state, stateT, clock, score ×2, golden goal, meters ×2, 5IVE MODE ×2, controlled ×2, owner, last scorer, kick kind/by/target. */
  g: number[];
  /** Ball: x y z vx vy vz. */
  b: number[];
  /** Players: x z vx vz facing air flags stamina mood moodT, then action kind t dur power flip (kind -1 = none). */
  p: number[][];
  /** Match events the guest hasn't acknowledged yet. */
  e: WireEvent[];
  /** The last guest button press applied. */
  a: number;
}

/** Guest → host, many times a second during a match. */
export interface Inp {
  t: "i";
  n: number;
  /** Sequence (newest wins for the stick). */
  q: number;
  /** Stick x, z. */
  m: [number, number];
  /** 1 sprint, 2 pass held, 4 shoot held, 8 auto switch on. */
  f: number;
  /** Button presses the host hasn't acknowledged: [id, edge, held seconds on release]. */
  e: [number, Edge, number?][];
  /** The last match event received. */
  k: number;
}

export type GameMsg = Snap | Inp;

/** Button edges: pass down/up, shoot down/up, skill. */
export const Edge = { PassDown: 0, PassUp: 1, ShootDown: 2, ShootUp: 3, Skill: 4 } as const;
export type Edge = (typeof Edge)[keyof typeof Edge];

/** A match event on the wire: id, host time, the event with players as indexes. */
export type WireEvent = [number, number, Record<string, unknown>];

export const STATES = ["kickoff", "play", "goal", "fulltime", "over"] as const;
export const MOODS = ["play", "celebrate", "cheer", "dejected", "idle"] as const;
export const ACTIONS = ["kick", "stepover", "roulette", "flick", "panna", "stumble", "barge", "slide", "kungfu", "floored"] as const;
export const KICKS = ["pass", "lob", "shot", "space", "panna", "rainbow", "loose"] as const;

/** Round for the wire (2 decimals is a centimetre / a hundredth of a second). */
export const r2 = (v: number) => Math.round(v * 100) / 100;
export const r3 = (v: number) => Math.round(v * 1000) / 1000;
