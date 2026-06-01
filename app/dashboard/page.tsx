"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { dbCardToCard, Rarity } from "@/lib/cards";
import CardDisplay from "@/components/CardDisplay";
import CardRatingsLeaderboard from "@/components/CardRatingsLeaderboard";
import FootballGame from "@/components/football/FootballGame";
import GameLeaderboard from "@/components/football/GameLeaderboard";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChannelStats {
  fanTotalEarned: number;
  bonusPoints: number;
  spendablePoints: number;
  cardCount: number;
  totalCards: number;
  rank: number;
}

interface ChannelData {
  slug: string;
  name: string;
  thumbnailUrl: string | null;
  description: string | null;
  isActive: boolean;
  rewardTags: string | null;
  fanCount: number;
  stats: ChannelStats;
}

interface SearchChannel {
  id: string;
  slug: string;
  name: string;
  thumbnailUrl: string | null;
  description: string | null;
  rewardTags: string | null;
  _count: { userStats: number };
}

interface CollectionCard {
  id: string;
  cardId: string;
  channelId: string | null;
  channel: { id: string; slug: string; name: string; thumbnailUrl: string | null } | null;
  isFavorite: boolean;
  obtainedAt: string;
  card: {
    id: string;
    name: string;
    kit: string | null;
    rarity: string;
    imageUrl: string;
    backImageUrl: string | null;
    attribute: string | null;
    description: string | null;
    channelId: string;
  } | null;
}

type RarityFilter = "all" | Rarity;
const RARITY_ORDER: Rarity[] = ["legendary", "epic", "rare", "common"];
const RARITY_COLORS: Record<Rarity, string> = {
  legendary: "text-amber-400",
  epic: "text-purple-400",
  rare: "text-blue-400",
  common: "text-zinc-400",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatPill({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-zinc-500 text-[10px] uppercase tracking-wide leading-none">{label}</span>
      <span className="text-white font-bold text-sm mt-0.5 leading-none">{value}</span>
      {sub && <span className="text-zinc-600 text-[10px] mt-0.5">{sub}</span>}
    </div>
  );
}

function ChannelCard({ channel }: { channel: ChannelData }) {
  const { stats } = channel;
  const progress = stats.totalCards > 0 ? Math.round((stats.cardCount / stats.totalCards) * 100) : 0;
  const inactive = !channel.isActive;

  return (
    <Link
      href={`/${channel.slug}`}
      className={`rounded-2xl bg-zinc-900/80 border overflow-hidden transition-all group block ${inactive ? "border-zinc-800/50 opacity-60" : "border-zinc-800 hover:border-purple-700/50 cursor-pointer"}`}
    >
      {/* Thumbnail */}
      <div className="h-28 relative bg-zinc-800">
        {channel.thumbnailUrl ? (
          <Image src={channel.thumbnailUrl} alt={channel.name} fill className={`object-cover ${inactive ? "grayscale" : ""}`} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-purple-700 flex items-center justify-center">
              <span className="text-white text-lg font-bold">{channel.name[0]}</span>
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        {inactive ? (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-zinc-800/90 border border-zinc-600/60 backdrop-blur-sm">
            <span className="text-zinc-400 text-[11px] font-medium">Inactive</span>
          </div>
        ) : (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-purple-900/80 border border-purple-700/60 backdrop-blur-sm">
            <span className="text-purple-300 text-[11px] font-bold">#{stats.rank}</span>
          </div>
        )}
      </div>

      <div className="p-3">
        <h3 className="text-white font-bold text-sm group-hover:text-purple-300 transition-colors truncate">
          {channel.name}
        </h3>
        <p className="text-zinc-500 text-[11px] mt-0.5">{channel.fanCount.toLocaleString()} fans</p>

        {/* Points grid */}
        <div className="grid grid-cols-3 gap-2 mt-2.5 pt-2.5 border-t border-zinc-800">
          <StatPill label="Fan Pts" value={stats.fanTotalEarned.toLocaleString()} />
          <StatPill label="Bonus" value={stats.bonusPoints.toLocaleString()} />
          <StatPill label="Spendable" value={stats.spendablePoints.toLocaleString()} />
        </div>

        {/* Cards progress */}
        <div className="mt-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-zinc-500 text-[10px]">Cards {stats.cardCount}/{stats.totalCards}</span>
            <span className="text-zinc-500 text-[10px]">{progress}%</span>
          </div>
          <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

      </div>
    </Link>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Channel stats
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);

  // Collection
  const [collection, setCollection] = useState<CollectionCard[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("all");
  const [showOwnedOnly] = useState(true);

  // Channel discovery
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchChannel[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout>>();

  // Active section tab
  const [activeTab, setActiveTab] = useState<"channels" | "collection" | "discover" | "cards" | "game">("channels");
  const [showInactive, setShowInactive] = useState(false);
  const [gameMode, setGameMode] = useState<"sp" | "pvp" | "leaderboard">("sp");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    Promise.all([
      fetch("/api/dashboard").then((r) => (r.ok ? r.json() : { channels: [] })),
      fetch("/api/user/collection").then((r) => (r.ok ? r.json() : { cards: [] })),
    ]).then(([dashData, colData]) => {
      setChannels(dashData.channels ?? []);
      setChannelsLoading(false);
      setCollection(colData.cards ?? []);
      setCollectionLoading(false);
    });
  }, [status]);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    clearTimeout(searchDebounce.current);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    searchDebounce.current = setTimeout(async () => {
      setSearchLoading(true);
      const res = await fetch(`/api/channels/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.channels ?? []);
      }
      setSearchLoading(false);
    }, 300);
  }, []);

  // Channels user is already a member of (for search filtering)
  const memberSlugs = new Set(channels.map((c) => c.slug));

  // Filtered collection
  const ownedCards = collection.filter((uc) => uc.card !== null);
  const filteredCards = ownedCards
    .filter((uc) => channelFilter === "all" || uc.channelId === channelFilter)
    .filter((uc) => rarityFilter === "all" || uc.card?.rarity === rarityFilter)
    .sort((a, b) => {
      const ri = RARITY_ORDER.indexOf(a.card?.rarity as Rarity);
      const rj = RARITY_ORDER.indexOf(b.card?.rarity as Rarity);
      return ri - rj;
    });

  // Unique channels in collection (for filter pills)
  const collectionChannels = channels.filter((ch) =>
    ownedCards.some((uc) => {
      const matchingChannel = channels.find((c) => c.slug === ch.slug);
      return uc.channel?.slug === matchingChannel?.slug;
    })
  );

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  const user = session?.user;

  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-purple-900/15 blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">5</span>
            </div>
            <span className="text-white font-semibold text-sm hidden sm:block">5iveG</span>
          </Link>

          <div className="flex items-center gap-3">
            <Link href="/game" className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors">
              Game
            </Link>
            <Link href="/settings" className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors">
              Settings
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
            >
              Sign out
            </button>
            {user?.image && (
              <div className="relative w-7 h-7 rounded-full overflow-hidden border border-zinc-700">
                <Image src={user.image} alt={user.name ?? "User"} fill className="object-cover" />
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Profile hero */}
        <div className="flex items-center gap-4 mb-8">
          {user?.image ? (
            <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-purple-700/50 shrink-0">
              <Image src={user.image} alt={user.name ?? "User"} fill className="object-cover" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full bg-purple-700 flex items-center justify-center shrink-0">
              <span className="text-white text-2xl font-bold">{user?.name?.[0] ?? "?"}</span>
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-white">{user?.name ?? "Fan"}</h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {channelsLoading ? "—" : `${channels.filter((c) => c.isActive).length} channel${channels.filter((c) => c.isActive).length !== 1 ? "s" : ""} · ${collection.length} cards`}
            </p>
          </div>
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 mb-6 bg-zinc-900/60 border border-zinc-800 rounded-xl p-1 w-fit flex-wrap">
          {(["channels", "collection", "cards", "game", "discover"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all whitespace-nowrap
                ${activeTab === tab ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-white"}`}
            >
              {tab === "channels" ? "My Channels" : tab === "collection" ? "Collection" : tab === "cards" ? "🏆 Card Ratings" : tab === "game" ? "⚽ Game" : "Discover"}
            </button>
          ))}
        </div>

        {/* ── My Channels tab ── */}
        {activeTab === "channels" && (
          <>
            {channelsLoading ? (
              <div className="flex justify-center py-20">
                <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : channels.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-zinc-500 text-lg mb-2">No channels yet</p>
                <p className="text-zinc-600 text-sm mb-4">Discover a channel to get started</p>
                <button
                  onClick={() => setActiveTab("discover")}
                  className="px-6 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-500 transition-all"
                >
                  Find Channels
                </button>
              </div>
            ) : (
              <>
                {/* Toolbar row */}
                <div className="flex items-center justify-between mb-4">
                  {channels.some((c) => !c.isActive) ? (
                    <button
                      onClick={() => setShowInactive((v) => !v)}
                      title="Channels you've joined but haven't interacted with yet"
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                        ${showInactive
                          ? "bg-zinc-700/60 border-zinc-600 text-zinc-200"
                          : "bg-zinc-900/60 border-zinc-700 text-zinc-500 hover:text-zinc-300"
                        }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${showInactive ? "bg-zinc-300" : "bg-zinc-600"}`} />
                      {showInactive ? "Hiding inactive" : "Show inactive"}
                      <span className="text-zinc-600 text-[9px] hidden sm:inline">no activity</span>
                    </button>
                  ) : <div />}
                  <button
                    onClick={() => setActiveTab("discover")}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-all shadow-lg shadow-purple-900/30"
                  >
                    <span className="text-lg leading-none">+</span> Add Channel
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {channels
                    .filter((ch) => showInactive || ch.isActive)
                    .map((ch) => (
                      <ChannelCard key={ch.slug} channel={ch} />
                    ))}
                  {/* Add channel tile */}
                  <button
                    onClick={() => setActiveTab("discover")}
                    className="rounded-2xl border-2 border-dashed border-zinc-700 hover:border-purple-600 bg-zinc-900/40 hover:bg-purple-900/10 transition-all flex flex-col items-center justify-center gap-3 min-h-[220px] group"
                  >
                    <div className="w-12 h-12 rounded-full bg-zinc-800 group-hover:bg-purple-900/60 border border-zinc-700 group-hover:border-purple-600 flex items-center justify-center transition-all">
                      <span className="text-zinc-400 group-hover:text-purple-300 text-2xl leading-none transition-colors">+</span>
                    </div>
                    <span className="text-zinc-500 group-hover:text-purple-300 text-sm font-medium transition-colors">Add a Channel</span>
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Collection tab ── */}
        {activeTab === "collection" && (
          <>
            {collectionLoading ? (
              <div className="flex justify-center py-20">
                <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {/* Stats summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  {(["legendary", "epic", "rare", "common"] as Rarity[]).map((r) => {
                    const count = ownedCards.filter((uc) => uc.card?.rarity === r).length;
                    return (
                      <div key={r} className="rounded-xl bg-zinc-900/60 border border-zinc-800 px-4 py-3 text-center">
                        <p className="text-zinc-500 text-xs capitalize">{r}</p>
                        <p className={`font-bold text-lg mt-0.5 ${RARITY_COLORS[r]}`}>{count}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-2 mb-5">
                  {/* Channel filter */}
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      onClick={() => setChannelFilter("all")}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all
                        ${channelFilter === "all" ? "bg-zinc-700 border-zinc-600 text-white" : "bg-zinc-900/60 border-zinc-700 text-zinc-400 hover:text-white"}`}
                    >
                      All Channels
                    </button>
                    {collectionChannels.map((ch) => {
                      const chId = collection.find((uc) => uc.channel?.slug === ch.slug)?.channelId;
                      return (
                        <button
                          key={ch.slug}
                          onClick={() => setChannelFilter(chId ?? "all")}
                          className={`px-3 py-1 rounded-full text-xs font-medium border transition-all
                            ${channelFilter === chId ? "bg-purple-900/60 border-purple-600 text-white" : "bg-zinc-900/60 border-zinc-700 text-zinc-400 hover:text-white"}`}
                        >
                          {ch.name}
                        </button>
                      );
                    })}
                  </div>

                  <div className="w-full sm:w-px sm:h-auto bg-zinc-800 my-1" />

                  {/* Rarity filter */}
                  <div className="flex gap-1.5 flex-wrap">
                    {(["all", "legendary", "epic", "rare", "common"] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => setRarityFilter(r)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border capitalize transition-all
                          ${rarityFilter === r ? "bg-purple-900/60 border-purple-600 text-white" : "bg-zinc-900/60 border-zinc-700 text-zinc-400 hover:text-white"}`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredCards.length === 0 ? (
                  <div className="text-center py-16 text-zinc-600">
                    <p className="text-lg">
                      {ownedCards.length === 0 ? "No cards yet — open some packs!" : "No cards match this filter"}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                    {filteredCards.map((uc) => {
                      if (!uc.card) return null;
                      const card = dbCardToCard(uc.card);
                      return (
                        <div key={uc.id} className="relative">
                          <CardDisplay card={card} size="sm" showDetails />
                          {uc.isFavorite && (
                            <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                              <span className="text-[8px]">★</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {!showOwnedOnly && <p className="text-zinc-600 text-xs text-center mt-4">Showing owned cards only</p>}
              </>
            )}
          </>
        )}

        {/* ── Card Ratings tab ── */}
        {activeTab === "cards" && (
          <CardRatingsLeaderboard
            channels={channels.map((c) => ({ id: c.slug, name: c.name, slug: c.slug }))}
          />
        )}

        {/* ── Game tab ── */}
        {activeTab === "game" && (
          <div className="flex flex-col items-center w-full">
            {/* Mode tabs: SP / PvP / Leaderboard */}
            <div className="flex gap-1 mb-6 bg-zinc-800 border border-zinc-600 rounded-xl p-1 self-start sm:self-center">
              <button
                onClick={() => setGameMode("sp")}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  gameMode === "sp" ? "bg-green-700 text-white shadow" : "text-zinc-200 hover:text-white hover:bg-zinc-700"
                }`}
              >
                ⚽ Single Player
              </button>
              <button
                onClick={() => setGameMode("pvp")}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  gameMode === "pvp" ? "bg-green-700 text-white shadow" : "text-zinc-200 hover:text-white hover:bg-zinc-700"
                }`}
              >
                ⚔️ PvP
              </button>
              <button
                onClick={() => setGameMode("leaderboard")}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  gameMode === "leaderboard" ? "bg-green-700 text-white shadow" : "text-zinc-200 hover:text-white hover:bg-zinc-700"
                }`}
              >
                🏆 Leaderboard
              </button>
            </div>

            {gameMode === "sp" && <div className="w-full"><FootballGame /></div>}

            {gameMode === "pvp" && (
              <div className="max-w-xl w-full">
                <p className="text-zinc-500 text-sm mb-5">
                  Challenge another player to a live 1v1 match — both pick squads, then watch the same simulation unfold in real time.
                </p>
                <Link
                  href="/game?tab=pvp"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-green-700 hover:bg-green-600 text-white font-bold transition-all shadow-lg shadow-green-900/30"
                >
                  ⚔️ Open PvP Lobby
                </Link>
              </div>
            )}

            {gameMode === "leaderboard" && (
              <div className="max-w-lg w-full">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-white font-bold text-lg">Game Leaderboard</h3>
                    <p className="text-zinc-500 text-xs mt-0.5">Ranked by wins · all-time</p>
                  </div>
                </div>
                <GameLeaderboard />
              </div>
            )}
          </div>
        )}

        {/* ── Discover tab ── */}
        {activeTab === "discover" && (
          <div className="max-w-xl">
            <p className="text-zinc-500 text-sm mb-5">
              Find active channels and join the community to start earning points.
            </p>

            {/* Search bar */}
            <div className="relative mb-6">
              <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                placeholder="Search channels..."
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-purple-600 transition-colors"
              />
              {searchLoading && (
                <div className="absolute inset-y-0 right-3.5 flex items-center">
                  <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Search results */}
            {(searchFocused || searchResults.length > 0) && searchQuery && (
              <div className="space-y-2 mb-6">
                {searchResults.length === 0 && !searchLoading ? (
                  <p className="text-zinc-600 text-sm text-center py-4">No channels found</p>
                ) : (
                  searchResults.map((ch) => {
                    const isMember = memberSlugs.has(ch.slug);
                    return (
                      <div
                        key={ch.slug}
                        className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/80 border border-zinc-800"
                      >
                        <div className="relative w-10 h-10 rounded-full overflow-hidden bg-zinc-800 shrink-0">
                          {ch.thumbnailUrl ? (
                            <Image src={ch.thumbnailUrl} alt={ch.name} fill className="object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-white text-sm font-bold">{ch.name[0]}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold text-sm truncate">{ch.name}</p>
                          <p className="text-zinc-500 text-xs">{ch._count.userStats.toLocaleString()} fans</p>
                        </div>
                        {isMember ? (
                          <Link
                            href={`/${ch.slug}`}
                            className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-medium hover:border-purple-600 transition-all shrink-0"
                          >
                            Enter
                          </Link>
                        ) : (
                          <Link
                            href={`/${ch.slug}`}
                            className="px-3 py-1.5 rounded-lg bg-purple-900/60 border border-purple-700/60 text-purple-300 text-xs font-medium hover:bg-purple-800/60 transition-all shrink-0"
                          >
                            Join
                          </Link>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* All channels (when no search) */}
            {!searchQuery && (
              <div>
                <p className="text-zinc-600 text-xs font-medium mb-3 uppercase tracking-wide">All Channels</p>
                <AllChannelsList memberSlugs={memberSlugs} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pb-10 text-center">
        <Link href="/artist" className="text-zinc-600 text-xs hover:text-zinc-400 transition-colors">
          Card artwork by Merle
        </Link>
      </div>
    </main>
  );
}

function AllChannelsList({ memberSlugs }: { memberSlugs: Set<string> }) {
  const [channels, setChannels] = useState<SearchChannel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/channels/search?q=")
      .then((r) => (r.ok ? r.json() : { channels: [] }))
      .then((data) => {
        setChannels(data.channels ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {channels.map((ch) => {
        const isMember = memberSlugs.has(ch.slug);
        return (
          <div key={ch.slug} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <div className="relative w-10 h-10 rounded-full overflow-hidden bg-zinc-800 shrink-0">
              {ch.thumbnailUrl ? (
                <Image src={ch.thumbnailUrl} alt={ch.name} fill className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-white text-sm font-bold">{ch.name[0]}</span>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate">{ch.name}</p>
              {ch.description && <p className="text-zinc-500 text-xs truncate">{ch.description}</p>}
              <p className="text-zinc-600 text-xs mt-0.5">{ch._count.userStats.toLocaleString()} fans</p>
            </div>
            {isMember ? (
              <Link
                href={`/${ch.slug}`}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-medium hover:border-purple-600 transition-all shrink-0"
              >
                Enter
              </Link>
            ) : (
              <Link
                href={`/${ch.slug}`}
                className="px-3 py-1.5 rounded-lg bg-purple-900/60 border border-purple-700/60 text-purple-300 text-xs font-medium hover:bg-purple-800/60 transition-all shrink-0"
              >
                Join
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
