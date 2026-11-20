"use client";

import { useState } from "react";
import Link from "next/link";
import { formatPounds, packById, type CartItem } from "@/lib/print-shop";

interface Order {
  id: string;
  number: number;
  livemode: boolean;
  status: "paid" | "posted" | "cancelled";
  email: string | null;
  customerName: string | null;
  shippingName: string | null;
  address: Record<string, string | null> | null;
  country: string | null;
  zone: string;
  items: CartItem[];
  packCount: number;
  totalPence: number;
  discountPence: number;
  shippingPence: number;
  firstEdition: boolean;
  note: string | null;
  paidAt: string;
  postedAt: string | null;
}
interface Data {
  shopOpen: boolean;
  orders: Order[];
  toMake: { packId: string; title: string; qty: number }[];
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const address = (o: Order) =>
  [o.shippingName, o.address?.line1, o.address?.line2, o.address?.city, o.address?.state, o.address?.postal_code, o.address?.country]
    .filter(Boolean)
    .join("\n");

/** Printed shop orders: what to make, who to post to, and marking them posted. */
export default function AdminOrdersPage() {
  const [secret, setSecret] = useState("");
  const [tests, setTests] = useState(false);
  const [show, setShow] = useState<"paid" | "all">("paid");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(s = secret, t = tests) {
    if (!s) return;
    setError(null);
    const res = await fetch(`/api/admin/orders${t ? "?tests=1" : ""}`, { headers: { "x-admin-secret": s } });
    if (!res.ok) return setError(res.status === 401 ? "Wrong admin secret." : "Server error.");
    setData(await res.json());
  }

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Server error.");
      if (body.action === "sync") setInfo(json.added ? `Added ${json.added} order${json.added === 1 ? "" : "s"} from Stripe.` : "Nothing missing: every paid order is here.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setInfo(`Copied ${what}.`);
    } catch {
      setError("Couldn't copy: select the text instead.");
    }
  }

  const orders = (data?.orders ?? []).filter((o) => show === "all" || o.status === "paid");
  const toPost = (data?.orders ?? []).filter((o) => o.status === "paid");
  const takings = (data?.orders ?? []).filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.totalPence, 0);
  const labels = toPost.map((o) => `#${o.number}\n${address(o)}`).join("\n\n");

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-4 py-6 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-white text-2xl font-bold">Shop orders</h1>
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

        {error && <p className="text-sm rounded-xl p-3 bg-red-900/40 text-red-300">{error}</p>}
        {info && <p className="text-sm rounded-xl p-3 bg-emerald-900/30 text-emerald-300">{info}</p>}

        {data && (
          <>
            {!data.shopOpen && (
              <p className="text-sm rounded-xl p-3 bg-amber-900/30 text-amber-200">Checkout is off: STRIPE_SECRET_KEY isn&rsquo;t set on this deployment.</p>
            )}

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-3">
                <p className="text-white text-xl font-bold">{toPost.length}</p>
                <p className="text-zinc-500 text-xs">to post</p>
              </div>
              <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-3">
                <p className="text-white text-xl font-bold">{toPost.reduce((s, o) => s + o.packCount, 0)}</p>
                <p className="text-zinc-500 text-xs">packs to make</p>
              </div>
              <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-3">
                <p className="text-white text-xl font-bold">{formatPounds(takings)}</p>
                <p className="text-zinc-500 text-xs">taken (incl. postage)</p>
              </div>
            </div>

            {data.toMake.length > 0 && (
              <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
                <h2 className="text-white font-semibold text-sm">Packs to make (paid, not posted)</h2>
                <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  {data.toMake.map((m) => (
                    <li key={m.packId} className="flex justify-between text-zinc-300">
                      <span>{m.title}</span>
                      <span className="tabular-nums text-white">{m.qty}</span>
                    </li>
                  ))}
                </ul>
                <button onClick={() => copy(labels, "every address to post")} className="text-xs text-purple-400 underline">
                  Copy all addresses to post
                </button>
              </section>
            )}

            <div className="flex flex-wrap items-center gap-2 text-sm">
              {(["paid", "all"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setShow(v)}
                  className={`px-3 py-1.5 rounded-lg ${show === v ? "bg-purple-600 text-white" : "bg-zinc-900 text-zinc-400"}`}
                >
                  {v === "paid" ? "To post" : "All orders"}
                </button>
              ))}
              <label className="flex items-center gap-2 text-zinc-400 ml-auto">
                <input
                  type="checkbox"
                  checked={tests}
                  onChange={(e) => {
                    setTests(e.target.checked);
                    load(secret, e.target.checked);
                  }}
                />
                Test orders
              </label>
              <button onClick={() => post({ action: "sync" })} disabled={busy} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 disabled:opacity-40">
                Check Stripe
              </button>
            </div>

            {orders.length === 0 && <p className="text-zinc-500 text-sm">No orders here yet.</p>}

            <ul className="space-y-3">
              {orders.map((o) => (
                <li key={o.id} className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-white font-semibold">
                        #{o.number} · {o.packCount} pack{o.packCount === 1 ? "" : "s"} · {formatPounds(o.totalPence)}
                        {!o.livemode && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">TEST</span>}
                        {o.firstEdition && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">1ST ED</span>}
                      </p>
                      <p className="text-zinc-500 text-xs">
                        {when(o.paidAt)} · {o.zone === "uk" ? "UK" : "Worldwide"}
                        {o.status === "posted" && ` · posted ${when(o.postedAt)}`}
                        {o.status === "cancelled" && " · cancelled"}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-lg ${
                        o.status === "paid" ? "bg-amber-500/15 text-amber-300" : o.status === "posted" ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-800 text-zinc-500"
                      }`}
                    >
                      {o.status === "paid" ? "To post" : o.status === "posted" ? "Posted" : "Cancelled"}
                    </span>
                  </div>
                  <ul className="text-zinc-300">
                    {o.items.map((i) => (
                      <li key={i.packId}>
                        {packById(i.packId)?.title ?? i.packId} × {i.qty}
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-start justify-between gap-3">
                    <pre className="text-zinc-400 text-xs whitespace-pre-wrap font-sans">{address(o)}</pre>
                    <button onClick={() => copy(address(o), `#${o.number}'s address`)} className="text-xs text-purple-400 underline shrink-0">
                      Copy
                    </button>
                  </div>
                  <p className="text-zinc-500 text-xs">
                    {o.customerName} · {o.email && <a href={`mailto:${o.email}`} className="underline">{o.email}</a>}
                  </p>
                  {o.note && <p className="text-zinc-400 text-xs italic">{o.note}</p>}
                  <div className="flex gap-2">
                    {o.status !== "posted" && (
                      <button
                        onClick={() => post({ action: "status", id: o.id, status: "posted" })}
                        disabled={busy}
                        className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-40"
                      >
                        Mark posted
                      </button>
                    )}
                    {o.status !== "paid" && (
                      <button onClick={() => post({ action: "status", id: o.id, status: "paid" })} disabled={busy} className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs disabled:opacity-40">
                        Back to &ldquo;to post&rdquo;
                      </button>
                    )}
                    {o.status === "paid" && (
                      <button
                        onClick={() => window.confirm(`Mark #${o.number} as cancelled? Refund it in Stripe separately if needed.`) && post({ action: "status", id: o.id, status: "cancelled" })}
                        disabled={busy}
                        className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-xs disabled:opacity-40"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const note = window.prompt("Note on this order", o.note ?? "");
                        if (note !== null) post({ action: "note", id: o.id, note });
                      }}
                      disabled={busy}
                      className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs disabled:opacity-40"
                    >
                      Note
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-zinc-600 text-xs">
              Money (and any refund) is handled in the Stripe dashboard. Each player pack sold adds to that player&rsquo;s earnings in{" "}
              <Link href="/admin/packs" className="underline">Player packs</Link>.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
