import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { pvpWins: true, pvpLosses: true, pvpDraws: true },
  });

  return NextResponse.json({
    pvpWins: user?.pvpWins ?? 0,
    pvpLosses: user?.pvpLosses ?? 0,
    pvpDraws: user?.pvpDraws ?? 0,
  });
}
