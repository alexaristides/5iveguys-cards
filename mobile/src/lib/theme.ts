import type { Rarity } from "@shared/cards";

export const colors = {
  bg: "#0a0a0a",
  card: "#18181b",      // zinc-900
  cardHi: "#27272a",    // zinc-800
  border: "#27272a",
  text: "#ffffff",
  text2: "#a1a1aa",     // zinc-400
  text3: "#71717a",     // zinc-500
  accent: "#9333ea",    // purple-600
  accentHi: "#a855f7",  // purple-500
  green: "#16a34a",
  greenHi: "#22c55e",
  user: "#3b82f6",
  cpu: "#ef4444",
  gold: "#fbbf24",
  youtube: "#ff0033",
  danger: "#ef4444",
};

export const rarityColor: Record<Rarity, string> = {
  common: "#a1a1aa",
  rare: "#60a5fa",
  epic: "#c084fc",
  legendary: "#fbbf24",
};

export const rarityLabel: Record<Rarity, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

export const RARITY_ORDER: Rarity[] = ["legendary", "epic", "rare", "common"];
