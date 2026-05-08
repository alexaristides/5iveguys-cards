"use client";

import { useState, useCallback } from "react";

interface AppStats {
  userCount: number;
  syncCount: number;
  totalLikes: number;
  totalEarlyLikes: number;
}

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [stats, setStats] = useState<AppStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async (s: string) => {
    if (!s) return;
    setError(null);
    const res = await fetch("/api/admin/stats", { headers: { "x-admin-secret": s } });
    if (res.ok) {
      setStats(await res.json());
    } else {
      setError("Invalid secret or server error.");
    }
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0a0a] p-8">
      <div className="max-w-lg mx-auto space-y-6">
        <h1 className="text-white text-2xl font-bold">Admin — Stats</h1>

        <div className="flex gap-3">
          <input
            type="password"
            placeholder="Admin secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onBlur={() => loadStats(secret)}
            className="flex-1 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500"
          />
          <button
            onClick={() => loadStats(secret)}
            disabled={!secret}
            className="px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-sm transition-all"
          >
            Refresh
          </button>
        </div>

        {error && (
          <p className="text-sm rounded-xl p-4 bg-red-900/40 text-red-300">{error}</p>
        )}

        {stats && (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 space-y-4">
            <h2 className="text-white font-semibold text-sm">App Stats</h2>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Total users" value={stats.userCount.toLocaleString()} />
              <Stat label="Synced accounts" value={stats.syncCount.toLocaleString()} />
              <Stat label="Total likes" value={stats.totalLikes.toLocaleString()} />
              <Stat label="Early likes" value={stats.totalEarlyLikes.toLocaleString()} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-800/60 rounded-xl p-3">
      <p className="text-zinc-500 text-xs">{label}</p>
      <p className="text-white font-semibold text-lg mt-0.5">{value}</p>
    </div>
  );
}
