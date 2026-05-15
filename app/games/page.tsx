"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import BattleBoard from "@/components/battles/BattleBoard";
import SquadBuilderModal from "@/components/battles/SquadBuilderModal";
import BattleReport from "@/components/battles/BattleReport";
import { type BattleEntry, type ResolvedBattle } from "@/lib/battles";

const LIMIT = 10;

export default function GamesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [points, setPoints] = useState(0);
  const [ownedCardIds, setOwnedCardIds] = useState<string[]>([]);
  const [battles, setBattles] = useState<BattleEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [result, setResult] = useState<(ResolvedBattle & { battleId: string; challengerId: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  const fetchUser = useCallback(async () => {
    const res = await fetch("/api/user");
    if (res.ok) {
      const data = await res.json();
      setPoints(data.points);
      setOwnedCardIds(data.cards.map((c: { cardId: string }) => c.cardId));
    }
  }, []);

  const fetchBattles = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/battles?page=${p}&limit=${LIMIT}`);
      if (res.ok) {
        const data = await res.json();
        setBattles(data.battles);
        setTotal(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchUser();
      fetchBattles(1);
    }
  }, [status, fetchUser, fetchBattles]);

  async function handleCreate(cardIds: string[], wager: number) {
    const res = await fetch("/api/battles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardIds, wager }),
    });
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) throw new Error((data.error as string) ?? "Failed to create challenge");
    setPoints(data.remainingPoints as number);
    await fetchBattles(1);
    setPage(1);
  }

  async function handleAccept(battleId: string, cardIds: string[]) {
    setError(null);
    const battle = battles.find((b) => b.id === battleId);
    const res = await fetch(`/api/battles/${battleId}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardIds }),
    });
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) {
      setError((data.error as string) ?? "Failed to accept challenge");
      return;
    }
    setPoints(data.remainingPoints as number);
    setResult({
      ...(data as ResolvedBattle),
      battleId,
      challengerId: battle?.challengerId ?? "",
    });
    await fetchBattles(page);
    await fetchUser();
  }

  async function handleCancel(battleId: string) {
    setError(null);
    const res = await fetch(`/api/battles/${battleId}/cancel`, { method: "POST" });
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) {
      setError((data.error as string) ?? "Failed to cancel challenge");
      return;
    }
    setPoints(data.remainingPoints as number);
    await fetchBattles(page);
  }

  async function goToPage(p: number) {
    setPage(p);
    await fetchBattles(p);
  }

  const totalPages = Math.ceil(total / LIMIT);
  const userId = session?.user?.id ?? "";

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar user={session!.user} points={points} />

      {/* Ambient glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-64 bg-purple-900/10 blur-3xl pointer-events-none" />

      <main className="max-w-2xl mx-auto px-4 pt-24 pb-24">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">Card Wars ⚔</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Build a 3-card squad under the 100pt salary cap. Type advantages give a +50% roll boost.
            Win 2-of-3 rounds to take the pot.
          </p>
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            <span className="text-zinc-500 text-xs">Cap costs:</span>
            <span className="text-zinc-600 text-xs">Common 10</span>
            <span className="text-zinc-700 text-xs">·</span>
            <span className="text-blue-500 text-xs">Rare 25</span>
            <span className="text-zinc-700 text-xs">·</span>
            <span className="text-purple-400 text-xs">Epic 40</span>
            <span className="text-zinc-700 text-xs">·</span>
            <span className="text-amber-400 text-xs">Legend 60</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className="text-zinc-500 text-xs">Types:</span>
            <span className="text-blue-400 text-xs">Pace</span>
            <span className="text-zinc-600 text-xs">beats</span>
            <span className="text-red-400 text-xs">Power</span>
            <span className="text-zinc-600 text-xs">beats</span>
            <span className="text-green-400 text-xs">Skill</span>
            <span className="text-zinc-600 text-xs">beats</span>
            <span className="text-blue-400 text-xs">Pace</span>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-1.5 bg-purple-900/30 border border-purple-700/30 rounded-full px-3 py-1.5">
            <span className="text-amber-400 text-sm">★</span>
            <span className="text-white font-bold text-sm">{points.toLocaleString()}</span>
            <span className="text-zinc-500 text-xs">pts</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/players/${userId}?tab=history`}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors border border-zinc-700"
            >
              <span>📋</span>
              My History
            </Link>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium transition-colors shadow-lg shadow-purple-900/30"
            >
              <span>⚔</span>
              Challenge
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 bg-red-900/30 border border-red-700/40 text-red-300 text-sm rounded-xl px-4 py-3 flex items-center justify-between">
            {error}
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 ml-3">✕</button>
          </div>
        )}

        {/* Pending battles */}
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-zinc-400 text-sm font-medium">Open Challenges</h2>
          {total > 0 && (
            <span className="text-zinc-600 text-xs">{total} pending</span>
          )}
        </div>

        <BattleBoard
          battles={battles}
          currentUserId={userId}
          ownedCardIds={ownedCardIds}
          userPoints={points}
          onAccept={handleAccept}
          onCancel={handleCancel}
          loading={loading}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 text-sm transition-colors"
            >
              ← Prev
            </button>
            <span className="text-zinc-600 text-sm">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 text-sm transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </main>

      {showCreate && (
        <SquadBuilderModal
          mode="create"
          ownedCardIds={ownedCardIds}
          userPoints={points}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}

      {result && (
        <BattleReport
          matchResults={result.matchResults}
          winnerId={result.winnerId}
          currentUserId={userId}
          challengerId={result.challengerId}
          pot={result.pot}
          tie={result.tie}
          onDismiss={() => setResult(null)}
        />
      )}
    </div>
  );
}
