/**
 * One-time migration: bootstraps the Channel + Card DB models
 * and migrates existing user data to the per-channel schema.
 *
 * Run after `npm run db:push` with:
 *   npx tsx prisma/seed.ts
 */

import { PrismaClient } from "@prisma/client";
import { CARDS } from "../lib/cards";

const prisma = new PrismaClient();

async function main() {
  const youtubeChannelId = process.env.YOUTUBE_CHANNEL_ID;
  if (!youtubeChannelId) throw new Error("YOUTUBE_CHANNEL_ID env var required");

  console.log("=== Multi-channel migration ===\n");

  // 1. Create (or find) the initial channel
  const channel = await prisma.channel.upsert({
    where: { slug: "5iveguysfc" },
    create: {
      slug: "5iveguysfc",
      name: "5iveguysfc",
      youtubeChannelId,
      description: "Official 5iveguysfc fan loyalty programme",
      thumbnailUrl: "/cards/home/Barney_Home.jpg",
    },
    update: { youtubeChannelId },
  });
  console.log(`Channel: ${channel.name} (${channel.id})`);

  // 2. Seed DB cards from lib/cards.ts (upsert by legacyId to be idempotent)
  const legacyIdToDbId = new Map<string, string>();
  for (const card of CARDS) {
    const existing = await prisma.card.findFirst({
      where: { channelId: channel.id, legacyId: card.id },
    });
    if (existing) {
      legacyIdToDbId.set(card.id, existing.id);
      continue;
    }
    const dbCard = await prisma.card.create({
      data: {
        channelId: channel.id,
        legacyId: card.id,
        name: card.name,
        kit: card.kit ?? null,
        rarity: card.rarity as "common" | "rare" | "epic" | "legendary",
        imageUrl: card.image,
        backImageUrl: card.backImage ?? null,
        attribute: card.attribute,
        description: card.description ?? null,
      },
    });
    legacyIdToDbId.set(card.id, dbCard.id);
  }
  console.log(`Cards seeded: ${legacyIdToDbId.size}`);

  // 3. Migrate UserCard.cardId from legacy IDs to DB Card IDs
  const userCards = await prisma.userCard.findMany({ where: { channelId: null } });
  let migratedCards = 0;
  for (const uc of userCards) {
    const newCardId = legacyIdToDbId.get(uc.cardId);
    if (newCardId) {
      await prisma.userCard.update({
        where: { id: uc.id },
        data: { cardId: newCardId, channelId: channel.id },
      });
      migratedCards++;
    } else {
      // Unknown legacy ID — attach to channel anyway so it's not orphaned
      await prisma.userCard.update({
        where: { id: uc.id },
        data: { channelId: channel.id },
      });
    }
  }
  console.log(`UserCards migrated: ${migratedCards} / ${userCards.length}`);

  // 4. Create UserChannelStats for all existing users (from User.points)
  const users = await prisma.user.findMany();
  let statsCreated = 0;
  for (const user of users) {
    await prisma.userChannelStats.upsert({
      where: { userId_channelId: { userId: user.id, channelId: channel.id } },
      create: {
        userId: user.id,
        channelId: channel.id,
        points: user.points,
        totalEarned: user.totalEarned,
      },
      update: {},
    });
    statsCreated++;
  }
  console.log(`UserChannelStats created: ${statsCreated}`);

  // 5. Set channelId on YoutubeSync records that don't have one
  const syncRecords = await prisma.youtubeSync.findMany({ where: { channelId: null } });
  for (const sync of syncRecords) {
    await prisma.youtubeSync.update({
      where: { id: sync.id },
      data: { channelId: channel.id },
    });
  }
  console.log(`YoutubeSync migrated: ${syncRecords.length}`);

  // 6. Set channelId on PointsEvent records
  const eventsUpdated = await prisma.pointsEvent.updateMany({
    where: { channelId: null },
    data: { channelId: channel.id },
  });
  console.log(`PointsEvents migrated: ${eventsUpdated.count}`);

  // 7. Set channelId on PackOpen records
  const packsUpdated = await prisma.packOpen.updateMany({
    where: { channelId: null },
    data: { channelId: channel.id },
  });
  console.log(`PackOpens migrated: ${packsUpdated.count}`);

  // 8. Set channelId on VideoMeta records (and remove duplicates if needed)
  const videoMetaUpdated = await prisma.videoMeta.updateMany({
    where: { channelId: null },
    data: { channelId: channel.id },
  });
  console.log(`VideoMeta migrated: ${videoMetaUpdated.count}`);

  console.log("\n=== Migration complete ===");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
