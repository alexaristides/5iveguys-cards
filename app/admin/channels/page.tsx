"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";

interface Channel {
  id: string;
  slug: string;
  name: string;
  youtubeChannelId: string;
  description: string | null;
  thumbnailUrl: string | null;
  isActive: boolean;
  _count?: { cards: number; userStats: number };
}

export default function AdminChannelsPage() {
  const [secret, setSecret] = useState(() =>
    typeof window !== "undefined" ? sessionStorage.getItem("adminSecret") ?? "" : ""
  );
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ slug: "", name: "", youtubeChannelId: "", description: "", thumbnailUrl: "", rewardTags: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (s: string) => {
    if (!s) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/channels", { headers: { "x-admin-secret": s } });
    setLoading(false);
    if (res.ok) {
      setChannels((await res.json()).channels);
      sessionStorage.setItem("adminSecret", s);
    } else {
      setError("Invalid secret or server error.");
    }
  }, []);

  useEffect(() => {
    if (secret) load(secret);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError((data.error as string) ?? "Failed to create channel"); return; }
    setShowAdd(false);
    setForm({ slug: "", name: "", youtubeChannelId: "", description: "", thumbnailUrl: "", rewardTags: "" });
    await load(secret);
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/admin" className="text-zinc-500 text-sm hover:text-white transition-colors">← Admin</Link>
            <h1 className="text-white text-2xl font-bold mt-1">Channels</h1>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium transition-colors"
          >
            + Add Channel
          </button>
        </div>

        <div className="flex gap-3">
          <input
            type="password"
            placeholder="Admin secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onBlur={() => load(secret)}
            className="flex-1 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500"
          />
          <button
            onClick={() => load(secret)}
            disabled={!secret || loading}
            className="px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-sm transition-all"
          >
            {loading ? "..." : "Load"}
          </button>
        </div>

        {error && <p className="text-sm rounded-xl p-4 bg-red-900/40 text-red-300">{error}</p>}

        {channels.length > 0 && (
          <div className="space-y-3">
            {channels.map((ch) => (
              <div key={ch.id} className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
                {ch.thumbnailUrl && (
                  <img src={ch.thumbnailUrl} alt={ch.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-semibold text-sm">{ch.name}</p>
                    {!ch.isActive && <span className="text-red-400 text-[10px] border border-red-800 rounded px-1">inactive</span>}
                  </div>
                  <p className="text-zinc-500 text-xs">/{ch.slug} · {ch._count?.cards ?? 0} cards · {ch._count?.userStats ?? 0} fans</p>
                </div>
                <Link
                  href={`/admin/channels/${ch.id}`}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
                >
                  Edit
                </Link>
                <Link
                  href={`/admin/channels/${ch.id}/cards`}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
                >
                  Cards
                </Link>
              </div>
            ))}
          </div>
        )}

        {showAdd && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <form onSubmit={handleAdd} className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md space-y-4">
              <h2 className="text-white font-bold text-lg">New Channel</h2>
              {[
                { key: "slug", label: "Slug (URL key)", placeholder: "e.g. 5iveguysfc" },
                { key: "name", label: "Display Name", placeholder: "e.g. 5iveguysfc" },
                { key: "youtubeChannelId", label: "YouTube Channel ID", placeholder: "UCxxxxxxxx" },
                { key: "description", label: "Description", placeholder: "Optional" },
                { key: "thumbnailUrl", label: "Thumbnail URL", placeholder: "https://..." },
                { key: "rewardTags", label: "Reward Tags (comma-separated)", placeholder: "Trading Cards, Merch, Exclusive Content" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="text-zinc-400 text-xs mb-1 block">{label}</label>
                  <input
                    type="text"
                    placeholder={placeholder}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    required={key === "slug" || key === "name" || key === "youtubeChannelId"}
                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500"
                  />
                </div>
              ))}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-400 text-sm hover:bg-zinc-700 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                  {saving ? "Saving..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
