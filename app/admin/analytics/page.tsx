"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";

interface FunnelStep { label: string; count: number }
interface FeatureStat { label: string; total: number; users: number }
interface PackStat { type: string; count: number; pointsSpent: number }
interface PointStat { type: string; count: number; total: number }
interface DayData { date: string; packs: number; signups: number; syncs: number }

interface AnalyticsData {
  funnel: FunnelStep[];
  features: FeatureStat[];
  packs: PackStat[];
  points: PointStat[];
  signups: { last7: number; last30: number; allTime: number };
  activeUsers30d: number;
  daily: DayData[];
}

interface Channel { id: string; slug: string; name: string; thumbnailUrl: string | null }

export default function AdminAnalyticsPage() {
  const [secret, setSecret] = useState(() =>
    typeof window !== "undefined" ? sessionStorage.getItem("adminSecret") ?? "" : ""
  );
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelSlug, setChannelSlug] = useState("all");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (s: string, slug: string) => {
    if (!s) return;
    setLoading(true);
    setError(null);
    const qs = slug !== "all" ? `?channelSlug=${slug}` : "";
    const [chRes, aRes] = await Promise.all([
      fetch("/api/admin/channels", { headers: { "x-admin-secret": s } }),
      fetch(`/api/admin/analytics${qs}`, { headers: { "x-admin-secret": s } }),
    ]);
    setLoading(false);
    if (!chRes.ok || !aRes.ok) { setError("Invalid secret or server error."); return; }
    const chData = await chRes.json();
    const aData = await aRes.json();
    setChannels(chData.channels ?? []);
    setData(aData);
    sessionStorage.setItem("adminSecret", s);
  }, []);

  // Load on mount if secret is cached
  useEffect(() => { if (secret) load(secret, channelSlug); }, []); // eslint-disable-line

  // Reload when channel filter changes (only if already loaded)
  useEffect(() => {
    if (secret && data) load(secret, channelSlug);
  }, [channelSlug]); // eslint-disable-line

  const totalUsers = data?.funnel[0]?.count ?? 1; // avoid div-by-zero
  const maxPacks = Math.max(...(data?.daily.map((d) => d.packs) ?? [0]), 1);
  const maxSyncs = Math.max(...(data?.daily.map((d) => d.syncs) ?? [0]), 1);

  return (
    <main className="min-h-screen bg-[#0a0a0a] p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-7">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link href="/admin" className="text-zinc-500 text-sm hover:text-white transition-colors">← Admin</Link>
            <h1 className="text-white text-2xl font-bold mt-1">Analytics</h1>
          </div>
          {loading && <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />}
        </div>

        {/* Secret input */}
        <div className="flex gap-3">
          <input
            type="password"
            placeholder="Admin secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onBlur={() => load(secret, channelSlug)}
            className="flex-1 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500"
          />
          <button
            onClick={() => load(secret, channelSlug)}
            disabled={!secret || loading}
            className="px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-sm transition-all"
          >
            {loading ? "…" : "Load"}
          </button>
        </div>

        {error && <p className="text-sm rounded-xl p-4 bg-red-900/40 text-red-300">{error}</p>}

        {/* Channel filter */}
        {channels.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <ChipBtn active={channelSlug === "all"} onClick={() => setChannelSlug("all")}>All channels</ChipBtn>
            {channels.map((ch) => (
              <ChipBtn key={ch.slug} active={channelSlug === ch.slug} onClick={() => setChannelSlug(ch.slug)}>
                {ch.name}
              </ChipBtn>
            ))}
          </div>
        )}

        {data && (
          <>
            {/* Overview strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <BigStat label="New users (7d)"  value={`+${data.signups.last7}`} />
              <BigStat label="New users (30d)" value={`+${data.signups.last30}`} />
              <BigStat label="Active (30d)"    value={data.activeUsers30d.toLocaleString()} sub="earned pts" />
              <BigStat label="Total users"     value={data.signups.allTime.toLocaleString()} />
            </div>

            {/* User funnel */}
            <Section
              title="User Funnel"
              subtitle="Unique users who have ever used each feature — where people drop off"
            >
              <div className="space-y-2.5">
                {data.funnel.map((step, i) => {
                  const pctOfTotal = totalUsers > 0 ? (step.count / totalUsers) * 100 : 0;
                  const prevCount = data.funnel[i - 1]?.count ?? totalUsers;
                  const pctOfPrev = i > 0 && prevCount > 0 ? (step.count / prevCount) * 100 : null;
                  const dropped = pctOfPrev !== null && pctOfPrev < 100;
                  return (
                    <div key={step.label} className="flex items-center gap-3">
                      {/* Label */}
                      <span className="text-zinc-500 text-xs w-32 shrink-0 text-right leading-tight">
                        {step.label}
                      </span>
                      {/* Bar */}
                      <div className="flex-1 h-5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-600 rounded-full transition-all duration-500"
                          style={{ width: `${pctOfTotal.toFixed(2)}%` }}
                        />
                      </div>
                      {/* Count */}
                      <span className="text-white text-sm font-semibold w-14 text-right shrink-0">
                        {step.count.toLocaleString()}
                      </span>
                      {/* % of total */}
                      <span className="text-zinc-500 text-xs w-9 shrink-0 text-right">
                        {pctOfTotal.toFixed(0)}%
                      </span>
                      {/* Drop-off from prev */}
                      <span className={`text-xs w-14 shrink-0 ${dropped ? "text-red-400" : "text-zinc-700"}`}>
                        {pctOfPrev !== null ? (dropped ? `↓${pctOfPrev.toFixed(0)}%` : "—") : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-zinc-600 text-xs pt-1">% column = of total users · arrow = retained from previous step</p>
            </Section>

            {/* Feature usage grid */}
            <Section title="Feature Usage" subtitle="Total events · unique users who triggered them">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {data.features.map((f) => (
                  <div key={f.label} className="bg-zinc-800/50 rounded-xl p-3 space-y-1">
                    <p className="text-zinc-500 text-xs">{f.label}</p>
                    <p className="text-white font-bold text-2xl leading-none">{f.total.toLocaleString()}</p>
                    {f.users > 0 && (
                      <p className="text-zinc-600 text-xs">
                        {f.users.toLocaleString()} user{f.users !== 1 ? "s" : ""}
                        {totalUsers > 0 ? ` · ${((f.users / totalUsers) * 100).toFixed(0)}%` : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Section>

            {/* Pack + Points breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Section title="Pack Opens by Type">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-600 text-xs">
                      <th className="text-left pb-2 font-normal">Pack</th>
                      <th className="text-right pb-2 font-normal">Opens</th>
                      <th className="text-right pb-2 font-normal">Pts spent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {data.packs.length === 0 && (
                      <tr><td colSpan={3} className="text-zinc-600 text-xs py-4 text-center">No data yet</td></tr>
                    )}
                    {data.packs.map((p) => (
                      <tr key={p.type}>
                        <td className="py-2 capitalize text-white">{p.type}</td>
                        <td className="py-2 text-right text-zinc-300">{p.count.toLocaleString()}</td>
                        <td className="py-2 text-right text-zinc-500">{p.pointsSpent.toLocaleString()}</td>
                      </tr>
                    ))}
                    {data.packs.length > 1 && (
                      <tr className="text-zinc-500 text-xs">
                        <td className="pt-2">Total</td>
                        <td className="pt-2 text-right">{data.packs.reduce((s, p) => s + p.count, 0).toLocaleString()}</td>
                        <td className="pt-2 text-right">{data.packs.reduce((s, p) => s + p.pointsSpent, 0).toLocaleString()}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Section>

              <Section title="Points Earned by Type">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-600 text-xs">
                      <th className="text-left pb-2 font-normal">Type</th>
                      <th className="text-right pb-2 font-normal">Events</th>
                      <th className="text-right pb-2 font-normal">Total pts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {data.points.length === 0 && (
                      <tr><td colSpan={3} className="text-zinc-600 text-xs py-4 text-center">No data yet</td></tr>
                    )}
                    {data.points.map((p) => (
                      <tr key={p.type}>
                        <td className="py-2 capitalize text-white">{p.type}</td>
                        <td className="py-2 text-right text-zinc-300">{p.count.toLocaleString()}</td>
                        <td className="py-2 text-right text-zinc-500">{p.total.toLocaleString()}</td>
                      </tr>
                    ))}
                    {data.points.length > 1 && (
                      <tr className="text-zinc-500 text-xs">
                        <td className="pt-2">Total</td>
                        <td className="pt-2 text-right">{data.points.reduce((s, p) => s + p.count, 0).toLocaleString()}</td>
                        <td className="pt-2 text-right">{data.points.reduce((s, p) => s + p.total, 0).toLocaleString()}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Section>
            </div>

            {/* 30-day activity chart */}
            <Section
              title="Last 30 Days"
              subtitle="Pack opens (purple) · YouTube syncs (teal)"
            >
              {/* Dual bar chart */}
              <div className="flex items-end gap-px h-28">
                {data.daily.map((d) => {
                  const ph = maxPacks > 0 ? (d.packs / maxPacks) * 100 : 0;
                  const sh = maxSyncs > 0 ? (d.syncs / maxSyncs) * 100 : 0;
                  return (
                    <div key={d.date} className="flex-1 flex items-end gap-px group cursor-default" title={`${d.date.slice(5)}: ${d.packs} opens · ${d.syncs} syncs · ${d.signups} signups`}>
                      <div className="flex-1 bg-purple-600/70 group-hover:bg-purple-500 rounded-sm transition-colors" style={{ height: `${ph}%`, minHeight: d.packs > 0 ? "2px" : "0" }} />
                      <div className="flex-1 bg-teal-500/60 group-hover:bg-teal-400 rounded-sm transition-colors" style={{ height: `${sh}%`, minHeight: d.syncs > 0 ? "2px" : "0" }} />
                    </div>
                  );
                })}
              </div>

              {/* Date labels */}
              <div className="flex justify-between mt-2">
                <span className="text-zinc-700 text-xs">{data.daily[0]?.date?.slice(5)}</span>
                <span className="text-zinc-700 text-xs">{data.daily[14]?.date?.slice(5)}</span>
                <span className="text-zinc-700 text-xs">{data.daily[data.daily.length - 1]?.date?.slice(5)}</span>
              </div>

              {/* 30-day totals */}
              <div className="flex gap-6 pt-1">
                <span className="text-zinc-500 text-xs">
                  <span className="inline-block w-2 h-2 rounded-sm bg-purple-500 mr-1.5" />
                  {data.daily.reduce((s, d) => s + d.packs, 0).toLocaleString()} pack opens
                </span>
                <span className="text-zinc-500 text-xs">
                  <span className="inline-block w-2 h-2 rounded-sm bg-teal-500 mr-1.5" />
                  {data.daily.reduce((s, d) => s + d.syncs, 0).toLocaleString()} syncs
                </span>
                <span className="text-zinc-500 text-xs">
                  {data.daily.reduce((s, d) => s + d.signups, 0).toLocaleString()} new signups
                </span>
              </div>
            </Section>
          </>
        )}
      </div>
    </main>
  );
}

function BigStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <p className="text-zinc-500 text-xs">{label}</p>
      <p className="text-white font-bold text-2xl mt-1 leading-none">{value}</p>
      {sub && <p className="text-zinc-600 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="text-white font-semibold text-sm">{title}</h2>
        {subtitle && <p className="text-zinc-600 text-xs mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function ChipBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-xl text-xs border transition-colors ${
        active
          ? "bg-purple-700 border-purple-600 text-white"
          : "border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500"
      }`}
    >
      {children}
    </button>
  );
}
