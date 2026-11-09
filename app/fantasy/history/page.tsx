"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RankMove } from "@/components/fantasy/FantasyLeagues";
import { FantasyShell, panel, Spinner } from "@/components/fantasy/FantasyShell";
import type { teamHistory } from "@/lib/fantasy-db";
import { CHIPS, formatPrice } from "@/lib/fantasy";

type History = Awaited<ReturnType<typeof teamHistory>>;

/** A team's season gameweek by gameweek. */
export default function FantasyHistoryPage() {
  return <Suspense fallback={<FantasyShell><Spinner /></FantasyShell>}><HistoryView /></Suspense>;
}

function HistoryView() {
  const teamId = useSearchParams().get("teamId");
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/fantasy/history${teamId ? `?teamId=${teamId}` : ""}`)
      .then(async (r) => (r.ok ? setData(await r.json()) : setError((await r.json()).error ?? "Couldn't load the history.")));
  }, [teamId]);

  if (error) return <FantasyShell><p className="text-red-400">{error}</p><Link href="/fantasy" className="text-purple-400">← Fantasy</Link></FantasyShell>;
  if (!data) return <FantasyShell><Spinner /></FantasyShell>;
  const weeks = [...data.weeks].reverse();

  return (
    <FantasyShell>
      <Link href="/fantasy" className="text-purple-400 text-sm">← Fantasy</Link>
      <div>
        <h1 className="text-white text-2xl font-black">{data.team.name}</h1>
        <p className="text-zinc-400 text-sm">{data.team.manager ? `${data.team.manager} · ` : ""}{data.team.totalPoints} points</p>
      </div>
      <div className={`${panel} p-0 overflow-hidden`}>
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-zinc-500 text-left">
            <tr><th className="px-3 py-2">GW</th><th className="text-right">Pts</th><th className="text-right">Total</th><th className="pl-4">Rank</th><th className="text-right">Transfers</th><th className="text-right px-3">Value</th></tr>
          </thead>
          <tbody>
            {weeks.map((w, i) => {
              const chip = w.chip ? CHIPS.find((c) => c.id === w.chip) : null;
              return (
                <tr key={w.number} className="border-t border-zinc-800">
                  <td className="px-3 py-2"><Link href={`/fantasy/gameweek/${w.number}${teamId ? `?teamId=${teamId}` : ""}`} className="text-white font-black hover:underline">{w.number}</Link> {chip && <span title={chip.name}>{chip.emoji}</span>}</td>
                  <td className="text-right text-white font-black tabular-nums">{w.points ?? (w.status === "live" ? "Live" : "–")}</td>
                  <td className="text-right text-zinc-400 tabular-nums">{w.overallPoints ?? "–"}</td>
                  <td className="pl-4"><span className="flex items-center gap-2">{w.overallRank !== null && <RankMove rank={w.overallRank} previous={weeks[i + 1]?.overallRank ?? null} />}<span className="text-zinc-300 tabular-nums">{w.overallRank ?? "–"}</span></span></td>
                  <td className={`text-right tabular-nums ${w.transferCost ? "text-red-400" : "text-zinc-400"}`}>{w.transfersMade}{w.transferCost ? ` (−${w.transferCost})` : ""}</td>
                  <td className="text-right px-3 text-zinc-400 tabular-nums">{formatPrice(w.value)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {weeks.length === 0 && <p className="text-zinc-500 text-sm p-4">No gameweeks played yet.</p>}
      </div>
    </FantasyShell>
  );
}
