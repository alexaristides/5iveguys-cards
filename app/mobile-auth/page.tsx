"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";

// Opened inside the iOS app's auth sheet by /api/mobile/auth/web-start.
// Runs the normal NextAuth Google flow, then returns to web-finish.
export default function MobileAuthPage() {
  useEffect(() => {
    signIn("google", { callbackUrl: "/api/mobile/auth/web-finish" });
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-4">
      <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-zinc-400 text-sm">Connecting to Google…</p>
    </main>
  );
}
