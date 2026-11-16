"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { FantasyPitch, type PitchSlot } from "@/components/fantasy/FantasyPitch";
import { FantasyShell, panel, Spinner, type FantasyOverview } from "@/components/fantasy/FantasyShell";
import { CHIPS, type Chip, type EntryScore, type GameweekStatus, type Pick } from "@/lib/fantasy";
import { lineupFromIds, slotPositions } from "@/lib/fantasy-lineup";

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
      {prev !== undefined ? <Link href={href(prev)} className="text-purple-400 font-bold">‹ GW{prev}</Link> : <span />}
      <h1 className="text-white text-2xl font-black">Gameweek {n}</h1>
      {next !== undefined ? <Link href={href(next)} className="text-purple-400 font-bold">GW{next} ›</Link> : <span />}
    </div>
  );

  if (error) return <FantasyShell>{nav}<p className="text-red-400">{error}</p><Link href="/fantasy" className="text-purple-400">← Fantasy</Link></FantasyShell>;
  if (!result || !overview) return <FantasyShell>{nav}<Spinner /></FantasyShell>;

  const { gameweek, team, entry, score, lines } = result;
  const live = gameweek.status === "live";
  const scored = new Map((score?.players ?? []).map((p) => [p.playerId, p]));
  const lineup = entry ? lineupFromIds(entry.picks.map((p) => p.playerId), players) : null;
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
      <Link href="/fantasy" className="text-purple-400 text-sm">← Fantasy</Link>
      {nav}
      <p className="text-zinc-400 text-sm text-center">{team.name}{team.manager ? ` · ${team.manager}` : ""}{matchLine ? ` — ${matchLine}` : ""}</p>

      <section className={`${panel} flex items-center`}>
        <div className="flex-1 text-center">
          <div className="text-white text-6xl font-black tabular-nums">{score?.total ?? "–"}</div>
          <div className="text-amber-400 text-xs font-black tracking-widest">{live ? "LIVE POINTS" : "FINAL POINTS"}</div>
        </div>
        <div className="border-l border-zinc-800 pl-6 pr-2 text-center space-y-2">
          <div><div className="text-white text-xl font-black">{result.average ?? "–"}</div><div className="text-zinc-500 text-xs">Average</div></div>
          <div><div className="text-white text-xl font-black">{result.highest ?? "–"}</div><div className="text-zinc-500 text-xs">Highest</div></div>
          <div><div className="text-white text-xl font-black">{result.gameweekRank ?? "–"}</div><div className="text-zinc-500 text-xs">GW rank</div></div>
        </div>
      </section>
      {live && <p className="text-zinc-400 text-sm text-center">Points update as match stats come in. Bonus points are provisional until the gameweek is final.</p>}
      {(chip || entry?.transferCost) ? (
        <p className="text-zinc-400 text-sm text-center">
          {[chip ? `${chip.emoji} ${chip.name} played` : null, entry?.transferCost ? `−${entry.transferCost} pts for transfers` : null].filter(Boolean).join(" · ")}
        </p>
      ) : null}

      {lineup ? <FantasyPitch slots={slots} /> : <p className="text-zinc-400">No team for this gameweek.</p>}

      {lineup && (
        <section className="space-y-2">
          <h2 className="text-white text-lg font-extrabold">Breakdown</h2>
          {lineup.slots.map((playerId) => {
            if (!playerId) return null;
            const s = scored.get(playerId);
            const l = lines[playerId] ?? [];
            const multiplier = s?.multiplier ?? 0;
            return (
              <div key={playerId} className={`${panel} py-3`}>
                <div className="flex justify-between items-center">
                  <span className="text-white font-bold">
                    {players.get(playerId)?.name ?? "Unknown"}
                    {playerId === score?.captainId && <span className="text-amber-400 text-sm ml-2">{multiplier === 3 ? "Triple captain" : "Captain"}</span>}
                  </span>
                  <span className={`text-lg font-black tabular-nums ${multiplier ? "text-white" : "text-zinc-500"}`}>{s ? s.points * Math.max(1, multiplier) * doubled : 0}</span>
                </div>
                {l.length ? l.map((line) => (
                  <div key={line.label} className="flex justify-between text-sm text-zinc-500">
                    <span>{line.label}</span>
                    <span className={line.points < 0 ? "text-red-400" : ""}>{line.points > 0 ? `+${line.points}` : line.points}</span>
                  </div>
                )) : <div className="text-sm text-zinc-500">{live ? "No stats yet" : "Didn't play"}</div>}
                {(multiplier > 1 || doubled > 1) && (
                  <div className="text-xs text-amber-400 font-bold mt-1">×{multiplier > 1 ? multiplier : 1}{doubled > 1 ? " ×2 Double Points" : ""}</div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </FantasyShell>
  );
}
