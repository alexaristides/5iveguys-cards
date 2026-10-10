import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { signLinkTicket } from "@/lib/mobile-auth";

// App → "Connect YouTube": a 5-minute ticket for /api/mobile/auth/web-start.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ticket: await signLinkTicket(session.user.id) });
}
