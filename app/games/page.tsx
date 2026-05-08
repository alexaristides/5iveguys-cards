"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Navbar from "@/components/Navbar";
import BattleBoard from "@/components/battles/BattleBoard";
import CreateBattleModal from "@/components/battles/CreateBattleModal";
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
  const [result, setResult] = useState<(ResolvedBattle & { battleId: string }) | null>(null);
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

  async function handleCreate(cardId: string, wager: number) {
    const res = await fetch("/api/battles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId, wager }),
    });
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) throw new Error((data.error as string) ?? "Failed to create challenge");
    setPoints(data.remainingPoints as number);
    await fetchBattles(1);
    setPage(1);
  }

  async function handleAccept(battleId: string, cardId: string) {
    setError(null);
    const res = await fetch(`/api/battles/${battleId}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId }),
    });
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) {
      setError((data.error as string) ?? "Failed to accept challenge");
      return;
    }
    setPoints(data.remainingPoints as number);
    setResult({ ...(data as ResolvedBattle), battleId });
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
            Challenge other collectors. Higher rarity wins. Winner takes the pot.
          </p>
          <div className="flex items-center gap-1.5 mt-3">
            <span className="text-zinc-500 text-xs">Roll ranges:</span>
            <span className="text-zinc-600 text-xs">Common 1–10</span>
            <span className="text-zinc-700 text-xs">·</span>
            <span className="text-blue-500 text-xs">Rare 11–25</span>
            <span className="text-zinc-700 text-xs">·</span>
            <span className="text-purple-400 text-xs">Epic 26–50</span>
            <span className="text-zinc-700 text-xs">·</span>
            <span className="text-amber-400 text-xs">Legend 51–100</span>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-1.5 bg-purple-900/30 border border-purple-700/30 rounded-full px-3 py-1.5">
            <span className="text-amber-400 text-sm">★</span>
            <span className="text-white font-bold text-sm">{points.toLocaleString()}</span>
            <span className="text-zinc-500 text-xs">pts</span>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium transition-colors shadow-lg shadow-purple-900/30"
          >
            <span>⚔</span>
            Challenge
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 bg-red-900/30 border border-red-700/40 text-red-300 text-sm rounded-xl px-4 py-3 flex items-center justify-between">
            {error}
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 ml-3">✕</button>
          </div>
        )}

        {/* Battle result overlay */}
        {result && (
          <div className="mb-5 bg-zinc-900 border border-zinc-700 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{result.tie ? "🤝" : result.winnerId === userId ? "🏆" : "💀"}</span>
              <h3 className="text-white font-bold">
                {result.tie
                  ? "It's a tie! Wagers refunded."
                  : result.winnerId === userId
                  ? `You won ${result.pot.toLocaleString()} pts!`
                  : `You lost. Better luck next time.`}
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center mb-4">
              <div className="bg-zinc-800/60 rounded-xl p-3">
                <p className="text-zinc-500 text-xs mb-1">Challenger&apos;s roll</p>
                <p className="text-white text-2xl font-bold">{result.challengerRoll}</p>
              </div>
              <div className="bg-zinc-800/60 rounded-xl p-3">
                <p className="text-zinc-500 text-xs mb-1">Your roll</p>
                <p className="text-white text-2xl font-bold">{result.acceptorRoll}</p>
              </div>
            </div>
            <button
              onClick={() => setResult(null)}
              className="w-full py-2 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white text-sm transition-colors"
            >
              Dismiss
            </button>
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
        <CreateBattleModal
          ownedCardIds={ownedCardIds}
          userPoints={points}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
