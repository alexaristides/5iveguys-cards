"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  DELIVERY, PRINT_PACKS, PRINT_SHOP, REFUND_POLICY, formatPounds, nextBundle, packImage, priceFor, type Zone,
} from "@/lib/print-shop";

const CART_KEY = "shop.cart.v1";
const ZONE_KEY = "shop.zone";

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode or storage blocked: the basket just won't survive a reload
  }
}

export function clearCart() {
  try {
    localStorage.removeItem(CART_KEY);
  } catch {}
}

function Stepper({ qty, onChange, label }: { qty: number; onChange: (n: number) => void; label: string }) {
  if (qty === 0) {
    return (
      <button
        type="button"
        onClick={() => onChange(1)}
        className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors"
        aria-label={`Add ${label}`}
      >
        Add
      </button>
    );
  }
  return (
    <div className="flex items-center justify-between rounded-xl bg-zinc-900 border border-purple-500/50">
      <button type="button" onClick={() => onChange(qty - 1)} className="w-11 h-10 text-white text-lg" aria-label={`One less ${label}`}>
        −
      </button>
      <span className="text-white font-semibold tabular-nums" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(PRINT_SHOP.maxPerPack, qty + 1))}
        className="w-11 h-10 text-white text-lg"
        aria-label={`One more ${label}`}
      >
        +
      </button>
    </div>
  );
}

export default function ShopClient({
  forSale,
  open,
  firstEdition,
  promise,
}: {
  /** false = packs are shown as "coming soon": no basket, nothing to add. */
  forSale: boolean;
  open: boolean;
  firstEdition: boolean;
  promise: string;
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [zone, setZone] = useState<Zone>("uk");
  const [basketOpen, setBasketOpen] = useState(false);
  const [state, setState] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!forSale) return;
    const saved = load<Record<string, number>>(CART_KEY, {});
    setCart(Object.fromEntries(Object.entries(saved).filter(([id, n]) => PRINT_PACKS.some((p) => p.id === id) && n > 0)));
    setZone(load<Zone>(ZONE_KEY, "uk") === "world" ? "world" : "uk");
  }, [forSale]);

  function setQty(id: string, n: number) {
    setCart((c) => {
      const next = { ...c };
      if (n <= 0) delete next[id];
      else next[id] = n;
      save(CART_KEY, next);
      return next;
    });
    setError(null);
  }
  function pickZone(z: Zone) {
    setZone(z);
    save(ZONE_KEY, z);
  }

  const items = useMemo(
    () => PRINT_PACKS.filter((p) => cart[p.id]).map((p) => ({ pack: p, qty: cart[p.id] })),
    [cart],
  );
  const count = items.reduce((n, i) => n + i.qty, 0);
  const price = priceFor(count);
  const delivery = DELIVERY[zone];
  const total = price.totalPence + (count ? delivery.pence : 0);
  const nudge = nextBundle(count);
  const tooMany = count > PRINT_SHOP.maxPacks;

  async function checkout() {
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/store/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zone, items: items.map((i) => ({ packId: i.pack.id, qty: i.qty })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error ?? "Checkout couldn't start. Please try again.");
      window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }

  return (
    <>
      <section className="rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-900/40 via-zinc-950 to-zinc-950 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
        <div>
          <p className="text-white text-2xl sm:text-3xl font-bold tracking-tight">
            {formatPounds(PRINT_SHOP.packPence)} a pack
            <span className="text-purple-300"> · any {PRINT_SHOP.bundle.size} for {formatPounds(PRINT_SHOP.bundle.pence)}</span>
          </p>
          <p className="text-zinc-400 text-sm mt-1">Mix any packs you like. {PRINT_SHOP.cardCount} printed cards in every pack.</p>
        </div>
        <div className={`rounded-2xl px-4 py-3 text-sm ${firstEdition ? "bg-amber-400/10 border border-amber-400/30 text-amber-100" : "bg-zinc-900 border border-zinc-800 text-zinc-300"}`}>
          {promise}
        </div>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {PRINT_PACKS.map((p) => (
          <article
            key={p.id}
            className={`rounded-2xl bg-zinc-900/60 border p-2.5 flex flex-col gap-2.5 ${cart[p.id] ? "border-purple-500/60" : "border-zinc-800"} ${
              p.kind === "squad" ? "col-span-2 sm:col-span-1" : ""
            }`}
          >
            <div className={p.kind === "squad" ? "flex gap-3 sm:block" : ""}>
              <img
                src={packImage(p.id)}
                alt={`${p.title}, 1st Edition`}
                loading={p.kind === "squad" ? "eager" : "lazy"}
                className={`rounded-xl object-cover aspect-[402/720] ${p.kind === "squad" ? "w-1/2 sm:w-full" : "w-full"}`}
              />
              {p.kind === "squad" && (
                <div className="sm:hidden flex flex-col justify-center gap-2">
                  <p className="text-purple-300 text-xs font-semibold uppercase tracking-widest">Random</p>
                  <h3 className="text-white font-semibold">{p.title}</h3>
                  <p className="text-zinc-400 text-xs leading-relaxed">{p.blurb}</p>
                </div>
              )}
            </div>
            <div className={`px-0.5 ${p.kind === "squad" ? "hidden sm:block" : ""}`}>
              <h3 className="text-white text-sm font-semibold">{p.title}</h3>
              <p className="text-zinc-500 text-xs leading-snug mt-0.5">{p.blurb}</p>
            </div>
            <div className="mt-auto">
              {forSale ? (
                <Stepper qty={cart[p.id] ?? 0} onChange={(n) => setQty(p.id, n)} label={p.title} />
              ) : (
                <p className="w-full py-2.5 rounded-xl border border-amber-300/30 bg-amber-300/10 text-amber-200 text-center text-sm font-semibold">
                  Coming soon
                </p>
              )}
            </div>
          </article>
        ))}
      </section>

      {/* Room for the basket bar */}
      <div className="h-24" />

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#0a0a0a]/95 backdrop-blur-md">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold">
                {count} pack{count === 1 ? "" : "s"} · {formatPounds(price.totalPence)}
              </p>
              <p className="text-xs text-purple-300 truncate">
                {nudge
                  ? nudge.changePence < 0
                    ? `Add ${nudge.more} more and pay ${formatPounds(-nudge.changePence)} less`
                    : `Add ${nudge.more} more for just ${formatPounds(nudge.changePence)}`
                  : price.discountPence
                    ? `You're saving ${formatPounds(price.discountPence)}`
                    : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setBasketOpen(true)}
              className="px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold"
            >
              Basket
            </button>
          </div>
        </div>
      )}

      {basketOpen && count > 0 && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/70" onClick={() => setBasketOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Your basket"
            className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-zinc-950 border border-zinc-800 p-5 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-white text-lg font-bold">Your basket</h2>
              <button type="button" onClick={() => setBasketOpen(false)} className="text-zinc-500 hover:text-white text-sm">
                Close
              </button>
            </div>

            <ul className="space-y-3">
              {items.map(({ pack, qty }) => (
                <li key={pack.id} className="flex items-center gap-3">
                  <img src={packImage(pack.id)} alt="" className="w-10 rounded-md" />
                  <span className="flex-1 text-white text-sm">{pack.title}</span>
                  <div className="w-28">
                    <Stepper qty={qty} onChange={(n) => setQty(pack.id, n)} label={pack.title} />
                  </div>
                </li>
              ))}
            </ul>

            <div className="space-y-2">
              <p className="text-zinc-300 text-xs font-medium">Posting to</p>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-900 border border-zinc-800">
                {(["uk", "world"] as Zone[]).map((z) => (
                  <button
                    key={z}
                    type="button"
                    aria-pressed={zone === z}
                    onClick={() => pickZone(z)}
                    className={`py-2 rounded-lg text-sm font-medium ${zone === z ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-white"}`}
                  >
                    {DELIVERY[z].short} · {formatPounds(DELIVERY[z].pence)}
                  </button>
                ))}
              </div>
            </div>

            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between text-zinc-400">
                <dt>
                  {count} pack{count === 1 ? "" : "s"}
                </dt>
                <dd className="tabular-nums">{formatPounds(price.subtotalPence)}</dd>
              </div>
              {price.discountPence > 0 && (
                <div className="flex justify-between text-purple-300">
                  <dt>
                    {PRINT_SHOP.bundle.size} for {formatPounds(PRINT_SHOP.bundle.pence)}
                    {price.bundles > 1 ? ` ×${price.bundles}` : ""}
                  </dt>
                  <dd className="tabular-nums">−{formatPounds(price.discountPence)}</dd>
                </div>
              )}
              <div className="flex justify-between text-zinc-400">
                <dt>{delivery.label}</dt>
                <dd className="tabular-nums">{formatPounds(delivery.pence)}</dd>
              </div>
              <div className="flex justify-between text-white font-semibold text-base pt-1.5 border-t border-zinc-800">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatPounds(total)}</dd>
              </div>
            </dl>

            {nudge && (
              <p className="text-xs rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-200 p-3">
                {nudge.changePence < 0
                  ? `Add ${nudge.more} more pack and your total goes down by ${formatPounds(-nudge.changePence)}: any ${PRINT_SHOP.bundle.size} are ${formatPounds(PRINT_SHOP.bundle.pence)}.`
                  : `Add ${nudge.more} more pack${nudge.more === 1 ? "" : "s"} for just ${formatPounds(nudge.changePence)}: any ${PRINT_SHOP.bundle.size} are ${formatPounds(PRINT_SHOP.bundle.pence)}.`}
              </p>
            )}
            {tooMany && <p className="text-sm text-red-300">Up to {PRINT_SHOP.maxPacks} packs per order.</p>}
            {error && <p className="text-sm rounded-xl p-3 bg-red-900/40 text-red-300">{error}</p>}

            <button
              type="button"
              disabled={!open || state === "sending" || tooMany}
              onClick={checkout}
              className="w-full py-4 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-semibold"
            >
              {!open ? "Checkout opens soon" : state === "sending" ? "Opening checkout…" : `Checkout · ${formatPounds(total)}`}
            </button>
            <p className="text-zinc-500 text-xs leading-relaxed">
              Secure payment by Stripe. {REFUND_POLICY} See our{" "}
              <Link href="/terms#shop" className="underline hover:text-zinc-300">
                terms
              </Link>
              .
            </p>
          </div>
        </div>
      )}
    </>
  );
}
