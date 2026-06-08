import type { Pos } from "@/lib/draft/types";

/** Colour band for a rating badge. */
export function ratingTier(rating: number): { bg: string; text: string; ring: string } {
  if (rating >= 85) return { bg: "bg-emerald-500", text: "text-emerald-950", ring: "ring-emerald-300/50" };
  if (rating >= 75) return { bg: "bg-yellow-400", text: "text-yellow-950", ring: "ring-yellow-200/50" };
  if (rating >= 65) return { bg: "bg-orange-400", text: "text-orange-950", ring: "ring-orange-200/50" };
  return { bg: "bg-zinc-500", text: "text-zinc-950", ring: "ring-zinc-300/40" };
}

/** Short colour for a position-group accent. */
export function posGroupColor(label: Pos): string {
  if (label === "GK") return "text-amber-300";
  if (["RB", "CB", "LB", "RWB", "LWB"].includes(label)) return "text-sky-300";
  if (["CDM", "CM", "CAM", "RM", "LM"].includes(label)) return "text-emerald-300";
  return "text-rose-300";
}

export const ACCENT = "#FFC233"; // World Cup gold
export const PITCH_GREEN = "#0e8a3e";
