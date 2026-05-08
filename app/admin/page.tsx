"use client";

import { useState, useCallback } from "react";

interface CacheStats {
  lastScanned: string | null;
  videoCount: number;
  totalAuthors: number;
  totalComments: number;
  avgCommentsPerUser: number;
}

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [stats, setStats] = useState<CacheStats | null>(null);

  const loadStats = useCallback(async (s: string) => {
    if (!s) return;
    const res = await fetch("/api/admin/stats", { headers: { "x-admin-secret": s } });
    if (res.ok) setStats(await res.json());
  }, []);

  async function runScan(fullReset = false) {
    setLoading(true);
    setProgress(null);
    setStatus(fullReset ? "Full reset — clearing old data and scanning everything…" : "Starting incremental scan (only new comments since last scan)…");

    try {
      let page = 0;
      let hasMore = true;
      let lastTotal = 0;
      let uploadsPlaylistId: string | undefined;

      while (hasMore) {
        const res = await fetch("/api/admin/scan", {
          method: "POST",
          headers: { "x-admin-secret": secret, "Content-Type": "application/json" },
          body: JSON.stringify({ page, uploadsPlaylistId, fullReset: fullReset && page === 0 }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setStatus(`Error: ${data.error ?? res.status}`);
          setLoading(false);
          return;
        }

        const data = await res.json();

        if (data.totalVideos === 0) {
          setStatus("Error: 0 videos found — check YOUTUBE_API_KEY in Vercel and that YouTube Data API v3 is enabled.");
          setLoading(false);
          return;
        }

        lastTotal = data.totalVideos;
        uploadsPlaylistId = data.uploadsPlaylistId;
        setProgress({ done: data.videosProcessed, total: data.totalVideos });
        setStatus(`Scanning… ${data.videosProcessed} / ${data.totalVideos} videos`);

        hasMore = data.hasMore;
        page = data.nextPage ?? page + 1;
      }

      setStatus(`Done! Scanned all ${lastTotal} videos.`);
      await loadStats(secret);
    } catch {
      setStatus("Network error — check console.");
    } finally {
      setLoading(false);
    }
  }

  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <main className="min-h-screen bg-[#0a0a0a] p-8">
      <div className="max-w-lg mx-auto space-y-6">
        <h1 className="text-white text-2xl font-bold">Admin — Channel Scan</h1>
        <p className="text-zinc-400 text-sm">
          Scans every video on the 5iveguysfc channel and stores comment counts per author.
          Incremental scans only fetch <em>new</em> comments since the last scan — much faster.
        </p>

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

        {/* Cache stats */}
        {stats && (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 space-y-4">
            <h2 className="text-white font-semibold text-sm">Current Cache</h2>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Videos scanned" value={stats.videoCount.toLocaleString()} />
              <Stat label="Unique commenters" value={stats.totalAuthors.toLocaleString()} />
              <Stat label="Total comments" value={stats.totalComments.toLocaleString()} />
              <Stat label="Avg per user" value={stats.avgCommentsPerUser.toFixed(1)} />
            </div>
            {stats.lastScanned && (
              <p className="text-zinc-600 text-xs">
                Last scan: {new Date(stats.lastScanned).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Scan buttons */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => runScan(false)}
            disabled={loading || !secret}
            className="w-full py-3 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:bg-zinc-800
              text-white font-semibold text-sm transition-all"
          >
            {loading ? "Scanning…" : "Run Incremental Scan"}
          </button>
          <button
            onClick={() => runScan(true)}
            disabled={loading || !secret}
            className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40
              text-zinc-400 text-sm transition-all border border-zinc-700"
          >
            Full Reset + Rescan Everything
          </button>
        </div>

        {/* Progress bar */}
        {loading && progress && (
          <div className="space-y-2">
            <div className="w-full bg-zinc-800 rounded-full h-2">
              <div
                className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-zinc-400 text-xs text-center">
              {progress.done} / {progress.total} videos ({pct}%)
            </p>
          </div>
        )}

        {status && (
          <p className={`text-sm rounded-xl p-4 ${
            status.startsWith("Error")
              ? "bg-red-900/40 text-red-300"
              : status.startsWith("Done")
              ? "bg-green-900/40 text-green-300"
              : "bg-zinc-900 text-zinc-300"
          }`}>
            {status}
          </p>
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
