"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RankMove } from "@/components/fantasy/FantasyLeagues";
import { BackLink, card, FantasyShell, Spinner } from "@/components/fantasy/FantasyShell";
import type { teamHistory } from "@/lib/fantasy-db";
import { CHIPS, FANTASY_RULES, formatPrice } from "@/lib/fantasy";

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

  if (error) return <FantasyShell><BackLink /><p className="text-red-600 font-semibold">{error}</p></FantasyShell>;
  if (!data) return <FantasyShell><Spinner /></FantasyShell>;
  const weeks = [...data.weeks].reverse();

  return (
    <FantasyShell>
      <BackLink />
      <div>
        <h1 className="text-ink text-2xl sm:text-3xl font-black">{data.team.name}</h1>
        <p className="text-ink-2 text-sm font-semibold">{data.team.manager ? `${data.team.manager} · ` : ""}{data.team.totalPoints} points</p>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="text-ink-3 text-xs font-extrabold text-left">
            <tr><th className="pl-4 pr-2 pt-3 pb-2">GW</th><th className="text-right pt-3 pb-2">Pts</th><th className="text-right pt-3 pb-2">Total</th><th className="pl-4 pt-3 pb-2">Rank</th><th className="text-right pr-4 pt-3 pb-2">Transfers</th>{FANTASY_RULES.prices && <th className="text-right pr-4 pt-3 pb-2">Value</th>}</tr>
          </thead>
          <tbody>
            {weeks.map((w, i) => {
              const chip = w.chip ? CHIPS.find((c) => c.id === w.chip) : null;
              return (
                <tr key={w.number} className="border-t border-lilac-line">
                  <td className="pl-4 pr-2 py-3"><Link href={`/fantasy/gameweek/${w.number}${teamId ? `?teamId=${teamId}` : ""}`} className="text-violet-600 font-black hover:text-violet-700">{w.number}</Link> {chip && <span title={chip.name}>{chip.emoji}</span>}</td>
                  <td className="text-right text-ink font-black tabular-nums">{w.points ?? (w.status === "live" ? "Live" : "–")}</td>
                  <td className="text-right text-ink-2 font-bold tabular-nums">{w.overallPoints ?? "–"}</td>
                  <td className="pl-4"><span className="flex items-center gap-2">{w.overallRank !== null && <RankMove rank={w.overallRank} previous={weeks[i + 1]?.overallRank ?? null} />}<span className="text-ink-2 font-bold tabular-nums">{w.overallRank ?? "–"}</span></span></td>
                  <td className={`text-right pr-4 font-bold tabular-nums ${w.transferCost ? "text-red-600" : "text-ink-2"}`}>{w.transfersMade}{w.transferCost ? ` (−${w.transferCost})` : ""}</td>
                  {FANTASY_RULES.prices && <td className="text-right pr-4 text-ink-2 font-bold tabular-nums">{formatPrice(w.value)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        {weeks.length === 0 && <p className="text-ink-3 text-sm text-center p-4 border-t border-lilac-line">No gameweeks played yet.</p>}
      </div>
    </FantasyShell>
  );
}
