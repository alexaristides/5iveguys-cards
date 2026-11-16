import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A message from the /support form. Stored for the admin inbox at /admin/support.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { name?: unknown; email?: unknown; message?: unknown; website?: unknown }
    | null;
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  // Honeypot: the form hides this field, so only bots fill it. Pretend it worked.
  if (typeof body.website === "string" && body.website.trim()) return NextResponse.json({ ok: true });

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 5000) : "";
  if (!EMAIL.test(email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  if (message.length < 5) return NextResponse.json({ error: "Please tell us how we can help." }, { status: 400 });

  const recent = await prisma.supportMessage.count({
    where: { email, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recent >= 5) {
    return NextResponse.json({ error: "We've got your messages. Please give us a little time to reply." }, { status: 429 });
  }

  const session = await getServerSession(authOptions);
  await prisma.supportMessage.create({
    data: { name: name || null, email, message, userId: session?.user?.id ?? null },
  });
  return NextResponse.json({ ok: true });
}
