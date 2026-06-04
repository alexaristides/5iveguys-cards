"use client";

import { useMemo, useState } from "react";
import seedrandom from "seedrandom";
import MatchPitch, { type MatchOutcome } from "./MatchPitch";
import { calcTeamStats, type AssignedPlayer, type Formation, type MatchSimulation } from "@/lib/football";
import { simulateFirstHalf, simulateSecondHalf, type HalfResult, type MatchFrame } from "@/lib/match-engine";

export interface MatchRunnerResult {
  userScore: number;
  cpuScore: number;
  userWon: boolean;
  userPens?: number;
  cpuPens?: number;
}

interface Props {
  userLineup: AssignedPlayer[];
  cpuLineup: AssignedPlayer[];
  userFormation: Formation;
  cpuFormation: Formation;
  seed: string;
  /** Knockout ties cannot draw — a shootout decides the winner. */
  knockout: boolean;
  userLabel?: string;
  cpuLabel?: string;
  onFinish: (r: MatchRunnerResult) => void;
}

// Seeded penalty shootout, weighted by squad overall. Deterministic per seed.
function shootout(seed: string, userOverall: number, cpuOverall: number) {
  const rng = seedrandom(`${seed}:pens`);
  const pUser = userOverall / (userOverall + cpuOverall);
  let u = 0, c = 0;
  for (let i = 0; i < 5; i++) { if (rng() < pUser * 0.95) u++; if (rng() < (1 - pUser) * 0.95) c++; }
  while (u === c) { if (rng() < pUser) u++; else c++; } // sudden death
  return { userPens: u, cpuPens: c, userWon: u > c };
}

export default function MatchRunner({
  userLineup, cpuLineup, userFormation, cpuFormation, seed, knockout,
  userLabel = "YOU", cpuLabel = "CPU", onFinish,
}: Props) {
  const firstHalf: HalfResult = useMemo(
    () => simulateFirstHalf({ userLineup, cpuLineup, userFormation, cpuFormation, seed }),
    [userLineup, cpuLineup, userFormation, cpuFormation, seed],
  );

  const [secondHalfFrames, setSecondHalfFrames] = useState<MatchFrame[] | null>(null);
  const [summary, setSummary] = useState<MatchSimulation | null>(null);
  const [final, setFinal] = useState<MatchRunnerResult | null>(null);

  // Auto-compute the second half the moment the first finishes (no tactical pause).
  function handleHalftime() {
    const { frames, summary: s } = simulateSecondHalf({
      userLineup, cpuLineup, userFormation, cpuFormation, seed,
      halftimeScore: firstHalf.endScore,
      involvements: new Map(firstHalf.involvements),
      firstHalfEvents: firstHalf.events,
    });
    setSummary(s);
    setSecondHalfFrames(frames);
  }

  function handleComplete() {
    if (!summary) return;
    let res: MatchRunnerResult = {
      userScore: summary.userScore, cpuScore: summary.cpuScore,
      userWon: summary.result === "win",
    };
    if (knockout && summary.userScore === summary.cpuScore) {
      const so = shootout(seed, calcTeamStats(userLineup).overall, calcTeamStats(cpuLineup).overall);
      res = { ...res, ...so };
    }
    setFinal(res);
  }

  const outcome: MatchOutcome | null = useMemo(() => {
    if (!final) return null;
    const won = final.userWon, draw = !knockout && final.userScore === final.cpuScore;
    return {
      outcome: won ? "win" : draw ? "draw" : "loss",
      label: won ? "Victory!" : draw ? "Draw" : "Defeat",
    };
  }, [final, knockout]);

  const resultPanel = final ? (
    <div className="text-center">
      <div className="text-white text-4xl font-black mb-1">{final.userScore}–{final.cpuScore}</div>
      {final.userPens != null && (
        <div className="text-amber-400 text-sm font-bold mb-2">Penalties {final.userPens}–{final.cpuPens}</div>
      )}
      <div className={`text-sm font-bold mb-4 ${final.userWon ? "text-green-400" : final.userScore === final.cpuScore ? "text-zinc-300" : "text-red-400"}`}>
        {final.userWon ? "You won!" : (!knockout && final.userScore === final.cpuScore) ? "Draw" : "You lost"}
      </div>
      <button
        onClick={() => onFinish(final)}
        className="w-full py-3 rounded-xl bg-green-700 hover:bg-green-600 text-white text-sm font-bold transition-all active:scale-95"
      >
        Continue ➜
      </button>
    </div>
  ) : null;

  return (
    <MatchPitch
      key={seed}
      userLineup={userLineup}
      cpuLineup={cpuLineup}
      firstHalfFrames={firstHalf.frames}
      secondHalfFrames={secondHalfFrames}
      userLabel={userLabel}
      cpuLabel={cpuLabel}
      onHalftime={handleHalftime}
      onComplete={handleComplete}
      result={outcome}
      resultPanel={resultPanel}
    />
  );
}
