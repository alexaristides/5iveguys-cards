import { NextResponse } from "next/server";
import { appleWebConfigured } from "@/lib/apple-web";
import { emailSignInConfigured } from "@/lib/email-sign-in";

// Which sign-in options are set up, so the website and the app only show ones that work.
// `apple` is the website's Sign in with Apple; the app's native one doesn't depend on it.
export function GET() {
  return NextResponse.json({ apple: appleWebConfigured(), email: emailSignInConfigured() });
}
