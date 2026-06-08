"use client";

import { useState, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Formation, PlacedPlayer } from "@/lib/draft/types";
import { simulateTournament, teamRating, type TournamentResult, type MatchResult } from "@/lib/draft/sim";
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

export default function SimScreen({ config, formation, placed, onRestart }: SimScreenProps) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [result, setResult] = useState<TournamentResult | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [alias, setAlias] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const rating = teamRating(placed, formation);

  const runSim = useCallback(() => {
    const res = simulateTournament(placed, formation, config.ratingsMode);
    setResult(res);
    setPhase("playing");
    setRevealed(0);
    timers.current.forEach(clearTimeout);
    timers.current = [];
    res.matches.forEach((_, i) => {
      timers.current.push(setTimeout(() => setRevealed(i + 1), 700 * (i + 1)));
    });
    timers.current.push(setTimeout(() => setPhase("done"), 700 * res.matches.length + 500));
  }, [placed, formation, config.ratingsMode]);

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
                Group stage → Round of 16 → Quarter-final → Semi-final → Final. Your ratings vs the world.
              </p>
              <button
                onClick={runSim}
                className="mt-5 rounded-2xl bg-[#FFC233] px-8 py-3.5 text-lg font-extrabold text-zinc-950 shadow-lg shadow-[#FFC233]/20 transition hover:bg-[#ffce5c] active:scale-[0.99]"
              >
                Simulate Tournament →
              </button>
            </div>
          )}

          {(phase === "playing" || phase === "done") && result && (
            <div>
              {phase === "done" && <ResultBanner result={result} />}

              <div className="mt-3 space-y-1.5">
                {result.matches.slice(0, revealed).map((m, i) => (
                  <MatchRow key={i} match={m} />
                ))}
              </div>

              {phase === "done" && (
                <div className="mt-4 space-y-3">
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
              )}
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
