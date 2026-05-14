"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import Navbar from "@/components/Navbar";

interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string | null;
  image: string | null;
  points: number;
  totalEarned: number;
  cardCount: number;
  isSubscribed: boolean;
  likedCount: number;
  earlyLikedCount: number;
  isCurrentUser: boolean;
}

export default function FansPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);
  const [userPoints, setUserPoints] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  const fetchData = useCallback(async () => {
    const [lbRes, userRes] = await Promise.all([
      fetch("/api/leaderboard"),
      fetch("/api/user"),
    ]);
    if (lbRes.ok) {
      const data = await lbRes.json();
      setLeaderboard(data.leaderboard);
      setCurrentUserRank(data.currentUserRank);
    }
    if (userRes.ok) {
      const data = await userRes.json();
      setUserPoints(data.points);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchData();
  }, [status, fetchData]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  // Podium order: 2nd, 1st, 3rd
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-purple-900/15 blur-3xl" />
      </div>

      <Navbar user={session!.user} points={userPoints} />

      <main className="relative max-w-2xl mx-auto px-4 pt-20 pb-24">

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white">Fan Leaderboard</h1>
          <p className="text-zinc-500 text-sm mt-1">The most dedicated 5iveguysfc supporters</p>
          {currentUserRank && (
            <p className="text-purple-400 text-sm mt-1.5 font-medium">You&apos;re ranked #{currentUserRank}</p>
          )}
        </div>

        {leaderboard.length === 0 ? (
          <div className="text-center py-20 text-zinc-600">
            <p className="text-lg">No fans yet — be the first to sync!</p>
          </div>
        ) : (
          <>
            {/* ── Top 3 podium ── */}
            {top3.length > 0 && (
              <div className="flex items-end justify-center gap-3 mb-6">
                {podiumOrder.map((entry) => {
                  if (!entry) return null;
                  const isFirst = entry.rank === 1;
                  return (
                    <Link
                      key={entry.id}
                      href={`/players/${entry.id}`}
                      className={`flex flex-col items-center rounded-2xl border p-3 flex-1 max-w-[140px] transition-all hover:opacity-80
                        ${isFirst
                          ? "border-purple-600/50 bg-purple-900/20 pb-4 -mb-0"
                          : "border-zinc-800 bg-zinc-900/60 mb-3"}
                        ${entry.isCurrentUser ? "ring-2 ring-purple-500" : ""}
                      `}
                    >
                      {/* Medal */}
                      <span className="text-lg mb-1.5">
                        {entry.rank === 1 ? "👑" : entry.rank === 2 ? "🥈" : "🥉"}
                      </span>

                      {/* Avatar */}
                      <div className={`relative rounded-full overflow-hidden shrink-0 ${isFirst ? "w-14 h-14" : "w-11 h-11"}`}>
                        {entry.image ? (
                          <Image src={entry.image} alt={entry.name ?? "Fan"} fill className="object-cover" />
                        ) : (
                          <div className="w-full h-full bg-zinc-700 flex items-center justify-center">
                            <span className="text-white font-bold">{entry.name?.[0] ?? "?"}</span>
                          </div>
                        )}
                      </div>

                      {/* Name */}
                      <p className="text-white font-semibold text-xs text-center mt-1.5 leading-tight truncate w-full px-1">
                        {entry.name?.split(" ")[0] ?? "Fan"}
                      </p>
                      {entry.isCurrentUser && (
                        <span className="text-purple-400 text-[10px]">You</span>
                      )}

                      {/* Points */}
                      <div className="mt-1.5 px-2 py-0.5 rounded-full bg-purple-900/50 border border-purple-700/40">
                        <span className="text-purple-300 font-bold text-xs">{entry.totalEarned.toLocaleString()} pts</span>
                      </div>

                      {/* Stats */}
                      <div className="flex gap-1.5 mt-2">
                        <div className="flex items-center gap-0.5 bg-zinc-800/60 rounded-md px-1.5 py-0.5">
                          <span className="text-[10px]">👍</span>
                          <span className="text-zinc-400 text-[10px] font-medium">{entry.likedCount}</span>
                        </div>
                        <div className="flex items-center gap-0.5 bg-zinc-800/60 rounded-md px-1.5 py-0.5">
                          <span className="text-[10px]">⚡</span>
                          <span className="text-zinc-400 text-[10px] font-medium">{entry.earlyLikedCount}</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* ── Rest of leaderboard ── */}
            {rest.length > 0 && (
              <div className="space-y-2">
                <p className="text-zinc-600 text-xs font-medium px-1 mb-3">All fans</p>
                {rest.map((entry) => (
                  <Link
                    key={entry.id}
                    href={`/players/${entry.id}`}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all hover:opacity-80
                      ${entry.isCurrentUser
                        ? "bg-purple-900/20 border-purple-700/40"
                        : "bg-zinc-900/60 border-zinc-800"
                      }`}
                  >
                    <span className="text-zinc-500 font-bold text-xs w-5 text-center shrink-0">
                      {entry.rank}
                    </span>

                    <div className="relative w-8 h-8 shrink-0">
                      {entry.image ? (
                        <Image src={entry.image} alt={entry.name ?? "Fan"} fill className="rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">
                          <span className="text-white text-xs font-bold">{entry.name?.[0] ?? "?"}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm truncate">
                        {entry.name ?? "Fan"}
                        {entry.isCurrentUser && <span className="text-purple-400 text-xs ml-1">(You)</span>}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {entry.isSubscribed && <span className="text-green-400 text-[10px]">✓ Sub</span>}
                        <span className="text-zinc-600 text-[10px]">👍 {entry.likedCount}</span>
                        <span className="text-zinc-600 text-[10px]">⚡ {entry.earlyLikedCount}</span>
                      </div>
                    </div>

                    <p className="text-purple-400 font-bold text-sm shrink-0">
                      {entry.totalEarned.toLocaleString()} <span className="text-zinc-600 font-normal text-xs">pts</span>
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
