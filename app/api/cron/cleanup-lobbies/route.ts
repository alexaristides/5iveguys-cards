import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  // Vercel cron sends a request with Authorization header
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const { count } = await prisma.lobby.deleteMany({
    where: {
      status: "WAITING",
      expiresAt: { lt: now },
    },
  });

  return NextResponse.json({ deleted: count, at: now.toISOString() });
}
