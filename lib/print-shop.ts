/**
 * The printed card shop at /shop: physical 1st Edition packs sold through Stripe Checkout and
 * posted from the UK. The rules (packs, prices, delivery, dates) live here; Stripe and the
 * database are in lib/print-shop-db.ts. Pure TypeScript (no Next/Prisma/Stripe imports).
 */

export const SITE_URL = "https://www.5iveg.com";
export const SUPPORT_EMAIL = "support@5iveg.com";
export const SELLER = "Genius Technologies Ltd, trading as 5iveG";

export const PRINT_SHOP = {
  currency: "gbp",
  /** One pack on its own. */
  packPence: 999,
  /** Any `size` packs together cost `pence`, mixed however the buyer likes. */
  bundle: { size: 3, pence: 2500 },
  cardCount: 5,
  maxPerPack: 20,
  maxPacks: 40,
  /** What each player is owed per pack of theirs sold (paid by hand, never shown to buyers). */
  playerSharePence: 100,
  /** The team whose squad the printed packs are (for the players' earnings). */
  channelSlug: "5iveguysfc",
  /** Orders paid before this are 1st Edition and posted by `postBy`. Midnight in London (GMT in December). */
  firstEditionCutoff: "2026-12-14T00:00:00Z",
  printStarts: "14 December",
  postBy: "20 December",
} as const;

export type Zone = "uk" | "world";

/** UK delivery covers Great Britain, Northern Ireland, the Isle of Man and the Channel Islands. */
export const UK_COUNTRIES = ["GB", "IM", "JE", "GG"] as const;

export const DELIVERY: Record<Zone, { pence: number; label: string; short: string }> = {
  uk: { pence: 299, label: "UK delivery", short: "UK" },
  world: { pence: 799, label: "Worldwide delivery", short: "Outside the UK" },
};

export interface PrintPack {
  id: string; // also the picture's name in public/shop/packs
  title: string;
  kind: "squad" | "player";
  player?: string; // the card name in the database, for the player's earnings
  blurb: string;
}

const PLAYERS = [
  "Adrian", "Barney", "Gravz", "Jack", "Joad", "Lats", "Louis", "Milo",
  "Neymar", "Oscar", "Raptis", "Ryan", "Stan", "SweetChilli", "Theo", "Uriel",
];

/** The packs on sale: the squad (random) pack, then one per player with a Home Kit card. */
export const PRINT_PACKS: PrintPack[] = [
  {
    id: "Squad",
    title: "Squad pack",
    kind: "squad",
    blurb: `${PRINT_SHOP.cardCount} cards from the whole 5ive Guys squad. Who will you pull?`,
  },
  ...PLAYERS.map(
    (p): PrintPack => ({
      id: p,
      title: `${p} pack`,
      kind: "player",
      player: p,
      blurb: `${PRINT_SHOP.cardCount} cards, with at least one ${p} card guaranteed.`,
    }),
  ),
];

export const packById = (id: string) => PRINT_PACKS.find((p) => p.id === id);
export const packImage = (id: string) => `/shop/packs/${id}.jpg`;

/** What a number of packs costs before delivery: every full bundle at the bundle price, the rest at full price. */
export function priceFor(packs: number) {
  const n = Math.max(0, Math.floor(packs));
  const { size, pence } = PRINT_SHOP.bundle;
  const bundles = Math.floor(n / size);
  const subtotalPence = n * PRINT_SHOP.packPence;
  const discountPence = bundles * (size * PRINT_SHOP.packPence - pence);
  return { packs: n, bundles, subtotalPence, discountPence, totalPence: subtotalPence - discountPence };
}

/**
 * The nudge towards the next bundle: how many more packs complete it and what that changes the
 * total by (negative if the bigger order were ever cheaper).
 */
export function nextBundle(packs: number): { more: number; changePence: number } | null {
  const left = packs % PRINT_SHOP.bundle.size;
  if (packs === 0 || left === 0) return null;
  const more = PRINT_SHOP.bundle.size - left;
  return { more, changePence: priceFor(packs + more).totalPence - priceFor(packs).totalPence };
}

export const formatPounds = (pence: number) =>
  `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`;

export interface CartItem {
  packId: string;
  qty: number;
}

/** Checks a basket from the shop page. Unknown packs and silly quantities are refused. */
export function parseCart(body: unknown): { ok: true; items: CartItem[]; zone: Zone } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const zone = b.zone === "uk" || b.zone === "world" ? b.zone : null;
  if (!zone) return { ok: false, error: "Choose where we're posting to." };
  const raw = Array.isArray(b.items) ? b.items : [];
  const merged = new Map<string, number>();
  for (const it of raw) {
    const r = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
    const id = typeof r.packId === "string" ? r.packId : "";
    const qty = Number(r.qty);
    if (!packById(id) || !Number.isInteger(qty) || qty < 1) return { ok: false, error: "Something in your basket isn't on sale." };
    merged.set(id, (merged.get(id) ?? 0) + qty);
  }
  const items = [...merged].map(([packId, qty]) => ({ packId, qty }));
  if (!items.length) return { ok: false, error: "Your basket is empty." };
  if (items.some((i) => i.qty > PRINT_SHOP.maxPerPack)) return { ok: false, error: `Up to ${PRINT_SHOP.maxPerPack} of each pack per order.` };
  if (countPacks(items) > PRINT_SHOP.maxPacks) return { ok: false, error: `Up to ${PRINT_SHOP.maxPacks} packs per order.` };
  // Same order as the shop, so the receipt reads the same way.
  items.sort((a, b2) => PRINT_PACKS.findIndex((p) => p.id === a.packId) - PRINT_PACKS.findIndex((p) => p.id === b2.packId));
  return { ok: true, items, zone };
}

export const countPacks = (items: CartItem[]) => items.reduce((n, i) => n + i.qty, 0);

/** "Milo:2,Squad:1": the basket in the Stripe session's metadata (500 characters at most). */
export const itemsToMeta = (items: CartItem[]) => items.map((i) => `${i.packId}:${i.qty}`).join(",");
export function itemsFromMeta(s: string | undefined | null): CartItem[] {
  return (s ?? "")
    .split(",")
    .map((part) => part.split(":"))
    .map(([packId, qty]) => ({ packId, qty: Number(qty) }))
    .filter((i) => packById(i.packId) && Number.isInteger(i.qty) && i.qty > 0);
}

/** The Stripe coupon for `bundles` bundles, named after the deal; its id carries the amounts so a price change makes a new one. */
export function bundleCoupon(bundles: number) {
  const { size, pence } = PRINT_SHOP.bundle;
  const each = size * PRINT_SHOP.packPence - pence;
  return {
    id: `PACKS-${size}FOR${pence}-AT${PRINT_SHOP.packPence}-X${bundles}`,
    amountOffPence: bundles * each,
    name: `${size} packs for ${formatPounds(pence)}${bundles > 1 ? ` (×${bundles})` : ""}`,
  };
}

export const isFirstEdition = (paidAt: Date) => paidAt.getTime() < Date.parse(PRINT_SHOP.firstEditionCutoff);

/** The delivery promise shown in the shop and at checkout. */
export function deliveryPromise(now: Date): string {
  return isFirstEdition(now)
    ? `Order before ${PRINT_SHOP.printStarts}: every card is 1st Edition, and we'll post your packs by ${PRINT_SHOP.postBy}.`
    : "1st Edition has sold out. New orders go into our next print run, and we'll email you when your packs are on their way.";
}

export const REFUND_POLICY =
  "All sales are final: we don't offer refunds or exchanges. This doesn't affect your statutory rights.";

export type OrderStatus = "paid" | "posted" | "cancelled";
export const ORDER_STATUSES: OrderStatus[] = ["paid", "posted", "cancelled"];

/** Packs still to print and post, by pack, from orders that are paid but not yet posted. */
export function toMake(orders: { status: string; items: CartItem[] }[]) {
  const counts = new Map<string, number>();
  for (const o of orders) {
    if (o.status !== "paid") continue;
    for (const i of o.items) counts.set(i.packId, (counts.get(i.packId) ?? 0) + i.qty);
  }
  return PRINT_PACKS.filter((p) => counts.has(p.id)).map((p) => ({ packId: p.id, title: p.title, qty: counts.get(p.id)! }));
}
