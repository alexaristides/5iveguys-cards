import { NextRequest, NextResponse } from "next/server";
import { verifySignInCode } from "@/lib/email-sign-in";
import { signInBrowser } from "@/lib/web-session";

// Website: check the emailed code and sign the browser in (lib/email-sign-in.ts).
export async function POST(req: NextRequest) {
  // JSON only, so another site can't post a form here to sign someone in to its own account.
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Expected JSON" }, { status: 415 });
  }
  const { email, code, name } = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await verifySignInCode(email, code, name);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, needsName: result.needsName ?? false }, { status: result.status });
  }
  return signInBrowser(NextResponse.json({ ok: true }), result.userId);
}
