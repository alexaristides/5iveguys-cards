import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function checkAdmin(req: NextRequest) {
  return req.headers.get("x-admin-secret") === process.env.ADMIN_SECRET;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { channelId } = await params;
  const data = await req.json();
  const allowed = ["name", "description", "thumbnailUrl", "isActive", "youtubeChannelId"];
  const update = Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)));
  const channel = await prisma.channel.update({ where: { id: channelId }, data: update });
  return NextResponse.json({ channel });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { channelId } = await params;
  await prisma.channel.update({ where: { id: channelId }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
