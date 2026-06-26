import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { STAT_FIELDS, type StatsMap } from "@/lib/card-rating";

export const dynamic = "force-dynamic";

// Returns every player card across all active channels, each carrying its
// averaged fan-voted attributes (when rated). Exhibition mode uses these stats
// to rate a player in whatever position they're fielded — so performance is
// driven by what the fans actually scored them, not just card rarity.
export async function GET() {
  const cards = await prisma.card.findMany({
    where: { channel: { isActive: true } },
    select: {
      id: true, name: true, kit: true, rarity: true, imageUrl: true,
      attribute: true, position: true,
      channel: { select: { name: true, slug: true } },
      votes: {
        select: STAT_FIELDS.reduce(
          (acc, f) => ({ ...acc, [f]: true }),
          {} as Record<(typeof STAT_FIELDS)[number], true>,
        ),
      },
    },
  });

  const players = cards
    // Screenshot/highlight "Moment" cards aren't really playable footballers.
    .filter((c) => c.position !== "Moment")
    .map((c) => {
      const voteCount = c.votes.length;
      let stats: StatsMap | null = null;
      if (voteCount > 0) {
        const avg = {} as StatsMap;
        for (const f of STAT_FIELDS) {
          avg[f] = (c.votes as StatsMap[]).reduce((s, v) => s + v[f], 0) / voteCount;
        }
        stats = avg;
      }
      return {
        id: c.id,
        name: c.name,
        kit: c.kit,
        rarity: c.rarity,
        imageUrl: c.imageUrl,
        attribute: c.attribute,
        position: c.position,
        channelName: c.channel.name,
        channelSlug: c.channel.slug,
        voteCount,
        stats,
      };
    });

  return NextResponse.json({ players });
}
