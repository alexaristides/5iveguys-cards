import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pusher } from "@/lib/pusher";
import { ROOM_PREFIX, roomCodeOf } from "@/lib/street-online";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const socketId = formData.get("socket_id") as string;
  const channelName = formData.get("channel_name") as string;

  if (!socketId || !channelName) {
    return NextResponse.json({ error: "Missing socket_id or channel_name" }, { status: 400 });
  }

  // 5IVE STREET rooms are for two: turn a third person away.
  if (channelName.startsWith(ROOM_PREFIX)) {
    if (!roomCodeOf(channelName)) return NextResponse.json({ error: "Bad room" }, { status: 400 });
    const res = await pusher.get({ path: `/channels/${channelName}/users` });
    const { users } = res.ok ? ((await res.json()) as { users: { id: string }[] }) : { users: [] };
    if (users.length >= 2 && !users.some((u) => u.id === session.user.id)) {
      return NextResponse.json({ error: "Room full" }, { status: 403 });
    }
  }

  const presenceData = {
    user_id: session.user.id,
    user_info: {
      name: session.user.name ?? "Unknown",
      image: session.user.image ?? null,
    },
  };

  const auth = pusher.authorizeChannel(socketId, channelName, presenceData);
  return NextResponse.json(auth);
}
