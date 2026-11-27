import { NextRequest, NextResponse } from "next/server";
import { verifySignInCode } from "@/lib/email-sign-in";
import { createMobileSession } from "@/lib/mobile-auth";

// iOS app: check the emailed code (sent by /api/sign-in/email) → { token }.
export async function POST(req: NextRequest) {
  const { email, code, name } = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await verifySignInCode(email, code, name);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, needsName: result.needsName ?? false }, { status: result.status });
  }
  return NextResponse.json({ token: await createMobileSession(result.userId) });
}
