"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import Navbar from "@/components/Navbar";
import type { overview } from "@/lib/fantasy-db";

/** GET /api/fantasy as the browser receives it. */
export type FantasyOverview = Awaited<ReturnType<typeof overview>>;
export type FantasyPlayerRow = FantasyOverview["players"][number];

/** Page chrome for the fantasy pages: the site navbar when signed in, a sign-in bar otherwise. */
export function FantasyShell({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [points, setPoints] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/user").then((r) => (r.ok ? r.json() : null)).then((d) => d && setPoints(d.points ?? 0)).catch(() => {});
  }, [status]);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {session?.user ? (
        <Navbar user={session.user} points={points} />
      ) : (
        <header className="fixed top-0 inset-x-0 z-40 bg-[#0a0a0a]/90 backdrop-blur border-b border-zinc-800">
          <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/" className="text-white font-black">5iveG</Link>
            {status !== "loading" && (
              <button onClick={() => signIn("google")} className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold">
                Sign in to play
              </button>
            )}
          </div>
        </header>
      )}
      <main className="max-w-3xl mx-auto px-4 pt-24 pb-24 space-y-5">{children}</main>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export const panel = "rounded-2xl bg-zinc-900/80 border border-zinc-800 p-5";
