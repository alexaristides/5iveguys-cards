import { NextRequest, NextResponse } from "next/server";
import { sendSignInCode } from "@/lib/email-sign-in";

// Website and app: email a 6-digit sign-in code (lib/email-sign-in.ts).
export async function POST(req: NextRequest) {
  const { email } = (await req.json().catch(() => ({}))) as { email?: unknown };
  const result = await sendSignInCode(email);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
