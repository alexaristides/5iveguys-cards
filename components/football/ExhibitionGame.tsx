"use client";

import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import {
  type Formation, type FootballCard, type LineupSlot,
  buildSlots, slotsToLineup, calcTeamStats,
} from "@/lib/football";
import type { StatsMap } from "@/lib/card-rating";
import {
  simulateExhibition, EXHIBITION_POOL,
  type ExhibitionResult, type ExhibitionScorer, type PlayerMatchRating,
} from "@/lib/exhibition";
import {
  readExhibitionStats, recordExhibitionMatch, topPlayers,
  type ExhibitionStats, type MatchPlayerEntry, type PlayerStat,
} from "@/lib/exhibition-stats";
import type { MatchEvent } from "@/lib/football";
import FormationPitchSelector from "./FormationPitchSelector";
import MatchPitch from "./MatchPitch";

type Phase = "setup" | "playing" | "result";
type Side = "A" | "B";

const EVENT_ICON: Record<string, string> = {
  goal: "⚽", save: "🧤", miss: "💨", nearpost: "🔔", blunder: "🤡",
  freekick: "🎯", yellowcard: "🟨", redcard: "🟥", corner: "🚩",
  halftime: "⏸", fulltime: "🔔", counter: "⚡",
};
// Events worth showing in the post-match log (skips filler like throw-ins/possession).
const LOG_TYPES = new Set(Object.keys(EVENT_ICON));

interface ApiPlayer {
  id: string;
  name: string;
  kit: string | null;
  rarity: FootballCard["rarity"];
  imageUrl: string;
  attribute: string | null;
  position: string | null;
  channelName: string;
  channelSlug: string;
  voteCount: number;
  stats: StatsMap | null;
}

const RARITY_OVR: Record<string, string> = {
  common: "text-zinc-300", rare: "text-blue-300", epic: "text-purple-300", legendary: "text-amber-300",
};

interface TeamState {
  name: string;
  formation: Formation;
  lineup: LineupSlot[];
}

function freshTeam(name: string): TeamState {
  return { name, formation: "2-2-2", lineup: buildSlots("2-2-2") };
}

export default function ExhibitionGame() {
  const [pool, setPool] = useState<FootballCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Side>("A");
  const [teamA, setTeamA] = useState<TeamState>(() => freshTeam("Team A"));
  const [teamB, setTeamB] = useState<TeamState>(() => freshTeam("Team B"));
  const [phase, setPhase] = useState<Phase>("setup");
  const [result, setResult] = useState<ExhibitionResult | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [stats, setStats] = useState<ExhibitionStats>({ gamesPlayed: 0, players: {} });

  // ── Load the player pool (every card across the channels, with fan stats) ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/exhibition/players");
        if (!res.ok) throw new Error("bad status");
        const data = await res.json();
        const players = (data.players ?? []) as ApiPlayer[];
        const mapped: FootballCard[] = players.map((p) => ({
          id: p.id,
          name: p.name,
          rarity: p.rarity,
          attribute: (p.attribute ?? "Skill") as FootballCard["attribute"],
          imageUrl: p.imageUrl,
          kit: p.kit,
          stats: p.stats ?? undefined,
          ratingPosition: p.position ?? undefined,
        }));
        if (alive) setPool(mapped.length > 0 ? mapped : EXHIBITION_POOL);
      } catch {
        if (alive) setPool(EXHIBITION_POOL);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Load persisted all-time stats on mount (client only).
  useEffect(() => { setStats(readExhibitionStats()); }, []);

  const team = editing === "A" ? teamA : teamB;
  const setTeam = editing === "A" ? setTeamA : setTeamB;

  const setFormation = useCallback((f: Formation) => {
    setTeam((t) => ({ ...t, formation: f }));
  }, [setTeam]);
  const setLineup = useCallback((slots: LineupSlot[]) => {
    setTeam((t) => ({ ...t, lineup: slots }));
  }, [setTeam]);

  function statsFor(t: TeamState) {
    const assigned = slotsToLineup(t.lineup);
    const filled = assigned.length;
    const overall = filled > 0 ? Math.round(calcTeamStats(assigned).overall) : 0;
    return { filled, overall };
  }

  const aInfo = statsFor(teamA);
  const bInfo = statsFor(teamB);
  const ready = aInfo.filled === 7 && bInfo.filled === 7;

  function runMatch() {
    const a = slotsToLineup(teamA.lineup);
    const b = slotsToLineup(teamB.lineup);
    if (a.length < 7 || b.length < 7) return;
    const seed = nanoid();
    const res = simulateExhibition(a, b, teamA.formation, teamB.formation, seed);

    // Persist all-time stats from this match (strip the side prefix → real card id).
    const entries: MatchPlayerEntry[] = res.ratings.map((r) => ({
      id: r.cardId.replace(/^[AB]:/, ""),
      name: r.name, imageUrl: r.imageUrl, rarity: r.rarity,
      won: (r.side === "A" && res.winner === "A") || (r.side === "B" && res.winner === "B"),
      goals: r.goals,
    }));
    setStats(recordExhibitionMatch(entries));

    setResult(res);
    setShareCopied(false);
    setPhase("playing");
  }

  const handleKickOff = runMatch;
  const handleRematch = runMatch;

  function handleEditTeams() {
    setPhase("setup");
    setResult(null);
  }

  function handleShare() {
    if (!result) return;
    const winner =
      result.winner === "A" ? `${teamA.name} beat ${teamB.name}` :
      result.winner === "B" ? `${teamB.name} beat ${teamA.name}` :
      `${teamA.name} drew with ${teamB.name}`;
    const text = `Exhibition result: ${winner} ${result.aScore}–${result.bScore} on 5iveG Cards ⚽🃏`;
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(text).then(() => {
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
      });
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-7 h-7 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (pool.length < 7) {
    return (
      <div className="text-center py-16 text-zinc-500 max-w-sm mx-auto">
        <div className="text-5xl mb-4">⚽</div>
        <p className="font-semibold text-zinc-300 text-lg">No players available yet</p>
        <p className="text-sm mt-2">Once cards exist in the channels, you can build exhibition teams.</p>
      </div>
    );
  }

  // ── Playing (solo tape of the whole match) ──────────────────────────────────
  if (phase === "playing" && result) {
    return (
      <div className="w-full">
        <MatchPitch
          key={`exhibition-${result.frames.length}-${result.aScore}-${result.bScore}`}
          userLineup={result.aLineup}
          cpuLineup={result.bLineup}
          userLabel={teamA.name || "Team A"}
          cpuLabel={teamB.name || "Team B"}
          firstHalfFrames={[]}
          secondHalfFrames={null}
          soloFrames={result.frames}
          soloDurationSec={result.durationSec}
          onComplete={() => setPhase("result")}
        />
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setPhase("result")}
            className="rounded-xl border border-zinc-700 bg-zinc-900/60 px-5 py-2.5 text-sm font-bold text-zinc-300 transition hover:border-zinc-500"
          >
            Skip to result ⏭
          </button>
        </div>
      </div>
    );
  }

  // ── Result ──────────────────────────────────────────────────────────────────
  if (phase === "result" && result) {
    return (
      <ResultScreen
        result={result}
        stats={stats}
        nameA={teamA.name || "Team A"}
        nameB={teamB.name || "Team B"}
        onRematch={handleRematch}
        onEdit={handleEditTeams}
        onShare={handleShare}
        shareCopied={shareCopied}
      />
    );
  }

  // ── Setup ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-sm mx-auto">
      {/* Team toggle */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        {(["A", "B"] as Side[]).map((side) => {
          const t = side === "A" ? teamA : teamB;
          const info = side === "A" ? aInfo : bInfo;
          const active = editing === side;
          const accent = side === "A" ? "blue" : "red";
          return (
            <button
              key={side}
              onClick={() => setEditing(side)}
              className={`rounded-xl border p-2.5 text-left transition-all ${
                active
                  ? accent === "blue"
                    ? "border-blue-500 bg-blue-950/40"
                    : "border-red-500 bg-red-950/40"
                  : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${accent === "blue" ? "text-blue-400" : "text-red-400"}`}>
                  {side === "A" ? "Team A · Home" : "Team B · Away"}
                </span>
                <span className={`text-xs font-black ${info.filled === 7 ? "text-green-400" : "text-zinc-500"}`}>
                  {info.filled}/7
                </span>
              </div>
              <div className="mt-0.5 text-sm font-bold text-white truncate">{t.name || (side === "A" ? "Team A" : "Team B")}</div>
              <div className="text-[11px] text-zinc-500">{info.overall ? `${info.overall} OVR` : "—"}</div>
            </button>
          );
        })}
      </div>

      {/* Editable team name */}
      <input
        value={team.name}
        onChange={(e) => setTeam((t) => ({ ...t, name: e.target.value.slice(0, 20) }))}
        placeholder={editing === "A" ? "Team A" : "Team B"}
        className="mb-4 w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-sm font-semibold text-white placeholder:text-zinc-600 focus:border-green-600 focus:outline-none"
      />

      <p className="mb-3 text-center text-[11px] text-zinc-500">
        Pick any 7 players from across the channels. Ratings come from fan votes — a
        player&apos;s score depends on the position you field them in.
      </p>

      <FormationPitchSelector
        key={editing}
        ownedCards={pool}
        formation={team.formation}
        lineup={team.lineup}
        onFormationChange={setFormation}
        onLineupChange={setLineup}
      />

      <button
        onClick={handleKickOff}
        disabled={!ready}
        className={`mt-5 w-full rounded-2xl py-4 text-lg font-bold transition-all flex items-center justify-center gap-2 ${
          ready
            ? "bg-green-700 hover:bg-green-600 text-white shadow-lg shadow-green-900/40 active:scale-95"
            : "bg-zinc-900 text-zinc-600 border border-zinc-800 cursor-not-allowed"
        }`}
      >
        <span>⚽</span>
        {ready
          ? "Kick Off!"
          : `Fill both teams (${aInfo.filled + bInfo.filled}/14)`}
      </button>
    </div>
  );
}

// ── Result screen ──────────────────────────────────────────────────────────────

function ResultScreen({
  result, stats, nameA, nameB, onRematch, onEdit, onShare, shareCopied,
}: {
  result: ExhibitionResult;
  stats: ExhibitionStats;
  nameA: string;
  nameB: string;
  onRematch: () => void;
  onEdit: () => void;
  onShare: () => void;
  shareCopied: boolean;
}) {
  const { aScore, bScore, aOverall, bOverall, winner } = result;
  const banner =
    winner === "A" ? `${nameA} win!` :
    winner === "B" ? `${nameB} win!` :
    "It's a draw!";

  const ratingsA = result.ratings.filter((r) => r.side === "A").sort((x, y) => y.rating - x.rating);
  const ratingsB = result.ratings.filter((r) => r.side === "B").sort((x, y) => y.rating - x.rating);
  const motm = result.ratings.find((r) => r.cardId === result.motmCardId) ?? null;

  return (
    <div className="max-w-sm mx-auto space-y-3">
      {/* Scoreline */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 text-center">
        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Full Time</div>
        <div className="mt-2 flex items-center justify-center gap-4">
          <div className="flex-1 text-right">
            <div className="text-sm font-bold text-blue-300 truncate">{nameA}</div>
            <div className="text-[10px] text-zinc-500">{Math.round(aOverall)} OVR</div>
          </div>
          <div className="text-4xl font-black tabular-nums text-white">
            {aScore}<span className="mx-1 text-zinc-600">–</span>{bScore}
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-bold text-red-300 truncate">{nameB}</div>
            <div className="text-[10px] text-zinc-500">{Math.round(bOverall)} OVR</div>
          </div>
        </div>
        <div className={`mt-3 text-lg font-black ${
          winner === "A" ? "text-blue-300" : winner === "B" ? "text-red-300" : "text-zinc-300"
        }`}>
          {winner === "draw" ? "🤝 " : "🏆 "}{banner}
        </div>
        {motm && (
          <div className="mt-2 text-[11px] text-amber-300">
            ⭐ Man of the Match — <span className="font-bold">{motm.name}</span>{" "}
            <span className="text-amber-500/80">({motm.rating.toFixed(1)})</span>
          </div>
        )}
      </div>

      {/* Goals quick-view */}
      {(result.aScorers.length > 0 || result.bScorers.length > 0) && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Goals</div>
          <div className="flex gap-6">
            <ScorerColumn label={nameA} accent="text-blue-400" scorers={result.aScorers} />
            <ScorerColumn label={nameB} accent="text-red-400" scorers={result.bScorers} />
          </div>
        </div>
      )}

      {/* Match events log */}
      <MatchEventsLog events={result.events} />

      {/* Player ratings */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Player Ratings</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <RatingsColumn label={nameA} accent="text-blue-400" players={ratingsA} motmId={result.motmCardId} />
          <RatingsColumn label={nameB} accent="text-red-400" players={ratingsB} motmId={result.motmCardId} />
        </div>
      </div>

      {/* All-time stats */}
      <StatsPanel stats={stats} />

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={onRematch}
          className="flex-1 rounded-2xl bg-green-700 py-3.5 font-bold text-white shadow-lg shadow-green-900/40 transition hover:bg-green-600 active:scale-95 flex items-center justify-center gap-2"
        >
          <span>⚔️</span> Rematch
        </button>
        <button
          onClick={onShare}
          className={`rounded-2xl px-5 py-3.5 text-sm font-bold transition flex items-center gap-1.5 ${
            shareCopied
              ? "border border-green-600 bg-green-900/60 text-green-300"
              : "border border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500"
          }`}
        >
          {shareCopied ? "✓ Copied!" : "Share"}
        </button>
      </div>
      <button
        onClick={onEdit}
        className="w-full rounded-2xl border border-zinc-700 bg-zinc-900/60 py-3 text-sm font-bold text-zinc-300 transition hover:border-zinc-500"
      >
        ↺ Edit Teams
      </button>
    </div>
  );
}

function ScorerColumn({ label, accent, scorers }: { label: string; accent: string; scorers: ExhibitionScorer[] }) {
  return (
    <div className="flex-1 min-w-0">
      <div className={`mb-1 text-[10px] font-bold truncate ${accent}`}>{label.toUpperCase()}</div>
      {scorers.length === 0 ? (
        <div className="text-xs text-zinc-600">—</div>
      ) : (
        scorers.map((s, i) => (
          <div key={`${s.cardId}-${i}`} className="py-0.5 text-xs text-zinc-300">
            ⚽ <span className={`font-semibold ${RARITY_OVR[s.rarity] ?? ""}`}>{s.name}</span>{" "}
            <span className="text-zinc-600">{s.minute}&apos;</span>
          </div>
        ))
      )}
    </div>
  );
}

function MatchEventsLog({ events }: { events: MatchEvent[] }) {
  const log = events.filter((e) => LOG_TYPES.has(e.type));
  if (log.length === 0) return null;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Match Events</div>
      <div className="max-h-56 overflow-y-auto pr-1 flex flex-col gap-1">
        {log.map((ev, i) => {
          const isGoal = ev.type === "goal";
          const dot = ev.team === "user" ? "bg-blue-400" : "bg-red-400";
          return (
            <div
              key={`${ev.minute}-${i}`}
              className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${
                isGoal ? "bg-zinc-800/70 border border-zinc-700/50" : "bg-zinc-900/40"
              }`}
            >
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
              <span className="shrink-0 text-sm leading-none mt-0.5">{EVENT_ICON[ev.type] ?? "●"}</span>
              <div className="min-w-0 flex-1">
                <span className="mr-1 font-mono text-[10px] text-zinc-500">{ev.minute}&apos;</span>
                <span className={`text-[11px] leading-snug ${isGoal ? "font-semibold text-white" : "text-zinc-300"}`}>
                  {ev.description}
                </span>
              </div>
              {(isGoal || ev.type === "halftime" || ev.type === "fulltime") && (
                <span className="shrink-0 text-[10px] font-bold text-white/70">{ev.scoreUser}–{ev.scoreCpu}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ratingColor(r: number): string {
  if (r >= 8) return "bg-green-600 text-white";
  if (r >= 7) return "bg-lime-600/90 text-white";
  if (r >= 6) return "bg-zinc-600 text-white";
  return "bg-red-700/90 text-white";
}

function RatingsColumn({
  label, accent, players, motmId,
}: { label: string; accent: string; players: PlayerMatchRating[]; motmId: string | null }) {
  return (
    <div className="min-w-0">
      <div className={`mb-1.5 text-[10px] font-bold truncate ${accent}`}>{label.toUpperCase()}</div>
      <div className="flex flex-col gap-1">
        {players.map((p) => (
          <div key={p.cardId} className="flex items-center gap-2">
            <span className="w-7 shrink-0 text-[9px] font-bold uppercase text-zinc-500">{p.position}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">
              {p.cardId === motmId && <span className="mr-0.5 text-amber-400">⭐</span>}
              {p.name}
            </span>
            <span className="shrink-0 text-[10px] text-zinc-500">
              {p.goals > 0 && <span className="mr-1">⚽{p.goals}</span>}
              {p.assists > 0 && <span className="mr-1">🅰{p.assists}</span>}
              {p.saves > 0 && p.position === "GK" && <span className="mr-1">🧤{p.saves}</span>}
            </span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-black tabular-nums ${ratingColor(p.rating)}`}>
              {p.rating.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsPanel({ stats }: { stats: ExhibitionStats }) {
  const mostPicked = topPlayers(stats, "picks", 5);
  const mostWins = topPlayers(stats, "wins", 5);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">All-Time Stats</span>
        <span className="text-[11px] text-zinc-400">
          <span className="font-black text-white">{stats.gamesPlayed}</span> game{stats.gamesPlayed === 1 ? "" : "s"} played
        </span>
      </div>
      {mostPicked.length === 0 ? (
        <p className="text-xs text-zinc-600">Play a few matches to build the leaderboards.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatList title="Most Picked" players={mostPicked} valueOf={(p) => p.picks} suffix="picks" />
          <StatList title="Most Wins" players={mostWins} valueOf={(p) => p.wins} suffix="wins" />
        </div>
      )}
    </div>
  );
}

function StatList({
  title, players, valueOf, suffix,
}: { title: string; players: PlayerStat[]; valueOf: (p: PlayerStat) => number; suffix: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">{title}</div>
      {players.length === 0 ? (
        <div className="text-xs text-zinc-600">—</div>
      ) : (
        <div className="flex flex-col gap-1">
          {players.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="w-3 shrink-0 text-[10px] font-bold text-zinc-600">{i + 1}</span>
              <span className={`min-w-0 flex-1 truncate text-xs font-medium ${RARITY_OVR[p.rarity] ?? "text-zinc-200"}`}>
                {p.name}
              </span>
              <span className="shrink-0 text-[11px] font-black tabular-nums text-white">{valueOf(p)}</span>
              <span className="shrink-0 text-[9px] text-zinc-600">{suffix}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
