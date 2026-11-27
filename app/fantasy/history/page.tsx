"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { AppShell, ErrorText, panel, Spinner } from "@/components/AppShell";
import { RankMove } from "@/components/fantasy/FantasyLeagues";
import type { teamHistory } from "@/lib/fantasy-db";
import { CHIPS, FANTASY_RULES, formatPrice } from "@/lib/fantasy";

type History = Awaited<ReturnType<typeof teamHistory>>;

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status})`);
  return data as T;
}

/** A team's season gameweek by gameweek, as in the app (mobile/src/app/fantasy/history.tsx): points, rank, transfers and chips. */
export default function FantasyHistoryPage() {
  return (
    <Suspense fallback={<AppShell title="History" back="/fantasy"><Spinner /></AppShell>}>
      <HistoryView />
    </Suspense>
  );
}

function HistoryView() {
  const { status } = useSession();
  const teamId = useSearchParams().get("teamId");
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    getJSON<History>(`/api/fantasy/history${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""}`)
      .then(setData, (e: Error) => setError(e.message));
  }, [status, teamId]);

  const gameweekHref = (number: number) => {
    const q = new URLSearchParams({ from: "history" });
    if (teamId) q.set("teamId", teamId);
    return `/fantasy/gameweek/${number}?${q}`;
  };

  return (
    <AppShell title="History" back={teamId ? "/leagues" : "/fantasy"}>
      {!data ? (error ? <ErrorText>{error}</ErrorText> : <Spinner />) : (
        <div>
          <p className="text-ink-2 text-sm font-semibold mb-2.5">{data.team.name}{data.team.manager ? ` · ${data.team.manager}` : ""}</p>
          <div className={`${panel} flex mb-4`}>
            <Summary label="Total points" value={String(data.team.totalPoints)} />
            <Summary label="Transfers" value={String(data.weeks.reduce((s, w) => s + w.transfersMade, 0))} />
            <Summary label="Hits" value={`−${data.weeks.reduce((s, w) => s + w.transferCost, 0)}`} />
          </div>

          <div className="flex px-3 mb-1.5 text-ink-3 text-[11px] font-extrabold">
            <span className="w-11">GW</span>
            <span className="w-[42px] text-right">Pts</span>
            <span className="w-[42px] text-right">Total</span>
            <span className="w-[70px] pl-2.5">Rank</span>
            <span className="w-[58px] text-right">TM</span>
            {FANTASY_RULES.prices && <span className="flex-1 text-right">Value</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            {[...data.weeks].reverse().map((w, i, all) => {
              const previous = all[i + 1]?.overallRank ?? null;
              const chip = w.chip ? CHIPS.find((c) => c.id === w.chip) : null;
              return (
                <Link
                  key={w.number}
                  href={gameweekHref(w.number)}
                  className="flex items-center rounded-xl bg-white border border-lilac-line px-3 py-[11px] active:opacity-70 hover:border-violet-300 transition"
                >
                  <span className="w-11 flex items-center gap-[3px]">
                    <span className={strong}>{w.number}</span>
                    {chip ? <span className="text-[11px]" title={chip.name}>{chip.emoji}</span> : null}
                  </span>
                  <span className={`${strong} w-[42px] text-right`}>{w.points ?? (w.status === "live" ? "Live" : "–")}</span>
                  <span className={`${cell} w-[42px] text-right`}>{w.overallPoints ?? "–"}</span>
                  <span className="w-[70px] pl-2.5 flex items-center gap-[5px]">
                    {w.overallRank !== null && <RankMove rank={w.overallRank} previous={previous} />}
                    <span className={cell}>{w.overallRank ?? "–"}</span>
                  </span>
                  <span className={`${cell} w-[58px] text-right ${w.transferCost ? "!text-red-600" : ""}`}>
                    {w.transfersMade}{w.transferCost ? ` (−${w.transferCost})` : ""}
                  </span>
                  {FANTASY_RULES.prices && <span className={`${cell} flex-1 text-right`}>{formatPrice(w.value)}</span>}
                </Link>
              );
            })}
          </div>
          {data.weeks.length === 0 && <p className={empty}>No gameweeks played yet.</p>}
          {data.weeks.some((w) => w.chip) && (
            <p className={empty}>
              Chips: {data.weeks.filter((w) => w.chip).map((w) => `${CHIPS.find((c) => c.id === w.chip)?.name} (GW${w.number})`).join(", ")}
            </p>
          )}
        </div>
      )}
    </AppShell>
  );
}

const cell = "text-ink-2 text-sm font-bold tabular-nums";
const strong = "text-ink text-[15px] font-black tabular-nums";
const empty = "text-ink-3 text-[13px] text-center mt-3.5";

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 flex flex-col items-center">
      <span className="text-ink text-[22px] leading-tight font-black tabular-nums">{value}</span>
      <span className="text-ink-3 text-[11px] font-semibold">{label}</span>
    </div>
  );
}
