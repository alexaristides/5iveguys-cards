import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function checkAdmin(req: NextRequest) {
  return req.headers.get("x-admin-secret") === process.env.ADMIN_SECRET;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { channelId } = await params;
  const cards = await prisma.card.findMany({
    where: { channelId },
    orderBy: [{ rarity: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ cards });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { channelId } = await params;
  const { name, kit, rarity, imageUrl, backImageUrl, attribute, description, position } = await req.json();
  if (!name || !rarity || !imageUrl) {
    return NextResponse.json({ error: "name, rarity, imageUrl are required" }, { status: 400 });
  }
  const card = await prisma.card.create({
    data: { channelId, name, kit, rarity, imageUrl, backImageUrl, attribute, description, position: position ?? null },
  });
  return NextResponse.json({ card }, { status: 201 });
}
