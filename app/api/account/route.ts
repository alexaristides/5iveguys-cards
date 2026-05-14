import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "google" },
    select: { scope: true },
  });

  const hasYoutubeScope = account?.scope?.includes("youtube") ?? false;

  return NextResponse.json({
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
    hasYoutubeScope,
  });
}
