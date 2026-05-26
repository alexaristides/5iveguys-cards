import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function checkAdmin(req: NextRequest) {
  return req.headers.get("x-admin-secret") === process.env.ADMIN_SECRET;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string; cardId: string }> }
) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { cardId } = await params;
  const data = await req.json();
  const allowed = ["name", "kit", "rarity", "imageUrl", "backImageUrl", "attribute", "description", "availableInPacks"];
  const update = Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)));
  const card = await prisma.card.update({ where: { id: cardId }, data: update });
  return NextResponse.json({ card });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string; cardId: string }> }
) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { cardId } = await params;
  await prisma.card.delete({ where: { id: cardId } });
  return NextResponse.json({ ok: true });
}
