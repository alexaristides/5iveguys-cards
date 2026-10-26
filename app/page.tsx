"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WORLDS } from "@/lib/worlds";

export default function HomePage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.push("/dashboard");
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
            Get points for being a fan of 5ive Guys and Other Guys, and unlock exclusive rewards.
          </p>
        </div>

        {/* 5IVE STREET hero — a static page (public/street), so a plain link rather than <Link>. */}
        <a
          href="/street"
          className="group relative mb-14 block overflow-hidden rounded-3xl border border-purple-500/40 bg-gradient-to-br from-[#a326d6]/30 via-[#12061f] to-[#070b14] p-8 transition hover:border-purple-400/70 sm:p-10"
        >
          <div className="pointer-events-none absolute -right-8 -top-8 text-[150px] opacity-10 transition group-hover:scale-110">
            ⚽
          </div>
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-purple-200">
              New · 3D · Free to play · no account needed
            </span>
            <h2 className="mt-4 text-3xl font-extrabold italic leading-tight text-white sm:text-4xl">
              5IVE STREET <span className="text-purple-300">3v3</span>
            </h2>
            <p className="mt-2 text-base text-zinc-300 sm:text-lg">
              Street football in a cage with the 5ive Guys squad. Play it off the walls, nutmeg the CPU.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <span className="rounded-2xl bg-purple-600 px-6 py-3 text-base font-extrabold text-white shadow-lg shadow-purple-600/30 transition group-hover:bg-purple-500">
                Play now →
              </span>
              <span className="text-sm font-semibold text-zinc-400">Best on a phone held sideways · keyboard on desktop</span>
            </div>
          </div>
        </a>

        {/* 5ive Verse hero: pick a world to enter */}
        <div className="relative overflow-hidden rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-800/30 via-[#0b0714] to-[#0b0714] p-8 sm:p-10">
          <div className="pointer-events-none absolute -right-10 -top-10 text-[160px] opacity-10">
            🃏
          </div>
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-purple-300">
              ✦ Fan Zone · collect &amp; earn
            </span>
            <h2 className="mt-4 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
              Enter the <span className="text-purple-400">5ive Verse</span>
            </h2>
            <p className="mt-2 text-base text-zinc-300 sm:text-lg">
              Be a fan, get points. <span className="text-zinc-400">Open packs. Collect cards.</span>
            </p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {WORLDS.map((w) => (
                <Link
                  key={w.slug}
                  href={`/${w.slug}`}
                  className="group flex items-center justify-between rounded-2xl border border-purple-500/30 bg-purple-500/10 px-6 py-4 transition hover:border-purple-400/70 hover:bg-purple-500/20"
                >
                  <span className="text-lg font-extrabold text-white">{w.name}</span>
                  <span className="text-purple-300 transition-transform group-hover:translate-x-1">Enter →</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

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
