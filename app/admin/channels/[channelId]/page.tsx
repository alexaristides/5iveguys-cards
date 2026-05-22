"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Channel {
  id: string;
  slug: string;
  name: string;
  youtubeChannelId: string;
  description: string | null;
  thumbnailUrl: string | null;
  rewardTags: string | null;
  isActive: boolean;
}

export default function AdminEditChannelPage() {
  const params = useParams<{ channelId: string }>();
  const router = useRouter();
  const [secret, setSecret] = useState(() =>
    typeof window !== "undefined" ? sessionStorage.getItem("adminSecret") ?? "" : ""
  );
  const [channel, setChannel] = useState<Channel | null>(null);
  const [form, setForm] = useState({ slug: "", name: "", youtubeChannelId: "", description: "", thumbnailUrl: "", rewardTags: "", isActive: true });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async (s: string) => {
    if (!s) return;
    const res = await fetch(`/api/admin/channels`, { headers: { "x-admin-secret": s } });
    if (!res.ok) { setError("Invalid secret"); return; }
    const data = await res.json();
    const ch = data.channels.find((c: Channel) => c.id === params.channelId);
    if (!ch) { setError("Channel not found"); return; }
    setChannel(ch);
    setForm({
      slug: ch.slug,
      name: ch.name,
      youtubeChannelId: ch.youtubeChannelId,
      description: ch.description ?? "",
      thumbnailUrl: ch.thumbnailUrl ?? "",
      rewardTags: ch.rewardTags ?? "",
      isActive: ch.isActive,
    });
    sessionStorage.setItem("adminSecret", s);
  }, [params.channelId]);

  useEffect(() => {
    if (secret) load(secret);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    const res = await fetch(`/api/admin/channels/${params.channelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError((data.error as string) ?? "Failed to save"); return; }
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  }

  async function handleDeactivate() {
    if (!confirm(`Deactivate channel "${channel?.name}"? It will be hidden from the home page.`)) return;
    const res = await fetch(`/api/admin/channels/${params.channelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify({ isActive: false }),
    });
    if (res.ok) router.push("/admin/channels");
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] p-8">
      <div className="max-w-lg mx-auto space-y-6">
        <div>
          <Link href="/admin/channels" className="text-zinc-500 text-sm hover:text-white transition-colors">← Channels</Link>
          <h1 className="text-white text-2xl font-bold mt-1">Edit Channel</h1>
        </div>

        {!channel && (
          <div className="flex gap-3">
            <input
              type="password"
              placeholder="Admin secret"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onBlur={() => load(secret)}
              className="flex-1 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500"
            />
            <button onClick={() => load(secret)} className="px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-sm transition-all">Load</button>
          </div>
        )}

        {error && <p className="text-sm rounded-xl p-4 bg-red-900/40 text-red-300">{error}</p>}
        {success && <p className="text-sm rounded-xl p-4 bg-green-900/40 text-green-300">Saved successfully.</p>}

        {channel && (
          <>
            <div className="flex gap-2">
              <Link
                href={`/admin/channels/${channel.id}/cards`}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors"
              >
                Manage Cards →
              </Link>
              <Link
                href={`/${channel.slug}`}
                target="_blank"
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors"
              >
                View Channel ↗
              </Link>
            </div>

            <form onSubmit={handleSave} className="space-y-4 rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
              {[
                { key: "slug", label: "Slug", placeholder: "url-key" },
                { key: "name", label: "Display Name", placeholder: "Channel name" },
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
                    value={form[key as keyof typeof form] as string}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500"
                  />
                </div>
              ))}
              <div className="flex items-center gap-3 pt-1">
                <label className="text-zinc-400 text-sm">Active</label>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
                  className={`relative w-10 h-5 rounded-full transition-colors ${form.isActive ? "bg-purple-600" : "bg-zinc-700"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${form.isActive ? "left-5" : "left-0.5"}`} />
                </button>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleDeactivate}
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-red-900/40 text-red-400 text-sm transition-colors"
                >
                  Deactivate
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
