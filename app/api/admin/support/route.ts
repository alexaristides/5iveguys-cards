import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const isAdmin = (req: NextRequest) =>
  !!process.env.ADMIN_SECRET && req.headers.get("x-admin-secret") === process.env.ADMIN_SECRET;

// Support inbox: newest first, open messages before handled ones.
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const messages = await prisma.supportMessage.findMany({
    orderBy: [{ handled: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  return NextResponse.json({ messages });
}

// Mark a message handled (or open again).
export async function PATCH(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, handled } = (await req.json().catch(() => ({}))) as { id?: string; handled?: boolean };
  if (!id || typeof handled !== "boolean") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  await prisma.supportMessage.update({ where: { id }, data: { handled } });
  return NextResponse.json({ ok: true });
}
