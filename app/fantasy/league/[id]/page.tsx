"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { LeagueTable, type LeagueRow } from "@/components/fantasy/FantasyLeagues";
import { BackLink, FantasyShell, primaryButton, Spinner } from "@/components/fantasy/FantasyShell";

interface Standings { league: { id: string; name: string; code: string; isMember: boolean }; lastGameweek: number | null; teamCount?: number; teams: LeagueRow[] }

/** A private league's table, with its invite code. */
export default function FantasyLeaguePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { status } = useSession();
  const [data, setData] = useState<Standings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/fantasy");
    if (status !== "authenticated") return;
    fetch(`/api/fantasy/leagues/${id}`).then(async (r) => (r.ok ? setData(await r.json()) : setError((await r.json()).error ?? "Couldn't load that league.")));
  }, [id, status, router]);

  if (error) return <FantasyShell><BackLink /><p className="text-red-600 font-semibold">{error}</p></FantasyShell>;
  if (!data) return <FantasyShell><Spinner /></FantasyShell>;

  const link = typeof window !== "undefined" ? `${window.location.origin}/fantasy/join/${data.league.code}` : "";
  async function leave() {
    if (!confirm((data!.teamCount ?? data!.teams.length) === 1 ? "You're the last one in this league, so it will be deleted. Leave?" : "Leave this league? You can rejoin with the code.")) return;
    const res = await fetch(`/api/fantasy/leagues/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/fantasy");
  }

  return (
    <FantasyShell>
      <BackLink />
      <h1 className="text-ink text-2xl sm:text-3xl font-black">{data.league.name}</h1>
      <section className="rounded-[20px] bg-violet-100 p-4 sm:p-5 flex flex-wrap items-center gap-4">
        <div className="flex-1">
          <div className="text-ink-3 text-xs font-bold">League code</div>
          <div className="text-violet-600 text-3xl font-black tracking-[0.2em]">{data.league.code}</div>
        </div>
        <button
          onClick={() => { navigator.clipboard.writeText(link).then(() => setCopied(true)); }}
          className={`${primaryButton} h-12 px-5`}
        >
          {copied ? "Link copied" : "Copy invite link"}
        </button>
      </section>
      <p className="text-ink-2 text-sm font-semibold">{data.teamCount ?? data.teams.length} team{(data.teamCount ?? data.teams.length) === 1 ? "" : "s"}{data.lastGameweek ? ` · after gameweek ${data.lastGameweek}` : ""}</p>
      <LeagueTable rows={data.teams} lastGameweek={data.lastGameweek} />
      {data.league.isMember && <button onClick={leave} className="text-red-600 hover:text-red-700 text-sm font-bold">Leave league</button>}
    </FantasyShell>
  );
}
