"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/**
 * League tables and the bits every league screen shares, as in the app
 * (mobile/src/components/fantasy/LeaderRow.tsx, mobile/src/lib/fantasy.ts, mobile/src/lib/api.ts).
 */

/** One team in a league table (GET /api/fantasy/leaderboard, /api/fantasy/leagues/[id]). */
export interface FantasyLeagueRow {
  rank: number;
  previousRank: number | null;
  id: string;
  name: string;
  manager: string | null;
  image?: string | null;
  totalPoints: number;
  lastPoints: number | null;
  mine?: boolean;
}

/** Green up, red down or grey level, from the rank a gameweek ago. */
export function RankMove({ rank, previous }: { rank: number; previous: number | null }) {
  if (previous === null) return <span className="inline-block w-4 shrink-0" />;
  const up = rank < previous, down = rank > previous;
  return (
    <span className={`inline-flex shrink-0 w-4 h-4 rounded-full items-center justify-center text-[8px] leading-none font-black text-white ${up ? "bg-green-600" : down ? "bg-red-600" : "bg-ink-3"}`}>
      {up ? "▲" : down ? "▼" : "•"}
    </span>
  );
}

/** One team in a league table; `href` makes it a link (the team's latest points). */
export function LeaderRow({ row, mine, href }: { row: FantasyLeagueRow; mine?: boolean; href?: string }) {
  const cls = `flex items-center gap-2 rounded-[14px] border-2 px-3 py-[11px] shadow-card leading-tight ${
    mine ? "border-violet-600 bg-violet-100" : "border-transparent bg-white"
  } ${href ? "hover:shadow-[0_6px_18px_rgba(46,16,101,0.12)] active:opacity-70 transition" : ""}`;
  const body = (
    <>
      <RankMove rank={row.rank} previous={row.previousRank} />
      <span className={`w-[26px] shrink-0 text-[15px] font-black ${row.rank <= 3 ? "text-amber-700" : "text-ink-2"}`}>{row.rank}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-ink text-[15px] font-extrabold truncate">{row.name}</span>
        {row.manager ? <span className="block text-ink-3 text-[12px] truncate">{row.manager}</span> : null}
      </span>
      <span className="w-[54px] shrink-0 text-right text-ink-2 text-[15px] font-bold tabular-nums">{row.lastPoints ?? "–"}</span>
      <span className="w-[54px] shrink-0 text-right text-ink text-[15px] font-black tabular-nums">{row.totalPoints}</span>
    </>
  );
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function LeaderHeader() {
  return (
    <div className="flex px-3 mb-1.5 text-ink-3 text-[12px] font-extrabold">
      <span className="w-[58px] shrink-0">Rank</span>
      <span className="flex-1">Team</span>
      <span className="w-[54px] shrink-0 text-right">Last GW</span>
      <span className="w-[54px] shrink-0 text-right">Total</span>
    </div>
  );
}

/** JSON request to the site's API, throwing the route's own error message (like the app's `api`). */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: opts.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status})`);
  return data as T;
}

/** What "Invite friends" shares: the code, and a link that also works without the app. */
export const inviteMessage = (league: { name: string; code: string }) =>
  `Join my Fantasy Div 1 league "${league.name}" on 5iveG — code ${league.code}\n${window.location.origin}/fantasy/join/${league.code}`;

/**
 * The app's Share sheet: the phone's share sheet where the browser has one, else the invite is copied
 * and `copied` is true for a couple of seconds.
 */
export function useShareInvite() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const share = useCallback(async (league: { name: string; code: string }) => {
    const text = inviteMessage(league);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return; // closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      window.prompt("Copy the invite:", text);
    }
  }, []);

  return { share, copied };
}

/** For sheets over the page: Escape closes, and the page behind doesn't scroll. */
export function useDismiss(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, []);
}
