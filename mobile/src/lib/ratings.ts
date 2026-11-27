import { STAT_FIELDS, type StatKey, type StatsMap } from "@shared/card-rating";

/** The 11 stats fans rate, in the website's order (the same votes feed the site and 5IVE STREET). */
export const STATS: { key: StatKey; label: string; color: string }[] = [
  { key: "attack", label: "Attack", color: "#E11D48" },
  { key: "defense", label: "Defence", color: "#2563EB" },
  { key: "speed", label: "Speed", color: "#EAB308" },
  { key: "strength", label: "Strength", color: "#16A34A" },
  { key: "skillMoves", label: "Skill moves", color: "#9333EA" },
  { key: "iq", label: "Football IQ", color: "#0891B2" },
  { key: "aura", label: "Aura", color: "#EA580C" },
  { key: "goalkeeping", label: "Goalkeeping", color: "#D97706" },
  { key: "agility", label: "Agility", color: "#0D9488" },
  { key: "celebration", label: "Celebrations", color: "#DB2777" },
  { key: "clutch", label: "Clutch", color: "#DC2626" },
];

export const EVEN_RATING = Object.fromEntries(STAT_FIELDS.map((f) => [f, 50])) as StatsMap;

/** The colour of an overall: gold for the best, green, then purple. */
export function overallColor(overall: number | null | undefined, palette: { gold: string; green: string; accent: string; muted: string }) {
  if (overall == null) return palette.muted;
  if (overall >= 80) return palette.gold;
  if (overall >= 65) return palette.green;
  return palette.accent;
}
