import {
  buildSlots, getPlayerRating,
  type FootballCard, type Formation, type LineupSlot, type Position,
} from "@shared/football";
import type { CollectionItem } from "./types";

export const FORMATION_LIST: Formation[] = ["2-2-2", "3-2-1", "1-3-2", "2-3-1"];

export interface SavedSlot { position: string; posIndex: number; cardId: string }

export function randomSeed() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Owned cards → playable footballers (deduped; "Moment" cards aren't players). */
export function toFootballCards(items: CollectionItem[]): FootballCard[] {
  const seen = new Set<string>();
  const out: FootballCard[] = [];
  for (const item of items) {
    const c = item.card;
    if (!c || seen.has(c.id) || c.position === "Moment") continue;
    seen.add(c.id);
    out.push({
      id: c.id, name: c.name, rarity: c.rarity,
      attribute: (c.attribute ?? "Skill") as FootballCard["attribute"],
      imageUrl: c.imageUrl, kit: c.kit,
    });
  }
  return out;
}

export function serializeSlots(slots: LineupSlot[]): SavedSlot[] {
  return slots
    .filter((s) => s.card !== null)
    .map((s) => ({ position: s.position, posIndex: s.posIndex, cardId: s.card!.id }));
}

export function restoreSlots(formation: Formation, saved: SavedSlot[], pool: FootballCard[]): LineupSlot[] {
  const byId = new Map(pool.map((c) => [c.id, c]));
  const slots = buildSlots(formation);
  for (const s of saved) {
    const slot = slots.find((x) => x.position === s.position && x.posIndex === s.posIndex);
    if (slot) slot.card = byId.get(s.cardId) ?? null;
  }
  return slots;
}

const ALL_POS: Position[] = ["GK", "DEF", "MID", "ATT"];

/** Best available card per slot, preferring each card's natural position (as on the web). */
export function autofill(pool: FootballCard[], formation: Formation): LineupSlot[] {
  const used = new Set<string>();
  return buildSlots(formation).map((slot) => {
    let best: FootballCard | null = null;
    let bestScore = -Infinity;
    for (const card of pool) {
      if (used.has(card.id)) continue;
      const rating = getPlayerRating(card, slot.position);
      const max = Math.max(...ALL_POS.map((p) => getPlayerRating(card, p)));
      const score = rating + (rating >= max - 3 ? 6 : 0);
      if (score > bestScore) { bestScore = score; best = card; }
    }
    if (best) used.add(best.id);
    return { ...slot, card: best };
  });
}
