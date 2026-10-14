import { NextRequest, NextResponse } from "next/server";
import { pusher } from "@/lib/pusher";
import { isRoomCode, relayUser, roomChannel } from "@/lib/street-online";

/** Pusher's limit is 10 KB per message; leave room for the envelope. */
const MAX_BYTES = 9000;

/**
 * 5IVE STREET online: pass a message to the other player in a room. Client
 * events are off on the Pusher app, so room traffic (picks, ready, WebRTC
 * set-up, and the match itself when a direct connection can't be made) goes
 * through here. Authenticated with the relay token from /api/street/me.
 */
export async function POST(req: NextRequest) {
  const from = relayUser(req.headers.get("x-street-relay"));
  if (!from) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { room?: unknown; socketId?: unknown; msg?: unknown } | null;
  if (!body || !isRoomCode(body.room) || body.msg === undefined) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const data = { from, msg: body.msg };
  if (Buffer.byteLength(JSON.stringify(data)) > MAX_BYTES) return NextResponse.json({ error: "Too large" }, { status: 413 });

  // Leave the sender out (they don't need their own message back).
  const socketId = typeof body.socketId === "string" && /^\d+\.\d+$/.test(body.socketId) ? body.socketId : undefined;
  await pusher.trigger(roomChannel(body.room), "msg", data, socketId ? { socket_id: socketId } : undefined);
  return NextResponse.json({ ok: true });
}
