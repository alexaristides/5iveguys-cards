import type { FantasyPosition } from "@shared/fantasy";

/** A bright, light look: white cards on a soft lilac background, 5iveG purple, a proper green pitch. */
export const colors = {
  bg: "#F4F2FB",
  card: "#FFFFFF",
  cardHi: "#EEEBF8",
  border: "#E3DFF0",
  text: "#160B2E",
  text2: "#4B4462",
  text3: "#857F9B",
  accent: "#7C3AED",     // 5iveG purple (violet-600)
  accentSoft: "#EDE7FE",
  pink: "#DB2777",
  green: "#16A34A",
  greenHi: "#22C55E",
  greenSoft: "#DCFCE7",
  pitch: "#24A148",
  pitchStripe: "#2BAE50",
  gold: "#FACC15",
  goldText: "#B45309",
  goldSoft: "#FEF3C7",
  danger: "#DC2626",
  dangerSoft: "#FEE2E2",
  white: "#FFFFFF",
};

/** The purple → pink of the big headline cards. */
export const HERO_GRADIENT = ["#7C3AED", "#C026D3", "#DB2777"] as const;

export const POSITION_COLOR: Record<FantasyPosition, string> = {
  GK: "#F59E0B", DEF: "#2563EB", MID: "#16A34A", FWD: "#E11D48",
};

/** Soft card shadow for white panels on the lilac background. */
export const shadow = {
  shadowColor: "#2E1065",
  shadowOpacity: 0.07,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
} as const;
