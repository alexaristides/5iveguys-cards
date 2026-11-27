import { STAT_FIELDS, type StatKey, type StatsMap } from "@/lib/card-rating";
import type { SquadRating } from "@/lib/player-ratings";

/** The team the Players and MOTM tabs cover (the app's MOTM_CHANNEL). */
export const SQUAD_CHANNEL = "5iveguysfc";

export type { SquadRating };

/** The 11 stats fans rate, as the app lists them (the same votes feed the site, the app and 5IVE STREET). */
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

/** The badge colour of an overall, as in the app: gold for the best, green, then purple. */
export function overallClass(overall: number | null | undefined) {
  if (overall == null) return "bg-ink-3 text-white";
  if (overall >= 80) return "bg-yellow-400 text-ink";
  if (overall >= 65) return "bg-green-600 text-white";
  return "bg-violet-600 text-white";
}
