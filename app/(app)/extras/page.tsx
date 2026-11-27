"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { AppShell, card, cardLink, LinkRow, PageTitle, primaryButton, SectionTitle } from "@/components/AppShell";
import { PRINT_SHOP } from "@/lib/print-shop";
import { WORLDS, worldName } from "@/lib/worlds";

interface World { slug: string; name: string; isActive: boolean; stats: { spendablePoints: number; cardCount: number; totalCards: number } }

const pounds = (pence: number) => `£${(pence / 100).toFixed(pence % 100 ? 2 : 0)}`;

/**
 * Extras: everything the website has that the app doesn't — 5IVE STREET and the other games,
 * digital cards, packs and points, and the printed card shop.
 */
export default function ExtrasPage() {
  const { status } = useSession();
  const [worlds, setWorlds] = useState<World[] | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/dashboard").then((r) => (r.ok ? r.json() : { channels: [] })).then((d) => setWorlds(d.channels ?? []));
  }, [status]);

  return (
    <AppShell>
      <PageTitle title="Extras" sub="Everything else on 5iveG: the games, your digital cards and points, and the shop." />

      <SectionTitle>Play</SectionTitle>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- /street is a static page, not a Next route (CLAUDE.md) */}
      <a href="/street" className={`${cardLink} group block overflow-hidden rounded-[22px]`}>
        <div className="relative h-44 sm:h-52 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/street-squad.jpg" alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-violet-950/80 via-violet-950/10 to-transparent" />
          <span className="absolute left-4 bottom-3 text-white text-2xl font-black italic tracking-tight drop-shadow">5IVE STREET</span>
        </div>
        <div className="p-4 flex items-center gap-3">
          <p className="flex-1 text-ink-2 text-sm">3v3 street football with the real squad: story mode, quick matches and online 1v1.</p>
          <span className={`${primaryButton} shrink-0 px-5 h-11 flex items-center`}>Play</span>
        </div>
      </a>
      <LinkRow href="/game" emoji="🎮" title="All games" detail="The 7v7 sim, live matches and the leaderboard" />

      <SectionTitle>Cards and points</SectionTitle>
      {status === "unauthenticated" ? (
        <div className={`${card} p-4 flex items-center gap-3`}>
          <p className="flex-1 text-ink-2 text-sm">Sign in to see your points and cards, sync YouTube and open packs.</p>
          <button onClick={() => signIn("google")} className={`${primaryButton} shrink-0 px-5 h-11`}>Sign in</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2.5">
          {WORLDS.map((w) => {
            const stats = worlds?.find((x) => x.slug === w.slug)?.stats;
            return (
              <Link key={w.slug} href={`/${w.slug}`} className={`${cardLink} p-4 space-y-3`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink font-black">{worldName(w.slug)}</span>
                  <span className="text-violet-600 text-sm font-extrabold">Earn points ›</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Stat value={stats ? stats.spendablePoints.toLocaleString() : worlds ? "0" : "–"} label="Points to spend" />
                  <Stat value={stats ? `${stats.cardCount}/${stats.totalCards}` : worlds ? "0" : "–"} label="Cards collected" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <div className="space-y-2">
        <LinkRow href="/dashboard" emoji="🃏" title="Your collection" detail="Every card you've got, card ratings and your worlds" />
        <LinkRow href="/5iveguysfc/packs" emoji="📦" title="Open packs" detail="Spend your points on digital card packs" />
        <LinkRow href="/5iveguysfc" emoji="▶️" title="Earn points" detail="Sync YouTube: subscribe, like and watch for points" />
      </div>

      <SectionTitle>Shop</SectionTitle>
      <LinkRow
        href="/shop" emoji="🛍️" title="Printed 1st Edition packs"
        detail={PRINT_SHOP.forSale
          ? `Real trading cards posted to you: ${pounds(PRINT_SHOP.packPence)} a pack, any ${PRINT_SHOP.bundle.size} for ${pounds(PRINT_SHOP.bundle.pence)}`
          : "Real trading cards of the squad, posted to you"}
        right={!PRINT_SHOP.forSale ? <span className="rounded-full bg-amber-100 border border-amber-300 text-amber-800 text-xs font-black px-2.5 py-1">Coming soon</span> : undefined}
      />

      <SectionTitle>Account</SectionTitle>
      <div className="space-y-2">
        <LinkRow href="/settings" emoji="⚙️" title="Settings" detail="Your account, team name and YouTube connection" />
        <LinkRow href="/support" emoji="💬" title="Help" detail="Questions, problems and feedback" />
      </div>
    </AppShell>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-lilac px-3 py-2">
      <div className="text-ink text-xl font-black tabular-nums">{value}</div>
      <div className="text-ink-3 text-xs font-bold">{label}</div>
    </div>
  );
}
