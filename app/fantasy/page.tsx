"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { FantasyPitch, type PitchSlot } from "@/components/fantasy/FantasyPitch";
import { FantasyShell, panel, Spinner, type FantasyOverview } from "@/components/fantasy/FantasyShell";
import { CHIPS, FANTASY_POINTS, formatCountdown, formatDeadline, formatPrice } from "@/lib/fantasy";
import { lineupFromIds } from "@/lib/fantasy-lineup";

interface LeaderRow { rank: number; id: string; name: string; manager: string | null; totalPoints: number; lastPoints: number | null }
interface Leaderboard { teams: LeaderRow[]; me: LeaderRow | null; teamCount: number; lastGameweek: number | null }

/** Fantasy Div 1 on the website: your team, the next deadline, last week's points and the standings. */
export default function FantasyPage() {
  const { status } = useSession();
  const [data, setData] = useState<FantasyOverview | null>(null);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const [o, b] = await Promise.all([
      fetch("/api/fantasy").then((r) => r.json()),
      fetch("/api/fantasy/leaderboard?limit=20").then((r) => r.json()),
    ]);
    setData(o);
    setBoard(b);
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
            When the 5ive Guys start their Division 1 season you&apos;ll pick a team of the real players and score points from every match.
          </p>
        </section>
      </FantasyShell>
    );
  }

  const team = data.team;
  const next = data.gameweeks.find((g) => g.number === data.nextGameweek);
  const live = data.gameweeks.find((g) => g.status === "live");
  const draft = team?.draft;
  const lineup = draft ? lineupFromIds(draft.picks.map((p) => p.playerId), players) : null;
  const chip = draft?.chip ? CHIPS.find((c) => c.id === draft.chip) : null;
  const toSlot = (id: string | null, key: string): PitchSlot => {
    const p = players.get(id ?? "") ?? null;
    return {
      key, position: p?.position ?? null, player: p,
      caption: p ? (p.lastPoints !== null ? `${p.lastPoints} pts` : formatPrice(p.price)) : undefined,
      badge: id === draft?.captainId ? "C" : id === draft?.viceCaptainId ? "V" : null,
    };
  };

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
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat value={String(team.totalPoints)} label="Total points" />
            <Stat value={`#${team.rank}`} label={`of ${team.teamCount}`} />
            <Stat value={team.lastGameweek ? String(team.lastGameweek.points) : "–"} label={team.lastGameweek ? `Gameweek ${team.lastGameweek.number}` : "Last gameweek"} />
          </div>
        </section>
      ) : (
        <section className={`${panel} space-y-2`}>
          <h2 className="text-white text-xl font-black">Play along this season</h2>
          <p className="text-zinc-400">
            Pick 9 of the 5ive Guys with {formatPrice(data.season.budget)}. Captain, subs, transfers and chips — points come from their real Division 1 matches.
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
                {team.freeTransfers === null ? "Unlimited changes" : `${team.freeTransfers} free transfer${team.freeTransfers === 1 ? "" : "s"}`}
                {chip ? ` · ${chip.name} active` : ""}
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
          {team ? "Pick team & transfers" : "Pick your team"}
        </Link>
      ) : (
        <button onClick={() => signIn("google")} className="w-full rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold py-3">
          Sign in to pick your team
        </button>
      ))}

      {live && team && <LinkRow href={`/fantasy/gameweek/${live.number}`} label={`Gameweek ${live.number} is live`} detail="Live points" />}
      {team?.lastGameweek && (
        <LinkRow href={`/fantasy/gameweek/${team.lastGameweek.number}`} label={`Gameweek ${team.lastGameweek.number}`} detail={`${team.lastGameweek.points} pts`} />
      )}

      {lineup && (
        <section className="space-y-3">
          <h2 className="text-white text-xl font-extrabold">Your team</h2>
          <FantasyPitch starters={lineup.starters.map((id, i) => toSlot(id, `s${i}`))} bench={lineup.bench.map((id, i) => toSlot(id, `b${i}`))} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-white text-xl font-extrabold">Leaderboard <span className="text-zinc-500 text-sm font-normal">{board?.teamCount ?? 0} teams</span></h2>
        {board && board.teams.length > 0 ? (
          <div className="rounded-2xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-zinc-500 text-left">
                <tr><th className="px-3 py-2 w-10">#</th><th className="py-2">Team</th><th className="text-right py-2">GW</th><th className="text-right px-3 py-2">Total</th></tr>
              </thead>
              <tbody>
                {[...board.teams, ...(board.me && !board.teams.some((t) => t.id === board.me!.id) ? [board.me] : [])].map((t) => (
                  <tr key={t.id} className={`border-t border-zinc-800 ${t.id === board.me?.id ? "bg-purple-900/30" : ""}`}>
                    <td className={`px-3 py-2 font-black ${t.rank <= 3 ? "text-amber-400" : "text-zinc-400"}`}>{t.rank}</td>
                    <td className="py-2">
                      {board.lastGameweek ? (
                        <Link href={`/fantasy/gameweek/${board.lastGameweek}?teamId=${t.id}`} className="text-white font-bold hover:underline">{t.name}</Link>
                      ) : <span className="text-white font-bold">{t.name}</span>}
                      {t.manager && <span className="text-zinc-500 ml-2">{t.manager}</span>}
                    </td>
                    <td className="text-right text-zinc-400 tabular-nums">{t.lastPoints ?? "–"}</td>
                    <td className="text-right px-3 text-white font-black tabular-nums">{t.totalPoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-zinc-500 text-sm">No teams yet — be the first.</p>}
      </section>

      <Rules budget={data.season.budget} />
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

function LinkRow({ href, label, detail }: { href: string; label: string; detail: string }) {
  return (
    <Link href={href} className={`${panel} flex justify-between items-center hover:border-zinc-700 py-4`}>
      <span className="text-white font-bold">{label}</span>
      <span className="text-purple-400 font-extrabold">{detail} ›</span>
    </Link>
  );
}

const SCORING: [string, number][] = [
  ["Playing", FANTASY_POINTS.played], ["Goal", FANTASY_POINTS.goal], ["Assist", FANTASY_POINTS.assist],
  ["Hat-trick bonus", FANTASY_POINTS.hatTrick], ["Clean sheet (GK & DEF)", FANTASY_POINTS.cleanSheet],
  ["Penalty save", FANTASY_POINTS.penaltySave], ["Man of the Match", FANTASY_POINTS.motm], ["Yellow card", FANTASY_POINTS.yellowCard],
  ["Red card", FANTASY_POINTS.redCard], ["Own goal", FANTASY_POINTS.ownGoal], ["Penalty miss", FANTASY_POINTS.penaltyMiss],
];

function Rules({ budget }: { budget: number }) {
  return (
    <section id="rules" className={`${panel} space-y-4 text-sm`}>
      <h2 className="text-white text-xl font-extrabold">How it works</h2>
      <p className="text-zinc-400">
        Pick 9 players with a {formatPrice(budget)} budget: a starting 7 (1 keeper, at least 2 defenders, 1 midfielder and 1 forward) and 2 subs.
        Teams lock at each gameweek&apos;s deadline. Your captain scores double — your vice-captain takes over if they don&apos;t play — and subs come
        on automatically, in bench order, for starters who don&apos;t play.
      </p>
      <p className="text-zinc-400">
        Change your team freely before your first deadline. After that you get 1 free transfer a week (unused ones roll over, up to 2); each extra
        costs 4 points. Players keep the price you paid for them.
      </p>
      <ul className="grid sm:grid-cols-2 gap-2">
        {CHIPS.map((c) => (
          <li key={c.id} className="rounded-xl bg-zinc-800 p-3">
            <div className="text-white font-bold">{c.emoji} {c.name}</div>
            <div className="text-zinc-500">{c.description} Once a season.</div>
          </li>
        ))}
      </ul>
      <table className="w-full">
        <tbody>
          {SCORING.map(([label, pts]) => (
            <tr key={label} className="border-t border-zinc-800">
              <td className="py-1.5 text-zinc-300">{label}</td>
              <td className={`text-right font-black ${pts < 0 ? "text-red-400" : "text-green-400"}`}>{pts > 0 ? `+${pts}` : pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
