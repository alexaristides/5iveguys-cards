import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const ADMIN_SECRET = process.env.ADMIN_SECRET!;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.verificationToken.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.packOpen.deleteMany({});
  await prisma.userCard.deleteMany({});
  await prisma.youtubeSync.deleteMany({});
  await prisma.account.deleteMany({});
  await prisma.user.deleteMany({});

  return NextResponse.json({ ok: true, message: "All user data cleared." });
}
