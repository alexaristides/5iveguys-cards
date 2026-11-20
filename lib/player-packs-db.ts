/**
 * Player packs against the database: the shop, orders, App Store purchases, opening packs,
 * refunds and the players' earnings. The rules (odds, draw, money) are in lib/player-packs.ts.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { buildSquad } from "./motm";
import { AppleVerifyError, verifyTransaction } from "./apple-iap";
import { WORLD_SLUGS, worldName } from "./worlds";
import { PRINT_SHOP, packById, type CartItem } from "./print-shop";
import {
  drawPlayerPack, guaranteedOdds, otherCardOdds, PLAYER_PACK, playerCards, summariseEarnings, type Rarity,
} from "./player-packs";

export class ShopError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const CARD_FIELDS = {
  id: true, name: true, kit: true, rarity: true, imageUrl: true, backImageUrl: true, position: true, attribute: true, description: true,
} as const;

type PoolCard = Prisma.CardGetPayload<{ select: typeof CARD_FIELDS }>;

async function worldBySlug(slug: string) {
  const channel = WORLD_SLUGS.includes(slug) ? await prisma.channel.findUnique({ where: { slug } }) : null;
  if (!channel) throw new ShopError("Unknown team", 404);
  return channel;
}

/** The team's cards that can come out of packs. */
function packPool(channelId: string): Promise<PoolCard[]> {
  return prisma.card.findMany({ where: { channelId, availableInPacks: true }, select: CARD_FIELDS, orderBy: { name: "asc" } });
}

const SOLD = ["paid", "opened"];

/** Every player you can buy a pack of in one team, with their odds and how many packs fans have bought. */
export async function shop(channelSlug: string) {
  const channel = await worldBySlug(channelSlug);
  const pool = await packPool(channel.id);
  const sold = await prisma.playerPack.groupBy({
    by: ["playerName"],
    where: { channelId: channel.id, status: { in: SOLD }, environment: "Production" },
    _count: true,
  });
  const supporters = new Map(sold.map((s) => [s.playerName, s._count]));

  const squad = buildSquad(pool.map((c) => ({ ...c, channelId: channel.id })));
  const byId = new Map(pool.map((c) => [c.id, c]));
  const players = squad
    .map((p) => {
      const theirs = playerCards(pool, p.name);
      return {
        name: p.name,
        card: byId.get(p.id)!,
        cards: theirs.length,
        odds: guaranteedOdds(theirs),
        supporters: supporters.get(p.name) ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    channel: { id: channel.id, slug: channel.slug, name: worldName(channel.slug) ?? channel.name },
    pack: {
      productId: PLAYER_PACK.productId,
      cardCount: PLAYER_PACK.cardCount,
      price: PLAYER_PACK.price,
      playerSharePence: PLAYER_PACK.playerSharePence,
      otherOdds: otherCardOdds(pool),
    },
    players,
  };
}

/** Starts an order for one player's pack. Its id goes to the App Store with the purchase. */
export async function createOrder(userId: string, channelSlug: string, playerName: string) {
  const channel = await worldBySlug(channelSlug);
  const pool = await packPool(channel.id);
  if (playerCards(pool, playerName).length === 0) throw new ShopError(`There's no pack of ${playerName}`, 404);

  // Tapping Buy again (say after cancelling Apple's sheet) reuses the order.
  const recent = await prisma.playerPack.findFirst({
    where: { userId, channelId: channel.id, playerName, status: "pending", createdAt: { gte: new Date(Date.now() - 60 * 60_000) } },
    orderBy: { createdAt: "desc" },
  });
  const pack = recent ?? await prisma.playerPack.create({ data: { userId, channelId: channel.id, playerName } });
  return { orderId: pack.id, productId: PLAYER_PACK.productId };
}

/** What the app hears back about a purchase: the shape of expo-iap's PurchaseConfirmation. */
export type Confirmation =
  | { status: "entitled"; alreadyGranted: boolean; packId: string }
  | { status: "ownership_conflict"; alreadyGranted: boolean }
  | { status: "verification_delayed"; retryAfterMs: number }
  | { status: "invalid"; reason: string };

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

/**
 * Turns a verified App Store purchase into a paid, unopened pack for whoever placed the order
 * (its appAccountToken). Safe to call any number of times for the same transaction.
 */
export async function confirmApplePurchase(userId: string, jws: string): Promise<Confirmation> {
  let tx;
  try {
    tx = await verifyTransaction(jws);
  } catch (err) {
    if (err instanceof AppleVerifyError && err.settled) return { status: "invalid", reason: err.message };
    console.error("[shop] couldn't verify an App Store purchase:", (err as Error).message);
    return { status: "verification_delayed", retryAfterMs: 60_000 };
  }
  if (tx.productId !== PLAYER_PACK.productId || !tx.transactionId) {
    return { status: "invalid", reason: `Unknown product ${tx.productId}` };
  }
  if (tx.revocationDate) {
    await refundTransaction(tx.transactionId);
    return { status: "invalid", reason: "This purchase was refunded" };
  }

  const settledFor = (pack: { id: string; userId: string | null }): Confirmation =>
    pack.userId === userId
      ? { status: "entitled", alreadyGranted: true, packId: pack.id }
      : { status: "ownership_conflict", alreadyGranted: true };

  const existing = await prisma.playerPack.findUnique({ where: { transactionId: tx.transactionId } });
  if (existing) return settledFor(existing);

  const token = tx.appAccountToken?.toLowerCase();
  const order = token ? await prisma.playerPack.findUnique({ where: { id: token } }).catch(() => null) : null;
  const paid = {
    status: "paid",
    store: "apple",
    productId: tx.productId,
    transactionId: tx.transactionId,
    originalTransactionId: tx.originalTransactionId ?? null,
    environment: String(tx.environment ?? ""),
    priceMilli: tx.price ?? null,
    currency: tx.currency ?? null,
    paidAt: new Date(),
  };

  try {
    let pack;
    if (order?.status === "pending") {
      pack = await prisma.playerPack.update({
        where: { id: order.id },
        data: { ...paid, playerSharePence: order.playerName ? PLAYER_PACK.playerSharePence : 0 },
      });
    } else if (order) {
      // The same order paid twice (two purchases started from one Buy): a second pack of that player.
      pack = await prisma.playerPack.create({
        data: { ...paid, userId: order.userId, channelId: order.channelId, playerName: order.playerName, playerSharePence: order.playerName ? PLAYER_PACK.playerSharePence : 0 },
      });
    } else {
      // No order to match (lost, or bought outside this app's flow): the buyer picks the player when opening.
      pack = await prisma.playerPack.create({ data: { ...paid, userId, channelId: null, playerName: null } });
    }
    if (order?.userId && order.userId !== userId) return { status: "ownership_conflict", alreadyGranted: true };
    return { status: "entitled", alreadyGranted: false, packId: pack.id };
  } catch (err) {
    // Two confirmations of one transaction at once: the other one recorded it.
    if (isUniqueViolation(err)) {
      const again = await prisma.playerPack.findUnique({ where: { transactionId: tx.transactionId } });
      if (again) return settledFor(again);
    }
    throw err;
  }
}

/** Test purchases for the local dev server only (SHOP_DEV_PURCHASES=1), so the shop can be tried without Apple. */
export async function devPurchase(userId: string, orderId: string) {
  if (process.env.NODE_ENV !== "development" || process.env.SHOP_DEV_PURCHASES !== "1") throw new ShopError("Not available", 404);
  const order = await prisma.playerPack.findFirst({ where: { id: orderId, userId, status: "pending" } });
  if (!order) throw new ShopError("Order not found", 404);
  await prisma.playerPack.update({
    where: { id: order.id },
    data: { status: "paid", store: "dev", environment: "Dev", paidAt: new Date(), playerSharePence: PLAYER_PACK.playerSharePence },
  });
  return { status: "entitled" as const, alreadyGranted: false, packId: order.id };
}

/** Marks an App Store transaction refunded: an unopened pack can't be opened any more and the player's share is taken back. */
export async function refundTransaction(transactionId: string) {
  return prisma.playerPack.updateMany({
    where: { transactionId, status: { in: ["paid", "opened"] } },
    data: { status: "refunded", refundedAt: new Date() },
  });
}

interface DrawnCard extends PoolCard {
  isNew: boolean;
  guaranteed: boolean;
}

function packView(p: { id: string; channelId: string | null; playerName: string | null; status: string; paidAt: Date | null; openedAt: Date | null }, cards: Map<string, PoolCard>) {
  return {
    id: p.id,
    channelId: p.channelId,
    playerName: p.playerName,
    status: p.status,
    paidAt: p.paidAt,
    openedAt: p.openedAt,
    card: cards.get(`${p.channelId}:${p.playerName}`) ?? null,
  };
}

/** Your unopened packs, and the last ones you opened. */
export async function myPacks(userId: string) {
  const [unopened, opened] = await Promise.all([
    prisma.playerPack.findMany({ where: { userId, status: "paid" }, orderBy: { paidAt: "asc" } }),
    prisma.playerPack.findMany({ where: { userId, status: "opened" }, orderBy: { openedAt: "desc" }, take: 20 }),
  ]);
  // Each pack shows its player's Home Kit card.
  const channelIds = [...new Set([...unopened, ...opened].map((p) => p.channelId).filter((c): c is string => !!c))];
  const kitCards = await prisma.card.findMany({ where: { channelId: { in: channelIds } }, select: { ...CARD_FIELDS, channelId: true } });
  const faces = new Map<string, PoolCard>();
  for (const p of buildSquad(kitCards)) faces.set(`${p.channelId}:${p.name}`, kitCards.find((c) => c.id === p.id)!);
  return { unopened: unopened.map((p) => packView(p, faces)), opened: opened.map((p) => packView(p, faces)) };
}

/**
 * Opens a paid pack: draws its 5 cards and adds every one to the collection (duplicates too).
 * Opening it again just shows the same cards. A pack without a player needs `choice`.
 */
export async function openPack(userId: string, packId: string, choice?: { channelSlug: string; playerName: string }) {
  const pack = await prisma.playerPack.findFirst({ where: { id: packId, userId } });
  if (!pack) throw new ShopError("Pack not found", 404);

  if (pack.status === "opened") {
    const ids: string[] = JSON.parse(pack.cardIds ?? "[]");
    const found = new Map((await prisma.card.findMany({ where: { id: { in: ids } }, select: CARD_FIELDS })).map((c) => [c.id, c]));
    const cards = ids.flatMap((id, i) => {
      const c = found.get(id);
      return c ? [{ ...c, isNew: false, guaranteed: i === ids.length - 1 }] : [];
    });
    return { packId: pack.id, playerName: pack.playerName, cards, alreadyOpened: true };
  }
  if (pack.status === "refunded") throw new ShopError("This pack was refunded, so it can't be opened.", 409);
  if (pack.status !== "paid") throw new ShopError("This pack hasn't been paid for yet.", 409);

  let channelId = pack.channelId;
  let playerName = pack.playerName;
  if (!channelId || !playerName) {
    if (!choice) throw new ShopError("Pick a player for this pack.", 422);
    channelId = (await worldBySlug(choice.channelSlug)).id;
    playerName = choice.playerName;
  }
  const pool = await packPool(channelId);
  if (playerCards(pool, playerName).length === 0) throw new ShopError(`There are no cards of ${playerName} right now.`, 409);
  const drawn = drawPlayerPack(pool, playerName);

  const owned = new Set(
    (await prisma.userCard.findMany({ where: { userId, cardId: { in: drawn.map((c) => c.id) } }, select: { cardId: true } })).map((c) => c.cardId),
  );
  const seen = new Set<string>();
  const cards: DrawnCard[] = drawn.map((c, i) => {
    const isNew = !owned.has(c.id) && !seen.has(c.id);
    seen.add(c.id);
    return { ...c, isNew, guaranteed: i === drawn.length - 1 };
  });
  const cardIds = JSON.stringify(drawn.map((c) => c.id));

  const opened = await prisma.$transaction(async (db) => {
    const claim = await db.playerPack.updateMany({
      where: { id: pack.id, status: "paid" },
      data: {
        status: "opened",
        openedAt: new Date(),
        cardIds,
        channelId,
        playerName,
        ...(pack.playerName ? {} : { playerSharePence: PLAYER_PACK.playerSharePence }),
      },
    });
    if (claim.count === 0) return false; // opened (or refunded) by another request meanwhile
    await db.userCard.createMany({ data: drawn.map((c) => ({ userId, channelId, cardId: c.id })) });
    await db.packOpen.create({ data: { userId, channelId, packType: `player:${playerName}`, cardIds, pointCost: 0 } });
    return true;
  });
  if (!opened) return openPack(userId, packId);
  return { packId: pack.id, playerName, cards, alreadyOpened: false };
}

/** Each player's pack sales, earnings, payouts and what they're still owed; and the latest sales. */
export async function earnings({ includeTests = false } = {}) {
  const environment = includeTests ? undefined : "Production";
  const [sales, payouts, channels, recent, printOrders] = await Promise.all([
    prisma.playerPack.findMany({
      where: { status: { in: ["paid", "opened", "refunded"] }, environment },
      select: { channelId: true, playerName: true, status: true, playerSharePence: true, priceMilli: true, currency: true },
    }),
    prisma.playerPayout.findMany({ orderBy: { paidAt: "desc" } }),
    prisma.channel
      .findMany({ where: { slug: { in: WORLD_SLUGS } }, select: { id: true, slug: true, name: true } })
      .then((cs) => cs.map((c) => ({ ...c, name: worldName(c.slug) ?? c.name }))),
    prisma.playerPack.findMany({
      where: { status: { in: ["paid", "opened", "refunded"] }, environment },
      orderBy: { paidAt: "desc" },
      take: 50,
      select: {
        id: true, channelId: true, playerName: true, status: true, environment: true, priceMilli: true, currency: true, paidAt: true, refundedAt: true,
        user: { select: { name: true } },
      },
    }),
    prisma.printOrder.findMany({
      where: { status: { in: ["paid", "posted"] }, ...(includeTests ? {} : { livemode: true }) },
      select: { items: true },
    }),
  ]);

  // Printed player packs from the web shop (lib/print-shop.ts) earn their player a share too.
  const printChannelId = channels.find((c) => c.slug === PRINT_SHOP.channelSlug)?.id;
  const printSales = printChannelId
    ? printOrders.flatMap((o) =>
        (JSON.parse(o.items) as CartItem[]).flatMap((i) => {
          const player = packById(i.packId)?.player;
          return player
            ? Array.from({ length: i.qty }, () => ({
                channelId: printChannelId, playerName: player, status: "paid", playerSharePence: PRINT_SHOP.playerSharePence,
              }))
            : [];
        }),
      )
    : [];

  // Takings by currency (the App Store charges each country in its own), before Apple's cut.
  const takings = new Map<string, number>();
  for (const s of sales) {
    if (s.status === "refunded" || s.priceMilli === null || !s.currency) continue;
    takings.set(s.currency, (takings.get(s.currency) ?? 0) + s.priceMilli);
  }

  return {
    playerSharePence: PLAYER_PACK.playerSharePence,
    channels,
    players: summariseEarnings(
      [...sales.filter((s): s is typeof s & { channelId: string } => !!s.channelId), ...printSales],
      payouts,
    ),
    takings: [...takings].map(([currency, milli]) => ({ currency, milli })),
    payouts,
    recent: recent.map(({ user, ...r }) => ({ ...r, buyer: user?.name ?? null })),
  };
}

export type ShopResponse = Awaited<ReturnType<typeof shop>>;
export type MyPacksResponse = Awaited<ReturnType<typeof myPacks>>;
export type OpenPackResponse = Awaited<ReturnType<typeof openPack>>;
export type { Rarity };
