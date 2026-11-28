"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { AppShell, cardLink, ErrorText, Hero, heroButton, panel, SectionTitle, Spinner } from "@/components/AppShell";
import { RankMove } from "@/components/fantasy/FantasyLeagues";
import { FantasyPitch, type PitchSlot } from "@/components/fantasy/FantasyPitch";
import { HowItWorks } from "@/components/fantasy/HowItWorks";
import { PlayerSheet } from "@/components/fantasy/PlayerSheet";
import { StatHighlights } from "@/components/fantasy/StatHighlights";
import type { FantasyOverview } from "@/components/fantasy/types";
import { CHIPS, FANTASY_RULES, formatCountdown, formatDeadline, type GameweekStatus } from "@/lib/fantasy";
import { lineupFromPicks, slotPositions } from "@/lib/fantasy-lineup";
import type { FantasyStats } from "@/lib/fantasy-stats";

/** GET /api/fantasy/gameweeks/[number], the parts My Team shows. */
interface GameweekPoints {
  gameweek: { number: number; status: GameweekStatus };
  entry: object | null;
  score: { total: number } | null;
  average: number | null;
  highest: number | null;
}
type Gameweek = FantasyOverview["gameweeks"][number];

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status})`);
  return data as T;
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(iv);
  }, [intervalMs]);
  return now;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * My Team, as in the app (mobile/src/app/(tabs)/index.tsx): what to do next, this gameweek's points,
 * your 7 on the pitch and the season's stat leaders.
 */
export default function MyTeamPage() {
  const { status } = useSession();
  const [data, setData] = useState<FantasyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gameweek, setGameweek] = useState<GameweekPoints | null>(null);
  const [stats, setStats] = useState<FantasyStats | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const now = useNow(30_000);
  const current = data?.team ? data.currentGameweek : null;

  useEffect(() => {
    if (status !== "authenticated") return;
    getJSON<FantasyOverview>("/api/fantasy").then(setData, (e: Error) => setError(e.message));
    getJSON<FantasyStats>("/api/fantasy/stats").then(setStats, () => {});
  }, [status]);
  useEffect(() => {
    if (current === null) return;
    getJSON<GameweekPoints>(`/api/fantasy/gameweeks/${current}`).then(setGameweek, () => {});
  }, [current]);

  let body;
  if (!data) {
    body = error ? <ErrorText>{error}</ErrorText> : <Spinner />;
  } else if (!data.season) {
    body = (
      <>
        <Hero eyebrow="COMING SOON" title="Kicking off soon ⚽">
          When our season starts you&apos;ll pick 7 of our real players and score points from every match.
        </Hero>
        <HowItWorks />
      </>
    );
  } else if (!data.team) {
    body = <Welcome data={data} now={now} stats={stats} openPlayer={setSheet} />;
  } else {
    body = (
      <Home
        data={data}
        now={now}
        gameweek={gameweek?.gameweek.number === current ? gameweek : null}
        stats={stats}
        openPlayer={setSheet}
      />
    );
  }

  return (
    <AppShell title="My Team">
      {body}
      {sheet && <PlayerSheet playerId={sheet} onClose={() => setSheet(null)} />}
    </AppShell>
  );
}

/** No team yet: what the game is and one big button. */
function Welcome({ data, now, stats, openPlayer }: {
  data: FantasyOverview; now: number; stats: FantasyStats | null; openPlayer: (id: string) => void;
}) {
  const next = data.gameweeks.find((g) => g.number === data.nextGameweek);
  return (
    <>
      <Hero
        eyebrow={next ? `GAMEWEEK ${next.number}` : "FANTASY DIV 1"}
        title="Pick your team"
        action={next ? <Link href="/fantasy/team" className={heroButton}>Pick my team</Link> : undefined}
        footer={next ? <DeadlineLine gameweek={next} now={now} /> : undefined}
      >
        Choose any {FANTASY_RULES.squadSize} of the 5ive Guys and score points from our real Division 1 matches. It&apos;s free and takes a minute.
      </Hero>
      {!next && <p className={muted}>No gameweek is open for picks right now. Check back soon.</p>}
      <StatHighlights stats={stats} openPlayer={openPlayer} />
      <HowItWorks />
    </>
  );
}

function Home({ data, now, gameweek, stats, openPlayer }: {
  data: FantasyOverview; now: number; gameweek: GameweekPoints | null; stats: FantasyStats | null; openPlayer: (id: string) => void;
}) {
  const team = data.team!;
  const players = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players]);
  const next = data.gameweeks.find((g) => g.number === data.nextGameweek);
  const draft = team.draft;
  const chip = draft?.chip ? CHIPS.find((c) => c.id === draft.chip) : null;
  const live = gameweek?.gameweek.status === "live";

  const lineup = draft ? lineupFromPicks(draft.picks, players) : null;
  const slots: PitchSlot[] = lineup
    ? slotPositions(lineup.formation).map((position, i) => {
        const p = players.get(lineup.slots[i] ?? "") ?? null;
        return {
          key: `s${i}`, position, player: p,
          caption: p && p.lastPoints !== null ? `${p.lastPoints} pts` : undefined,
          badge: p?.id === draft?.captainId ? "C" : p?.id === draft?.viceCaptainId ? "V" : null,
          onPress: p ? () => openPlayer(p.id) : undefined,
        };
      })
    : [];

  const nextCard = next ? (
    <Hero
      eyebrow={`GAMEWEEK ${next.number}${next.name ? ` · ${next.name.toUpperCase()}` : ""}`}
      title={draft ? "Your team is in ✓" : "Pick your team"}
      action={<Link href="/fantasy/team" className={heroButton}>Change my team</Link>}
      footer={<DeadlineLine gameweek={next} now={now} />}
    >
      {[
        "Change players, formation or captain before the deadline.",
        team.freeTransfers === null ? "Changes are free until then." : `You have ${plural(team.freeTransfers, "free player change")}.`,
        chip ? `${chip.emoji} ${chip.name} is on.` : null,
      ].filter(Boolean).join(" ")}
    </Hero>
  ) : (
    <div className={panel}><p className={muted}>No gameweek is open for changes right now. Check back soon.</p></div>
  );

  const pointsCard = gameweek?.entry ? (
    <Link
      href={`/fantasy/gameweek/${gameweek.gameweek.number}`}
      aria-label={`Gameweek ${gameweek.gameweek.number} points`}
      className={`${cardLink} p-4 flex items-center`}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-ink-3 text-xs font-black tracking-[0.8px]">GAMEWEEK {gameweek.gameweek.number} POINTS</span>
          {live && <span className="rounded-md bg-red-600 px-1.5 py-px text-white text-[11px] font-black">LIVE</span>}
        </div>
        <div className="text-violet-600 text-[56px] leading-[62px] font-black tabular-nums">{gameweek.score?.total ?? 0}</div>
        <div className="text-violet-600 text-sm font-extrabold">See who scored ›</div>
      </div>
      <div className="flex flex-col gap-3 pl-4 pr-1 border-l border-lilac-line">
        <Mini label="Average" value={gameweek.average ?? "–"} />
        <Mini label="Highest" value={gameweek.highest ?? "–"} />
      </div>
    </Link>
  ) : null;

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-ink text-[24px] leading-tight font-black truncate">{team.name}</h2>
          <p className="text-ink-2 text-[15px] font-semibold mt-0.5">{plural(team.totalPoints, "point")} this season</p>
        </div>
        <Link
          href="/leagues"
          aria-label={`Ranked ${team.rank} of ${team.teamCount}`}
          className="shrink-0 rounded-2xl bg-white shadow-card px-3.5 py-2 flex flex-col items-center active:opacity-70 hover:shadow-[0_6px_18px_rgba(46,16,101,0.12)] transition"
        >
          <span className="flex items-center gap-1.5">
            <RankMove rank={team.rank} previous={team.previousRank} />
            <span className="text-ink text-[20px] leading-tight font-black tabular-nums">#{team.rank}</span>
          </span>
          <span className="text-ink-3 text-xs font-bold">of {team.teamCount}</span>
        </Link>
      </div>

      {live ? <>{pointsCard}{nextCard}</> : <>{nextCard}{pointsCard}</>}

      {lineup && (
        <>
          <SectionTitle
            right={next ? <Link href="/fantasy/team" className="shrink-0 whitespace-nowrap text-violet-600 hover:text-violet-700 text-[16px] font-extrabold">Edit team</Link> : null}
          >
            {next ? `Your team for gameweek ${next.number}` : "Your team"}
          </SectionTitle>
          <p className="!mt-2 text-ink-2 text-[13px]">
            C = captain (double points), V = vice-captain. Tap a player for their stats{next ? ", or Edit team to change players, formation or captain" : ""}.
          </p>
          <FantasyPitch slots={slots} />
        </>
      )}

      <StatHighlights stats={stats} openPlayer={openPlayer} />

      <Link
        href="/fantasy/history"
        className="flex items-center rounded-[18px] bg-white shadow-card p-4 active:opacity-70 hover:shadow-[0_6px_18px_rgba(46,16,101,0.12)] transition"
      >
        <span className="flex-1 text-ink text-base font-extrabold whitespace-pre">📈  Your points, week by week</span>
        <span className="text-ink-3 text-[22px] leading-none font-semibold" aria-hidden>›</span>
      </Link>
    </>
  );
}

const muted = "text-ink-2 text-[15px] leading-[21px] text-center";

function DeadlineLine({ gameweek, now }: { gameweek: Gameweek; now: number }) {
  return (
    <div className="!mt-3.5 flex items-center gap-2.5 rounded-[14px] bg-white/[0.16] px-3 py-[9px]">
      <span className="flex-1 text-white text-sm font-bold whitespace-pre-wrap">⏰  Deadline {formatDeadline(gameweek.deadline)}</span>
      <span className="rounded-[10px] bg-white px-2.5 py-[5px] text-pink-600 text-sm font-black tabular-nums">
        {formatCountdown(new Date(gameweek.deadline).getTime() - now)}
      </span>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-ink text-[20px] leading-tight font-black tabular-nums">{value}</span>
      <span className="text-ink-3 text-xs font-semibold">{label}</span>
    </div>
  );
}
