import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const channel = await prisma.channel.findUnique({ where: { slug } });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cards = await prisma.card.findMany({
    where: { channelId: channel.id },
    orderBy: [{ rarity: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ cards });
}
