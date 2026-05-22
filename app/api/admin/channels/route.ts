import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function checkAdmin(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  return secret === process.env.ADMIN_SECRET;
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const channels = await prisma.channel.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { cards: true, userStats: true } } } });
  return NextResponse.json({ channels });
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug, name, youtubeChannelId, description, thumbnailUrl } = await req.json();
  if (!slug || !name || !youtubeChannelId) {
    return NextResponse.json({ error: "slug, name, and youtubeChannelId are required" }, { status: 400 });
  }
  const channel = await prisma.channel.create({
    data: { slug, name, youtubeChannelId, description, thumbnailUrl },
  });
  return NextResponse.json({ channel }, { status: 201 });
}
