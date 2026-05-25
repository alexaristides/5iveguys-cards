"use client";

import { useSession } from "next-auth/react";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import CardDisplay from "@/components/CardDisplay";
import { dbCardToCard, Rarity } from "@/lib/cards";
import type { MatchResults } from "@/lib/battles";

type FilterRarity = "all" | Rarity;
type Tab = "collection" | "history";
const RARITY_ORDER: Rarity[] = ["legendary", "epic", "rare", "common"];

function formatWatchTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

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

interface PlayerProfile {
  id: string;
  name: string | null;
  image: string | null;
  totalEarned: number;
  cardCount: number;
  ownedCardIds: string[];
  watchTimeSeconds: number;
  isSubscribed: boolean;
  likedCount: number;
  earlyLikedCount: number;
}

interface BattleRecord { wins: number; losses: number; ties: number }

interface BattleEntry {
  id: string;
  outcome: "win" | "loss" | "tie";
  opponent: { id: string; name: string | null; image: string | null } | null;
  wager: number;
  pointsChange: number;
  resolvedAt: string | null;
  matchResults: MatchResults | null;
  wasChallenger: boolean;
}

function StatCard({ label, value, accent, sub }: { label: string; value: string; accent?: boolean; sub?: string }) {
  return (
    <div className={`rounded-2xl p-4 border ${accent ? "bg-purple-900/20 border-purple-700/40" : "bg-zinc-900/80 border-zinc-800"}`}>
      <p className="text-zinc-500 text-xs mb-1">{label}</p>
      <p className={`text-xl font-bold ${accent ? "text-purple-300" : "text-white"}`}>{value}</p>
      {sub && <p className="text-zinc-600 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

function RecordStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-zinc-500 text-xs mt-0.5">{label}</p>
    </div>
  );
}

export default function PlayerPage() {
  const { data: session, status } = useSession();
  const params = useParams<{ channelSlug: string; userId: string }>();
  const { channelSlug, userId } = params;
  const searchParams = useSearchParams();

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [allCards, setAllCards] = useState<DbCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterRarity>("all");
  const [showOwned, setShowOwned] = useState(false);
  const [tab, setTab] = useState<Tab>(searchParams.get("tab") === "history" ? "history" : "collection");
  const [battles, setBattles] = useState<BattleEntry[]>([]);
  const [record, setRecord] = useState<BattleRecord>({ wins: 0, losses: 0, ties: 0 });
  const [battlesLoading, setBattlesLoading] = useState(false);
  const [expandedBattle, setExpandedBattle] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const [profileRes, cardsRes] = await Promise.all([
      fetch(`/api/players/${userId}?channelSlug=${channelSlug}`),
      fetch(`/api/channels/${channelSlug}/cards`),
    ]);
    if (profileRes.ok) setProfile(await profileRes.json());
    if (cardsRes.ok) setAllCards((await cardsRes.json()).cards ?? []);
    setLoading(false);
  }, [userId, channelSlug]);

  useEffect(() => {
    if (status === "authenticated") fetchData();
  }, [status, fetchData]);

  const fetchBattles = useCallback(async () => {
    setBattlesLoading(true);
    const res = await fetch(`/api/players/${userId}/battles`);
    if (res.ok) {
      const data = await res.json();
      setBattles(data.history);
      setRecord(data.record);
    }
    setBattlesLoading(false);
  }, [userId]);

  useEffect(() => {
    if (tab === "history" && battles.length === 0 && !battlesLoading) fetchBattles();
  }, [tab, battles.length, battlesLoading, fetchBattles]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-zinc-500">Player not found</div>;
  }

  const ownedSet = new Set(profile.ownedCardIds);
  let displayCards = [...allCards].sort(
    (a, b) => RARITY_ORDER.indexOf(a.rarity as Rarity) - RARITY_ORDER.indexOf(b.rarity as Rarity)
  );
  if (filter !== "all") displayCards = displayCards.filter((c) => c.rarity === filter);
  if (showOwned) displayCards = displayCards.filter((c) => ownedSet.has(c.id));

  const uniqueOwned = ownedSet.size;
  const progress = allCards.length > 0 ? Math.round((uniqueOwned / allCards.length) * 100) : 0;
  const isCurrentUser = profile.id === session?.user?.id;
  const totalBattles = record.wins + record.losses + record.ties;
  const winRate = totalBattles > 0 ? Math.round((record.wins / totalBattles) * 100) : null;
  const cardMap = new Map(allCards.map((c) => [c.id, c]));

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 rounded-full bg-purple-900/15 blur-3xl" />
      </div>

      <main className="relative max-w-6xl mx-auto px-6 pt-24 pb-20">
        <Link
          href={`/${channelSlug}/fans`}
          className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-white text-sm mb-6 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Leaderboard
        </Link>

        {/* ── Header card ── */}
        <div className="flex items-center gap-4 mb-6 p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800">
          <div className="relative w-16 h-16 shrink-0">
            {profile.image ? (
              <Image src={profile.image} alt={profile.name ?? "Player"} fill className="rounded-full object-cover" />
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
              {profile.totalEarned.toLocaleString()} pts earned
            </p>
            {totalBattles > 0 && (
              <p className="text-zinc-600 text-xs mt-0.5">
                {record.wins}W {record.losses}L {record.ties}T &middot; {winRate}% win rate
              </p>
            )}
          </div>

          {/* Engagement badges */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {profile.isSubscribed && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-900/40 border border-green-700/40 text-green-400 text-xs font-medium">
                ✓ Subscribed
              </span>
            )}
            <div className="flex items-center gap-2">
              {profile.likedCount > 0 && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs">
                  👍 {profile.likedCount}
                </span>
              )}
              {profile.earlyLikedCount > 0 && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-900/30 border border-yellow-700/30 text-yellow-500 text-xs">
                  ⚡ {profile.earlyLikedCount}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Stats grid (mirrors dashboard) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Points Earned" value={profile.totalEarned.toLocaleString()} accent />
          <StatCard label="Cards" value={profile.cardCount.toLocaleString()} sub={`${uniqueOwned} unique`} />
          <StatCard
            label="Watch Time"
            value={profile.watchTimeSeconds > 0 ? formatWatchTime(profile.watchTimeSeconds) : "—"}
          />
          <StatCard
            label="Collection"
            value={`${progress}%`}
            sub={`${uniqueOwned} / ${allCards.length}`}
          />
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl bg-zinc-900/60 border border-zinc-800 w-fit">
          <button
            onClick={() => setTab("collection")}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === "collection" ? "bg-purple-900/60 text-white border border-purple-700/50" : "text-zinc-400 hover:text-white"}`}
          >
            Collection
          </button>
          <button
            onClick={() => setTab("history")}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === "history" ? "bg-purple-900/60 text-white border border-purple-700/50" : "text-zinc-400 hover:text-white"}`}
          >
            Match History
          </button>
        </div>

        {/* ── Collection tab ── */}
        {tab === "collection" && (
          <>
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden mb-6">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="flex gap-2 flex-wrap">
                {(["all", "legendary", "epic", "rare", "common"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setFilter(r)}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium capitalize transition-all border ${filter === r ? "bg-purple-900/60 border-purple-600 text-white" : "bg-zinc-900/60 border-zinc-700 text-zinc-400 hover:text-white"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowOwned(!showOwned)}
                className={`ml-auto flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium border transition-all ${showOwned ? "bg-green-900/40 border-green-700/60 text-green-400" : "bg-zinc-900/60 border-zinc-700 text-zinc-400 hover:text-white"}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${showOwned ? "bg-green-400" : "bg-zinc-600"}`} />
                Owned only
              </button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
              {displayCards.map((dbCard) => {
                const card = dbCardToCard(dbCard);
                const owned = ownedSet.has(dbCard.id);
                const count = profile.ownedCardIds.filter((id) => id === dbCard.id).length;
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
          </>
        )}

        {/* ── Match History tab ── */}
        {tab === "history" && (
          <>
            {battlesLoading ? (
              <div className="flex justify-center py-20">
                <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : battles.length === 0 ? (
              <div className="text-center py-20 text-zinc-600">
                <p className="text-lg">No battles yet</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <RecordStat label="Wins" value={record.wins} color="text-green-400" />
                  <RecordStat label="Losses" value={record.losses} color="text-red-400" />
                  <RecordStat label="Ties" value={record.ties} color="text-zinc-400" />
                </div>
                <div className="space-y-2">
                  {battles.map((battle) => (
                    <div key={battle.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
                      <button
                        onClick={() => setExpandedBattle(expandedBattle === battle.id ? null : battle.id)}
                        className="w-full flex items-center gap-3 p-4 hover:bg-zinc-800/40 transition-colors text-left"
                      >
                        <span className={`w-10 shrink-0 text-center text-xs font-bold py-1 rounded-md ${battle.outcome === "win" ? "bg-green-900/50 text-green-400" : battle.outcome === "loss" ? "bg-red-900/50 text-red-400" : "bg-zinc-800 text-zinc-400"}`}>
                          {battle.outcome === "win" ? "WIN" : battle.outcome === "loss" ? "LOSS" : "TIE"}
                        </span>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="relative w-7 h-7 shrink-0">
                            {battle.opponent?.image ? (
                              <Image src={battle.opponent.image} alt={battle.opponent.name ?? "Opponent"} fill className="rounded-full object-cover" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center">
                                <span className="text-white text-xs font-bold">{battle.opponent?.name?.[0] ?? "?"}</span>
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-white text-sm font-medium truncate">vs {battle.opponent?.name ?? "Unknown"}</p>
                            <p className="text-zinc-600 text-xs">
                              {battle.resolvedAt
                                ? new Date(battle.resolvedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                                : "—"}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-bold ${battle.pointsChange > 0 ? "text-green-400" : battle.pointsChange < 0 ? "text-red-400" : "text-zinc-400"}`}>
                            {battle.pointsChange > 0 ? "+" : ""}{battle.pointsChange} pts
                          </p>
                          <p className="text-zinc-600 text-xs">{battle.wager} wager</p>
                        </div>
                        <svg className={`w-4 h-4 text-zinc-600 shrink-0 transition-transform ${expandedBattle === battle.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {expandedBattle === battle.id && battle.matchResults && (
                        <div className="border-t border-zinc-800 px-4 py-3 space-y-2">
                          {battle.matchResults.rounds.map((round) => {
                            const myCardId = battle.wasChallenger ? round.challengerCardId : round.acceptorCardId;
                            const oppCardId = battle.wasChallenger ? round.acceptorCardId : round.challengerCardId;
                            const myRoll = battle.wasChallenger ? round.challengerFinalRoll : round.acceptorFinalRoll;
                            const oppRoll = battle.wasChallenger ? round.acceptorFinalRoll : round.challengerFinalRoll;
                            const myAttr = battle.wasChallenger ? round.challengerAttribute : round.acceptorAttribute;
                            const myAdv = battle.wasChallenger ? round.challengerHasAdvantage : round.acceptorHasAdvantage;
                            const roundWon = round.roundWinner === "tie" ? "tie" : (round.roundWinner === "challenger") === battle.wasChallenger ? "win" : "loss";
                            const myCard = cardMap.get(myCardId);
                            const oppCard = cardMap.get(oppCardId);
                            return (
                              <div key={round.round} className="flex items-center gap-3 text-xs">
                                <span className="text-zinc-600 w-12 shrink-0">Round {round.round}</span>
                                <div className="flex-1 flex items-center gap-2">
                                  <span className="text-zinc-300 truncate">{myCard?.name ?? myCardId}</span>
                                  {myAdv && <span className="text-yellow-500 text-[10px]">⚡adv</span>}
                                  <span className="text-zinc-600">({myAttr} {myRoll})</span>
                                </div>
                                <span className={`w-8 text-center font-bold ${roundWon === "win" ? "text-green-400" : roundWon === "loss" ? "text-red-400" : "text-zinc-400"}`}>
                                  {roundWon === "win" ? "W" : roundWon === "loss" ? "L" : "T"}
                                </span>
                                <div className="flex-1 flex items-center gap-2 justify-end">
                                  <span className="text-zinc-600">({oppRoll})</span>
                                  <span className="text-zinc-300 truncate">{oppCard?.name ?? oppCardId}</span>
                                </div>
                              </div>
                            );
                          })}
                          <div className="pt-1 border-t border-zinc-800/60 text-xs text-zinc-600 flex justify-between">
                            <span>
                              Rounds: {battle.wasChallenger ? battle.matchResults.challengerWins : battle.matchResults.acceptorWins}
                              {" – "}
                              {battle.wasChallenger ? battle.matchResults.acceptorWins : battle.matchResults.challengerWins}
                            </span>
                            <span>{battle.wasChallenger ? "You challenged" : "You accepted"}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
