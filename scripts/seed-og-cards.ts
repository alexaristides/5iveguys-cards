/**
 * Seed The Other Guys cards into the DB.
 * Run with: npx tsx scripts/seed-og-cards.ts
 *
 * Requires DATABASE_URL to be set (uses .env / .env.local).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const OG_SLUG = "the-other-guys";
const BACK_IMAGE = "/cards/og/OG_Back.jpg";
const KIT = "OG Kit";

const OG_CARDS = [
  { name: "Alistair",  image: "/cards/og/OG_Alistair.jpg",  attribute: "Power" },
  { name: "Cem",       image: "/cards/og/OG_Cem.jpg",       attribute: "Pace"  },
  { name: "Charlie",   image: "/cards/og/OG_Charlie.jpg",   attribute: "Skill" },
  { name: "Jack",      image: "/cards/og/OG_Jack.jpg",      attribute: "Power" },
  { name: "Jairo",     image: "/cards/og/OG_Jairo.jpg",     attribute: "Pace"  },
  { name: "Jimmy",     image: "/cards/og/OG_Jimmy.jpg",     attribute: "Power" },
  { name: "Leonardo",  image: "/cards/og/OG_Leonardo.jpg",  attribute: "Skill" },
  { name: "Lil Jr",    image: "/cards/og/OG_LilJr.jpg",     attribute: "Pace"  },
  { name: "Nicholas",  image: "/cards/og/OG_Nicholas.jpg",  attribute: "Skill" },
  { name: "Noah",      image: "/cards/og/OG_Noah.jpg",      attribute: "Pace"  },
  { name: "Pedro Jr",  image: "/cards/og/OG_PedroJr.jpg",   attribute: "Skill" },
  { name: "Ramin",     image: "/cards/og/OG_Ramin.jpg",     attribute: "Skill" },
  { name: "Sam",       image: "/cards/og/OG_Sam.jpg",       attribute: "Power" },
  { name: "Tanel",     image: "/cards/og/OG_Tanel.jpg",     attribute: "Pace"  },
] as const;

async function main() {
  const channel = await prisma.channel.findUnique({ where: { slug: OG_SLUG } });
  if (!channel) {
    console.error(`Channel "${OG_SLUG}" not found. Make sure it exists in the DB first.`);
    process.exit(1);
  }

  console.log(`Seeding cards for: ${channel.name} (${channel.id})`);

  let created = 0;
  let skipped = 0;

  for (const card of OG_CARDS) {
    const existing = await prisma.card.findFirst({
      where: { channelId: channel.id, imageUrl: card.image },
    });
    if (existing) {
      console.log(`  skip  ${card.name} (already exists)`);
      skipped++;
      continue;
    }
    await prisma.card.create({
      data: {
        channelId: channel.id,
        name: card.name,
        kit: KIT,
        rarity: "common",
        imageUrl: card.image,
        backImageUrl: BACK_IMAGE,
        attribute: card.attribute,
        description: "The Other Guys FC",
      },
    });
    console.log(`  ✓     ${card.name}`);
    created++;
  }

  console.log(`\nDone — ${created} created, ${skipped} skipped.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
