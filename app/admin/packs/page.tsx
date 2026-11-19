"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMilli, formatPence, type PlayerEarnings } from "@/lib/player-packs";

interface Payout {
  id: string;
  channelId: string;
  playerName: string;
  amountPence: number;
  note: string | null;
  paidAt: string;
}

interface Sale {
  id: string;
  channelId: string | null;
  playerName: string | null;
  status: string;
  environment: string | null;
  priceMilli: number | null;
  currency: string | null;
  paidAt: string | null;
  buyer: string | null;
}

interface Data {
  playerSharePence: number;
  channels: { id: string; slug: string; name: string }[];
  players: PlayerEarnings[];
  takings: { currency: string; milli: number }[];
  payouts: Payout[];
  recent: Sale[];
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

/** Player packs: what each player has earned (£1 a pack), what they've been paid, and what they're owed. */
export default function AdminPacksPage() {
  const [secret, setSecret] = useState("");
  const [tests, setTests] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null); // "channelId:player"
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(s = secret, t = tests) {
    if (!s) return;
    setError(null);
    const res = await fetch(`/api/admin/packs${t ? "?tests=1" : ""}`, { headers: { "x-admin-secret": s } });
    if (!res.ok) return setError(res.status === 401 ? "Wrong admin secret." : "Server error.");
    setData(await res.json());
  }

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/packs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Server error.");
      await load();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function startPayout(p: PlayerEarnings) {
    setPaying(`${p.channelId}:${p.playerName}`);
    setAmount(p.owedPence > 0 ? (p.owedPence / 100).toFixed(2) : "");
    setNote("");
  }

  async function recordPayout(p: PlayerEarnings) {
    const pence = Math.round(Number(amount) * 100);
    if (!Number.isFinite(pence) || pence <= 0) return setError("Enter how much you paid.");
    if (await post({ action: "payout", channelId: p.channelId, playerName: p.playerName, amountPence: pence, note })) setPaying(null);
  }

  const team = (id: string | null) => data?.channels.find((c) => c.id === id)?.name ?? "";
  const totalOwed = data?.players.reduce((s, p) => s + Math.max(0, p.owedPence), 0) ?? 0;
  const totalPacks = data?.players.reduce((s, p) => s + p.packs, 0) ?? 0;

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-4 py-6 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-white text-2xl font-bold">Player packs</h1>
          <Link href="/admin" className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm">← Admin</Link>
        </div>

        <div className="flex gap-2">
          <input
            type="password"
            placeholder="Admin secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onBlur={() => load()}
            onKeyDown={(e) => e.key === "Enter" && load()}
            className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-base outline-none focus:border-purple-500"
          />
          <button onClick={() => load()} disabled={!secret} className="px-4 py-3 rounded-xl bg-zinc-800 disabled:opacity-40 text-white text-sm">
            Load
          </button>
        </div>
        <label className="flex items-center gap-2 text-zinc-400 text-sm">
          <input
            type="checkbox"
            checked={tests}
            onChange={(e) => { setTests(e.target.checked); load(secret, e.target.checked); }}
            className="w-5 h-5 accent-purple-600"
          />
          Include test purchases (TestFlight / sandbox)
        </label>

        {error && <p className="text-sm rounded-xl p-4 bg-red-900/40 text-red-300">{error}</p>}

        {data && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Packs sold" value={totalPacks.toLocaleString()} />
              <Stat label="Owed to players" value={formatPence(totalOwed)} highlight />
              <Stat
                label="Takings"
                value={data.takings.length ? data.takings.map((t) => formatMilli(t.milli, t.currency)).join(" + ") : "£0.00"}
              />
            </div>
            <p className="text-zinc-500 text-xs leading-relaxed">
              Each paid pack earns its player {formatPence(data.playerSharePence)}. Takings are what buyers paid, before
              Apple&apos;s commission and VAT; refunded packs don&apos;t count.
            </p>

            <section className="space-y-2">
              <h2 className="text-white font-semibold">Players</h2>
              {data.players.length === 0 && <p className="text-zinc-500 text-sm">No packs sold yet.</p>}
              {data.players.map((p) => {
                const key = `${p.channelId}:${p.playerName}`;
                return (
                  <div key={key} className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-white font-bold text-lg truncate">{p.playerName}</p>
                        <p className="text-zinc-500 text-xs">
                          {team(p.channelId)} · {p.packs} pack{p.packs === 1 ? "" : "s"}
                          {p.refunded ? ` · ${p.refunded} refunded` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-xl font-black ${p.owedPence > 0 ? "text-amber-400" : "text-zinc-400"}`}>{formatPence(p.owedPence)}</p>
                        <p className="text-zinc-500 text-xs">owed</p>
                      </div>
                    </div>
                    <p className="text-zinc-400 text-xs">
                      Earned {formatPence(p.earnedPence)} · Paid {formatPence(p.paidOutPence)}
                    </p>
                    {paying === key ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <span className="px-3 py-3 rounded-xl bg-zinc-800 text-zinc-300 text-base">£</span>
                          <input
                            inputMode="decimal"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="Amount paid"
                            className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-700 text-white text-base outline-none focus:border-purple-500"
                          />
                        </div>
                        <input
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Note (optional), e.g. bank transfer 19 Nov"
                          className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-700 text-white text-base outline-none focus:border-purple-500"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => recordPayout(p)}
                            disabled={busy}
                            className="flex-1 py-3 rounded-xl bg-purple-600 text-white font-semibold disabled:opacity-50"
                          >
                            Record payment
                          </button>
                          <button onClick={() => setPaying(null)} className="px-4 py-3 rounded-xl bg-zinc-800 text-zinc-300">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => startPayout(p)} className="w-full py-3 rounded-xl bg-zinc-800 text-white text-sm font-semibold">
                        I&apos;ve paid {p.playerName}
                      </button>
                    )}
                  </div>
                );
              })}
            </section>

            <section className="space-y-2">
              <h2 className="text-white font-semibold">Payments to players</h2>
              {data.payouts.length === 0 && <p className="text-zinc-500 text-sm">None recorded yet.</p>}
              {data.payouts.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-zinc-900 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-semibold">
                      {formatPence(p.amountPence)} to {p.playerName}
                    </p>
                    <p className="text-zinc-500 text-xs truncate">
                      {when(p.paidAt)}{p.note ? ` · ${p.note}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => confirm(`Undo the ${formatPence(p.amountPence)} payment to ${p.playerName}?`) && post({ action: "deletePayout", id: p.id })}
                    className="text-zinc-500 text-xs underline shrink-0"
                  >
                    Undo
                  </button>
                </div>
              ))}
            </section>

            <section className="space-y-2">
              <h2 className="text-white font-semibold">Latest sales</h2>
              {data.recent.length === 0 && <p className="text-zinc-500 text-sm">No sales yet.</p>}
              {data.recent.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-zinc-900 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-semibold truncate">
                      {s.playerName ? `${s.playerName} pack` : "Pack (player not picked yet)"}
                      {s.environment && s.environment !== "Production" ? <span className="text-zinc-500 font-normal"> · test</span> : null}
                    </p>
                    <p className="text-zinc-500 text-xs truncate">
                      {when(s.paidAt)} · {s.buyer ?? "deleted account"} · {team(s.channelId)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-semibold ${s.status === "refunded" ? "text-red-400 line-through" : "text-white"}`}>
                      {s.priceMilli !== null && s.currency ? formatMilli(s.priceMilli, s.currency) : "–"}
                    </p>
                    <p className="text-zinc-500 text-xs">{s.status === "paid" ? "unopened" : s.status}</p>
                  </div>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-3">
      <p className={`text-lg font-black leading-tight break-words ${highlight ? "text-amber-400" : "text-white"}`}>{value}</p>
      <p className="text-zinc-500 text-xs mt-1">{label}</p>
    </div>
  );
}
