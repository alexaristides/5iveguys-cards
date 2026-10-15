import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 5IVE STREET online: each room is a Pusher presence channel named after its
 * code. Room codes are 5 characters from an alphabet without look-alikes (no
 * 0/O, 1/I/L). The game page builds the same names (mobile/street/src/net).
 */
export const ROOM_PREFIX = "presence-street-";
const CODE = /^[A-HJKMNP-Z2-9]{5}$/;

export const isRoomCode = (code: unknown): code is string => typeof code === "string" && CODE.test(code);
export const roomChannel = (code: string) => `${ROOM_PREFIX}${code}`;
export const roomCodeOf = (channel: string) =>
  channel.startsWith(ROOM_PREFIX) && isRoomCode(channel.slice(ROOM_PREFIX.length)) ? channel.slice(ROOM_PREFIX.length) : null;

/**
 * Relay tokens let the game post room messages through /api/street/relay many
 * times a second without a database session lookup each time: the user id and
 * an expiry, signed with NEXTAUTH_SECRET.
 */
const RELAY_HOURS = 12;

function sign(body: string) {
  return createHmac("sha256", process.env.NEXTAUTH_SECRET ?? "").update(`street-relay:${body}`).digest("base64url");
}

export function relayToken(userId: string) {
  const body = `${userId}.${Date.now() + RELAY_HOURS * 3600_000}`;
  return `${body}.${sign(body)}`;
}

/** The user id a relay token was issued to, or null if it's forged or expired. */
export function relayUser(token: string | null): string | null {
  if (!token) return null;
  const cut = token.lastIndexOf(".");
  if (cut < 0) return null;
  const body = token.slice(0, cut);
  const sig = Buffer.from(token.slice(cut + 1));
  const want = Buffer.from(sign(body));
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  const dot = body.lastIndexOf(".");
  const userId = body.slice(0, dot);
  return Number(body.slice(dot + 1)) > Date.now() && userId ? userId : null;
}
