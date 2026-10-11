"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { FantasyPitch, type PitchSlot } from "@/components/fantasy/FantasyPitch";
import { FantasyShell, panel, Spinner, type FantasyOverview } from "@/components/fantasy/FantasyShell";
import { CHIPS, type Chip, type EntryScore, type GameweekStatus, type Pick } from "@/lib/fantasy";
import { lineupFromIds } from "@/lib/fantasy-lineup";

interface GameweekResult {
  gameweek: { number: number; name: string | null; deadline: string; status: GameweekStatus };
  team: { id: string; name: string; manager: string | null };
  entry: { picks: Pick[]; captainId: string; viceCaptainId: string; chip: Chip | null; transferCost: number } | null;
  score: EntryScore | null;
  lines: Record<string, { label: string; points: number }[]>;
  average: number | null;
  highest: number | null;
}

/** A team's points for one gameweek: who scored what, captaincy, auto-subs and chips. */
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
    fetch(`/api/fantasy/gameweeks/${number}${teamId ? `?teamId=${teamId}` : ""}`)
      .then(async (r) => (r.ok ? setResult(await r.json()) : setError((await r.json()).error ?? "Couldn't load that gameweek.")));
    fetch("/api/fantasy").then((r) => r.json()).then(setOverview);
  }, [number, teamId]);

  const players = useMemo(() => new Map((overview?.players ?? []).map((p) => [p.id, p])), [overview]);

  if (error) return <FantasyShell><p className="text-red-400">{error}</p><Link href="/fantasy" className="text-purple-400">← Fantasy</Link></FantasyShell>;
  if (!result || !overview) return <FantasyShell><Spinner /></FantasyShell>;

  const { gameweek, team, entry, score, lines } = result;
  const live = gameweek.status === "live";
  const scored = new Map((score?.players ?? []).map((p) => [p.playerId, p]));
  const lineup = entry ? lineupFromIds(entry.picks.map((p) => p.playerId), players) : null;
  const chip = entry?.chip ? CHIPS.find((c) => c.id === entry.chip) : null;
  const toSlot = (id: string | null, key: string): PitchSlot => {
    const p = players.get(id ?? "") ?? null;
    const s = id ? scored.get(id) : undefined;
    const counted = !!s && s.multiplier > 0;
    return {
      key, position: p?.position ?? null, player: p,
      caption: s ? `${s.subbedIn ? "↑ " : ""}${counted ? s.points * s.multiplier : s.points}` : undefined,
      badge: id === score?.captainId ? "C" : null,
      dim: !counted,
    };
  };

  return (
    <FantasyShell>
      <Link href="/fantasy" className="text-purple-400 text-sm">← Fantasy</Link>
      <div>
        <h1 className="text-white text-2xl font-black">Gameweek {gameweek.number}{gameweek.name ? ` · ${gameweek.name}` : ""}</h1>
        <p className="text-zinc-400 text-sm">{team.name}{team.manager ? ` · ${team.manager}` : ""}</p>
      </div>

      <section className={`${panel} flex items-center`}>
        <div className="flex-1 text-center">
          <div className="text-white text-6xl font-black tabular-nums">{score?.total ?? "–"}</div>
          <div className="text-amber-400 text-xs font-black tracking-widest">{live ? "LIVE POINTS" : "POINTS"}</div>
        </div>
        {result.average !== null && (
          <div className="border-l border-zinc-800 pl-6 pr-2 text-center space-y-2">
            <div><div className="text-white text-xl font-black">{result.average}</div><div className="text-zinc-500 text-xs">Average</div></div>
            <div><div className="text-white text-xl font-black">{result.highest}</div><div className="text-zinc-500 text-xs">Highest</div></div>
          </div>
        )}
      </section>
      {live && <p className="text-zinc-400 text-sm text-center">Points update as match stats come in.</p>}
      {(chip || entry?.transferCost) ? (
        <p className="text-zinc-400 text-sm text-center">
          {[chip ? `${chip.emoji} ${chip.name} played` : null, entry?.transferCost ? `-${entry.transferCost} pts for transfers` : null].filter(Boolean).join(" · ")}
        </p>
      ) : null}

      {lineup ? (
        <FantasyPitch starters={lineup.starters.map((id, i) => toSlot(id, `s${i}`))} bench={lineup.bench.map((id, i) => toSlot(id, `b${i}`))} />
      ) : <p className="text-zinc-400">No team for this gameweek.</p>}

      {score && score.autoSubs.length > 0 && (
        <p className="text-zinc-400 text-sm text-center">
          Auto-subs: {score.autoSubs.map((s) => `${players.get(s.in)?.name} on for ${players.get(s.out)?.name}`).join(", ")}
        </p>
      )}

      {entry && (
        <section className="space-y-2">
          <h2 className="text-white text-lg font-extrabold">Breakdown</h2>
          {entry.picks.map(({ playerId }) => {
            const s = scored.get(playerId);
            const l = lines[playerId] ?? [];
            return (
              <div key={playerId} className={`${panel} py-3`}>
                <div className="flex justify-between items-center">
                  <span className="text-white font-bold">
                    {players.get(playerId)?.name ?? "Unknown"}
                    {playerId === score?.captainId && <span className="text-amber-400 text-sm ml-2">{s?.multiplier === 3 ? "Triple captain" : "Captain"}</span>}
                  </span>
                  <span className={`text-lg font-black tabular-nums ${s?.multiplier ? "text-white" : "text-zinc-500"}`}>{s ? s.points * Math.max(1, s.multiplier) : 0}</span>
                </div>
                {l.length ? l.map((line) => (
                  <div key={line.label} className="flex justify-between text-sm text-zinc-500">
                    <span>{line.label}</span>
                    <span className={line.points < 0 ? "text-red-400" : ""}>{line.points > 0 ? `+${line.points}` : line.points}</span>
                  </div>
                )) : <div className="text-sm text-zinc-500">{live ? "No stats yet" : "Didn't play"}</div>}
                {s && s.multiplier === 0 && l.length > 0 && <div className="text-xs text-zinc-500 italic mt-1">On the bench — didn&apos;t count</div>}
              </div>
            );
          })}
        </section>
      )}
    </FantasyShell>
  );
}
