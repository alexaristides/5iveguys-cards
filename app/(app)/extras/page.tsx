"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { AppShell, card, cardLink, LinkRow, primaryButton, SectionTitle } from "@/components/AppShell";
import { signInBasic } from "@/components/SignInScreen";
import { WORLDS, worldName } from "@/lib/worlds";

interface World { slug: string; name: string; isActive: boolean; stats: { spendablePoints: number; cardCount: number; totalCards: number } }

/**
 * Extras, from the burger menu: what the website has beyond the app — 5IVE STREET and the other games,
 * the trading cards and points for each team's world. Open without signing in (the games need no account).
 */
export default function ExtrasPage() {
  const { status } = useSession();
  const [worlds, setWorlds] = useState<World[] | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/dashboard").then((r) => (r.ok ? r.json() : { channels: [] })).then((d) => setWorlds(d.channels ?? []));
  }, [status]);

  return (
    <AppShell title="Extras" back="/fantasy" open>
      <p className="text-ink-2 text-[15px] leading-[21px]">Everything else on 5iveG: the games, the trading cards and your points.</p>

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
          <span className={`${primaryButton} shrink-0 h-11 flex items-center`}>Play</span>
        </div>
      </a>
      <LinkRow href="/game" emoji="🎮" title="All games" detail="The 7v7 sim, live matches and the leaderboard" />

      <SectionTitle>Cards and points</SectionTitle>
      {status === "unauthenticated" ? (
        <div className={`${card} p-4 flex items-center gap-3`}>
          <p className="flex-1 text-ink-2 text-sm">Sign in to see your points and your cards.</p>
          <button onClick={() => signInBasic("/extras")} className={`${primaryButton} shrink-0 h-11`}>Sign in</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2.5">
          {WORLDS.map((w) => {
            const stats = worlds?.find((x) => x.slug === w.slug)?.stats;
            return (
              <Link key={w.slug} href={`/${w.slug}`} className={`${cardLink} p-4 space-y-3`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink font-black">{worldName(w.slug)}</span>
                  <span className="text-violet-600 text-sm font-extrabold">Open ›</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Stat value={stats ? stats.spendablePoints.toLocaleString() : worlds ? "0" : "–"} label="Points" />
                  <Stat value={stats ? `${stats.cardCount}/${stats.totalCards}` : worlds ? "0" : "–"} label="Cards collected" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <div className="space-y-2">
        <LinkRow href="/dashboard" emoji="🃏" title="Your collection" detail="Every card you've got and the card ratings" />
        <LinkRow href="/5iveguysfc" emoji="▶️" title="Points" detail="You get points for being a fan" />
        <LinkRow href="/settings" emoji="⚙️" title="Points and YouTube settings" detail="Your name in the games and your YouTube connection" />
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
