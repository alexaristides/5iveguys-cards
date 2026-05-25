"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

interface AppStats {
  userCount: number;
  syncCount: number;
  totalLikes: number;
  totalEarlyLikes: number;
}

interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  points: number;
  totalEarned: number;
}

interface AdminChannel {
  id: string;
  slug: string;
  name: string;
  thumbnailUrl: string | null;
}

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [stats, setStats] = useState<AppStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [channelSlug, setChannelSlug] = useState("");
  const [pointsInput, setPointsInput] = useState("");
  const [reason, setReason] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantMsg, setGrantMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Initial load: stats + channels list (users come separately per channel)
  const loadData = useCallback(async (s: string) => {
    if (!s) return;
    setError(null);
    const [statsRes, channelsRes] = await Promise.all([
      fetch("/api/admin/stats", { headers: { "x-admin-secret": s } }),
      fetch("/api/admin/channels", { headers: { "x-admin-secret": s } }),
    ]);
    if (statsRes.ok && channelsRes.ok) {
      setStats(await statsRes.json());
      const chData = await channelsRes.json();
      const chList: AdminChannel[] = chData.channels ?? [];
      setChannels(chList);
      if (chList.length > 0) setChannelSlug(chList[0].slug);
    } else {
      setError("Invalid secret or server error.");
    }
  }, []);

  // Re-fetch users whenever the selected channel changes
  const loadChannelUsers = useCallback(async (s: string, slug: string) => {
    if (!s || !slug) return;
    setUsers([]);
    setSelected(new Set());
    setSearch("");
    const res = await fetch(`/api/admin/users?channelSlug=${slug}`, {
      headers: { "x-admin-secret": s },
    });
    if (res.ok) setUsers(await res.json());
  }, []);

  useEffect(() => {
    if (secret && channelSlug) loadChannelUsers(secret, channelSlug);
  }, [channelSlug, secret, loadChannelUsers]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
    );
  }, [users, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((u) => selected.has(u.id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      const next = new Set(selected);
      filtered.forEach((u) => next.delete(u.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      filtered.forEach((u) => next.add(u.id));
      setSelected(next);
    }
  }

  function toggleUser(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function grantPoints() {
    const pts = parseInt(pointsInput, 10);
    if (!pts || isNaN(pts)) return;
    if (selected.size === 0) return;
    if (!channelSlug) return;

    setGranting(true);
    setGrantMsg(null);
    try {
      const res = await fetch("/api/admin/grant-points", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({
          userIds: Array.from(selected),
          points: pts,
          reason,
          channelSlug,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const ch = channels.find((c) => c.slug === channelSlug);
        setGrantMsg({
          ok: true,
          text: `Granted ${pts > 0 ? "+" : ""}${pts} pts to ${data.granted} user${data.granted !== 1 ? "s" : ""} in ${ch?.name ?? channelSlug}.`,
        });
        setPointsInput("");
        setReason("");
        setSelected(new Set());
        await loadChannelUsers(secret, channelSlug);
      } else {
        setGrantMsg({ ok: false, text: data.error ?? "Failed to grant points." });
      }
    } catch {
      setGrantMsg({ ok: false, text: "Network error." });
    } finally {
      setGranting(false);
    }
  }

  const pts = parseInt(pointsInput, 10);
  const canGrant = !isNaN(pts) && pts !== 0 && selected.size > 0 && !!channelSlug && !granting;

  return (
    <main className="min-h-screen bg-[#0a0a0a] p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-white text-2xl font-bold">Admin — Stats</h1>
          <Link href="/admin/channels" className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors">
            Channels →
          </Link>
        </div>

        <div className="flex gap-3">
          <input
            type="password"
            placeholder="Admin secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onBlur={() => loadData(secret)}
            className="flex-1 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500"
          />
          <button
            onClick={() => loadData(secret)}
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

        {users.length > 0 && (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 space-y-4">
            <h2 className="text-white font-semibold text-sm">Grant Points</h2>

            {/* Channel selector */}
            <div>
              <label className="text-zinc-500 text-xs mb-1.5 block">Target channel</label>
              <div className="flex flex-wrap gap-2">
                {channels.map((ch) => (
                  <button
                    key={ch.slug}
                    onClick={() => setChannelSlug(ch.slug)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm transition-all ${
                      channelSlug === ch.slug
                        ? "bg-purple-900/50 border-purple-600 text-white"
                        : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"
                    }`}
                  >
                    {ch.thumbnailUrl && (
                      <Image src={ch.thumbnailUrl} alt="" width={18} height={18} className="rounded-full" />
                    )}
                    {ch.name}
                  </button>
                ))}
              </div>
            </div>

            {/* User count for selected channel */}
            <p className="text-zinc-500 text-xs -mt-1">
              {users.length} member{users.length !== 1 ? "s" : ""} in this channel
            </p>

            {/* Search + select-all */}
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500 placeholder:text-zinc-500"
              />
              <button
                onClick={toggleSelectAll}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm whitespace-nowrap transition-colors"
              >
                {allFilteredSelected ? "Deselect all" : "Select all"}
              </button>
            </div>

            {/* User list */}
            <div className="overflow-y-auto max-h-72 space-y-1 pr-1">
              {filtered.length === 0 && (
                <p className="text-zinc-500 text-sm text-center py-4">No users match.</p>
              )}
              {filtered.map((u) => (
                <label
                  key={u.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-zinc-800 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(u.id)}
                    onChange={() => toggleUser(u.id)}
                    className="w-4 h-4 accent-purple-500 shrink-0"
                  />
                  {u.image ? (
                    <Image src={u.image} alt="" width={28} height={28} className="rounded-full shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-zinc-700 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{u.name ?? "(no name)"}</p>
                    <p className="text-zinc-500 text-xs truncate">{u.email ?? ""}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-purple-400 text-sm font-medium">{u.points.toLocaleString()} pts</p>
                    <p className="text-zinc-600 text-xs">{u.totalEarned.toLocaleString()} earned</p>
                  </div>
                </label>
              ))}
            </div>

            <p className="text-zinc-500 text-xs">
              {selected.size} user{selected.size !== 1 ? "s" : ""} selected
              {search && ` (showing ${filtered.length} of ${users.length})`}
            </p>

            {/* Points + reason inputs */}
            <div className="flex gap-3">
              <input
                type="number"
                placeholder="Points (negative to deduct)"
                value={pointsInput}
                onChange={(e) => setPointsInput(e.target.value)}
                className="w-52 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500 placeholder:text-zinc-500"
              />
              <input
                type="text"
                placeholder="Reason / event label (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500 placeholder:text-zinc-500"
              />
            </div>

            <button
              onClick={grantPoints}
              disabled={!canGrant}
              className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-sm font-medium transition-all"
            >
              {granting
                ? "Granting…"
                : canGrant
                  ? `${pts > 0 ? "Grant +" : "Deduct "}${Math.abs(pts)} pts to ${selected.size} user${selected.size !== 1 ? "s" : ""}`
                  : "Select a channel, users, and points amount"}
            </button>

            {grantMsg && (
              <p className={`text-sm rounded-xl p-3 ${grantMsg.ok ? "bg-green-900/40 text-green-300" : "bg-red-900/40 text-red-300"}`}>
                {grantMsg.text}
              </p>
            )}
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
