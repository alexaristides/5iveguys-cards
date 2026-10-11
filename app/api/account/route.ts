import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revokeAppleToken, revokeGoogleToken } from "@/lib/mobile-auth";

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
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
    hasYoutubeScope,
  });
}

// Permanently delete the signed-in user and everything they own (App Store
// guideline 5.1.1(v) requires in-app account deletion).
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const accounts = await prisma.account.findMany({
    where: { userId },
    select: { provider: true, refresh_token: true, access_token: true },
  });

  await prisma.$transaction(async (tx) => {
    // Relations without onDelete: Cascade must be cleared before the user row.
    const createdLobbies = await tx.lobby.findMany({ where: { creatorId: userId }, select: { id: true } });
    const lobbyIds = createdLobbies.map((l) => l.id);
    await tx.matchResult.deleteMany({ where: { lobbyId: { in: lobbyIds } } });
    await tx.lobby.deleteMany({ where: { id: { in: lobbyIds } } });
    await tx.lobby.updateMany({ where: { opponentId: userId }, data: { opponentId: null } });

    await tx.cardBattle.updateMany({ where: { winnerId: userId }, data: { winnerId: null } });
    await tx.cardBattle.updateMany({ where: { acceptorId: userId }, data: { acceptorId: null } });
    await tx.cardBattle.deleteMany({ where: { challengerId: userId } });

    await tx.draftEntry.updateMany({ where: { userId }, data: { userId: null } });

    await tx.user.delete({ where: { id: userId } }); // cascades everything else
  });

  // Best-effort: revoke third-party grants after the data is gone.
  await Promise.all(
    accounts.map((a) => {
      if (a.provider === "apple" && a.refresh_token) return revokeAppleToken(a.refresh_token);
      if (a.provider === "google") {
        const token = a.refresh_token ?? a.access_token;
        if (token) return revokeGoogleToken(token);
      }
    }),
  );

  return NextResponse.json({ ok: true });
}
