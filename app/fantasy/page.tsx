"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { FantasyPitch, type PitchSlot } from "@/components/fantasy/FantasyPitch";
import { LeagueForms, LeagueTable, RankMove, type LeagueRow } from "@/components/fantasy/FantasyLeagues";
import {
  card, FantasyShell, Hero, heroButton, panel, SectionTitle, Spinner, type FantasyOverview,
} from "@/components/fantasy/FantasyShell";
import { CHIPS, FANTASY_RULES, formatCountdown, formatDeadline, formatPrice } from "@/lib/fantasy";
import { fantasyGuide } from "@/lib/fantasy-guide";
import { lineupFromPicks, slotPositions } from "@/lib/fantasy-lineup";

interface Leaderboard { teams: LeagueRow[]; me: LeagueRow | null; teamCount: number; lastGameweek: number | null }
interface MyLeague { id: string; name: string; code: string; members: number; rank: number }
interface GameweekPoints { gameweek: { number: number; status: string }; score: { total: number } | null; average: number | null; highest: number | null; gameweekRank: number | null }
type Gameweek = FantasyOverview["gameweeks"][number];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

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
        <Title />
        <Hero eyebrow="COMING SOON" title="Kicking off soon ⚽">
          When the 5ive Guys&apos; Division 1 season starts you&apos;ll pick 7 of the real players and score points from every match.
        </Hero>
      </FantasyShell>
    );
  }

  const team = data.team;
  const next = data.gameweeks.find((g) => g.number === data.nextGameweek);
  const draft = team?.draft;
  const lineup = draft ? lineupFromPicks(draft.picks, players) : null;
  const chip = draft?.chip ? CHIPS.find((c) => c.id === draft.chip) : null;
  const live = points?.gameweek.status === "live";
  const slots: PitchSlot[] = lineup
    ? slotPositions(lineup.formation).map((position, i) => {
        const p = players.get(lineup.slots[i] ?? "") ?? null;
        return {
          key: `s${i}`, position, player: p,
          caption: p ? (p.lastPoints !== null ? `${p.lastPoints} pts` : FANTASY_RULES.prices ? formatPrice(p.price) : undefined) : undefined,
          badge: p?.id === draft?.captainId ? "C" : p?.id === draft?.viceCaptainId ? "V" : null,
        };
      })
    : [];

  // The one thing to do: pick or change your team (sign in first).
  const action = !next ? null : status === "authenticated" ? (
    <Link href="/fantasy/team" className={heroButton}>{team ? "Change my team" : "Pick my team"}</Link>
  ) : (
    <button onClick={() => signIn("google")} className={heroButton}>Sign in to pick your team</button>
  );

  const nextCard = next ? (
    team ? (
      <Hero
        eyebrow={`GAMEWEEK ${next.number}${next.name ? ` · ${next.name.toUpperCase()}` : ""}`}
        title={draft ? "Your team is in ✓" : "Pick your team"}
        footer={<DeadlineLine gameweek={next} now={now} />}
        action={action}
      >
        {[
          "Make any changes before the deadline.",
          team.freeTransfers === null ? "Transfers are unlimited until then." : `You have ${plural(team.freeTransfers, "free transfer")}.`,
          FANTASY_RULES.prices && draft ? `${formatPrice(draft.bank)} in the bank.` : null,
          chip ? `${chip.emoji} ${chip.name} is on.` : null,
        ].filter(Boolean).join(" ")}
      </Hero>
    ) : (
      <Hero eyebrow={`GAMEWEEK ${next.number}`} title="Pick your team" footer={<DeadlineLine gameweek={next} now={now} />} action={action}>
        {FANTASY_RULES.prices
          ? `Pick ${FANTASY_RULES.squadSize} of the 5ive Guys with ${formatPrice(data.season.budget)}: captain, transfers, price changes and chips, just like Fantasy Premier League.`
          : `Choose any ${FANTASY_RULES.squadSize} of the 5ive Guys and play them anywhere: captain, transfers and chips, just like Fantasy Premier League.`}
        {" "}The points come from their real Division 1 matches. It&apos;s free and takes a minute.
      </Hero>
    )
  ) : (
    <div className={`${panel} text-center text-ink-2`}>No gameweek is open for picks right now. Check back soon.</div>
  );

  const pointsCard = points ? (
    <Link href={`/fantasy/gameweek/${points.gameweek.number}`} className={`${panel} flex items-center hover:shadow-[0_6px_18px_rgba(46,16,101,0.12)] transition-shadow`}>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-ink-3 text-xs font-black tracking-[0.07em]">GAMEWEEK {points.gameweek.number} POINTS</span>
          {live && <span className="rounded-md bg-red-600 text-white text-[11px] font-black px-1.5">LIVE</span>}
        </div>
        <div className="text-violet-600 text-[56px] leading-[62px] font-black tabular-nums">{points.score?.total ?? 0}</div>
        <div className="text-violet-600 text-sm font-extrabold">See who scored ›</div>
      </div>
      <div className="border-l border-lilac-line pl-4 sm:pl-6 pr-1 space-y-2 text-center">
        <Mini label="Average" value={points.average} />
        <Mini label="Highest" value={points.highest} />
        <Mini label="GW rank" value={points.gameweekRank} />
      </div>
    </Link>
  ) : null;

  return (
    <FantasyShell>
      <Title season={data.season.name} />

      {team && (
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-ink text-2xl font-black truncate">{team.name}</h2>
            <p className="text-ink-2 font-semibold">
              {plural(team.totalPoints, "point")} this season{FANTASY_RULES.prices && team.value !== null ? ` · team value ${formatPrice(team.value)}` : ""}
            </p>
          </div>
          <a href="#overall" className={`${card} px-4 py-2 text-center hover:shadow-[0_6px_18px_rgba(46,16,101,0.12)] transition-shadow`} aria-label={`Ranked ${team.rank} of ${team.teamCount}`}>
            <span className="flex items-center justify-center gap-1.5">
              <RankMove rank={team.rank} previous={team.previousRank} />
              <span className="text-ink text-xl font-black tabular-nums">#{team.rank}</span>
            </span>
            <span className="block text-ink-3 text-xs font-bold">of {team.teamCount}</span>
          </a>
        </div>
      )}

      {live ? <>{pointsCard}{nextCard}</> : <>{nextCard}{pointsCard}</>}

      {lineup && (
        <section className="space-y-3">
          <SectionTitle>{next ? `Your team for gameweek ${next.number}` : "Your team"}</SectionTitle>
          <p className="text-ink-2 text-sm -mt-1">C = captain (double points), V = vice-captain.</p>
          <FantasyPitch slots={slots} />
        </section>
      )}

      {team && (
        <Link href="/fantasy/history" className={`${card} flex items-center p-4 hover:shadow-[0_6px_18px_rgba(46,16,101,0.12)] transition-shadow`}>
          <span className="flex-1 text-ink font-extrabold">📈&nbsp; Your points, week by week</span>
          <span className="text-ink-3 text-2xl leading-none font-semibold">›</span>
        </Link>
      )}

      {team && (
        <section className="space-y-3">
          <SectionTitle>Your leagues</SectionTitle>
          {leagues && leagues.length > 0 && (
            <div className="space-y-2">
              {leagues.map((l) => (
                <LeagueLink key={l.id} href={`/fantasy/league/${l.id}`} emoji="⚽" name={l.name} detail={`${plural(l.members, "team")} · code ${l.code}`} rank={l.rank} />
              ))}
            </div>
          )}
          {leagues && leagues.length === 0 && <p className="text-ink-3 text-sm text-center">You&apos;re not in any private leagues yet.</p>}
          <LeagueForms />
        </section>
      )}

      <section id="overall" className="space-y-3 scroll-mt-20">
        <SectionTitle right={<span className="text-ink-3 text-sm font-semibold">{plural(board?.teamCount ?? 0, "team")}</span>}>Overall</SectionTitle>
        {board && board.teams.length > 0 ? (
          <LeagueTable
            rows={[...board.teams, ...(board.me && !board.teams.some((t) => t.id === board.me!.id) ? [board.me] : [])]}
            lastGameweek={board.lastGameweek}
            meId={board.me?.id}
          />
        ) : <p className="text-ink-3 text-sm">No teams yet — be the first.</p>}
      </section>

      <Rules budget={data.season.budget} secondHalfFrom={data.season.secondHalfFrom} />
    </FantasyShell>
  );
}

function Title({ season }: { season?: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h1 className="text-ink text-3xl sm:text-4xl font-black">Fantasy Div 1</h1>
        {season && <p className="text-ink-3 text-sm font-semibold">{season}</p>}
      </div>
      <a href="#rules" className="text-violet-600 hover:text-violet-700 text-sm font-extrabold pb-1">How it works</a>
    </div>
  );
}

function DeadlineLine({ gameweek, now }: { gameweek: Gameweek; now: number }) {
  return (
    <div className="mt-1.5 flex items-center gap-2.5 rounded-2xl bg-white/15 px-3 py-2.5">
      <span className="flex-1 text-sm font-bold">⏰&nbsp; Deadline {formatDeadline(gameweek.deadline)}</span>
      <span className="rounded-[10px] bg-white text-pink-600 text-sm font-black tabular-nums px-2.5 py-1">
        {formatCountdown(new Date(gameweek.deadline).getTime() - now)}
      </span>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div className="text-ink text-xl font-black tabular-nums">{value ?? "–"}</div>
      <div className="text-ink-3 text-xs font-semibold">{label}</div>
    </div>
  );
}

function LeagueLink({ href, emoji, name, detail, rank }: { href: string; emoji: string; name: string; detail: string; rank: number }) {
  return (
    <Link href={href} className={`${card} flex items-center gap-3 px-4 py-3 hover:shadow-[0_6px_18px_rgba(46,16,101,0.12)] transition-shadow`}>
      <span className="w-[42px] h-[42px] shrink-0 rounded-full bg-violet-100 flex items-center justify-center text-xl" aria-hidden>{emoji}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-ink font-black truncate">{name}</span>
        <span className="block text-ink-3 text-sm">{detail}</span>
      </span>
      <span className="text-right">
        <span className="block text-violet-600 text-lg font-black tabular-nums">#{rank}</span>
        <span className="block text-ink-3 text-[11px] font-bold">your rank</span>
      </span>
      <span className="text-ink-3 text-2xl leading-none font-semibold">›</span>
    </Link>
  );
}

const STEPS = [
  { emoji: "👕", title: `Pick ${FANTASY_RULES.squadSize} players`, body: FANTASY_RULES.prices ? "Any of the 5ive Guys, within your budget." : "Any of the 5ive Guys. No prices, no budget." },
  { emoji: "⭐", title: "Choose a captain", body: "Your captain scores double points." },
  { emoji: "⚽", title: "Score points", body: "Goals, assists, clean sheets and more, from their real matches." },
  { emoji: "🏆", title: "Beat your mates", body: "Start a league and share the code." },
];

function Rules({ budget, secondHalfFrom }: { budget: number; secondHalfFrom: number | null }) {
  const guide = fantasyGuide({ budget, secondHalfFrom });
  const chips = guide.sections.find((s) => s.title === "Chips");
  return (
    <section id="rules" className="space-y-3 scroll-mt-20">
      <SectionTitle>How it works</SectionTitle>
      <p className="text-ink-2">Fantasy football for the 5ive Guys&apos; real Division 1 season, with Fantasy Premier League&apos;s rules made for 7-a-side.</p>
      <div className={`${panel} grid sm:grid-cols-2 gap-4`}>
        {STEPS.map((s, i) => (
          <div key={s.title} className="flex items-center gap-3.5">
            <span className="w-[46px] h-[46px] shrink-0 rounded-full bg-violet-100 flex items-center justify-center text-[22px]" aria-hidden>{s.emoji}</span>
            <div>
              <div className="text-ink font-black">{i + 1}. {s.title}</div>
              <div className="text-ink-2 text-sm">{s.body}</div>
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>Scoring</SectionTitle>
      <p className="text-ink-2">Your players score from what they do in each real match.</p>
      <div className={`${card} px-4 sm:px-5 py-1`}>
        <table className="w-full">
          <tbody>
            {guide.scoring.map((s, i) => (
              <tr key={s.label} className={i ? "border-t border-lilac-line" : ""}>
                <td className="py-2.5 pr-3 text-ink font-semibold">{s.label}</td>
                <td className={`py-2.5 text-right font-black ${s.points.startsWith("−") || s.points.startsWith("-") ? "text-red-600" : "text-green-600"}`}>{s.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle>The details</SectionTitle>
      <div className="grid sm:grid-cols-2 gap-2.5">
        {guide.sections.filter((s) => s !== chips).map((s) => (
          <Detail key={s.title} title={s.title}>{s.body}</Detail>
        ))}
      </div>

      {chips && (
        <>
          <SectionTitle>Chips</SectionTitle>
          <p className="text-ink-2">Optional power-ups. {chips.body}</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {guide.chips.map((c) => (
              <div key={c.id} className={`${panel} flex items-center gap-3.5`}>
                <span className="text-[28px]" aria-hidden>{c.emoji}</span>
                <div>
                  <div className="text-ink font-black">{c.name}</div>
                  <div className="text-ink-2 text-sm">{c.description}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Detail({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={`${panel} space-y-1`}>
      <h3 className="text-ink font-black">{title}</h3>
      <p className="text-ink-2 text-sm leading-relaxed">{children}</p>
    </div>
  );
}
