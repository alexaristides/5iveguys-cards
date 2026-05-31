"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  image: string | null;
  wins: number;
  losses: number;
  draws: number;
  played: number;
  isCurrentUser: boolean;
}

export default function GameLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/football/leaderboard")
      .then(r => r.json())
      .then(d => { setEntries(d.leaderboard ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-10 text-zinc-500">
        <div className="text-4xl mb-3">🏆</div>
        <p className="font-semibold text-zinc-400">No matches played yet</p>
        <p className="text-sm mt-1">Play some games to appear here!</p>
      </div>
    );
  }

  const MEDAL = ["🥇", "🥈", "🥉"];

  return (
    <div className="space-y-1.5">
      {/* Header */}
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        <span className="w-6 text-center">#</span>
        <span>Player</span>
        <div className="flex gap-4 text-right">
          <span className="w-6 text-green-400">W</span>
          <span className="w-6 text-zinc-400">D</span>
          <span className="w-6 text-red-400">L</span>
          <span className="w-8 text-zinc-500">GP</span>
        </div>
      </div>

      {entries.map(e => (
        <div
          key={e.id}
          className={`grid grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-2 rounded-xl transition-all
            ${e.isCurrentUser
              ? "bg-green-900/30 border border-green-700/40"
              : "bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-700/50"}
          `}
        >
          {/* Rank */}
          <div className="w-6 text-center text-sm">
            {e.rank <= 3 ? MEDAL[e.rank - 1] : (
              <span className="text-zinc-500 text-xs font-bold">{e.rank}</span>
            )}
          </div>

          {/* Player */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative w-7 h-7 rounded-full overflow-hidden bg-zinc-800 shrink-0">
              {e.image ? (
                <Image src={e.image} alt={e.name ?? ""} fill className="object-cover" sizes="28px" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs font-bold">
                  {(e.name ?? "?")[0]}
                </div>
              )}
            </div>
            <span className={`text-sm font-semibold truncate ${e.isCurrentUser ? "text-green-300" : "text-zinc-200"}`}>
              {e.name ?? "Unknown"}
              {e.isCurrentUser && <span className="ml-1.5 text-[9px] text-green-400 font-normal">you</span>}
            </span>
          </div>

          {/* Stats */}
          <div className="flex gap-4 items-center text-right text-sm font-bold">
            <span className="w-6 text-green-400">{e.wins}</span>
            <span className="w-6 text-zinc-400">{e.draws}</span>
            <span className="w-6 text-red-400">{e.losses}</span>
            <span className="w-8 text-zinc-600 text-xs font-normal">{e.played}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
