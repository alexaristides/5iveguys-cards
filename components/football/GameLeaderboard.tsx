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

type Tab = "sp" | "pvp";

function Table({ entries }: { entries: LeaderboardEntry[] }) {
  const MEDAL = ["🥇", "🥈", "🥉"];

  if (entries.length === 0) {
    return (
      <div className="text-center py-10 text-zinc-500">
        <div className="text-4xl mb-3">🏆</div>
        <p className="font-semibold text-zinc-400">No matches played yet</p>
        <p className="text-sm mt-1">Play some games to appear here!</p>
      </div>
    );
  }

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
          <div className="w-6 text-center text-sm">
            {e.rank <= 3 ? MEDAL[e.rank - 1] : (
              <span className="text-zinc-500 text-xs font-bold">{e.rank}</span>
            )}
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <div className="relative w-7 h-7 rounded-full overflow-hidden bg-zinc-800 shrink-0">
              {e.image ? (
                <Image src={e.image} alt={e.name} fill className="object-cover" sizes="28px" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs font-bold">
                  {e.name[0]}
                </div>
              )}
            </div>
            <span className={`text-sm font-semibold truncate ${e.isCurrentUser ? "text-green-300" : "text-zinc-200"}`}>
              {e.name}
              {e.isCurrentUser && <span className="ml-1.5 text-[9px] text-green-400 font-normal">you</span>}
            </span>
          </div>

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

export default function GameLeaderboard() {
  const [tab, setTab] = useState<Tab>("sp");
  const [spEntries, setSpEntries] = useState<LeaderboardEntry[]>([]);
  const [pvpEntries, setPvpEntries] = useState<LeaderboardEntry[]>([]);
  const [loadingSp, setLoadingSp]   = useState(true);
  const [loadingPvp, setLoadingPvp] = useState(true);

  useEffect(() => {
    fetch("/api/football/leaderboard?type=sp")
      .then(r => r.json())
      .then(d => { setSpEntries(d.leaderboard ?? []); setLoadingSp(false); })
      .catch(() => setLoadingSp(false));

    fetch("/api/football/leaderboard?type=pvp")
      .then(r => r.json())
      .then(d => { setPvpEntries(d.leaderboard ?? []); setLoadingPvp(false); })
      .catch(() => setLoadingPvp(false));
  }, []);

  const loading = tab === "sp" ? loadingSp : loadingPvp;
  const entries = tab === "sp" ? spEntries : pvpEntries;

  return (
    <div>
      {/* SP / PvP sub-tabs */}
      <div className="flex gap-1 mb-5 bg-zinc-900 border border-zinc-700 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab("sp")}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
            tab === "sp" ? "bg-zinc-700 text-white shadow" : "text-zinc-400 hover:text-white"
          }`}
        >
          ⚽ Single Player
        </button>
        <button
          onClick={() => setTab("pvp")}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
            tab === "pvp" ? "bg-zinc-700 text-white shadow" : "text-zinc-400 hover:text-white"
          }`}
        >
          ⚔️ PvP
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <Table entries={entries} />
      )}
    </div>
  );
}
