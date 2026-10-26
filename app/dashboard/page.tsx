"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { dbCardToCard, Rarity } from "@/lib/cards";
import { WORLDS, worldName } from "@/lib/worlds";
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

interface WorldChannel {
  slug: string;
  thumbnailUrl: string | null;
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
    position: string | null;
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

function WorldCard({
  slug,
  name,
  channel,
  mine,
  loading,
}: {
  slug: string;
  name: string;
  channel?: WorldChannel;
  mine?: ChannelData;
  loading: boolean;
}) {
  const stats = mine?.stats;
  const progress = stats && stats.totalCards > 0 ? Math.round((stats.cardCount / stats.totalCards) * 100) : 0;
  const thumbnailUrl = channel?.thumbnailUrl ?? mine?.thumbnailUrl ?? null;
  const fanCount = channel?._count.userStats ?? mine?.fanCount;

  return (
    <Link
      href={`/${slug}`}
      className="group relative block overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/80 p-6 transition-all duration-200 hover:border-purple-600/70 hover:shadow-lg hover:shadow-purple-900/20"
    >
      {/* Big faded crest in the corner */}
      {thumbnailUrl && (
        <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 overflow-hidden rounded-full opacity-15 blur-[2px] transition-transform duration-300 group-hover:scale-110">
          <Image src={thumbnailUrl} alt="" fill className="object-cover" />
        </div>
      )}

      <div className="relative flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-purple-700/50 bg-zinc-800">
          {thumbnailUrl ? (
            <Image src={thumbnailUrl} alt={name} fill className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-purple-700">
              <span className="text-2xl font-bold text-white">{name[0]}</span>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-2xl font-extrabold text-white transition-colors group-hover:text-purple-300">{name}</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {fanCount != null ? `${fanCount.toLocaleString()} fans` : "\u00a0"}
          </p>
        </div>
      </div>

      <div className="relative mt-5 min-h-[52px]">
        {loading ? null : stats ? (
          <>
            <div className="flex items-center gap-5">
              <StatPill label="Points" value={stats.spendablePoints.toLocaleString()} />
              <StatPill label="Fan rank" value={`#${stats.rank}`} />
              <StatPill label="Cards" value={`${stats.cardCount}/${stats.totalCards}`} />
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-400">Join the fans and start your collection.</p>
        )}
      </div>

      <div className="relative mt-5 flex items-center gap-1.5 text-sm font-semibold text-purple-400">
        <span>Enter</span>
        <span className="transition-transform group-hover:translate-x-1">→</span>
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

  // The two worlds' public info (crest, fan count), for worlds the user hasn't joined yet
  const [worldChannels, setWorldChannels] = useState<WorldChannel[]>([]);

  // Top-level mode (home → collect or play)
  const [activeMode, setActiveMode] = useState<"home" | "collect" | "play">("home");
  // Fan Zone sub-tab
  const [activeTab, setActiveTab] = useState<"worlds" | "collection" | "cards">("worlds");
  const [gameMode, setGameMode] = useState<"sp" | "pvp" | "leaderboard">("sp");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    Promise.all([
      fetch("/api/dashboard").then((r) => (r.ok ? r.json() : { channels: [] })),
      fetch("/api/user/collection").then((r) => (r.ok ? r.json() : { cards: [] })),
      fetch("/api/channels").then((r) => (r.ok ? r.json() : { channels: [] })),
    ]).then(([dashData, colData, worldData]) => {
      setChannels(dashData.channels ?? []);
      setChannelsLoading(false);
      setCollection(colData.cards ?? []);
      setCollectionLoading(false);
      setWorldChannels(worldData.channels ?? []);
    });
  }, [status]);

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
          <button onClick={() => setActiveMode("home")} className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">5</span>
            </div>
            <span className="text-white font-semibold text-sm hidden sm:block">5iveG</span>
          </button>

          <div className="flex items-center gap-3">
            <button onClick={() => setActiveMode("play")} className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors">
              Game
            </button>
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

        {/* ── Home mode picker ── */}
        {activeMode === "home" && (
          <div>
            {/* Profile line */}
            <div className="flex items-center gap-3 mb-10">
              {user?.image ? (
                <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-purple-700/50 shrink-0">
                  <Image src={user.image} alt={user.name ?? "User"} fill className="object-cover" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-full bg-purple-700 flex items-center justify-center shrink-0">
                  <span className="text-white text-xl font-bold">{user?.name?.[0] ?? "?"}</span>
                </div>
              )}
              <div>
                <p className="text-white font-semibold text-base">{user?.name ?? "Fan"}</p>
                <p className="text-zinc-500 text-xs mt-0.5">
                  {collectionLoading ? "—" : `${collection.length} card${collection.length !== 1 ? "s" : ""}`}
                </p>
              </div>
            </div>

            <p className="text-zinc-400 text-sm mb-8">What do you want to do today?</p>

            {/* Mode cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl">
              {/* Fan Zone */}
              <button
                onClick={() => setActiveMode("collect")}
                className="group text-left rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-purple-600/70 hover:shadow-lg hover:shadow-purple-900/20 transition-all duration-200 p-6"
              >
                <div className="w-12 h-12 rounded-xl bg-purple-900/60 border border-purple-700/50 flex items-center justify-center mb-4 group-hover:bg-purple-800/70 transition-colors">
                  <span className="text-2xl leading-none">🃏</span>
                </div>
                <h2 className="text-white font-bold text-xl mb-2 group-hover:text-purple-300 transition-colors">Fan Zone</h2>
                <p className="text-zinc-500 text-sm leading-relaxed">
                  Enter the 5ive Guys or Other Guys world. You get points for being a fan; spend them on card packs and build your collection.
                </p>
                <div className="mt-5 flex items-center gap-1.5 text-purple-400 text-sm font-semibold">
                  <span>Enter</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </button>

              {/* Play */}
              <button
                onClick={() => setActiveMode("play")}
                className="group text-left rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-green-600/70 hover:shadow-lg hover:shadow-green-900/20 transition-all duration-200 p-6"
              >
                <div className="w-12 h-12 rounded-xl bg-green-900/60 border border-green-700/50 flex items-center justify-center mb-4 group-hover:bg-green-800/70 transition-colors">
                  <span className="text-2xl leading-none">⚽</span>
                </div>
                <h2 className="text-white font-bold text-xl mb-2 group-hover:text-green-300 transition-colors">Play</h2>
                <p className="text-zinc-500 text-sm leading-relaxed">
                  Jump into a football simulation, challenge another fan to a live 1v1 PvP match, or check where you rank on the leaderboard.
                </p>
                <div className="mt-5 flex items-center gap-1.5 text-green-400 text-sm font-semibold">
                  <span>Enter</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ── Fan Zone mode ── */}
        {activeMode === "collect" && (
          <>
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
                  {collectionLoading ? "—" : `${collection.length} card${collection.length !== 1 ? "s" : ""}`}
                </p>
              </div>
            </div>

            {/* Tab nav */}
            <div className="flex gap-1 mb-6 bg-zinc-900/60 border border-zinc-800 rounded-xl p-1 w-fit flex-wrap">
              {(["worlds", "collection", "cards"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all whitespace-nowrap
                    ${activeTab === tab ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-white"}`}
                >
                  {tab === "worlds" ? "Worlds" : tab === "collection" ? "Collection" : "🏆 Card Ratings"}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Worlds tab ── */}
        {activeMode === "collect" && activeTab === "worlds" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {WORLDS.map((w) => (
              <WorldCard
                key={w.slug}
                slug={w.slug}
                name={w.name}
                channel={worldChannels.find((c) => c.slug === w.slug)}
                mine={channels.find((c) => c.slug === w.slug)}
                loading={channelsLoading}
              />
            ))}
          </div>
        )}

        {/* ── Collection tab ── */}
        {activeMode === "collect" && activeTab === "collection" && (
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
                      All
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
                          {worldName(ch.slug) ?? ch.name}
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
                          {uc.card?.position === "Moment" && (
                            <div className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-purple-700 border border-purple-500 text-[8px] font-bold text-purple-100 leading-none">
                              ✨ Moment
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
        {activeMode === "collect" && activeTab === "cards" && (
          <CardRatingsLeaderboard
            channels={WORLDS.map((w) => ({ id: w.slug, name: w.name, slug: w.slug }))}
          />
        )}

        {/* ── Play mode ── */}
        {activeMode === "play" && (
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

            {gameMode === "sp" && (
              <div className="w-full">
                <div className="max-w-sm mx-auto mb-5">
                  {/* 5IVE STREET is a static page (public/street), so a plain link rather than <Link>. */}
                  <a
                    href="/street"
                    className="group flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#a326d6] to-purple-900 hover:from-[#b43ae6] hover:to-purple-800 p-4 shadow-lg shadow-purple-900/40 transition-all active:scale-[0.99]"
                  >
                    <span className="text-3xl shrink-0">🏙️</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-bold leading-tight">5IVE STREET · 3v3</div>
                      <div className="text-purple-100/80 text-xs mt-0.5">Street football in 3D with the squad</div>
                    </div>
                    <span className="text-white/80 text-xl shrink-0 group-hover:translate-x-0.5 transition-transform">›</span>
                  </a>
                </div>
                <FootballGame />
              </div>
            )}

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
              <div className="max-w-lg w-full space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-white font-bold text-lg">Game Leaderboard</h3>
                      <p className="text-zinc-500 text-xs mt-0.5">Ranked by wins · all-time</p>
                    </div>
                  </div>
                  <GameLeaderboard />
                </div>
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
