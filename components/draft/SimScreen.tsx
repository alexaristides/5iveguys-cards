"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import type { Formation, PlacedPlayer } from "@/lib/draft/types";
import { simulateTournament, teamRating, type TournamentResult, type MatchResult } from "@/lib/draft/sim";
import MatchPitch, { type MatchOutcome } from "@/components/football/MatchPitch";
import type { MatchFrame } from "@/lib/match-engine";
import type { DraftConfig } from "./SetupScreen";
import Pitch from "./Pitch";
import Leaderboard from "./Leaderboard";

interface SimScreenProps {
  config: DraftConfig;
  formation: Formation;
  placed: PlacedPlayer[];
  onRestart: () => void;
}

type Phase = "ready" | "playing" | "done";

// Stable empty array so MatchPitch's solo-mode effect deps don't churn on re-render.
const NO_FRAMES: MatchFrame[] = [];

export default function SimScreen({ config, formation, placed, onRestart }: SimScreenProps) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [result, setResult] = useState<TournamentResult | null>(null);
  const [matchIdx, setMatchIdx] = useState(0);
  const [matchFinished, setMatchFinished] = useState(false);
  const [alias, setAlias] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const rating = teamRating(placed, formation);

  const runSim = useCallback(() => {
    const res = simulateTournament(placed, formation, config.ratingsMode);
    setResult(res);
    setMatchIdx(0);
    setMatchFinished(false);
    setSubmitted(false);
    setPhase(res.playbacks.length > 0 ? "playing" : "done");
  }, [placed, formation, config.ratingsMode]);

  // A clip finishing freezes on a full-time result screen; the user advances.
  const finishMatch = useCallback(() => setMatchFinished(true), []);
  const advanceMatch = useCallback(() => {
    setMatchFinished(false);
    setMatchIdx((i) => i + 1);
  }, []);
  const skipMatches = useCallback(() => {
    setMatchFinished(false);
    setResult((r) => { if (r) setMatchIdx(r.playbacks.length); return r; });
  }, []);
  useEffect(() => {
    if (phase === "playing" && result && matchIdx >= result.playbacks.length) setPhase("done");
  }, [phase, matchIdx, result]);

  const submitScore = async () => {
    if (!result || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/draft/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alias: alias.trim() || "Anonymous",
          formation: formation.name,
          teamRating: result.teamRating,
          placement: result.placement,
          won: result.won,
          wins: result.wins,
          draws: result.draws,
          losses: result.losses,
          goalsFor: result.goalsFor,
          goalsAgainst: result.goalsAgainst,
          difficulty: config.difficulty,
          ratingsMode: config.ratingsMode,
          squad: placed.map((p) => ({
            name: p.player.name,
            nation: p.player.nationName,
            flag: p.player.flag,
            rating: p.player.rating,
            slot: formation.slots[p.slotIndex].label,
          })),
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        setRefreshKey((k) => k + 1);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const share = async () => {
    if (!result) return;
    const text =
      `⚽ My 2026 World Cup Dream Team (XI rating ${result.teamRating})\n` +
      `🏆 ${result.placement} · W${result.wins} D${result.draws} L${result.losses} · ${result.goalsFor} goals\n` +
      `Build yours free → ${typeof window !== "undefined" ? window.location.origin + "/draft" : ""}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "2026 World Cup Dream Team", text });
      } else {
        await navigator.clipboard.writeText(text);
        alert("Result copied to clipboard!");
      }
    } catch {
      /* user cancelled share */
    }
  };

  // ── Match playback (full-width while a tournament tie is animating) ──────────
  if (phase === "playing" && result) {
    const pb = result.playbacks[matchIdx];
    const m = result.matches[matchIdx];
    if (pb && m) {
      const isLast = matchIdx === result.playbacks.length - 1;
      const outcome: MatchOutcome | null = matchFinished
        ? {
            outcome: m.outcome === "W" ? "win" : m.outcome === "D" ? "draw" : "loss",
            label: m.outcome === "W" ? "Victory!" : m.outcome === "D" ? "Draw" : "Defeat",
          }
        : null;

      return (
        <div className="mx-auto max-w-5xl px-4 py-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                {pb.stage} · Match {matchIdx + 1} of {result.playbacks.length}
                {matchFinished && <span className="ml-2 text-emerald-400">· Full Time</span>}
              </div>
              <div className="truncate text-sm font-extrabold text-white">
                {pb.userLabel} vs {pb.opponent.flag} {pb.opponent.name}
                {pb.knockout && <span className="ml-2 text-[10px] font-bold uppercase text-amber-400">Knockout</span>}
              </div>
            </div>
            {!matchFinished && (
              <button
                onClick={skipMatches}
                className="shrink-0 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-white transition hover:border-white/30"
              >
                Skip ⏭
              </button>
            )}
          </div>

          <MatchPitch
            key={matchIdx}
            userLineup={pb.userLineup}
            cpuLineup={pb.cpuLineup}
            userLabel={pb.userLabel}
            cpuLabel={pb.cpuLabel}
            firstHalfFrames={NO_FRAMES}
            secondHalfFrames={null}
            soloFrames={pb.frames}
            soloDurationSec={pb.durationSec}
            onComplete={finishMatch}
            result={outcome}
            resultPanel={outcome ? <MatchResultPanel match={m} isLast={isLast} onNext={advanceMatch} /> : null}
          />

          {matchIdx > 0 && (
            <div className="mt-4 space-y-1.5">
              {result.matches.slice(0, matchIdx).map((mr, i) => (
                <MatchRow key={i} match={mr} />
              ))}
            </div>
          )}
        </div>
      );
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* XI pitch */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-white">Your XI</h2>
            <span className="rounded-lg bg-[#FFC233] px-2.5 py-1 text-sm font-extrabold text-zinc-950">
              {rating} OVR
            </span>
          </div>
          <Pitch formation={formation} placed={placed} className="mx-auto max-w-[320px]" />
          <button
            onClick={onRestart}
            className="mt-3 w-full rounded-xl border border-white/15 bg-white/5 py-2.5 text-sm font-bold text-white transition hover:border-white/30"
          >
            ↺ Draft a new team
          </button>
        </div>

        {/* Results */}
        <div>
          {phase === "ready" && (
            <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
              <div className="text-5xl">🏆</div>
              <h3 className="mt-3 text-xl font-extrabold text-white">Ready for the tournament?</h3>
              <p className="mt-1 max-w-xs text-sm text-zinc-400">
                Group stage → Round of 16 → Quarter-final → Semi-final → Final. Each tie plays out live on the pitch.
              </p>
              <button
                onClick={runSim}
                className="mt-5 rounded-2xl bg-[#FFC233] px-8 py-3.5 text-lg font-extrabold text-zinc-950 shadow-lg shadow-[#FFC233]/20 transition hover:bg-[#ffce5c] active:scale-[0.99]"
              >
                Simulate Tournament →
              </button>
            </div>
          )}

          {phase === "done" && result && (
            <div>
              <ResultBanner result={result} />

              <div className="mt-3 space-y-1.5">
                {result.matches.map((m, i) => (
                  <MatchRow key={i} match={m} />
                ))}
              </div>

              <div className="mt-4 space-y-3">
                  {/* Play again with the same squad */}
                  <button
                    onClick={runSim}
                    className="w-full rounded-2xl bg-[#FFC233] py-3 text-base font-extrabold text-zinc-950 shadow-lg shadow-[#FFC233]/20 transition hover:bg-[#ffce5c] active:scale-[0.99]"
                  >
                    🔄 Play again
                  </button>

                  {/* Stats */}
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <Stat label="Record" value={`${result.wins}-${result.draws}-${result.losses}`} />
                    <Stat label="Goals" value={`${result.goalsFor}`} />
                    <Stat label="Conceded" value={`${result.goalsAgainst}`} />
                    <Stat label="XI OVR" value={`${result.teamRating}`} />
                  </div>

                  {/* Share + submit */}
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    {!submitted ? (
                      <>
                        <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                          Add your name to the leaderboard
                        </label>
                        <div className="mt-2 flex gap-2">
                          <input
                            value={alias}
                            onChange={(e) => setAlias(e.target.value.slice(0, 24))}
                            placeholder="Your name"
                            className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#FFC233] focus:outline-none"
                          />
                          <button
                            onClick={submitScore}
                            disabled={submitting}
                            className="rounded-xl bg-[#FFC233] px-4 py-2.5 text-sm font-extrabold text-zinc-950 transition hover:bg-[#ffce5c] disabled:opacity-50"
                          >
                            {submitting ? "Saving…" : "Submit"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-center text-sm font-semibold text-emerald-400">
                        ✓ Saved to the leaderboard!
                      </p>
                    )}
                    <button
                      onClick={share}
                      className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 py-2.5 text-sm font-bold text-white transition hover:border-white/30"
                    >
                      📲 Share my result
                    </button>
                  </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {phase === "done" && (
        <div className="mt-8">
          <Leaderboard refreshKey={refreshKey} />
        </div>
      )}
    </div>
  );
}

// Full-time card shown in MatchPitch's side column when a clip ends.
function MatchResultPanel({ match, isLast, onNext }: { match: MatchResult; isLast: boolean; onNext: () => void }) {
  const won = match.outcome === "W";
  const drew = match.outcome === "D";
  const color = won ? "text-emerald-400" : drew ? "text-zinc-300" : "text-rose-400";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col items-center justify-center text-center"
    >
      <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{match.stage} · Full Time</div>
      <div className="mt-2 flex items-center justify-center gap-2 text-sm font-bold text-white">
        <span className="text-lg">{match.opponent.flag}</span>
        <span className="truncate">{match.opponent.name}</span>
      </div>
      <div className="mt-3 text-6xl font-black tabular-nums text-white">
        {match.userGoals}<span className="mx-2 text-zinc-600">–</span>{match.oppGoals}
      </div>
      {match.userPens != null && (
        <div className="mt-1 text-sm font-bold text-amber-400">Penalties {match.userPens}–{match.oppPens}</div>
      )}
      <div className={`mt-2 text-xl font-extrabold uppercase tracking-wide ${color}`}>
        {won ? "Win" : drew ? "Draw" : "Defeat"}
      </div>
      <button
        onClick={onNext}
        className="mt-6 rounded-2xl bg-[#FFC233] px-7 py-3 text-base font-extrabold text-zinc-950 shadow-lg shadow-[#FFC233]/20 transition hover:bg-[#ffce5c] active:scale-95"
      >
        {isLast ? "View final standings →" : "Next match →"}
      </button>
    </motion.div>
  );
}

function ResultBanner({ result }: { result: TournamentResult }) {
  const champion = result.won;
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`relative overflow-hidden rounded-2xl border p-5 text-center ${
        champion
          ? "border-[#FFC233]/60 bg-gradient-to-b from-[#FFC233]/20 to-transparent"
          : "border-white/10 bg-white/5"
      }`}
    >
      {champion && (
        <motion.div
          initial={{ y: -10, rotate: -8 }}
          animate={{ y: [0, -8, 0], rotate: [-8, 8, -8] }}
          transition={{ repeat: Infinity, duration: 2.5 }}
          className="text-6xl"
        >
          🏆
        </motion.div>
      )}
      {!champion && <div className="text-5xl">{placementEmoji(result.placement)}</div>}
      <h3 className={`mt-2 text-2xl font-extrabold ${champion ? "text-[#FFC233]" : "text-white"}`}>
        {champion ? "World Champions!" : result.placement}
      </h3>
      <p className="mt-1 text-sm text-zinc-300">
        {champion
          ? "You went all the way and lifted the trophy!"
          : result.advancedFromGroup
            ? "A run to remember — but it ends here."
            : "Didn't make it out of the group this time."}
      </p>
    </motion.div>
  );
}

function placementEmoji(placement: string): string {
  if (placement === "Runners-up") return "🥈";
  if (placement === "Semi-finals") return "🥉";
  if (placement === "Quarter-finals") return "⚔️";
  if (placement === "Round of 16") return "🎯";
  return "😞";
}

function MatchRow({ match }: { match: MatchResult }) {
  const color =
    match.outcome === "W" ? "text-emerald-400" : match.outcome === "L" ? "text-rose-400" : "text-zinc-400";
  const score =
    match.userPens != null
      ? `${match.userGoals}-${match.oppGoals} (${match.userPens}-${match.oppPens} pens)`
      : `${match.userGoals}-${match.oppGoals}`;
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
    >
      <span className="w-24 shrink-0 text-[11px] font-semibold text-zinc-500">{match.stage}</span>
      <span className="text-lg">{match.opponent.flag}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
        {match.opponent.name}
      </span>
      <span className={`shrink-0 text-sm font-extrabold tabular-nums ${color}`}>{score}</span>
      <span className={`w-4 shrink-0 text-center text-xs font-extrabold ${color}`}>{match.outcome}</span>
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 py-2">
      <div className="text-sm font-extrabold text-white">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
    </div>
  );
}
