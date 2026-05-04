"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
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
  commentCount: number;
  isCurrentUser: boolean;
}

const RANK_STYLES: Record<number, { badge: string; glow: string; label: string }> = {
  1: { badge: "bg-amber-500 text-black", glow: "shadow-[0_0_20px_rgba(245,158,11,0.3)]", label: "👑" },
  2: { badge: "bg-zinc-300 text-black", glow: "shadow-[0_0_15px_rgba(212,212,216,0.2)]", label: "🥈" },
  3: { badge: "bg-amber-700 text-white", glow: "shadow-[0_0_15px_rgba(180,83,9,0.2)]", label: "🥉" },
};

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

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-purple-900/15 blur-3xl" />
      </div>

      <Navbar user={session!.user} points={userPoints} />

      <main className="relative max-w-3xl mx-auto px-6 pt-24 pb-20">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">Fan Leaderboard</h1>
          <p className="text-zinc-500">The most dedicated 5iveguysfc supporters</p>
          {currentUserRank && (
            <p className="text-purple-400 text-sm mt-2 font-medium">
              You're ranked #{currentUserRank}
            </p>
          )}
        </div>

        {leaderboard.length === 0 ? (
          <div className="text-center py-20 text-zinc-600">
            <p className="text-lg">No fans yet — be the first to sync!</p>
          </div>
        ) : (
          <>
            {/* Top 3 podium */}
            {top3.length > 0 && (
              <div className="flex items-end justify-center gap-4 mb-8">
                {/* 2nd */}
                {top3[1] && <PodiumCard entry={top3[1]} />}
                {/* 1st */}
                {top3[0] && <PodiumCard entry={top3[0]} large />}
                {/* 3rd */}
                {top3[2] && <PodiumCard entry={top3[2]} />}
              </div>
            )}

            {/* Rest of leaderboard */}
            {rest.length > 0 && (
              <div className="space-y-2">
                {rest.map((entry) => (
                  <LeaderboardRow key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function PodiumCard({ entry, large }: { entry: LeaderboardEntry; large?: boolean }) {
  const style = RANK_STYLES[entry.rank];
  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-2xl p-4 border transition-all
        ${large ? "pb-6 pt-6 border-purple-700/40 bg-purple-900/20" : "border-zinc-800 bg-zinc-900/60"}
        ${entry.isCurrentUser ? "ring-2 ring-purple-500" : ""}
        ${style?.glow ?? ""}
      `}
      style={{ minWidth: large ? 160 : 130 }}
    >
      <span className="text-2xl">{style?.label ?? `#${entry.rank}`}</span>
      <div className="relative w-14 h-14">
        {entry.image ? (
          <Image src={entry.image} alt={entry.name ?? "Fan"} fill className="rounded-full object-cover" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-zinc-700 flex items-center justify-center">
            <span className="text-white text-xl font-bold">{entry.name?.[0] ?? "?"}</span>
          </div>
        )}
      </div>
      <p className="text-white font-semibold text-sm text-center leading-tight">
        {entry.name?.split(" ")[0] ?? "Fan"}
        {entry.isCurrentUser && <span className="text-purple-400 text-xs block">You</span>}
      </p>
      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-purple-900/40 border border-purple-700/40">
        <span className="text-purple-300 font-bold text-sm">{entry.totalEarned.toLocaleString()}</span>
        <span className="text-purple-500 text-xs">pts</span>
      </div>
      <div className="grid grid-cols-2 gap-1 w-full mt-1">
        <StatPill icon="👍" value={entry.likedCount} />
        <StatPill icon="💬" value={entry.commentCount} />
      </div>
    </div>
  );
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-2xl border transition-all
        ${entry.isCurrentUser
          ? "bg-purple-900/20 border-purple-700/40"
          : "bg-zinc-900/60 border-zinc-800 hover:border-zinc-700"
        }`}
    >
      <span className="text-zinc-500 font-bold text-sm w-6 text-center">#{entry.rank}</span>

      <div className="relative w-9 h-9 flex-shrink-0">
        {entry.image ? (
          <Image src={entry.image} alt={entry.name ?? "Fan"} fill className="rounded-full object-cover" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center">
            <span className="text-white text-sm font-bold">{entry.name?.[0] ?? "?"}</span>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-white font-medium text-sm truncate">
          {entry.name ?? "Fan"}
          {entry.isCurrentUser && <span className="text-purple-400 text-xs ml-1">(You)</span>}
        </p>
        <div className="flex items-center gap-3 mt-0.5">
          {entry.isSubscribed && <span className="text-green-400 text-xs">✓ Sub</span>}
          <span className="text-zinc-600 text-xs">👍 {entry.likedCount}</span>
          <span className="text-zinc-600 text-xs">💬 {entry.commentCount}</span>
          <span className="text-zinc-600 text-xs">🃏 {entry.cardCount}</span>
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <p className="text-purple-400 font-bold text-sm">{entry.totalEarned.toLocaleString()}</p>
        <p className="text-zinc-600 text-xs">pts earned</p>
      </div>
    </div>
  );
}

function StatPill({ icon, value }: { icon: string; value: number }) {
  return (
    <div className="flex items-center gap-1 justify-center bg-zinc-800/60 rounded-lg px-1.5 py-1">
      <span className="text-xs">{icon}</span>
      <span className="text-zinc-400 text-xs font-medium">{value}</span>
    </div>
  );
}
