"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import Navbar from "@/components/Navbar";

type Period = "day" | "week" | "month" | "alltime";

const PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "alltime", label: "All Time" },
];

const EMPTY_LABELS: Record<Period, string> = {
  day: "No activity today yet",
  week: "No activity this week yet",
  month: "No activity this month yet",
  alltime: "No fans yet — be the first to sync!",
};

interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string | null;
  image: string | null;
  points: number;
  totalEarned: number;
  score: number;
  cardCount: number;
  isSubscribed: boolean;
  likedCount: number;
  earlyLikedCount: number;
  isCurrentUser: boolean;
  rankChange: number;
}

interface PlatformStats {
  newSubsThisWeek: number;
  totalLikesThisWeek: number;
  likesByDay: { date: string; likeCount: number }[];
  mostActiveUsers: { userId: string; name: string | null; image: string | null; pointsThisWeek: number }[];
}

function RankChange({ change }: { change: number }) {
  if (change === 0) return <span className="text-zinc-600 text-[10px]">—</span>;
  if (change > 0) return <span className="text-green-400 text-[10px] font-semibold">↑{change}</span>;
  return <span className="text-red-400 text-[10px] font-semibold">↓{Math.abs(change)}</span>;
}

export default function FansPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);
  const [userPoints, setUserPoints] = useState(0);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lbLoading, setLbLoading] = useState(false);
  const [period, setPeriod] = useState<Period>("alltime");
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  const fetchLeaderboard = useCallback(async (p: Period) => {
    setLbLoading(true);
    const res = await fetch(`/api/leaderboard?period=${p}`);
    if (res.ok) {
      const data = await res.json();
      setLeaderboard(data.leaderboard);
      setCurrentUserRank(data.currentUserRank);
    }
    setLbLoading(false);
  }, []);

  // Initial load: leaderboard + user points + stats
  useEffect(() => {
    if (status !== "authenticated" || initialLoadDone.current) return;
    initialLoadDone.current = true;
    Promise.all([
      fetchLeaderboard("alltime"),
      fetch("/api/user").then((r) => r.ok ? r.json() : null),
      fetch("/api/stats").then((r) => r.ok ? r.json() : null),
    ]).then(([, userData, statsData]) => {
      if (userData) setUserPoints(userData.points);
      if (statsData) setStats(statsData);
      setLoading(false);
    });
  }, [status, fetchLeaderboard]);

  // Re-fetch leaderboard when period changes (skip initial mount)
  const prevPeriod = useRef<Period | null>(null);
  useEffect(() => {
    if (prevPeriod.current === null) { prevPeriod.current = period; return; }
    if (prevPeriod.current === period) return;
    prevPeriod.current = period;
    if (status === "authenticated") fetchLeaderboard(period);
  }, [period, status, fetchLeaderboard]);

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

        {/* Period toggle */}
        <div className="flex gap-1.5 justify-center mb-5">
          {PERIODS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                ${period === key
                  ? "bg-purple-600 text-white"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Platform stats banner (always shows weekly stats) */}
        {stats && (
          <div className="flex gap-3 mb-6">
            <div className="flex-1 rounded-xl bg-zinc-900/60 border border-zinc-800 px-4 py-3 text-center">
              <p className="text-zinc-500 text-xs">New subs this week</p>
              <p className="text-white font-bold text-lg mt-0.5">{stats.newSubsThisWeek}</p>
            </div>
            <div className="flex-1 rounded-xl bg-zinc-900/60 border border-zinc-800 px-4 py-3 text-center">
              <p className="text-zinc-500 text-xs">Likes added this week</p>
              <p className="text-white font-bold text-lg mt-0.5">{stats.totalLikesThisWeek}</p>
            </div>
          </div>
        )}

        {lbLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="text-center py-20 text-zinc-600">
            <p className="text-lg">{EMPTY_LABELS[period]}</p>
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

                      {/* Score */}
                      <div className="mt-1.5 px-2 py-0.5 rounded-full bg-purple-900/50 border border-purple-700/40">
                        <span className="text-purple-300 font-bold text-xs">{entry.score.toLocaleString()} pts</span>
                      </div>

                      {period === "alltime" && <RankChange change={entry.rankChange} />}

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

                    <div className="flex flex-col items-end shrink-0">
                      <p className="text-purple-400 font-bold text-sm">
                        {entry.score.toLocaleString()} <span className="text-zinc-600 font-normal text-xs">pts</span>
                      </p>
                      {period === "alltime" && <RankChange change={entry.rankChange} />}
                    </div>
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
