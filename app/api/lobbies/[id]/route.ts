import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const lobby = await prisma.lobby.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true, image: true } },
      opponent: { select: { id: true, name: true, image: true } },
      matchResult: true,
    },
  });

  if (!lobby) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ lobby });
}
