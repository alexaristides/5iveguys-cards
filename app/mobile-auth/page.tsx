"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";

// Opened inside the iOS app's auth sheet by /api/mobile/auth/web-start.
// Runs the normal NextAuth Google flow, then returns to web-finish.
// ?basic=1 (the fantasy-only app): ask for name and email only, not YouTube. include_granted_scopes
// keeps any YouTube access a website user already gave, so signing in on the app doesn't drop it.
export default function MobileAuthPage() {
  useEffect(() => {
    const basic = new URLSearchParams(window.location.search).get("basic") === "1";
    signIn(
      "google",
      { callbackUrl: "/api/mobile/auth/web-finish" },
      basic ? { scope: "openid email profile", include_granted_scopes: "true" } : undefined,
    );
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-4">
      <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-zinc-400 text-sm">Connecting to Google…</p>
    </main>
  );
}
