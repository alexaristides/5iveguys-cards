"use client";

import { useState } from "react";

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runScan() {
    setLoading(true);
    setStatus("Scanning all channel videos and comments… this may take up to 60 seconds.");
    try {
      const res = await fetch("/api/admin/scan", {
        method: "POST",
        headers: { "x-admin-secret": secret },
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(
          `Done! Scanned ${data.videosScanned} videos, found ${data.totalComments} total comments from ${data.uniqueAuthors} unique authors.`
        );
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch {
      setStatus("Network error — check console.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-white text-2xl font-bold">Admin — Channel Scan</h1>
        <p className="text-zinc-400 text-sm">
          Scans every video and all comments on the 5iveguysfc channel, then stores
          comment counts per author. Run this once a day — users will pick up their
          accurate comment count on their next sync.
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
        {status && (
          <p className={`text-sm rounded-xl p-4 ${status.startsWith("Error") ? "bg-red-900/40 text-red-300" : "bg-zinc-900 text-zinc-300"}`}>
            {status}
          </p>
        )}
      </div>
    </main>
  );
}
