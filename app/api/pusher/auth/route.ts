import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pusher } from "@/lib/pusher";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const socketId = formData.get("socket_id") as string;
  const channelName = formData.get("channel_name") as string;

  if (!socketId || !channelName) {
    return NextResponse.json({ error: "Missing socket_id or channel_name" }, { status: 400 });
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
