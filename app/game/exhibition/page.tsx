"use client";

import Link from "next/link";
import ExhibitionGame from "@/components/football/ExhibitionGame";

export default function ExhibitionPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-green-900/15 blur-3xl" />
      </div>

      <header className="relative border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">5</span>
            </div>
            <span className="text-white font-semibold text-sm hidden sm:block">5iveG</span>
          </Link>
          <Link href="/game" className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors">
            ← Play
          </Link>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <span>🎮</span> Exhibition Match
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Build both 7-a-side teams from any players across the 5ive Guys channels, then run the
            sim to see who comes out on top.
          </p>
        </div>

        <ExhibitionGame />
      </div>
    </main>
  );
}
