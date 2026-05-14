"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import CardDisplay from "@/components/CardDisplay";
import { CARDS, Rarity } from "@/lib/cards";

type FilterRarity = "all" | Rarity;

const RARITY_ORDER: Rarity[] = ["legendary", "epic", "rare", "common"];

interface PlayerProfile {
  id: string;
  name: string | null;
  image: string | null;
  totalEarned: number;
  cardCount: number;
  ownedCardIds: string[];
}

export default function PlayerPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { userId } = useParams<{ userId: string }>();

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [userPoints, setUserPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterRarity>("all");
  const [showOwned, setShowOwned] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  const fetchData = useCallback(async () => {
    const [profileRes, userRes] = await Promise.all([
      fetch(`/api/players/${userId}`),
      fetch("/api/user"),
    ]);
    if (profileRes.ok) setProfile(await profileRes.json());
    if (userRes.ok) setUserPoints((await userRes.json()).points);
    setLoading(false);
  }, [userId]);

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

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-zinc-500">
        Player not found
      </div>
    );
  }

  const ownedSet = new Set(profile.ownedCardIds);

  let displayCards = [...CARDS].sort(
    (a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity)
  );
  if (filter !== "all") displayCards = displayCards.filter((c) => c.rarity === filter);
  if (showOwned) displayCards = displayCards.filter((c) => ownedSet.has(c.id));

  const uniqueOwned = ownedSet.size;
  const progress = Math.round((uniqueOwned / CARDS.length) * 100);
  const isCurrentUser = profile.id === session?.user?.id;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar user={session!.user} points={userPoints} />

      <main className="max-w-6xl mx-auto px-6 pt-24 pb-20">
        {/* Back */}
        <Link
          href="/fans"
          className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-white text-sm mb-6 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Leaderboard
        </Link>

        {/* Player header */}
        <div className="flex items-center gap-4 mb-8 p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800">
          <div className="relative w-16 h-16 shrink-0">
            {profile.image ? (
              <Image
                src={profile.image}
                alt={profile.name ?? "Player"}
                fill
                className="rounded-full object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-zinc-700 flex items-center justify-center">
                <span className="text-white text-xl font-bold">{profile.name?.[0] ?? "?"}</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white truncate">
              {profile.name ?? "Fan"}
              {isCurrentUser && <span className="text-purple-400 text-sm font-normal ml-2">(You)</span>}
            </h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {uniqueOwned} / {CARDS.length} cards &middot; {profile.totalEarned.toLocaleString()} pts earned
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-purple-400 font-bold text-lg">{progress}%</p>
            <p className="text-zinc-600 text-xs">complete</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden mb-8">
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex gap-2 flex-wrap">
            {(["all", "legendary", "epic", "rare", "common"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setFilter(r)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium capitalize transition-all border
                  ${filter === r
                    ? "bg-purple-900/60 border-purple-600 text-white"
                    : "bg-zinc-900/60 border-zinc-700 text-zinc-400 hover:text-white"
                  }`}
              >
                {r}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowOwned(!showOwned)}
            className={`ml-auto flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium border transition-all
              ${showOwned
                ? "bg-green-900/40 border-green-700/60 text-green-400"
                : "bg-zinc-900/60 border-zinc-700 text-zinc-400 hover:text-white"
              }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${showOwned ? "bg-green-400" : "bg-zinc-600"}`} />
            Owned only
          </button>
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
          {displayCards.map((card) => {
            const owned = ownedSet.has(card.id);
            const count = profile.ownedCardIds.filter((id) => id === card.id).length;
            return (
              <div key={card.id} className={`relative transition-all ${!owned ? "opacity-30 grayscale" : ""}`}>
                <CardDisplay card={card} size="sm" showDetails />
                {owned && count > 1 && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">×{count}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {displayCards.length === 0 && (
          <div className="text-center py-20 text-zinc-600">
            <p className="text-lg">No cards match this filter</p>
          </div>
        )}
      </main>
    </div>
  );
}
