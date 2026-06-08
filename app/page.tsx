"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { STATS } from "@/lib/draft/nations";

interface Channel {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  thumbnailUrl: string | null;
  rewardTags: string | null;
  _count: { userStats: number };
}

export default function HomePage() {
  const { status } = useSession();
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/dashboard");
      return;
    }
    fetch("/api/channels")
      .then((r) => r.ok ? r.json() : { channels: [] })
      .then((data) => { setChannels(data.channels ?? []); setLoading(false); });
  }, [status, router]);

  if (status === "loading" || status === "authenticated") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-purple-900/15 blur-3xl" />
      </div>

      {/* Top bar */}
      <header className="relative border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">5</span>
            </div>
            <span className="text-white font-semibold text-sm">5iveG</span>
          </div>
          <div>
            <button
              onClick={() => signIn("google")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold hover:bg-zinc-100 transition-all"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in
            </button>
          </div>
        </div>
      </header>

      {/* Beta banner */}
      <div className="bg-amber-950/60 border-b border-amber-800/40 px-4 py-2.5 text-center">
        <p className="text-amber-300/90 text-xs sm:text-sm">
          🚧 <span className="font-semibold">Beta</span> — 5iveG is still in early testing. Points may be reset periodically before the full launch.
        </p>
      </div>

      <div className="relative max-w-6xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-14">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            5iveG
          </h1>
          <p className="text-zinc-400 text-lg max-w-lg mx-auto">
            Earn points by engaging with your favourite YouTube channels and unlock exclusive rewards.
          </p>
        </div>

        {/* World Cup Draft hero */}
        <Link
          href="/draft"
          className="group relative mb-14 block overflow-hidden rounded-3xl border border-[#FFC233]/30 bg-gradient-to-br from-[#0e8a3e]/25 via-[#070b14] to-[#070b14] p-8 transition hover:border-[#FFC233]/60 sm:p-10"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 text-[160px] opacity-10 transition group-hover:scale-110">
            🏆
          </div>
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFC233]/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#FFC233]">
              ⚽ Free to play · no account needed
            </span>
            <h2 className="mt-4 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
              Build your ultimate <span className="text-[#FFC233]">2026 World Cup XI</span>
            </h2>
            <p className="mt-2 text-base text-zinc-300 sm:text-lg">
              Spin. Draft. Simulate. <span className="text-zinc-400">Free to play.</span>
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <span className="rounded-2xl bg-[#FFC233] px-6 py-3 text-base font-extrabold text-zinc-950 shadow-lg shadow-[#FFC233]/20 transition group-hover:bg-[#ffce5c]">
                Start Draft →
              </span>
              <span className="text-sm font-semibold text-zinc-400">
                {STATS.nations} Nations · {STATS.players.toLocaleString()}+ Players · 1 Dream Team
              </span>
            </div>
          </div>
        </Link>

        {/* 5ive Verse hero */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center py-20 text-zinc-600">
            <p className="text-xl mb-2">No channels yet</p>
            <p className="text-sm">An admin needs to add a channel first.</p>
          </div>
        ) : (
          <Link
            href={`/${channels[0].slug}`}
            className="group relative block overflow-hidden rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-800/30 via-[#0b0714] to-[#0b0714] p-8 transition hover:border-purple-500/60 sm:p-10"
          >
            <div className="pointer-events-none absolute -right-10 -top-10 text-[160px] opacity-10 transition group-hover:scale-110">
              🃏
            </div>
            <div className="relative">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-purple-300">
                ✦ {channels.length} channel{channels.length === 1 ? "" : "s"} · collect & earn
              </span>
              <h2 className="mt-4 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
                Enter the <span className="text-purple-400">5ive Verse</span>
              </h2>
              <p className="mt-2 text-base text-zinc-300 sm:text-lg">
                Earn points across your favourite channels. <span className="text-zinc-400">Open packs. Collect cards.</span>
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <span className="rounded-2xl bg-purple-500 px-6 py-3 text-base font-extrabold text-white shadow-lg shadow-purple-500/20 transition group-hover:bg-purple-400">
                  Enter →
                </span>
              </div>
            </div>
          </Link>
        )}

        {/* Footer */}
        <div className="mt-20 text-center space-y-3">
          <div>
            <Link href="/artist" className="text-zinc-500 text-sm hover:text-purple-400 transition-colors font-medium">
              🎨 Card artwork by Merle
            </Link>
          </div>
          <p className="text-zinc-700 text-xs">
            By signing in you agree to our{" "}
            <a href="/terms" className="underline hover:text-zinc-500">Terms of Service</a>
            {" "}and{" "}
            <a href="/privacy" className="underline hover:text-zinc-500">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </main>
  );
}
