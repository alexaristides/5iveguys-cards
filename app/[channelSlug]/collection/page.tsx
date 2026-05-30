"use client";

import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import CardDisplay from "@/components/CardDisplay";
import { SkeletonBox } from "@/components/Skeleton";
import { dbCardToCard, Rarity } from "@/lib/cards";

type FilterRarity = "all" | Rarity;
const RARITY_ORDER: Rarity[] = ["legendary", "epic", "rare", "common"];
const RARITY_BADGE: Record<Rarity, string> = {
  legendary: "bg-amber-900/70 text-amber-300",
  epic:      "bg-purple-900/70 text-purple-300",
  rare:      "bg-blue-900/70 text-blue-300",
  common:    "bg-zinc-700/70 text-zinc-300",
};

interface DbCard {
  id: string;
  name: string;
  kit: string | null;
  rarity: string;
  imageUrl: string;
  backImageUrl: string | null;
  attribute: string | null;
  description: string | null;
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <p className="text-zinc-600 text-xs">{label}</p>
      <p className={`font-bold text-sm ${color}`}>{value}</p>
    </div>
  );
}

export default function CollectionPage() {
  const { status } = useSession();
  const params = useParams<{ channelSlug: string }>();
  const channelSlug = params.channelSlug;

  const [allCards, setAllCards] = useState<DbCard[]>([]);
  const [ownedIds, setOwnedIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<FilterRarity>("all");
  const [showOwned, setShowOwned] = useState(false);

  const fetchData = useCallback(async () => {
    const [cardsRes, userRes] = await Promise.all([
      fetch(`/api/channels/${channelSlug}/cards`),
      fetch(`/api/user?channelSlug=${channelSlug}`),
    ]);
    if (cardsRes.ok) setAllCards((await cardsRes.json()).cards ?? []);
    if (userRes.ok) {
      const data = await userRes.json();
      setOwnedIds(data.cards.map((c: { cardId: string }) => c.cardId));
    }
  }, [channelSlug]);

  useEffect(() => {
    if (status === "authenticated") fetchData();
  }, [status, fetchData]);

  const ownedSet = new Set(ownedIds);

  let displayCards = [...allCards].sort(
    (a, b) => RARITY_ORDER.indexOf(a.rarity as Rarity) - RARITY_ORDER.indexOf(b.rarity as Rarity)
  );
  if (filter !== "all") displayCards = displayCards.filter((c) => c.rarity === filter);
  if (showOwned) displayCards = displayCards.filter((c) => ownedSet.has(c.id));

  const stats = {
    total: allCards.length,
    owned: new Set(ownedIds).size,
    legendary: allCards.filter((c) => c.rarity === "legendary" && ownedSet.has(c.id)).length,
    epic: allCards.filter((c) => c.rarity === "epic" && ownedSet.has(c.id)).length,
    rare: allCards.filter((c) => c.rarity === "rare" && ownedSet.has(c.id)).length,
    common: allCards.filter((c) => c.rarity === "common" && ownedSet.has(c.id)).length,
  };

  const progress = stats.total > 0 ? Math.round((stats.owned / stats.total) * 100) : 0;

  if (status === "loading" || (status === "authenticated" && allCards.length === 0 && ownedIds.length === 0)) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <main className="max-w-6xl mx-auto px-6 pt-24 pb-20">
          <div className="mb-8">
            <SkeletonBox className="h-8 w-40 mb-2" />
            <SkeletonBox className="h-4 w-32" />
          </div>
          <div className="mb-8 rounded-2xl bg-zinc-900/80 border border-zinc-800 p-5">
            <div className="flex justify-between mb-3">
              <SkeletonBox className="h-4 w-36" />
              <SkeletonBox className="h-4 w-10" />
            </div>
            <SkeletonBox className="h-2 w-full mb-4" />
            <div className="flex gap-6">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonBox key={i} className="h-8 w-16" />)}
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
            {Array.from({ length: 18 }).map((_, i) => <SkeletonBox key={i} className="aspect-[2/3]" />)}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <main className="max-w-6xl mx-auto px-6 pt-24 pb-20">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">Collection</h1>
          <p className="text-zinc-500 text-sm">{stats.owned} / {stats.total} cards collected</p>
        </div>

        <div className="mb-8 rounded-2xl bg-zinc-900/80 border border-zinc-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white text-sm font-medium">Collection Progress</span>
            <span className="text-purple-400 font-bold">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3 mt-4">
            <MiniStat label="Legendary" value={`${stats.legendary}/${allCards.filter(c => c.rarity === "legendary").length}`} color="text-amber-400" />
            <MiniStat label="Epic" value={`${stats.epic}/${allCards.filter(c => c.rarity === "epic").length}`} color="text-purple-400" />
            <MiniStat label="Rare" value={`${stats.rare}/${allCards.filter(c => c.rarity === "rare").length}`} color="text-blue-400" />
            <MiniStat label="Common" value={`${stats.common}/${allCards.filter(c => c.rarity === "common").length}`} color="text-zinc-400" />
          </div>
          {(() => {
            const totalMissing = stats.total - stats.owned;
            if (totalMissing <= 0 || stats.total === 0) return null;
            const pHit = totalMissing / stats.total;
            const estimatedPacks = Math.ceil(totalMissing / (3 * pHit));
            return (
              <p className="text-zinc-500 text-xs mt-3">
                ~{estimatedPacks} Team Pack{estimatedPacks !== 1 ? "s" : ""} to complete your set
              </p>
            );
          })()}
        </div>

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

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
          {displayCards.map((dbCard) => {
            const card = dbCardToCard(dbCard);
            const owned = ownedSet.has(dbCard.id);
            const count = ownedIds.filter((id) => id === dbCard.id).length;
            return (
              <div
                key={dbCard.id}
                className={`relative group transition-all ${!owned ? "opacity-30 grayscale hover:opacity-85 hover:grayscale-0" : ""}`}
              >
                <CardDisplay card={card} size="sm" showDetails />
                {/* Hover overlay — name + rarity badge */}
                <div className="absolute inset-0 flex flex-col items-center justify-end pb-2 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none overflow-hidden">
                  <div className="w-full bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-6 pb-2 px-1 flex flex-col items-center gap-0.5">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold capitalize ${RARITY_BADGE[card.rarity]}`}>
                      {card.rarity}
                    </span>
                    <p className="text-white text-[10px] font-medium text-center leading-tight drop-shadow-md line-clamp-2">
                      {card.name}
                    </p>
                    {!owned && <span className="text-zinc-400 text-[9px]">Not owned</span>}
                  </div>
                </div>
                {owned && count > 1 && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center z-10">
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
