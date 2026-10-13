/**
 * The six players in 5IVE STREET: how each one looks (taken from their cards)
 * and how they play. Stats are a starting point — fan ratings from the app
 * are blended in (see `blendStats`).
 */

export type HairStyle = "curlyMop" | "curlyTop" | "shortCurly" | "messy" | "locs" | "quiff";
export type Beard = "none" | "stubble" | "goatee" | "full";
export type Celebration = "airplane" | "kneeSlide" | "flex" | "siuu" | "fistPump" | "pointUp";

/** Where the face is on a card, as fractions of the image: midpoint between the eyes, and the chin. */
export interface FaceCrop {
  x: number;
  y: number;
  chin: number;
  /** Narrow the face mask (0..1) for faces turned to the side, so the card background doesn't show. */
  w?: number;
}

export interface Look {
  skin: string;
  hair: string;
  /** Lighter colour for the tips of the hair (curls), if any. */
  hairTip?: string;
  hairStyle: HairStyle;
  beard: Beard;
  /** Standing height in metres. */
  height: number;
  /** Body width multiplier (1 = average). */
  build: number;
  boots: string;
  smile: boolean;
  earrings?: boolean;
  snood?: boolean;
  /** Face position on the Home Kit card, for the photo face. */
  face: FaceCrop;
}

export interface Stats {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
}

export interface RosterPlayer {
  key: string;
  name: string;
  /** Card art, site-relative. */
  card: string;
  look: Look;
  stats: Stats;
  celebration: Celebration;
}

export const ROSTER: RosterPlayer[] = [
  {
    key: "neymar",
    name: "Neymar",
    card: "/cards/home/Neymar_Home.jpg",
    look: {
      skin: "#b9805a", hair: "#3b2416", hairTip: "#b07a45", hairStyle: "curlyTop", beard: "none",
      height: 1.75, build: 0.94, boots: "#ff3d9a", smile: false, earrings: true,
      face: { x: 0.54, y: 0.339, chin: 0.565 },
    },
    stats: { pace: 84, shooting: 80, passing: 78, dribbling: 95, defending: 45, physical: 56 },
    celebration: "airplane",
  },
  {
    key: "uriel",
    name: "Uriel",
    card: "/cards/home/Uriel_Home.jpg",
    look: {
      skin: "#5b3826", hair: "#141010", hairStyle: "locs", beard: "goatee",
      height: 1.86, build: 1.0, boots: "#ff7a1a", smile: true, snood: true,
      face: { x: 0.498, y: 0.249, chin: 0.48 },
    },
    stats: { pace: 90, shooting: 87, passing: 77, dribbling: 86, defending: 60, physical: 76 },
    celebration: "kneeSlide",
  },
  {
    key: "barney",
    name: "Barney",
    card: "/cards/home/Barney_Home.jpg",
    look: {
      skin: "#a06a45", hair: "#151111", hairStyle: "shortCurly", beard: "goatee",
      height: 1.88, build: 1.1, boots: "#f4f4f5", smile: true,
      face: { x: 0.395, y: 0.298, chin: 0.53, w: 0.88 },
    },
    stats: { pace: 74, shooting: 70, passing: 75, dribbling: 64, defending: 92, physical: 93 },
    celebration: "flex",
  },
  {
    key: "louis",
    name: "Louis",
    card: "/cards/home/Louis_Home.jpg",
    look: {
      skin: "#dcae88", hair: "#1d1410", hairStyle: "curlyMop", beard: "none",
      height: 1.8, build: 0.98, boots: "#b8ff3a", smile: true,
      face: { x: 0.505, y: 0.314, chin: 0.55 },
    },
    stats: { pace: 72, shooting: 74, passing: 82, dribbling: 80, defending: 70, physical: 66 },
    celebration: "fistPump",
  },
  {
    key: "oscar",
    name: "Oscar",
    card: "/cards/home/Oscar_Home.jpg",
    look: {
      skin: "#e2b391", hair: "#4a3021", hairStyle: "messy", beard: "full",
      height: 1.82, build: 1.0, boots: "#18181b", smile: false,
      face: { x: 0.521, y: 0.343, chin: 0.565 },
    },
    stats: { pace: 91, shooting: 77, passing: 72, dribbling: 80, defending: 56, physical: 66 },
    celebration: "pointUp",
  },
  {
    key: "raptis",
    name: "Raptis",
    card: "/cards/home/Raptis_Home.jpg",
    look: {
      skin: "#dcae8a", hair: "#2a1b12", hairStyle: "quiff", beard: "stubble",
      height: 1.8, build: 1.04, boots: "#2f7bff", smile: false,
      face: { x: 0.605, y: 0.339, chin: 0.553, w: 0.8 },
    },
    stats: { pace: 85, shooting: 84, passing: 78, dribbling: 76, defending: 72, physical: 84 },
    celebration: "siuu",
  },
];

/** The 11 attributes fans vote on in the app (see lib/card-rating.ts). */
export interface FanAverages {
  attack: number; defense: number; speed: number; strength: number; skillMoves: number;
  iq: number; aura: number; goalkeeping: number; agility: number; celebration: number; clutch: number;
}

/** How many "votes" the built-in stats count as, so one or two fan votes nudge rather than overwrite. */
const PRIOR_VOTES = 3;

export function blendStats(base: Stats, fans: FanAverages | undefined, voteCount: number): Stats {
  if (!fans || voteCount <= 0) return base;
  const fromFans: Stats = {
    pace: 0.7 * fans.speed + 0.3 * fans.agility,
    shooting: 0.7 * fans.attack + 0.3 * fans.clutch,
    passing: fans.iq,
    dribbling: 0.65 * fans.skillMoves + 0.35 * fans.agility,
    defending: fans.defense,
    physical: fans.strength,
  };
  const out = { ...base };
  for (const k of Object.keys(base) as (keyof Stats)[]) {
    const v = (base[k] * PRIOR_VOTES + fromFans[k] * voteCount) / (PRIOR_VOTES + voteCount);
    out[k] = Math.round(Math.min(99, Math.max(40, v)));
  }
  return out;
}

export const overall = (s: Stats) =>
  Math.round((s.pace + s.shooting + s.passing + s.dribbling + s.defending + s.physical) / 6);
