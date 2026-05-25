import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const ADMIN_SECRET = process.env.ADMIN_SECRET!;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const channelSlug = req.nextUrl.searchParams.get("channelSlug");

  if (channelSlug) {
    // Return only users who have engaged with this channel, with channel-specific points
    const channel = await prisma.channel.findUnique({
      where: { slug: channelSlug },
      select: { id: true },
    });
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const stats = await prisma.userChannelStats.findMany({
      where: { channelId: channel.id },
      orderBy: { totalEarned: "desc" },
      select: {
        points: true,
        totalEarned: true,
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    return NextResponse.json(
      stats.map((s) => ({
        id: s.user.id,
        name: s.user.name,
        email: s.user.email,
        image: s.user.image,
        points: s.points,
        totalEarned: s.totalEarned,
      }))
    );
  }

  // No channel filter — return all users with global points (fallback for stats panel)
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, points: true, totalEarned: true, image: true },
    orderBy: { totalEarned: "desc" },
  });

  return NextResponse.json(users);
}
