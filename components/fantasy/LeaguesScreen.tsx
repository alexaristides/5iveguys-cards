"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErrorText, panel, primaryButton, secondaryButton, SectionTitle, Spinner } from "@/components/AppShell";
import { api } from "@/components/fantasy/FantasyLeagues";
import { JoinSheet, type JoinMode } from "@/components/fantasy/JoinSheet";
import type { FantasyOverview } from "@/components/fantasy/types";

interface LeagueSummary { id: string; name: string; code: string; members: number; rank: number }

/**
 * The Leagues tab, as in the app (mobile/src/app/(tabs)/leagues.tsx): the overall table, your private
 * leagues, and starting or joining one in the join sheet. `joinCode` (an invite link) opens the sheet
 * with the code filled in; closing it goes to /leagues.
 */
export function LeaguesScreen({ joinCode }: { joinCode?: string }) {
  const router = useRouter();
  const [data, setData] = useState<FantasyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<LeagueSummary[] | null>(null);
  const [leaguesLoading, setLeaguesLoading] = useState(false);
  const [sheet, setSheet] = useState<JoinMode | null>(joinCode ? "join" : null);

  const loadLeagues = useCallback(async () => {
    setLeaguesLoading(true);
    try {
      setLeagues((await api<{ leagues: LeagueSummary[] }>("/api/fantasy/leagues")).leagues);
    } catch {
      // Like the app: the list just stays as it was.
    } finally {
      setLeaguesLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const overview = await api<FantasyOverview>("/api/fantasy");
      setData(overview);
      setError(null);
      if (overview.team) loadLeagues();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [loadLeagues]);

  // Fresh numbers whenever the tab is opened or the browser comes back to it (the app refetches on focus).
  useEffect(() => {
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const closeSheet = useCallback(() => {
    setSheet(null);
    if (joinCode) router.replace("/leagues");
  }, [joinCode, router]);

  // From an invite link, the league replaces the link in the history (no joining twice on Back).
  const navigate = useCallback((href: string) => (joinCode ? router.replace(href) : router.push(href)), [joinCode, router]);

  const team = data?.team ?? null;
  let body;
  if (!data) {
    body = error ? <ErrorText>{error}</ErrorText> : <Spinner />;
  } else if (!team) {
    body = (
      <section className={`${panel} flex flex-col gap-3`}>
        <h2 className={titleCls}>Pick your team first</h2>
        <p className={bodyCls}>Once you have a team you&apos;re in the overall league, and you can start or join leagues with your mates.</p>
        {data.nextGameweek !== null && (
          <Link href="/fantasy/team" className={`${primaryButton} flex items-center justify-center`}>Pick my team</Link>
        )}
      </section>
    );
  } else {
    body = (
      <>
        <section className={`${panel} flex flex-col gap-3`}>
          <h2 className={titleCls}>Play your mates 🏆</h2>
          <p className={bodyCls}>Start a league and send the code to your mates, or join theirs. Everyone&apos;s ranked on their season points.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setSheet("create")} className={`${primaryButton} flex-1`}>Start a league</button>
            <button type="button" onClick={() => setSheet("join")} className={`${secondaryButton} flex-1`}>Join with code</button>
          </div>
        </section>

        <SectionTitle>Your leagues</SectionTitle>
        <div className="flex flex-col gap-2">
          <LeagueRow
            href="/fantasy/league/overall" emoji="🌍" name="Everyone" rank={team.rank}
            detail={team.teamCount === 1 ? "Just you so far" : `All ${team.teamCount} teams`}
          />
          {(leagues ?? []).map((l) => (
            <LeagueRow
              key={l.id} href={`/fantasy/league/${l.id}`} emoji="⚽" name={l.name} rank={l.rank}
              detail={`${l.members} team${l.members === 1 ? "" : "s"} · code ${l.code}`}
            />
          ))}
          {leaguesLoading && !leagues && <Spinner />}
          {leagues && leagues.length === 0 && (
            <p className="text-ink-3 text-[14px] text-center mt-1.5">You&apos;re not in any private leagues yet.</p>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {body}
      {sheet && data && (
        <JoinSheet
          mode={sheet}
          code={joinCode}
          hasTeam={!!team}
          onClose={closeSheet}
          onChanged={loadLeagues}
          onNavigate={navigate}
        />
      )}
    </div>
  );
}

const titleCls = "text-ink text-[22px] leading-tight font-black";
const bodyCls = "text-ink-2 text-[15px] leading-[21px]";

function LeagueRow({ href, name, detail, rank, emoji }: { href: string; name: string; detail: string; rank: number; emoji: string }) {
  return (
    <Link
      href={href}
      aria-label={`${name}, you're ${rank}`}
      className="flex items-center gap-3 rounded-[18px] bg-white px-3.5 py-3 shadow-card leading-tight hover:shadow-[0_6px_18px_rgba(46,16,101,0.12)] active:opacity-70 transition"
    >
      <span className="w-[42px] h-[42px] shrink-0 rounded-full bg-violet-100 flex items-center justify-center text-[20px]" aria-hidden>{emoji}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-ink text-[17px] font-black truncate">{name}</span>
        <span className="block text-ink-3 text-[13px] mt-px">{detail}</span>
      </span>
      <span className="flex flex-col items-end">
        <span className="text-violet-600 text-[18px] font-black tabular-nums">#{rank}</span>
        <span className="text-ink-3 text-[11px] font-bold">your rank</span>
      </span>
      <span className="text-ink-3 text-[22px] font-semibold ml-0.5" aria-hidden>›</span>
    </Link>
  );
}
