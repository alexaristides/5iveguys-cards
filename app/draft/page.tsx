import type { Metadata } from "next";
import Link from "next/link";
import WorldCupDraft from "@/components/draft/WorldCupDraft";
import { STATS } from "@/lib/draft/nations";

export const metadata: Metadata = {
  title: "2026 World Cup Dream Team Draft — Free to Play",
  description:
    "Spin the wheel, draft real players from all 48 World Cup 2026 nations into your ultimate XI, then simulate a tournament. No account needed.",
};

export default function DraftPage() {
  return (
    <main className="min-h-screen bg-[#070b14] text-white">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-0 h-[360px] w-[760px] -translate-x-1/2 rounded-full bg-[#FFC233]/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[300px] w-[400px] rounded-full bg-emerald-700/10 blur-3xl" />
      </div>

      <header className="relative border-b border-white/5 bg-[#070b14]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-zinc-400 hover:text-white">
            ← 5iveG
          </Link>
          <div className="text-xs font-bold text-zinc-500">
            {STATS.nations} Nations · {STATS.players.toLocaleString()}+ Players
          </div>
        </div>
      </header>

      <div className="relative">
        <WorldCupDraft />
      </div>

      <footer className="relative border-t border-white/5 py-6 text-center">
        <p className="text-xs text-zinc-600">
          Free to play · no account needed · ratings are approximate. Built for fun by 5iveG.
        </p>
      </footer>
    </main>
  );
}
