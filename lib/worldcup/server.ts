// Server-only helpers for World Cup (card lookup + overall calculation).
import { prisma } from "@/lib/db";
import { calcTeamStats, type AssignedPlayer, type FootballCard } from "@/lib/football";
import type { SavedSlot } from "./types";

/**
 * Resolve the user's chosen slots into an engine lineup using their real cards,
 * and compute the squad overall. Returns null if the lineup is invalid.
 */
export async function lineupOverallFromSlots(
  userId: string, slots: SavedSlot[],
): Promise<{ lineup: AssignedPlayer[]; overall: number } | null> {
  if (!Array.isArray(slots) || slots.length < 7) return null;

  const cardIds = slots.map((s) => s.cardId);
  // Only count cards the user actually owns.
  const owned = await prisma.userCard.findMany({
    where: { userId, cardId: { in: cardIds } },
    select: { cardId: true },
  });
  const ownedIds = new Set(owned.map((o) => o.cardId));
  const cards = await prisma.card.findMany({
    where: { id: { in: cardIds } },
    select: { id: true, name: true, rarity: true, attribute: true, imageUrl: true, kit: true },
  });
  const cardMap = new Map<string, FootballCard>(
    cards.map((c) => [c.id, {
      id: c.id, name: c.name, rarity: c.rarity,
      attribute: (c.attribute ?? "Skill") as FootballCard["attribute"],
      imageUrl: c.imageUrl, kit: c.kit,
    }]),
  );

  const lineup: AssignedPlayer[] = [];
  for (const s of slots) {
    const card = cardMap.get(s.cardId);
    if (!card || !ownedIds.has(s.cardId)) return null;
    lineup.push({ card, position: s.position, posIndex: s.posIndex });
  }
  return { lineup, overall: calcTeamStats(lineup).overall };
}
