import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pusher } from "@/lib/pusher";
import { ROOM_PREFIX, roomCodeOf } from "@/lib/street-online";

/**
 * 5IVE STREET online: open rooms, i.e. room channels with just their host in
 * them. Rooms live only as Pusher presence channels, so there's nothing to
 * store or clean up: a room is gone as soon as its host leaves.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await pusher.get({ path: "/channels", params: { filter_by_prefix: ROOM_PREFIX, info: "user_count" } });
  if (!res.ok) return NextResponse.json({ rooms: [] });
  const { channels } = (await res.json()) as { channels: Record<string, { user_count?: number }> };
  const waiting = Object.entries(channels)
    .filter(([name, c]) => c.user_count === 1 && roomCodeOf(name))
    .map(([name]) => name)
    .slice(0, 12);

  const hosts = await Promise.all(waiting.map(async (name) => {
    const r = await pusher.get({ path: `/channels/${name}/users` });
    const { users } = r.ok ? ((await r.json()) as { users: { id: string }[] }) : { users: [] };
    return { code: roomCodeOf(name)!, hostId: users[0]?.id };
  }));
  const others = hosts.filter((h): h is { code: string; hostId: string } => !!h.hostId && h.hostId !== session.user.id);
  const people = await prisma.user.findMany({
    where: { id: { in: others.map((h) => h.hostId) } },
    select: { id: true, name: true, teamName: true, image: true },
  });
  const byId = new Map(people.map((p) => [p.id, p]));

  return NextResponse.json({
    rooms: others.flatMap(({ code, hostId }) => {
      const p = byId.get(hostId);
      return p ? [{ code, host: { name: p.teamName ?? p.name ?? "Player", image: p.image } }] : [];
    }),
  });
}
