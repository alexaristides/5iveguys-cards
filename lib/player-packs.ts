/**
 * Player packs: a paid pack built around one player. Every pack holds 5 cards, the last one
 * guaranteed to be the chosen player's, and £1 of the price goes to that player.
 * Pure TypeScript (no Next/Prisma imports): shared by the API, the admin page and the app.
 */
import { isSquadCard } from "./motm";

export type Rarity = "common" | "rare" | "epic" | "legendary";
export const RARITIES: readonly Rarity[] = ["common", "rare", "epic", "legendary"];

export const PLAYER_PACK = {
  /** The one App Store product (a consumable). The player is picked in the app and sent with the order. */
  productId: "com.fiveguysfc.cards.playerpack",
  cardCount: 5,
  /** Shown until the App Store's own (localised) price loads. App Store Connect sets the real price. */
  price: "£7.99",
  /** Credited to the player for every paid pack, in pence. */
  playerSharePence: 100,
  /** Odds for the four cards that aren't the guaranteed one, in percent. */
  odds: { common: 60, rare: 25, epic: 12, legendary: 3 } as Record<Rarity, number>,
} as const;

/** A pack's life: ordered (waiting for the store), paid (unopened), opened, or refunded. */
export type PackStatus = "pending" | "paid" | "opened" | "refunded";

export interface PackPoolCard {
  id: string;
  name: string;
  kit: string | null;
  rarity: string;
}

/** The squad's names, one per player, from their kit cards. */
export function squadNames(cards: readonly PackPoolCard[]): string[] {
  return [...new Set(cards.filter(isSquadCard).map((c) => c.name))].sort((a, b) => a.localeCompare(b));
}

/**
 * Whose card this is. A kit card is its player's; a special edition or moment named after a
 * squad player ("Louis Ballon d'Or", "Adrian Clamptown") is theirs too. Team moments are nobody's.
 */
export function cardPlayer(card: PackPoolCard, squad: readonly string[]): string | null {
  if (isSquadCard(card)) return card.name;
  const longestFirst = [...squad].sort((a, b) => b.length - a.length);
  return longestFirst.find((n) => card.name === n || card.name.startsWith(`${n} `)) ?? null;
}

/** Every card of one player in the pool. */
export function playerCards<C extends PackPoolCard>(pool: readonly C[], player: string): C[] {
  const squad = squadNames(pool);
  return pool.filter((c) => cardPlayer(c, squad) === player);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Odds for a pick from `cards` by `odds`: rarities the cards don't have fall to common
 * (or, with no commons either, are shared across what's there). Percent, one decimal.
 */
function oddsAmong(cards: readonly PackPoolCard[], odds: Record<Rarity, number>, foldIntoCommon: boolean) {
  const present = RARITIES.filter((r) => cards.some((c) => c.rarity === r));
  const weights = Object.fromEntries(RARITIES.map((r) => [r, present.includes(r) ? odds[r] : 0])) as Record<Rarity, number>;
  if (foldIntoCommon && present.includes("common")) {
    weights.common += RARITIES.filter((r) => !present.includes(r)).reduce((s, r) => s + odds[r], 0);
  }
  const total = RARITIES.reduce((s, r) => s + weights[r], 0);
  return Object.fromEntries(RARITIES.map((r) => [r, total ? round1((weights[r] / total) * 100) : 0])) as Record<Rarity, number>;
}

/** Chance of each rarity for the guaranteed card: the pack odds, among the rarities the player has. */
export function guaranteedOdds(cards: readonly PackPoolCard[]): Record<Rarity, number> {
  return oddsAmong(cards, PLAYER_PACK.odds, false);
}

/** Chance of each rarity for the other cards. A rarity the team has no cards of becomes a common. */
export function otherCardOdds(pool: readonly PackPoolCard[]): Record<Rarity, number> {
  return oddsAmong(pool, PLAYER_PACK.odds, true);
}

/** Kit cards are the most likely within a rarity; specials and moments a third as likely. */
const weightOf = (c: PackPoolCard) => (isSquadCard(c) ? 1 : 0.35);

function pick<T>(items: readonly T[], weight: (t: T) => number, rng: () => number): T {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let r = rng() * total;
  for (const t of items) {
    r -= weight(t);
    if (r < 0) return t;
  }
  return items[items.length - 1];
}

function pickFrom<C extends PackPoolCard>(cards: readonly C[], odds: Record<Rarity, number>, rng: () => number): C {
  const rarity = pick(RARITIES.filter((r) => odds[r] > 0), (r) => odds[r], rng);
  return pick(cards.filter((c) => c.rarity === rarity), weightOf, rng);
}

/**
 * Draws a player pack from the team's pack cards: four cards by the pack odds, then the
 * guaranteed card of `player` last (so it's the final reveal).
 */
export function drawPlayerPack<C extends PackPoolCard>(pool: readonly C[], player: string, rng: () => number = Math.random): C[] {
  const theirs = playerCards(pool, player);
  if (theirs.length === 0) throw new Error(`No cards of ${player} to put in a pack`);
  const others = otherCardOdds(pool);
  const cards: C[] = [];
  for (let i = 0; i < PLAYER_PACK.cardCount - 1; i++) cards.push(pickFrom(pool, others, rng));
  cards.push(pickFrom(theirs, guaranteedOdds(theirs), rng));
  return cards;
}

/** "£7.50" from pence; `short` drops ".00" from whole pounds ("£1"). */
export function formatPence(pence: number, { short = false } = {}): string {
  const sign = pence < 0 ? "−" : "";
  const pounds = Math.abs(pence) / 100;
  return `${sign}£${short && Number.isInteger(pounds) ? pounds : pounds.toFixed(2)}`;
}

/** An App Store price (thousandths of the currency) as money, e.g. "£7.99" or "$7.99". */
export function formatMilli(milli: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(milli / 1000);
  } catch {
    return `${(milli / 1000).toFixed(2)} ${currency}`;
  }
}

// ── Player earnings ───────────────────────────────────────────────────────────

export interface PackSale {
  channelId: string;
  playerName: string | null;
  status: string;
  playerSharePence: number;
}

export interface PlayerPayoutRow {
  channelId: string;
  playerName: string;
  amountPence: number;
}

export interface PlayerEarnings {
  channelId: string;
  playerName: string;
  /** Paid packs, opened or not, not counting refunds. */
  packs: number;
  refunded: number;
  earnedPence: number;
  paidOutPence: number;
  /** Still to pay the player. */
  owedPence: number;
}

/** What each player has earned from their packs, been paid, and is still owed. Most owed first. */
export function summariseEarnings(sales: readonly PackSale[], payouts: readonly PlayerPayoutRow[]): PlayerEarnings[] {
  const rows = new Map<string, PlayerEarnings>();
  const row = (channelId: string, playerName: string) => {
    const key = `${channelId}:${playerName}`;
    let r = rows.get(key);
    if (!r) rows.set(key, (r = { channelId, playerName, packs: 0, refunded: 0, earnedPence: 0, paidOutPence: 0, owedPence: 0 }));
    return r;
  };
  for (const s of sales) {
    if (!s.playerName) continue;
    if (s.status === "paid" || s.status === "opened") {
      const r = row(s.channelId, s.playerName);
      r.packs += 1;
      r.earnedPence += s.playerSharePence;
    } else if (s.status === "refunded") {
      row(s.channelId, s.playerName).refunded += 1;
    }
  }
  for (const p of payouts) row(p.channelId, p.playerName).paidOutPence += p.amountPence;
  for (const r of rows.values()) r.owedPence = r.earnedPence - r.paidOutPence;
  return [...rows.values()].sort((a, b) => b.owedPence - a.owedPence || b.packs - a.packs || a.playerName.localeCompare(b.playerName));
}
