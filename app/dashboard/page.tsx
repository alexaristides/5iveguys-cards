"use client";

import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Navbar from "@/components/Navbar";
import PointsActivity from "@/components/PointsActivity";
import CardDisplay from "@/components/CardDisplay";
import { CARDS_BY_ID, PACKS } from "@/lib/cards";
import Link from "next/link";

interface UserData {
  points: number;
  totalEarned: number;
  cardCount: number;
  cards: { cardId: string; obtainedAt: string }[];
  youtubeSync: {
    isSubscribed: boolean;
    likedVideoIds: string;
    earlyLikedVideoIds: string;
  } | null;
  hasYoutubeScope: boolean;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  const fetchUser = useCallback(async () => {
    const res = await fetch("/api/user");
    if (res.ok) setUserData(await res.json());
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchUser();
  }, [status, fetchUser]);

  async function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/youtube/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        if (data.pointsEarned > 0) {
          setSyncMessage(`+${data.pointsEarned} points earned!`);
          fetchUser();
        } else {
          setSyncMessage("All caught up — keep engaging!");
          fetchUser();
        }
      } else if (data.error === "reauth_required") {
        signIn("google", { callbackUrl: "/dashboard" });
      } else {
        setSyncMessage("Sync failed — please try again.");
      }
    } catch {
      setSyncMessage("Sync failed — check your connection and try again.");
    } finally {
      setSyncing(false);
    }
  }

  if (status === "loading" || !userData) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const recentCards = userData.cards
    .slice(0, 6)
    .map((uc) => CARDS_BY_ID[uc.cardId])
    .filter(Boolean);

  const uniqueCards = new Set(userData.cards.map((c) => c.cardId)).size;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 rounded-full bg-purple-900/15 blur-3xl" />
      </div>

      <Navbar user={session!.user} points={userData.points} />

      <main className="relative max-w-6xl mx-auto px-6 pt-24 pb-20">
        {/* Header */}
        <div className="mb-10">
          <p className="text-zinc-500 text-sm mb-1">Welcome back,</p>
          <h1 className="text-3xl font-bold text-white">{session?.user?.name?.split(" ")[0]}</h1>
        </div>

        {/* Sync message */}
        {syncMessage && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-purple-900/40 border border-purple-700/40 text-purple-300 text-sm">
            {syncMessage}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="Points" value={userData.points.toLocaleString()} accent />
              <StatCard label="Cards" value={String(userData.cardCount)} />
              <StatCard label="Unique" value={String(uniqueCards)} />
            </div>

            {/* Quick open pack */}
            <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-6 backdrop-blur">
              <h2 className="text-white font-semibold mb-4">Quick Open</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {PACKS.map((pack) => {
                  const canAfford = userData.points >= pack.cost;
                  return (
                    <Link
                      key={pack.id}
                      href="/packs"
                      className={`flex items-center justify-between p-4 rounded-xl border transition-all
                        ${canAfford
                          ? "bg-purple-900/20 border-purple-700/40 hover:bg-purple-900/30 hover:border-purple-600/60"
                          : "bg-zinc-800/40 border-zinc-700/40 opacity-60"
                        }`}
                    >
                      <div>
                        <p className="text-white text-sm font-medium">{pack.name}</p>
                        <p className="text-zinc-500 text-xs">{pack.cardCount} cards</p>
                      </div>
                      <span className={`text-sm font-bold ${canAfford ? "text-purple-400" : "text-zinc-500"}`}>
                        {pack.cost}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Recent cards */}
            {recentCards.length > 0 && (
              <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-6 backdrop-blur">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-white font-semibold">Recent Cards</h2>
                  <Link href="/collection" className="text-purple-400 text-sm hover:text-purple-300">
                    View all →
                  </Link>
                </div>
                <div className="flex flex-wrap gap-3">
                  {recentCards.map((card, i) => (
                    <CardDisplay key={i} card={card} size="sm" showDetails />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div>
            <PointsActivity
              sync={userData.youtubeSync}
              onSync={handleSync}
              syncing={syncing}
              hasYoutubeScope={userData.hasYoutubeScope}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-5 border ${accent ? "bg-purple-900/20 border-purple-700/40" : "bg-zinc-900/80 border-zinc-800"}`}>
      <p className="text-zinc-500 text-xs mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ? "text-purple-300" : "text-white"}`}>{value}</p>
    </div>
  );
}
