"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { LeagueTable, type LeagueRow } from "@/components/fantasy/FantasyLeagues";
import { FantasyShell, panel, Spinner } from "@/components/fantasy/FantasyShell";

interface Standings { league: { id: string; name: string; code: string; isMember: boolean }; lastGameweek: number | null; teams: LeagueRow[] }

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

  if (error) return <FantasyShell><p className="text-red-400">{error}</p><Link href="/fantasy" className="text-purple-400">← Fantasy</Link></FantasyShell>;
  if (!data) return <FantasyShell><Spinner /></FantasyShell>;

  const link = typeof window !== "undefined" ? `${window.location.origin}/fantasy/join/${data.league.code}` : "";
  async function leave() {
    if (!confirm(data!.teams.length === 1 ? "You're the last one in this league, so it will be deleted. Leave?" : "Leave this league? You can rejoin with the code.")) return;
    const res = await fetch(`/api/fantasy/leagues/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/fantasy");
  }

  return (
    <FantasyShell>
      <Link href="/fantasy" className="text-purple-400 text-sm">← Fantasy</Link>
      <h1 className="text-white text-2xl font-black">{data.league.name}</h1>
      <section className={`${panel} flex flex-wrap items-center gap-4`}>
        <div className="flex-1">
          <div className="text-zinc-500 text-xs font-bold">League code</div>
          <div className="text-white text-3xl font-black tracking-[0.3em]">{data.league.code}</div>
        </div>
        <button
          onClick={() => { navigator.clipboard.writeText(link).then(() => setCopied(true)); }}
          className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold"
        >
          {copied ? "Link copied" : "Copy invite link"}
        </button>
      </section>
      <p className="text-zinc-400 text-sm">{data.teams.length} team{data.teams.length === 1 ? "" : "s"}{data.lastGameweek ? ` · after gameweek ${data.lastGameweek}` : ""}</p>
      <LeagueTable rows={data.teams} lastGameweek={data.lastGameweek} />
      {data.league.isMember && <button onClick={leave} className="text-red-400 text-sm">Leave league</button>}
    </FantasyShell>
  );
}
