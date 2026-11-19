import { NextRequest, NextResponse } from "next/server";
import { NotificationTypeV2 } from "@apple/app-store-server-library";
import { prisma } from "@/lib/db";
import { verifyNotification } from "@/lib/apple-iap";
import { refundTransaction } from "@/lib/player-packs-db";

/**
 * App Store Server Notifications V2 (set this URL in App Store Connect → App Information).
 * A refund or revoke takes the pack back (unopened ones can't be opened) and the player's
 * share with it; a reversed refund restores it. Apple retries anything that isn't a 200.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { signedPayload?: unknown };
  if (typeof body.signedPayload !== "string") return NextResponse.json({ error: "No signedPayload" }, { status: 400 });

  let verified;
  try {
    verified = await verifyNotification(body.signedPayload);
  } catch (err) {
    console.error("[shop] App Store notification failed verification:", (err as Error).message);
    return NextResponse.json({ error: "Unverified" }, { status: 400 });
  }
  const { notification, transaction } = verified;
  const transactionId = transaction?.transactionId;
  if (!transactionId) return NextResponse.json({ ok: true });

  switch (notification.notificationType) {
    case NotificationTypeV2.REFUND:
    case NotificationTypeV2.REVOKE:
      await refundTransaction(transactionId);
      break;
    case NotificationTypeV2.REFUND_REVERSED:
      await prisma.playerPack.updateMany({ where: { transactionId, status: "refunded", cardIds: { not: null } }, data: { status: "opened", refundedAt: null } });
      await prisma.playerPack.updateMany({ where: { transactionId, status: "refunded", cardIds: null }, data: { status: "paid", refundedAt: null } });
      break;
  }
  return NextResponse.json({ ok: true });
}
