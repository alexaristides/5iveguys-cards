"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

const GAMES = [
  {
    href: "/game?tab=sp",
    emoji: "⚽",
    title: "Single Player",
    description: "Pick your best squad and play a 7v7 match vs CPU",
    color: "from-green-800/30 via-[#0b1a10] to-[#0b1a10]",
    border: "border-green-600/30 hover:border-green-500/60",
    badge: "bg-green-600/20 text-green-300",
    badgeText: "vs CPU",
    cta: "bg-green-600 hover:bg-green-500 shadow-green-600/20",
  },
  {
    href: "/game?tab=pvp",
    emoji: "⚔️",
    title: "PvP Matches",
    description: "1v1 live matches — both players watch the same simulation unfold",
    color: "from-orange-800/30 via-[#170d0b] to-[#170d0b]",
    border: "border-orange-600/30 hover:border-orange-500/60",
    badge: "bg-orange-600/20 text-orange-300",
    badgeText: "Live 1v1",
    cta: "bg-orange-600 hover:bg-orange-500 shadow-orange-600/20",
  },
  {
    href: "/game/worldcup",
    emoji: "🏆",
    title: "World Cup — Road to Glory",
    description: "Take 5ive Guys FC through the 48-team World Cup tournament",
    color: "from-amber-800/30 via-[#170f00] to-[#170f00]",
    border: "border-amber-600/30 hover:border-amber-500/60",
    badge: "bg-amber-600/20 text-amber-300",
    badgeText: "Tournament",
    cta: "bg-amber-600 hover:bg-amber-500 shadow-amber-600/20",
  },
];

export default function GamesPage() {
  const params = useParams<{ channelSlug: string }>();

  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-purple-900/10 blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto px-6 pt-24 pb-16">
        <div className="mb-10">
          <h1 className="text-3xl font-extrabold text-white">Games</h1>
          <p className="text-zinc-500 text-sm mt-1">Play with your collection</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {GAMES.map((game) => (
            <Link
              key={game.href}
              href={game.href}
              className={`group relative block overflow-hidden rounded-3xl border ${game.border} bg-gradient-to-br ${game.color} p-7 transition`}
            >
              <div className="pointer-events-none absolute -right-4 -top-4 text-[90px] opacity-10 transition group-hover:scale-110">
                {game.emoji}
              </div>
              <div className="relative">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${game.badge}`}>
                  {game.badgeText}
                </span>
                <h2 className="mt-3 text-lg font-extrabold text-white leading-snug">{game.title}</h2>
                <p className="mt-1 text-sm text-zinc-400">{game.description}</p>
                <div className="mt-5">
                  <span className={`rounded-xl ${game.cta} px-5 py-2.5 text-sm font-bold text-white shadow-lg transition`}>
                    Play →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
