"use client";

import { useState } from "react";

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function runScan() {
    setLoading(true);
    setProgress(null);
    setStatus("Starting scan…");

    // Clear existing cache before a fresh full scan
    try {
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const res = await fetch("/api/admin/scan", {
          method: "POST",
          headers: {
            "x-admin-secret": secret,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ page }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setStatus(`Error: ${data.error ?? res.status}`);
          setLoading(false);
          return;
        }

        const data = await res.json();
        setProgress({ done: data.videosProcessed, total: data.totalVideos });
        setStatus(`Scanning… ${data.videosProcessed} / ${data.totalVideos} videos`);

        hasMore = data.hasMore;
        page = data.nextPage ?? page + 1;
      }

      setStatus(`Done! Scanned all ${progress?.total ?? "?"} videos. Comment counts updated.`);
    } catch {
      setStatus("Network error — check console.");
    } finally {
      setLoading(false);
    }
  }

  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-white text-2xl font-bold">Admin — Channel Scan</h1>
        <p className="text-zinc-400 text-sm">
          Scans every video and all comments on the 5iveguysfc channel, stores
          comment counts per author. Run once a day — users pick up accurate
          comment counts on their next sync.
        </p>

        <input
          type="password"
          placeholder="Admin secret"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500"
        />

        <button
          onClick={runScan}
          disabled={loading || !secret}
          className="w-full py-3 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:bg-zinc-800
            text-white font-semibold text-sm transition-all"
        >
          {loading ? "Scanning…" : "Run Channel Scan"}
        </button>

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
