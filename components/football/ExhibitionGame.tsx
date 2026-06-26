"use client";

import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import {
  type Formation, type FootballCard, type LineupSlot,
  buildSlots, slotsToLineup, calcTeamStats,
} from "@/lib/football";
import type { StatsMap } from "@/lib/card-rating";
import { simulateExhibition, EXHIBITION_POOL, type ExhibitionResult, type ExhibitionScorer } from "@/lib/exhibition";
import FormationPitchSelector from "./FormationPitchSelector";
import MatchPitch from "./MatchPitch";

type Phase = "setup" | "playing" | "result";
type Side = "A" | "B";

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

  function handleKickOff() {
    const a = slotsToLineup(teamA.lineup);
    const b = slotsToLineup(teamB.lineup);
    if (a.length < 7 || b.length < 7) return;
    const seed = nanoid();
    const res = simulateExhibition(a, b, teamA.formation, teamB.formation, seed);
    setResult(res);
    setShareCopied(false);
    setPhase("playing");
  }

  function handleRematch() {
    const a = slotsToLineup(teamA.lineup);
    const b = slotsToLineup(teamB.lineup);
    const seed = nanoid();
    const res = simulateExhibition(a, b, teamA.formation, teamB.formation, seed);
    setResult(res);
    setShareCopied(false);
    setPhase("playing");
  }

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
          userLineup={slotsToLineup(teamA.lineup)}
          cpuLineup={slotsToLineup(teamB.lineup)}
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
  result, nameA, nameB, onRematch, onEdit, onShare, shareCopied,
}: {
  result: ExhibitionResult;
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

  return (
    <div className="max-w-sm mx-auto">
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
      </div>

      {(result.aScorers.length > 0 || result.bScorers.length > 0) && (
        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Goals</div>
          <div className="flex gap-6">
            <ScorerColumn label={nameA} accent="text-blue-400" scorers={result.aScorers} />
            <ScorerColumn label={nameB} accent="text-red-400" scorers={result.bScorers} />
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-3">
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
        className="mt-3 w-full rounded-2xl border border-zinc-700 bg-zinc-900/60 py-3 text-sm font-bold text-zinc-300 transition hover:border-zinc-500"
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
