import { NextRequest, NextResponse } from "next/server";
import { deleteMobileSession } from "@/lib/mobile-auth";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    await deleteMobileSession(auth.slice("Bearer ".length).trim());
  }
  return NextResponse.json({ ok: true });
}
