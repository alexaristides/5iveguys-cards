/**
 * The squad in 5IVE STREET: how each player looks (taken from their Home Kit
 * card) and how they play. Stats are seeded from the card's attribute and
 * position; fan ratings from the app are blended in (see `blendStats`).
 */

export type HairStyle =
  | "curlyMop" | "curlyTop" | "shortCurly" | "messy" | "locs" | "quiff" | "longCurly" | "afro" | "twists";
export type Beard = "none" | "stubble" | "goatee" | "full";
export type Celebration =
  | "airplane" | "kneeSlide" | "flex" | "siuu" | "fistPump" | "pointUp"
  | "backflip" | "bellyDive" | "shush" | "cupEars" | "robot" | "dance" | "salute" | "rockBaby" | "calma" | "archer";

/** Every celebration. A player does their own (in their roster entry) first, then a different one for each goal. */
export const CELEBRATIONS: Celebration[] = [
  "airplane", "kneeSlide", "flex", "siuu", "fistPump", "pointUp",
  "backflip", "bellyDive", "shush", "cupEars", "robot", "dance", "salute", "rockBaby", "calma", "archer",
];
/** Celebrations the scorer's teammates join in with when they get to them. */
export const GROUP_CELEBRATIONS: Celebration[] = ["robot", "dance", "salute", "rockBaby"];

/** Where the face is on a card, as fractions of the image: midpoint between the eyes, and the chin. */
export interface FaceCrop {
  x: number;
  y: number;
  chin: number;
  /** Narrow the face mask (0..1) for faces turned to the side, so the card background doesn't show. */
  w?: number;
  /** Degrees the head is tilted clockwise in the photo (the slope of the eye line), to level it. */
  tilt?: number;
}

export interface Look {
  skin: string;
  hair: string;
  /** Lighter colour for the tips of the hair (curls), if any. */
  hairTip?: string;
  hairStyle: HairStyle;
  /** Volume of curly styles (1 = as drawn for the first player with that style). */
  hairSize?: number;
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
    celebration: "salute",
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
  // ── The rest of the squad (in card order) ────────────────────────────────
  {
    key: "adrian",
    name: "Adrian",
    card: "/cards/home/Adrian_Home.jpg",
    // LW · Power
    look: {
      skin: "#6b4430", hair: "#141010", hairStyle: "shortCurly", beard: "goatee",
      height: 1.83, build: 1.02, boots: "#f5c518", smile: true, earrings: true,
      face: { x: 0.488, y: 0.241, chin: 0.468, tilt: -3 },
    },
    stats: { pace: 86, shooting: 78, passing: 68, dribbling: 77, defending: 58, physical: 80 },
    celebration: "backflip",
  },
  {
    key: "gravz",
    name: "Gravz",
    card: "/cards/home/Gravz_Home.jpg",
    // CAM · Pace
    look: {
      skin: "#4a2e22", hair: "#121010", hairStyle: "shortCurly", beard: "none",
      height: 1.78, build: 1.06, boots: "#22c55e", smile: true,
      face: { x: 0.495, y: 0.277, chin: 0.505, tilt: -2 },
    },
    stats: { pace: 88, shooting: 74, passing: 79, dribbling: 80, defending: 52, physical: 62 },
    celebration: "dance",
  },
  {
    key: "jack",
    name: "Jack",
    card: "/cards/home/Jack_Home.jpg",
    // ST · Skill
    look: {
      skin: "#e8bfa0", hair: "#6b3f22", hairTip: "#8a5530", hairStyle: "quiff", beard: "none",
      height: 1.78, build: 0.95, boots: "#14b8a6", smile: false,
      face: { x: 0.563, y: 0.304, chin: 0.52, w: 0.85, tilt: -9 },
    },
    stats: { pace: 76, shooting: 84, passing: 72, dribbling: 85, defending: 45, physical: 62 },
    celebration: "shush",
  },
  {
    key: "joad",
    name: "Joad",
    card: "/cards/home/Joad_Home.jpg",
    // DEF · Pace
    look: {
      skin: "#4a2c1c", hair: "#121010", hairStyle: "curlyTop", hairSize: 0.6, beard: "none",
      height: 1.85, build: 0.95, boots: "#a78bfa", smile: true, earrings: true,
      face: { x: 0.588, y: 0.293, chin: 0.54, w: 0.75, tilt: 2 },
    },
    stats: { pace: 88, shooting: 58, passing: 68, dribbling: 66, defending: 84, physical: 80 },
    celebration: "bellyDive",
  },
  {
    key: "lats",
    name: "Lats",
    card: "/cards/home/Lats_Home.jpg",
    // DEF · Power
    look: {
      skin: "#4e2f20", hair: "#141010", hairStyle: "curlyTop", hairSize: 0.6, beard: "none",
      height: 1.84, build: 1.04, boots: "#18181b", smile: true,
      face: { x: 0.407, y: 0.268, chin: 0.493, w: 0.9 },
    },
    stats: { pace: 70, shooting: 60, passing: 72, dribbling: 58, defending: 90, physical: 92 },
    celebration: "robot",
  },
  {
    key: "milo",
    name: "Milo",
    card: "/cards/home/Milo_Home.jpg",
    // LW · Pace
    look: {
      skin: "#d9a986", hair: "#2b1f17", hairTip: "#5a4433", hairStyle: "longCurly", beard: "goatee",
      height: 1.78, build: 0.92, boots: "#fde047", smile: false, earrings: true,
      face: { x: 0.441, y: 0.288, chin: 0.515, w: 0.85, tilt: -5 },
    },
    stats: { pace: 92, shooting: 74, passing: 74, dribbling: 86, defending: 50, physical: 58 },
    celebration: "archer",
  },
  {
    key: "ryan",
    name: "Ryan",
    card: "/cards/home/Ryan_Home.jpg",
    // CM · Power
    look: {
      skin: "#9c6646", hair: "#161210", hairTip: "#2e241d", hairStyle: "afro", hairSize: 0.8, beard: "none",
      height: 1.75, build: 1.0, boots: "#38bdf8", smile: true,
      face: { x: 0.496, y: 0.312, chin: 0.545, tilt: -4 },
    },
    stats: { pace: 74, shooting: 76, passing: 82, dribbling: 74, defending: 72, physical: 84 },
    celebration: "fistPump",
  },
  {
    key: "stan",
    name: "Stan",
    card: "/cards/home/Stan_Home.jpg",
    // ST · Skill
    look: {
      skin: "#4b2d1f", hair: "#121010", hairStyle: "shortCurly", beard: "stubble",
      height: 1.83, build: 1.04, boots: "#dc2626", smile: false,
      face: { x: 0.489, y: 0.278, chin: 0.493 },
    },
    stats: { pace: 75, shooting: 86, passing: 72, dribbling: 84, defending: 48, physical: 80 },
    celebration: "cupEars",
  },
  {
    key: "sweetchilli",
    name: "SweetChilli",
    card: "/cards/home/SweetChilli_Home.jpg",
    // LW · Pace
    look: {
      skin: "#4c2c1e", hair: "#121010", hairTip: "#2e241d", hairStyle: "afro", hairSize: 1.3, beard: "stubble",
      height: 1.85, build: 1.1, boots: "#ff4d00", smile: true,
      face: { x: 0.486, y: 0.363, chin: 0.58 },
    },
    stats: { pace: 90, shooting: 80, passing: 76, dribbling: 82, defending: 50, physical: 72 },
    celebration: "rockBaby",
  },
  {
    key: "theo",
    name: "Theo",
    card: "/cards/home/Theo_Home.jpg",
    // DEF · Skill
    look: {
      skin: "#b98260", hair: "#21150d", hairTip: "#8a5a32", hairStyle: "twists", beard: "goatee",
      height: 1.78, build: 0.96, boots: "#e5e7eb", smile: false, earrings: true,
      face: { x: 0.507, y: 0.308, chin: 0.528, tilt: 2 },
    },
    stats: { pace: 76, shooting: 66, passing: 84, dribbling: 82, defending: 84, physical: 72 },
    celebration: "calma",
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
