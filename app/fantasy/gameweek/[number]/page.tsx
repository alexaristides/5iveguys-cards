"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { AppShell, ErrorText, panel, Spinner } from "@/components/AppShell";
import { FantasyPitch, type PitchSlot } from "@/components/fantasy/FantasyPitch";
import { PlayerSheet } from "@/components/fantasy/PlayerSheet";
import type { FantasyOverview } from "@/components/fantasy/types";
import { CHIPS, type Chip, type EntryScore, type GameweekStatus, type Pick } from "@/lib/fantasy";
import { lineupFromPicks, slotPositions } from "@/lib/fantasy-lineup";

/** GET /api/fantasy/gameweeks/[number]. */
interface GameweekResult {
  gameweek: { number: number; name: string | null; deadline: string; status: GameweekStatus; goalsFor: number | null; goalsAgainst: number | null };
  team: { id: string; name: string; manager: string | null };
  entry: { picks: Pick[]; captainId: string; viceCaptainId: string; chip: Chip | null; transferCost: number; transfersMade: number } | null;
  score: EntryScore | null;
  gameweekRank: number | null;
  lines: Record<string, { label: string; points: number }[]>;
  average: number | null;
  highest: number | null;
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status})`);
  return data as T;
}

/**
 * A team's points for one gameweek, as in the app (mobile/src/app/fantasy/gameweek/[number].tsx): who scored
 * what, the captain and chips. ?teamId= shows someone else's team; ?from=history sends Back to the history.
 */
export default function FantasyGameweekPage() {
  return (
    <Suspense fallback={<AppShell title="Points" back="/fantasy"><Spinner /></AppShell>}>
      <Gameweek />
    </Suspense>
  );
}

function Gameweek() {
  const { status } = useSession();
  const { number } = useParams<{ number: string }>();
  const search = useSearchParams();
  const teamId = search.get("teamId");
  const from = search.get("from");
  const n = Number(number);
  const [result, setResult] = useState<GameweekResult | null>(null);
  const [overview, setOverview] = useState<FantasyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let live = true;
    setError(null);
    getJSON<GameweekResult>(`/api/fantasy/gameweeks/${n}${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""}`)
      .then((r) => live && setResult(r), (e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [status, n, teamId]);
  useEffect(() => {
    if (status !== "authenticated") return;
    getJSON<FantasyOverview>("/api/fantasy").then(setOverview, (e: Error) => setError(e.message));
  }, [status]);

  const players = useMemo(() => new Map((overview?.players ?? []).map((p) => [p.id, p])), [overview]);
  const started = (overview?.gameweeks ?? []).filter((g) => g.status !== "upcoming").map((g) => g.number);
  const prev = started.filter((g) => g < n).at(-1);
  const next = started.find((g) => g > n);

  const query = (extra: Record<string, string | null>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `?${s}` : "";
  };
  const href = (to: number) => `/fantasy/gameweek/${to}${query({ teamId, from })}`;
  const back = from === "history" ? `/fantasy/history${query({ teamId })}` : teamId ? "/leagues" : "/fantasy";

  const nav = (
    <div className="flex items-center justify-between mb-2.5">
      <NavArrow to={prev} href={prev !== undefined ? href(prev) : null} label={`‹ GW${prev ?? ""}`} aria="Previous gameweek" />
      <h2 className="text-ink text-[20px] leading-tight font-black">Gameweek {n}</h2>
      <NavArrow to={next} href={next !== undefined ? href(next) : null} label={`GW${next ?? ""} ›`} aria="Next gameweek" />
    </div>
  );

  // After ‹ or ›, the spinner shows until that gameweek's numbers arrive, as in the app.
  const data = result?.gameweek.number === n ? result : null;
  if (!data || !overview) {
    return (
      <AppShell title="Points" back={back}>
        <div>
          {nav}
          {error ? <ErrorText>{error}</ErrorText> : <Spinner />}
        </div>
      </AppShell>
    );
  }

  const { gameweek, team, entry, score, lines } = data;
  const live = gameweek.status === "live";
  const scored = new Map((score?.players ?? []).map((p) => [p.playerId, p]));
  const lineup = entry ? lineupFromPicks(entry.picks, players) : null;
  const chip = entry?.chip ? CHIPS.find((c) => c.id === entry.chip) : null;
  const doubled = entry?.chip === "double_points" ? 2 : 1;
  const result90 = gameweek.goalsFor !== null && gameweek.goalsAgainst !== null
    ? `5ive Guys ${gameweek.goalsFor}–${gameweek.goalsAgainst}${gameweek.name ? ` ${gameweek.name}` : ""}`
    : gameweek.name;

  const slots: PitchSlot[] = lineup
    ? slotPositions(lineup.formation).map((position, i) => {
        const id = lineup.slots[i];
        const p = players.get(id ?? "") ?? null;
        const s = id ? scored.get(id) : undefined;
        return {
          key: `s${i}`, position, player: p,
          caption: s ? String(s.points * Math.max(1, s.multiplier) * doubled) : "0",
          badge: id === score?.captainId ? "C" : null,
          dim: !s || s.multiplier === 0,
          onPress: p ? () => setSheet(p.id) : undefined,
        };
      })
    : [];

  return (
    <AppShell title="Points" back={back}>
      <div>
        {nav}
        <p className="text-ink-2 text-sm font-semibold text-center">{team.name}{teamId && team.manager ? ` · ${team.manager}` : ""}</p>
        {result90 ? <p className="text-ink-3 text-[13px] text-center mt-0.5 mb-2.5">{result90}</p> : null}

        <section className={`${panel} py-[18px] mt-1.5 flex items-center`}>
          <div className="flex-1 flex flex-col items-center">
            <span className="text-violet-600 text-[56px] leading-[1.2] font-black tabular-nums">{score?.total ?? "–"}</span>
            <span className="text-ink-3 text-xs font-black tracking-[1px]">{live ? "POINTS SO FAR" : "FINAL POINTS"}</span>
          </div>
          <div className="flex flex-col gap-2 pl-[18px] pr-1.5 border-l border-lilac-line">
            <Side label="Average" value={data.average} />
            <Side label="Highest" value={data.highest} />
            <Side label="Your rank" value={data.gameweekRank} />
          </div>
        </section>
        {live && <p className={note}>Points update as the match stats come in. Bonus points are provisional until the gameweek is final.</p>}
        {(chip || entry?.transferCost) ? (
          <p className={`${note} whitespace-pre-wrap`}>
            {[chip ? `${chip.emoji} ${chip.name} played` : null, entry?.transferCost ? `−${entry.transferCost} pts for transfers` : null]
              .filter(Boolean).join("  ·  ")}
          </p>
        ) : null}

        {lineup ? (
          <div className="mt-3"><FantasyPitch slots={slots} /></div>
        ) : (
          <p className={note}>No team for this gameweek.</p>
        )}

        {lineup && <h3 className="text-ink text-[20px] font-extrabold mt-6 mb-2.5">Who scored what</h3>}
        <div className="flex flex-col gap-2">
          {lineup?.slots.map((id) => {
            if (!id) return null;
            const s = scored.get(id);
            const rows = lines[id] ?? [];
            const multiplier = s?.multiplier ?? 0;
            return (
              <div key={id} className={`${panel} py-3`}>
                <div className="flex justify-between items-center gap-2 mb-1">
                  <span className="shrink min-w-0 text-ink text-base font-extrabold whitespace-pre-wrap">
                    {players.get(id)?.name ?? "Unknown"}
                    {id === score?.captainId ? (multiplier === 3 ? "  ·  Triple captain" : "  ·  Captain") : ""}
                  </span>
                  <span className={`text-[18px] font-black tabular-nums ${multiplier ? "text-ink" : "text-ink-3"}`}>
                    {s ? s.points * Math.max(1, multiplier) * doubled : 0}
                  </span>
                </div>
                {rows.length ? rows.map((l) => (
                  <div key={l.label} className="flex justify-between py-0.5 text-[13px]">
                    <span className="text-ink-3">{l.label}</span>
                    <span className={l.points < 0 ? "text-red-600" : "text-ink-2"}>{l.points > 0 ? `+${l.points}` : l.points}</span>
                  </div>
                )) : <p className="text-ink-3 text-[13px]">{live ? "No stats yet" : "Didn't play"}</p>}
                {multiplier > 1 || doubled > 1 ? (
                  <p className="text-amber-700 text-xs font-extrabold mt-1">
                    ×{multiplier > 1 ? multiplier : 1}{doubled > 1 ? " ×2 Double Points" : ""}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      {sheet && <PlayerSheet playerId={sheet} onClose={() => setSheet(null)} />}
    </AppShell>
  );
}

const note = "text-ink-2 text-[13px] leading-[18px] text-center mt-2.5";

function NavArrow({ to, href, label, aria }: { to: number | undefined; href: string | null; label: string; aria: string }) {
  const cls = "min-w-16 text-violet-600 text-[15px] font-extrabold";
  return to !== undefined && href ? (
    <Link href={href} replace aria-label={aria} className={`${cls} hover:text-violet-700`}>{label}</Link>
  ) : (
    <span aria-hidden className={`${cls} opacity-25`}>{label}</span>
  );
}

function Side({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-ink text-[18px] leading-tight font-black tabular-nums">{value ?? "–"}</span>
      <span className="text-ink-3 text-[11px] font-semibold">{label}</span>
    </div>
  );
}
