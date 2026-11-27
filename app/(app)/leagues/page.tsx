"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { AppShell, LinkRow, PageTitle, panel, primaryButton, SectionTitle, Spinner } from "@/components/AppShell";
import { LeagueForms } from "@/components/fantasy/FantasyLeagues";
import type { FantasyOverview } from "@/components/fantasy/types";

interface MyLeague { id: string; name: string; code: string; members: number; rank: number }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Leagues, as in the app: the overall league, your private leagues, and starting or joining one. */
export default function LeaguesPage() {
  const { status } = useSession();
  const [data, setData] = useState<FantasyOverview | null>(null);
  const [leagues, setLeagues] = useState<MyLeague[] | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    fetch("/api/fantasy").then((r) => r.json()).then((o: FantasyOverview) => {
      setData(o);
      if (o.team) fetch("/api/fantasy/leagues").then((r) => (r.ok ? r.json() : { leagues: [] })).then((l) => setLeagues(l.leagues));
    });
  }, [status]);

  const team = data?.team ?? null;
  let body;
  if (!data) {
    body = <Spinner />;
  } else if (!team) {
    body = (
      <>
        <section className={`${panel} space-y-3`}>
          <h2 className="text-ink text-[22px] font-black">Pick your team first</h2>
          <p className="text-ink-2">Once you have a team you&apos;re in the overall league, and you can start or join leagues with your mates.</p>
          {status !== "authenticated" ? (
            <button onClick={() => signIn("google")} className={`${primaryButton} w-full h-[52px] text-[17px]`}>Sign in to play</button>
          ) : data.nextGameweek !== null ? (
            <Link href="/fantasy/team" className={`${primaryButton} flex items-center justify-center h-[52px] text-[17px]`}>Pick my team</Link>
          ) : null}
        </section>
        <LinkRow href="/fantasy/league/overall" emoji="🌍" title="Everyone" detail="The overall table" />
      </>
    );
  } else {
    body = (
      <>
        <LeagueForms />
        <SectionTitle>Your leagues</SectionTitle>
        <div className="space-y-2">
          <LinkRow
            href="/fantasy/league/overall" emoji="🌍" title="Everyone"
            detail={team.teamCount === 1 ? "Just you so far" : `All ${team.teamCount} teams`}
            right={<Rank rank={team.rank} />}
          />
          {(leagues ?? []).map((l) => (
            <LinkRow
              key={l.id} href={`/fantasy/league/${l.id}`} emoji="⚽" title={l.name}
              detail={`${plural(l.members, "team")} · code ${l.code}`} right={<Rank rank={l.rank} />}
            />
          ))}
          {leagues === null && <Spinner />}
          {leagues?.length === 0 && <p className="text-ink-3 text-sm text-center pt-1">You&apos;re not in any private leagues yet.</p>}
        </div>
      </>
    );
  }

  return (
    <AppShell>
      <PageTitle title="Leagues" />
      {body}
    </AppShell>
  );
}

function Rank({ rank }: { rank: number }) {
  return (
    <span className="text-right">
      <span className="block text-violet-600 text-lg font-black tabular-nums">#{rank}</span>
      <span className="block text-ink-3 text-[11px] font-bold">your rank</span>
    </span>
  );
}
