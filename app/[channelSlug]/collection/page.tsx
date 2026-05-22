"use client";

import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import CardDisplay from "@/components/CardDisplay";
import { dbCardToCard, Rarity } from "@/lib/cards";

type FilterRarity = "all" | Rarity;
const RARITY_ORDER: Rarity[] = ["legendary", "epic", "rare", "common"];

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

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
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
          <div className="flex gap-6 mt-4">
            <MiniStat label="Legendary" value={`${stats.legendary}/${allCards.filter(c => c.rarity === "legendary").length}`} color="text-amber-400" />
            <MiniStat label="Epic" value={`${stats.epic}/${allCards.filter(c => c.rarity === "epic").length}`} color="text-purple-400" />
            <MiniStat label="Rare" value={`${stats.rare}/${allCards.filter(c => c.rarity === "rare").length}`} color="text-blue-400" />
            <MiniStat label="Common" value={`${stats.common}/${allCards.filter(c => c.rarity === "common").length}`} color="text-zinc-400" />
          </div>
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
              <div key={dbCard.id} className={`relative transition-all ${!owned ? "opacity-30 grayscale" : ""}`}>
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
