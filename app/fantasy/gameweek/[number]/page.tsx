"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { FantasyPitch, type PitchSlot } from "@/components/fantasy/FantasyPitch";
import { BackLink, card, FantasyShell, panel, SectionTitle, Spinner, type FantasyOverview } from "@/components/fantasy/FantasyShell";
import { CHIPS, type Chip, type EntryScore, type GameweekStatus, type Pick } from "@/lib/fantasy";
import { lineupFromPicks, slotPositions } from "@/lib/fantasy-lineup";

interface GameweekResult {
  gameweek: { number: number; name: string | null; deadline: string; status: GameweekStatus; goalsFor: number | null; goalsAgainst: number | null };
  team: { id: string; name: string; manager: string | null };
  entry: { picks: Pick[]; captainId: string; viceCaptainId: string; chip: Chip | null; transferCost: number } | null;
  score: EntryScore | null;
  gameweekRank: number | null;
  lines: Record<string, { label: string; points: number }[]>;
  average: number | null;
  highest: number | null;
}

/** A team's points for one gameweek: who scored what, the captain and chips. */
export default function FantasyGameweekPage() {
  return <Suspense fallback={<FantasyShell><Spinner /></FantasyShell>}><Gameweek /></Suspense>;
}

function Gameweek() {
  const { number } = useParams<{ number: string }>();
  const teamId = useSearchParams().get("teamId");
  const [result, setResult] = useState<GameweekResult | null>(null);
  const [overview, setOverview] = useState<FantasyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResult(null);
    setError(null);
    fetch(`/api/fantasy/gameweeks/${number}${teamId ? `?teamId=${teamId}` : ""}`)
      .then(async (r) => (r.ok ? setResult(await r.json()) : setError((await r.json()).error ?? "Couldn't load that gameweek.")));
  }, [number, teamId]);
  useEffect(() => { fetch("/api/fantasy").then((r) => r.json()).then(setOverview); }, []);

  const players = useMemo(() => new Map((overview?.players ?? []).map((p) => [p.id, p])), [overview]);
  const started = (overview?.gameweeks ?? []).filter((g) => g.status !== "upcoming").map((g) => g.number);
  const n = Number(number);
  const prev = started.filter((g) => g < n).at(-1);
  const next = started.find((g) => g > n);
  const href = (to: number) => `/fantasy/gameweek/${to}${teamId ? `?teamId=${teamId}` : ""}`;

  const nav = (
    <div className="flex items-center justify-between">
      {prev !== undefined ? <Link href={href(prev)} className="min-w-16 text-violet-600 hover:text-violet-700 font-extrabold">‹ GW{prev}</Link> : <span className="min-w-16" />}
      <h1 className="text-ink text-2xl sm:text-3xl font-black">Gameweek {n}</h1>
      {next !== undefined ? <Link href={href(next)} className="min-w-16 text-right text-violet-600 hover:text-violet-700 font-extrabold">GW{next} ›</Link> : <span className="min-w-16" />}
    </div>
  );

  if (error) return <FantasyShell><BackLink />{nav}<p className="text-red-600 font-semibold">{error}</p></FantasyShell>;
  if (!result || !overview) return <FantasyShell>{nav}<Spinner /></FantasyShell>;

  const { gameweek, team, entry, score, lines } = result;
  const live = gameweek.status === "live";
  const scored = new Map((score?.players ?? []).map((p) => [p.playerId, p]));
  const lineup = entry ? lineupFromPicks(entry.picks, players) : null;
  const chip = entry?.chip ? CHIPS.find((c) => c.id === entry.chip) : null;
  const doubled = entry?.chip === "double_points" ? 2 : 1;
  const matchLine = gameweek.goalsFor !== null && gameweek.goalsAgainst !== null
    ? `5ive Guys ${gameweek.goalsFor}–${gameweek.goalsAgainst}${gameweek.name ? ` ${gameweek.name}` : ""}` : gameweek.name;
  const slots: PitchSlot[] = lineup
    ? slotPositions(lineup.formation).map((position, i) => {
        const id = lineup.slots[i];
        const p = players.get(id ?? "") ?? null;
        const s = id ? scored.get(id) : undefined;
        return {
          key: `s${i}`, position, player: p,
          caption: String(s ? s.points * Math.max(1, s.multiplier) * doubled : 0),
          badge: id === score?.captainId ? "C" : null,
          dim: !s || s.multiplier === 0,
        };
      })
    : [];

  return (
    <FantasyShell>
      <BackLink />
      {nav}
      <div className="text-center -mt-2">
        <p className="text-ink-2 text-sm font-semibold">{team.name}{team.manager ? ` · ${team.manager}` : ""}</p>
        {matchLine && <p className="text-ink-3 text-[13px]">{matchLine}</p>}
      </div>

      <section className={`${panel} flex items-center`}>
        <div className="flex-1 text-center">
          <div className="text-violet-600 text-[56px] sm:text-6xl leading-none font-black tabular-nums">{score?.total ?? "–"}</div>
          <div className="mt-1 text-ink-3 text-xs font-black tracking-[0.08em]">{live ? "POINTS SO FAR" : "FINAL POINTS"}</div>
          {live && <span className="mt-1.5 inline-block rounded-md bg-red-600 text-white text-[11px] font-black px-1.5">LIVE</span>}
        </div>
        <div className="border-l border-lilac-line pl-5 sm:pl-6 pr-1 text-center space-y-2">
          <Side label="Average" value={result.average} />
          <Side label="Highest" value={result.highest} />
          <Side label="GW rank" value={result.gameweekRank} />
        </div>
      </section>
      {live && <p className="text-ink-2 text-sm text-center">Points update as match stats come in. Bonus points are provisional until the gameweek is final.</p>}
      {(chip || entry?.transferCost) ? (
        <p className="text-ink-2 text-sm text-center font-semibold">
          {[chip ? `${chip.emoji} ${chip.name} played` : null, entry?.transferCost ? `−${entry.transferCost} pts for transfers` : null].filter(Boolean).join(" · ")}
        </p>
      ) : null}

      {lineup ? <FantasyPitch slots={slots} /> : <p className={`${panel} text-ink-2 text-center`}>No team for this gameweek.</p>}

      {lineup && (
        <section className="space-y-2">
          <SectionTitle>Who scored what</SectionTitle>
          {lineup.slots.map((playerId) => {
            if (!playerId) return null;
            const s = scored.get(playerId);
            const l = lines[playerId] ?? [];
            const multiplier = s?.multiplier ?? 0;
            return (
              <div key={playerId} className={`${card} px-4 py-3`}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-ink font-extrabold">
                    {players.get(playerId)?.name ?? "Unknown"}
                    {playerId === score?.captainId && <span className="ml-2 rounded-md bg-yellow-400 text-[#111] text-[11px] font-black px-1.5 py-0.5 align-middle">{multiplier === 3 ? "TRIPLE CAPTAIN" : "CAPTAIN"}</span>}
                  </span>
                  <span className={`text-lg font-black tabular-nums ${multiplier ? "text-ink" : "text-ink-3"}`}>{s ? s.points * Math.max(1, multiplier) * doubled : 0}</span>
                </div>
                {l.length ? l.map((line) => (
                  <div key={line.label} className="flex justify-between text-[13px] text-ink-3 py-0.5">
                    <span>{line.label}</span>
                    <span className={`font-semibold ${line.points < 0 ? "text-red-600" : "text-ink-2"}`}>{line.points > 0 ? `+${line.points}` : line.points}</span>
                  </div>
                )) : <div className="text-[13px] text-ink-3">{live ? "No stats yet" : "Didn't play"}</div>}
                {(multiplier > 1 || doubled > 1) && (
                  <div className="text-xs text-amber-700 font-extrabold mt-1">×{multiplier > 1 ? multiplier : 1}{doubled > 1 ? " ×2 Double Points" : ""}</div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </FantasyShell>
  );
}

function Side({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div className="text-ink text-xl font-black tabular-nums">{value ?? "–"}</div>
      <div className="text-ink-3 text-xs font-semibold">{label}</div>
    </div>
  );
}
