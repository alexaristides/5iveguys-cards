"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { FantasyPitch, type PitchSlot } from "@/components/fantasy/FantasyPitch";
import { LeagueForms, LeagueTable, RankMove, type LeagueRow } from "@/components/fantasy/FantasyLeagues";
import { FantasyShell, panel, Spinner, type FantasyOverview } from "@/components/fantasy/FantasyShell";
import { CHIPS, FANTASY_RULES, formatCountdown, formatDeadline, formatPrice } from "@/lib/fantasy";
import { fantasyGuide } from "@/lib/fantasy-guide";
import { lineupFromIds, slotPositions } from "@/lib/fantasy-lineup";

interface Leaderboard { teams: LeagueRow[]; me: LeagueRow | null; teamCount: number; lastGameweek: number | null }
interface MyLeague { id: string; name: string; code: string; members: number; rank: number }
interface GameweekPoints { gameweek: { number: number; status: string }; score: { total: number } | null; average: number | null; highest: number | null; gameweekRank: number | null }

/** Fantasy Div 1 on the website: this gameweek's points, your rank, the deadline, your 7 and the leagues. */
export default function FantasyPage() {
  const { status } = useSession();
  const [data, setData] = useState<FantasyOverview | null>(null);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [leagues, setLeagues] = useState<MyLeague[] | null>(null);
  const [points, setPoints] = useState<GameweekPoints | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const [o, b] = await Promise.all([
      fetch("/api/fantasy").then((r) => r.json()) as Promise<FantasyOverview>,
      fetch("/api/fantasy/leaderboard?limit=20").then((r) => r.json()),
    ]);
    setData(o);
    setBoard(b);
    if (o.team) {
      fetch("/api/fantasy/leagues").then((r) => (r.ok ? r.json() : { leagues: [] })).then((l) => setLeagues(l.leagues));
      if (o.currentGameweek) {
        fetch(`/api/fantasy/gameweeks/${o.currentGameweek}`).then((r) => (r.ok ? r.json() : null)).then((g) => setPoints(g?.entry ? g : null));
      }
    }
  }, []);

  useEffect(() => { if (status !== "loading") load(); }, [status, load]);
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const players = useMemo(() => new Map((data?.players ?? []).map((p) => [p.id, p])), [data]);

  if (!data) return <FantasyShell><Spinner /></FantasyShell>;

  if (!data.season) {
    return (
      <FantasyShell>
        <section className={`${panel} space-y-3`}>
          <h1 className="text-white text-2xl font-black">Fantasy Div 1 — kicking off soon ⚽</h1>
          <p className="text-zinc-400">
            When the 5ive Guys&apos; Division 1 season starts you&apos;ll pick 7 of the real players and score points from every match.
          </p>
        </section>
      </FantasyShell>
    );
  }

  const team = data.team;
  const next = data.gameweeks.find((g) => g.number === data.nextGameweek);
  const draft = team?.draft;
  const lineup = draft ? lineupFromIds(draft.picks.map((p) => p.playerId), players) : null;
  const chip = draft?.chip ? CHIPS.find((c) => c.id === draft.chip) : null;
  const slots: PitchSlot[] = lineup
    ? slotPositions(lineup.formation).map((position, i) => {
        const p = players.get(lineup.slots[i] ?? "") ?? null;
        return {
          key: `s${i}`, position, player: p,
          caption: p ? (p.lastPoints !== null ? `${p.lastPoints} pts` : formatPrice(p.price)) : undefined,
          badge: p?.id === draft?.captainId ? "C" : p?.id === draft?.viceCaptainId ? "V" : null,
        };
      })
    : [];

  return (
    <FantasyShell>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-white text-3xl font-black">Fantasy Div 1</h1>
          <p className="text-zinc-500 text-sm">{data.season.name}</p>
        </div>
        <a href="#rules" className="text-purple-400 text-sm font-semibold">How it works</a>
      </div>

      {team ? (
        <section className={`${panel} space-y-4`}>
          <h2 className="text-white text-xl font-black">{team.name}</h2>
          {points && (
            <Link href={`/fantasy/gameweek/${points.gameweek.number}`} className="flex items-center rounded-xl bg-purple-900/30 border border-purple-700 p-4 hover:border-purple-500">
              <div className="flex-1 text-center">
                <div className="text-amber-400 text-xs font-black tracking-widest">GAMEWEEK {points.gameweek.number}{points.gameweek.status === "live" ? " · LIVE" : ""}</div>
                <div className="text-white text-5xl font-black tabular-nums">{points.score?.total ?? 0}</div>
                <div className="text-purple-400 text-sm font-bold">Points ›</div>
              </div>
              <div className="border-l border-zinc-700 pl-5 space-y-1 text-center">
                <Mini label="Average" value={points.average} />
                <Mini label="Highest" value={points.highest} />
                <Mini label="GW rank" value={points.gameweekRank} />
              </div>
            </Link>
          )}
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat value={String(team.totalPoints)} label="Total points" />
            <div className="rounded-xl bg-zinc-800 py-3">
              <div className="flex items-center justify-center gap-2"><RankMove rank={team.rank} previous={team.previousRank} /><span className="text-white text-2xl font-black tabular-nums">{team.rank}</span></div>
              <div className="text-zinc-500 text-xs">of {team.teamCount} overall</div>
            </div>
            <Stat value={team.value !== null ? formatPrice(team.value) : "–"} label="Team value" />
          </div>
          <Link href="/fantasy/history" className="block text-center text-purple-400 text-sm font-semibold">Points history ›</Link>
        </section>
      ) : (
        <section className={`${panel} space-y-2`}>
          <h2 className="text-white text-xl font-black">Play along this season</h2>
          <p className="text-zinc-400">
            Pick {FANTASY_RULES.squadSize} of the 5ive Guys with {formatPrice(data.season.budget)}. Captain, transfers, price changes and chips, just like
            Fantasy Premier League — and the points come from their real Division 1 matches.
          </p>
        </section>
      )}

      {next ? (
        <section className={`${panel} flex items-center gap-4`}>
          <div className="flex-1">
            <div className="text-white font-bold">Gameweek {next.number}{next.name ? ` · ${next.name}` : ""}</div>
            <div className="text-zinc-400 text-sm">Deadline {formatDeadline(next.deadline)}</div>
            {team && (
              <div className="text-zinc-400 text-sm">
                {[team.freeTransfers === null ? "Unlimited transfers" : `${team.freeTransfers} free transfer${team.freeTransfers === 1 ? "" : "s"}`,
                  draft ? `${formatPrice(draft.bank)} in the bank` : null, chip ? `${chip.name} on` : null].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
          <span className="rounded-lg bg-amber-400/15 text-amber-400 font-black tabular-nums px-3 py-1.5">
            {formatCountdown(new Date(next.deadline).getTime() - now)}
          </span>
        </section>
      ) : (
        <p className="text-zinc-500 text-center text-sm">No gameweek is open for picks right now — check back soon.</p>
      )}

      {next && (status === "authenticated" ? (
        <Link href="/fantasy/team" className="block text-center rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold py-3">
          {team ? "Transfers & captain" : "Pick your team"}
        </Link>
      ) : (
        <button onClick={() => signIn("google")} className="w-full rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold py-3">
          Sign in to pick your team
        </button>
      ))}

      {lineup && (
        <section className="space-y-3">
          <h2 className="text-white text-xl font-extrabold">{next ? `Your team for gameweek ${next.number}` : "Your team"}</h2>
          <FantasyPitch slots={slots} />
        </section>
      )}

      {team && (
        <section className="space-y-3">
          <h2 className="text-white text-xl font-extrabold">Your leagues</h2>
          {leagues && leagues.length > 0 && (
            <div className="space-y-2">
              {leagues.map((l) => (
                <Link key={l.id} href={`/fantasy/league/${l.id}`} className={`${panel} py-3 flex items-center justify-between hover:border-zinc-700`}>
                  <span><span className="text-white font-bold">{l.name}</span><span className="text-zinc-500 text-sm ml-2">{l.members} teams</span></span>
                  <span className="text-purple-400 font-black">#{l.rank} ›</span>
                </Link>
              ))}
            </div>
          )}
          <LeagueForms />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-white text-xl font-extrabold">Overall <span className="text-zinc-500 text-sm font-normal">{board?.teamCount ?? 0} teams</span></h2>
        {board && board.teams.length > 0 ? (
          <LeagueTable
            rows={[...board.teams, ...(board.me && !board.teams.some((t) => t.id === board.me!.id) ? [board.me] : [])]}
            lastGameweek={board.lastGameweek}
            meId={board.me?.id}
          />
        ) : <p className="text-zinc-500 text-sm">No teams yet — be the first.</p>}
      </section>

      <Rules budget={data.season.budget} secondHalfFrom={data.season.secondHalfFrom} />
    </FantasyShell>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-zinc-800 py-3">
      <div className="text-white text-2xl font-black tabular-nums">{value}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number | null }) {
  return <div><div className="text-white text-lg font-black tabular-nums">{value ?? "–"}</div><div className="text-zinc-500 text-[11px]">{label}</div></div>;
}

function Rules({ budget, secondHalfFrom }: { budget: number; secondHalfFrom: number | null }) {
  const guide = fantasyGuide({ budget, secondHalfFrom });
  return (
    <section id="rules" className={`${panel} space-y-4 text-sm`}>
      <h2 className="text-white text-xl font-extrabold">How it works</h2>
      <p className="text-zinc-400">Fantasy Premier League rules, made for 7-a-side.</p>
      {guide.sections.map((s) => (
        <div key={s.title} className="space-y-1">
          <h3 className="text-white font-bold">{s.title}</h3>
          <p className="text-zinc-400">{s.body}</p>
          {s.title === "Chips" && (
            <ul className="grid sm:grid-cols-2 gap-2 pt-1">
              {guide.chips.map((c) => (
                <li key={c.id} className="rounded-xl bg-zinc-800 p-3">
                  <div className="text-white font-bold">{c.emoji} {c.name}</div>
                  <div className="text-zinc-500">{c.description}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <h3 className="text-white font-bold">Scoring</h3>
      <table className="w-full">
        <tbody>
          {guide.scoring.map((s) => (
            <tr key={s.label} className="border-t border-zinc-800">
              <td className="py-1.5 text-zinc-300">{s.label}</td>
              <td className={`text-right font-black ${s.points.startsWith("−") || s.points.startsWith("-") ? "text-red-400" : "text-green-400"}`}>{s.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
