"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import {
  AppShell, cardLink, Hero, heroButton, PageTitle, panel, SectionTitle, Spinner,
} from "@/components/AppShell";
import { FantasyPitch, type PitchSlot } from "@/components/fantasy/FantasyPitch";
import { RankMove } from "@/components/fantasy/FantasyLeagues";
import { Steps } from "@/components/fantasy/HowToPlay";
import type { FantasyOverview } from "@/components/fantasy/types";
import { CHIPS, FANTASY_RULES, formatCountdown, formatDeadline, formatPrice } from "@/lib/fantasy";
import { lineupFromPicks, slotPositions } from "@/lib/fantasy-lineup";

interface GameweekPoints { gameweek: { number: number; status: string }; score: { total: number } | null; average: number | null; highest: number | null; gameweekRank: number | null }
type Gameweek = FantasyOverview["gameweeks"][number];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** My Team, as in the app: what to do next, this gameweek's points and your 7 on the pitch. */
export default function MyTeamPage() {
  const { status } = useSession();
  const [data, setData] = useState<FantasyOverview | null>(null);
  const [points, setPoints] = useState<GameweekPoints | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status === "loading") return;
    fetch("/api/fantasy").then((r) => r.json()).then((o: FantasyOverview) => {
      setData(o);
      if (o.team && o.currentGameweek) {
        fetch(`/api/fantasy/gameweeks/${o.currentGameweek}`).then((r) => (r.ok ? r.json() : null)).then((g) => setPoints(g?.entry ? g : null));
      }
    });
  }, [status]);
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const players = useMemo(() => new Map((data?.players ?? []).map((p) => [p.id, p])), [data]);

  if (!data) return <AppShell><PageTitle title="My Team" /><Spinner /></AppShell>;

  if (!data.season) {
    return (
      <AppShell>
        <PageTitle title="My Team" />
        <Hero eyebrow="COMING SOON" title="Kicking off soon ⚽">
          When the 5ive Guys&apos; season starts you&apos;ll pick 7 of the real players and score points from every match.
        </Hero>
        <HowItWorksTitle />
        <Steps />
      </AppShell>
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

  if (!team) {
    return (
      <AppShell>
        <PageTitle title="My Team" sub={data.season.name} />
        {next ? (
          <Hero eyebrow={`GAMEWEEK ${next.number}`} title="Pick your team" footer={<DeadlineLine gameweek={next} now={now} />} action={action}>
            {FANTASY_RULES.prices
              ? `Pick ${FANTASY_RULES.squadSize} of the 5ive Guys with ${formatPrice(data.season.budget)} and score points from their real Division 1 matches.`
              : `Choose any ${FANTASY_RULES.squadSize} of the 5ive Guys and score points from their real Division 1 matches.`}
            {" "}It&apos;s free and takes a minute.
          </Hero>
        ) : (
          <Hero eyebrow="FANTASY DIV 1" title="Pick your team">
            Choose any {FANTASY_RULES.squadSize} of the 5ive Guys and score points from their real Division 1 matches.
          </Hero>
        )}
        {!next && <p className="text-ink-2 text-center">No gameweek is open for picks right now. Check back soon.</p>}
        <HowItWorksTitle />
        <Steps />
      </AppShell>
    );
  }

  const nextCard = next ? (
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
    <div className={`${panel} text-center text-ink-2`}>No gameweek is open for changes right now. Check back soon.</div>
  );

  const pointsCard = points ? (
    <Link href={`/fantasy/gameweek/${points.gameweek.number}`} className={`${cardLink} p-4 sm:p-5 flex items-center`}>
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
    <AppShell>
      <PageTitle title="My Team" sub={data.season.name} />

      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-ink text-2xl font-black truncate">{team.name}</h2>
          <p className="text-ink-2 font-semibold">
            {plural(team.totalPoints, "point")} this season{FANTASY_RULES.prices && team.value !== null ? ` · team value ${formatPrice(team.value)}` : ""}
          </p>
        </div>
        <Link href="/fantasy/league/overall" className={`${cardLink} px-4 py-2 text-center`} aria-label={`Ranked ${team.rank} of ${team.teamCount}`}>
          <span className="flex items-center justify-center gap-1.5">
            <RankMove rank={team.rank} previous={team.previousRank} />
            <span className="text-ink text-xl font-black tabular-nums">#{team.rank}</span>
          </span>
          <span className="block text-ink-3 text-xs font-bold">of {team.teamCount}</span>
        </Link>
      </div>

      {live ? <>{pointsCard}{nextCard}</> : <>{nextCard}{pointsCard}</>}

      {lineup && (
        <section className="space-y-3">
          <SectionTitle>{next ? `Your team for gameweek ${next.number}` : "Your team"}</SectionTitle>
          <p className="text-ink-2 text-sm -mt-1">C = captain (double points), V = vice-captain.</p>
          <FantasyPitch slots={slots} />
        </section>
      )}

      <Link href="/fantasy/history" className={`${cardLink} flex items-center p-4`}>
        <span className="flex-1 text-ink font-extrabold">📈&nbsp; Your points, week by week</span>
        <span className="text-ink-3 text-2xl leading-none font-semibold">›</span>
      </Link>
    </AppShell>
  );
}

function HowItWorksTitle() {
  return (
    <SectionTitle right={<Link href="/how-to-play" className="text-violet-600 hover:text-violet-700 text-sm font-extrabold">All the rules</Link>}>
      How it works
    </SectionTitle>
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

