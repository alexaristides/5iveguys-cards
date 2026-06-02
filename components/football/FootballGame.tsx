"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Formation,
  type FootballCard,
  type AssignedPlayer,
  type LineupSlot,
  type MatchSimulation,
  buildSlots,
  slotsToLineup,
  pickCpuLineup,
  FORMATIONS,
} from "@/lib/football";
import {
  simulateFirstHalf,
  simulateSecondHalf,
  pickCpuSecondHalfFormation,
  type HalfResult,
  type MatchFrame,
} from "@/lib/match-engine";
import { nanoid } from "nanoid";
import FormationPitchSelector from "./FormationPitchSelector";
import MatchPitch from "./MatchPitch";

type Phase = "setup" | "playing" | "result";

interface MatchStats {
  wins: number;
  losses: number;
  draws: number;
}

interface ApiCard {
  id: string;
  cardId: string;
  card: {
    id: string;
    name: string;
    kit: string | null;
    rarity: string;
    imageUrl: string;
    attribute: string | null;
    description: string | null;
    position: string | null;
  } | null;
}

interface SavedSlot {
  position: string;
  posIndex: number;
  cardId: string;
}

const LS_KEY = "fball_team";

function saveToStorage(formation: Formation, slots: LineupSlot[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      formation,
      slots: slots.filter((s) => s.card !== null).map((s) => ({
        position: s.position, posIndex: s.posIndex, cardId: s.card!.id,
      })),
    }));
  } catch {}
}

function loadFromStorage(cards: FootballCard[]): { formation: Formation; lineup: LineupSlot[] } | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const { formation, slots } = JSON.parse(raw) as { formation: Formation; slots: SavedSlot[] };
    const cardMap = new Map(cards.map((c) => [c.id, c]));
    const lineup = buildSlots(formation);
    for (const saved of slots) {
      const card = cardMap.get(saved.cardId) ?? null;
      const slot = lineup.find((s) => s.position === saved.position && s.posIndex === saved.posIndex);
      if (slot) slot.card = card;
    }
    return { formation, lineup };
  } catch { return null; }
}

const RARITY_BADGE: Record<string, string> = {
  common: "bg-zinc-700/80 text-zinc-300", rare: "bg-blue-900/60 text-blue-300",
  epic: "bg-purple-900/60 text-purple-300", legendary: "bg-amber-900/60 text-amber-400",
};

export default function FootballGame() {
  const [phase, setPhase]           = useState<Phase>("setup");
  const [shareCopied, setShareCopied] = useState(false);
  const [ownedCards, setOwnedCards] = useState<FootballCard[]>([]);
  const [formation, setFormation]   = useState<Formation>("2-2-2");
  const [lineup, setLineup]         = useState<LineupSlot[]>(() => buildSlots("2-2-2"));
  const [userLineup, setUserLineup] = useState<AssignedPlayer[]>([]);
  const [cpuLineup, setCpuLineup]   = useState<AssignedPlayer[]>([]);
  const [cpuFormation, setCpuFormation] = useState<Formation>("2-2-2");
  const [firstHalf, setFirstHalf]   = useState<HalfResult | null>(null);
  const [secondHalfFrames, setSecondHalfFrames] = useState<MatchFrame[] | null>(null);
  const [summary, setSummary]       = useState<MatchSimulation | null>(null);
  const [showHalftime, setShowHalftime] = useState(false);
  const [secondHalfFormation, setSecondHalfFormation] = useState<Formation>("2-2-2");
  const [skipSignal, setSkipSignal] = useState(0);
  const [halfSec, setHalfSec]       = useState(28); // playback seconds per half
  const [stats, setStats]           = useState<MatchStats>({ wins: 0, losses: 0, draws: 0 });
  const [loadingCards, setLoadingCards] = useState(true);
  const [saving, setSaving]         = useState(false);
  const [savedMsg, setSavedMsg]     = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  void saveTimer;

  // Refs so playback callbacks always read current values.
  const seedRef = useRef("");
  const firstHalfRef = useRef<HalfResult | null>(null);
  const summaryRef = useRef<MatchSimulation | null>(null);
  const userLineupRef = useRef<AssignedPlayer[]>([]);
  const cpuLineupRef = useRef<AssignedPlayer[]>([]);
  const cpuFormationRef = useRef<Formation>("2-2-2");
  const secondHalfFormationRef = useRef<Formation>("2-2-2");

  const fetchCards = useCallback(async () => {
    setLoadingCards(true);
    try {
      const res = await fetch("/api/user/collection");
      if (!res.ok) return;
      const data = await res.json();
      const seen = new Set<string>();
      const cards: FootballCard[] = [];
      for (const item of (data.cards ?? []) as ApiCard[]) {
        if (!item.card || seen.has(item.card.id)) continue;
        if (item.card.position === "Moment") continue; // Moment cards are not playable
        seen.add(item.card.id);
        cards.push({
          id: item.card.id, name: item.card.name,
          rarity: item.card.rarity as FootballCard["rarity"],
          attribute: (item.card.attribute ?? "Skill") as FootballCard["attribute"],
          imageUrl: item.card.imageUrl, kit: item.card.kit ?? null,
        });
      }
      setOwnedCards(cards);

      const local = loadFromStorage(cards);
      if (local) { setFormation(local.formation); setLineup(local.lineup); }

      const teamRes = await fetch("/api/football/team");
      if (teamRes.ok) {
        const { team } = await teamRes.json();
        if (team && !local) {
          const dbLineup = buildSlots(team.formation as Formation);
          const cardMap = new Map(cards.map((c) => [c.id, c]));
          for (const saved of (team.slots as SavedSlot[])) {
            const card = cardMap.get(saved.cardId) ?? null;
            const slot = dbLineup.find((s) => s.position === saved.position && s.posIndex === saved.posIndex);
            if (slot) slot.card = card;
          }
          setFormation(team.formation as Formation);
          setLineup(dbLineup);
        }
      }
    } finally { setLoadingCards(false); }
  }, []);

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/football");
    if (res.ok) {
      const data = await res.json();
      setStats({ wins: data.wins, losses: data.losses, draws: data.draws });
    }
  }, []);

  useEffect(() => { fetchCards(); fetchStats(); }, [fetchCards, fetchStats]);

  function handleLineupChange(next: LineupSlot[]) {
    setLineup(next);
    saveToStorage(formation, next);
  }

  function handleFormationChange(f: Formation) { setFormation(f); }

  async function saveTeamToDb(fm: Formation, slots: LineupSlot[]) {
    setSaving(true);
    try {
      await fetch("/api/football/team", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formation: fm,
          slots: slots.filter((s) => s.card !== null).map((s) => ({
            position: s.position, posIndex: s.posIndex, cardId: s.card!.id,
          })),
        }),
      });
      saveToStorage(fm, slots);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
    } finally { setSaving(false); }
  }

  function handleKickOff() {
    const assigned = slotsToLineup(lineup);
    if (assigned.length < 7) return;

    const { formation: cpuFm, lineup: cpuAssigned } = pickCpuLineup();
    const seed = nanoid();
    const h1 = simulateFirstHalf({
      userLineup: assigned, cpuLineup: cpuAssigned,
      userFormation: formation, cpuFormation: cpuFm, seed,
    });

    setUserLineup(assigned); userLineupRef.current = assigned;
    setCpuLineup(cpuAssigned); cpuLineupRef.current = cpuAssigned;
    setCpuFormation(cpuFm); cpuFormationRef.current = cpuFm;
    seedRef.current = seed;
    setFirstHalf(h1); firstHalfRef.current = h1;
    setSecondHalfFrames(null);
    setSummary(null); summaryRef.current = null;
    setSecondHalfFormation(formation); secondHalfFormationRef.current = formation;
    setSkipSignal(0);
    setShowHalftime(false);
    setPhase("playing");

    saveTeamToDb(formation, lineup);
  }

  function computeSecondHalf(userFm: Formation): MatchSimulation {
    const h1 = firstHalfRef.current!;
    const cpuFm2 = pickCpuSecondHalfFormation(cpuFormationRef.current, h1.endScore.cpu, h1.endScore.user, seedRef.current);
    const { frames, summary: s } = simulateSecondHalf({
      userLineup: userLineupRef.current,
      cpuLineup: cpuLineupRef.current,
      userFormation: userFm,
      cpuFormation: cpuFm2,
      seed: seedRef.current,
      halftimeScore: h1.endScore,
      involvements: new Map(h1.involvements),
      firstHalfEvents: h1.events,
    });
    summaryRef.current = s;
    setSummary(s);
    setSecondHalfFrames(frames);
    return s;
  }

  async function finishMatch(s: MatchSimulation) {
    setPhase("result");
    try {
      await fetch("/api/football", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userCardIds: userLineupRef.current.map((p) => p.card.id),
          cpuCardIds: cpuLineupRef.current.map((p) => p.card.id),
          formation,
          userScore: s.userScore,
          cpuScore: s.cpuScore,
          result: s.result,
        }),
      });
      await fetchStats();
    } catch {}
  }

  function handleHalftimeReached() { setShowHalftime(true); }

  function handleStartSecondHalf() {
    secondHalfFormationRef.current = secondHalfFormation;
    setShowHalftime(false);
    computeSecondHalf(secondHalfFormation); // sets secondHalfFrames → MatchPitch resumes
  }

  function handleSkipToResult() {
    const s = summaryRef.current ?? computeSecondHalf(secondHalfFormationRef.current);
    setShowHalftime(false);
    finishMatch(s);
  }

  function handleSkipPlayback() { setSkipSignal((n) => n + 1); }

  function handleMatchComplete() {
    const s = summaryRef.current;
    if (s) finishMatch(s);
  }

  function handlePlayAgain() {
    setPhase("setup");
    setSummary(null); summaryRef.current = null;
    setFirstHalf(null); firstHalfRef.current = null;
    setSecondHalfFrames(null);
    setShowHalftime(false);
    setShareCopied(false);
  }

  function handleShare() {
    if (!summary) return;
    const { result, userScore, cpuScore, userOverall } = summary;
    const outcome =
      result === "win"  ? `beat CPU ${userScore}–${cpuScore}` :
      result === "draw" ? `drew with CPU ${userScore}–${cpuScore}` :
                          `lost to CPU ${cpuScore}–${userScore}`;
    const text = `I just ${outcome} with a ${Math.round(userOverall)} OVR squad on 5iveG Cards ⚽🃏`;
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(text).then(() => {
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
      });
    }
  }

  const filledCount = lineup.filter((s) => s.card !== null).length;
  const canKickOff  = filledCount === 7;

  // ── Setup ──────────────────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="max-w-sm mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex gap-3 text-sm font-bold">
            <span className="text-green-400">{stats.wins}W</span>
            <span className="text-red-400">{stats.losses}L</span>
            <span className="text-zinc-500">{stats.draws}D</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {savedMsg && <span className="text-green-400 text-xs">Team saved ✓</span>}
            <button
              onClick={() => saveTeamToDb(formation, lineup)}
              disabled={saving || filledCount === 0}
              className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 disabled:opacity-40 transition-all flex items-center gap-1.5"
            >
              {saving ? <span className="w-3 h-3 border border-zinc-500 border-t-transparent rounded-full animate-spin" /> : <span>💾</span>}
              Save Team
            </button>
          </div>
        </div>

        {loadingCards ? (
          <div className="flex justify-center py-24">
            <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : ownedCards.length < 7 ? (
          <div className="text-center py-16 text-zinc-500">
            <div className="text-5xl mb-4">⚽</div>
            <p className="font-semibold text-zinc-300 text-lg">You need at least 7 cards</p>
            <p className="text-sm mt-2">Open some packs to build your squad!</p>
          </div>
        ) : (
          <>
            <FormationPitchSelector
              ownedCards={ownedCards}
              formation={formation}
              lineup={lineup}
              onFormationChange={handleFormationChange}
              onLineupChange={handleLineupChange}
            />

            <button
              onClick={handleKickOff}
              disabled={!canKickOff}
              className={`w-full mt-5 py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2
                ${canKickOff
                  ? "bg-green-700 hover:bg-green-600 text-white shadow-lg shadow-green-900/40 active:scale-95"
                  : "bg-zinc-900 text-zinc-600 border border-zinc-800 cursor-not-allowed"
                }`}
            >
              <span>⚽</span>
              {canKickOff ? "Kick Off!" : `Fill ${7 - filledCount} more position${7 - filledCount !== 1 ? "s" : ""}`}
            </button>
          </>
        )}
      </div>
    );
  }

  // ── Playing ────────────────────────────────────────────────────────────────
  if (phase === "playing" && firstHalf) {
    return (
      <div className="w-full">
        <div className="text-center mb-3">
          <h2 className="text-zinc-300 text-sm font-semibold uppercase tracking-wider">Match in Progress</h2>
          <p className="text-zinc-600 text-xs mt-0.5">{secondHalfFormation} vs {cpuFormation}</p>
        </div>
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="flex items-center gap-1 rounded-lg bg-zinc-900 border border-zinc-800 p-0.5">
            <span className="text-zinc-500 text-[10px] px-1.5">Speed</span>
            {([["Slow", 42], ["Normal", 28], ["Fast", 16]] as const).map(([label, sec]) => (
              <button
                key={label}
                onClick={() => setHalfSec(sec)}
                className={`text-[11px] px-2 py-1 rounded-md transition-all ${
                  halfSec === sec ? "bg-green-700 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={handleSkipPlayback}
            className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300"
          >
            Skip ⏭
          </button>
        </div>

        <MatchPitch
          userLineup={userLineup}
          cpuLineup={cpuLineup}
          firstHalfFrames={firstHalf.frames}
          secondHalfFrames={secondHalfFrames}
          halfDurationSec={halfSec}
          skipSignal={skipSignal}
          onHalftime={handleHalftimeReached}
          onComplete={handleMatchComplete}
        />

        {showHalftime && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl p-6 text-center">
              <div className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mb-2">Half Time</div>
              <div className="text-white text-4xl font-black mb-4">{firstHalf.endScore.user}–{firstHalf.endScore.cpu}</div>
              <div className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Second-half formation</div>
              <div className="grid grid-cols-2 gap-2 mb-5">
                {(["2-2-2", "3-2-1", "1-3-2", "2-3-1"] as Formation[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setSecondHalfFormation(f)}
                    className={`py-2 rounded-lg text-sm font-bold border transition-all ${
                      secondHalfFormation === f
                        ? "bg-green-700 border-green-500 text-white"
                        : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500"
                    }`}
                  >
                    {FORMATIONS[f].label}
                    <span className="block text-[9px] font-normal text-zinc-400">{FORMATIONS[f].desc}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={handleStartSecondHalf}
                className="w-full py-3 rounded-xl bg-green-700 hover:bg-green-600 text-white text-sm font-bold transition-all active:scale-95 mb-2"
              >
                ⚽ Second Half
              </button>
              <button
                onClick={handleSkipToResult}
                className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-bold"
              >
                Skip to result
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Result ─────────────────────────────────────────────────────────────────
  if (phase === "result" && summary) {
    const { userScore, cpuScore, result, userOverall, cpuOverall, mvp } = summary;
    const cfg = {
      win:  { label: "Victory!", color: "text-green-400", bg: "from-green-900/25 to-transparent", emoji: "🏆" },
      loss: { label: "Defeat",   color: "text-red-400",   bg: "from-red-900/25 to-transparent",   emoji: "😞" },
      draw: { label: "Draw",     color: "text-zinc-200",  bg: "from-zinc-700/20 to-transparent",   emoji: "🤝" },
    }[result];

    return (
      <div className="max-w-sm mx-auto text-center">
        {/* Score card */}
        <div className={`rounded-2xl bg-gradient-to-b ${cfg.bg} border border-zinc-800 p-8 mb-5`}>
          <div className="text-6xl mb-3">{cfg.emoji}</div>
          <h2 className={`text-3xl font-black mb-3 ${cfg.color}`}>{cfg.label}</h2>
          <div className="text-5xl font-black text-white mb-5">
            {userScore}<span className="text-zinc-600 text-3xl mx-2">–</span>{cpuScore}
          </div>
          <div className="flex justify-center gap-8 text-sm text-zinc-500">
            <div>
              <div className="text-white font-bold text-lg">{Math.round(userOverall)}</div>
              <div>Your OVR</div>
            </div>
            <div>
              <div className="text-white font-bold text-lg">{Math.round(cpuOverall)}</div>
              <div>CPU OVR</div>
            </div>
          </div>
        </div>

        {/* Goalscorers */}
        {(userScore > 0 || cpuScore > 0) && (
          <div className="mb-5 rounded-xl bg-zinc-900/60 border border-zinc-800 px-4 py-3 text-left">
            <div className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Goals</div>
            <div className="flex gap-6">
              {userScore > 0 && (
                <div className="flex-1">
                  <div className="text-blue-400 text-[10px] font-bold mb-1">YOU</div>
                  {summary.events
                    .filter((ev) => ev.type === "goal" && ev.team === "user")
                    .map((ev, i) => {
                      const scorer = userLineup.find((p) => p.card.id === ev.scorerCardId)?.card.name ?? "—";
                      return (
                        <div key={i} className="text-zinc-300 text-xs py-0.5">
                          ⚽ <span className="font-semibold">{scorer}</span>{" "}
                          <span className="text-zinc-600">{ev.minute}&apos;</span>
                        </div>
                      );
                    })}
                </div>
              )}
              {cpuScore > 0 && (
                <div className="flex-1">
                  <div className="text-red-400 text-[10px] font-bold mb-1">CPU</div>
                  {summary.events
                    .filter((ev) => ev.type === "goal" && ev.team === "cpu")
                    .map((ev, i) => {
                      const scorer = cpuLineup.find((p) => p.card.id === ev.scorerCardId)?.card.name ?? "CPU";
                      return (
                        <div key={i} className="text-zinc-300 text-xs py-0.5">
                          ⚽ <span className="font-semibold text-zinc-400">{scorer}</span>{" "}
                          <span className="text-zinc-600">{ev.minute}&apos;</span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Man of the Match */}
        {mvp && (
          <div className="mb-5 rounded-2xl bg-amber-900/15 border border-amber-700/40 p-5">
            <div className="text-amber-400 text-[10px] font-bold uppercase tracking-widest mb-3">⭐ Man of the Match</div>
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-20 rounded-xl overflow-hidden ring-2 ring-amber-500/60 shrink-0">
                <Image src={mvp.imageUrl} alt={mvp.name} fill className="object-cover" sizes="64px" />
              </div>
              <div className="text-left">
                <div className="text-white font-black text-lg leading-tight">{mvp.name}</div>
                <div className="flex gap-3 mt-2">
                  {mvp.goals > 0 && (
                    <div>
                      <div className="text-green-400 font-black text-xl leading-none">{mvp.goals}</div>
                      <div className="text-zinc-600 text-[10px]">Goal{mvp.goals > 1 ? "s" : ""}</div>
                    </div>
                  )}
                  {mvp.assists > 0 && (
                    <div>
                      <div className="text-blue-400 font-black text-xl leading-none">{mvp.assists}</div>
                      <div className="text-zinc-600 text-[10px]">Assist{mvp.assists > 1 ? "s" : ""}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Season record */}
        <div className="flex justify-center gap-8 mb-7">
          <div className="text-center">
            <div className="text-2xl font-black text-green-400">{stats.wins}</div>
            <div className="text-zinc-500 text-xs">Wins</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black text-red-400">{stats.losses}</div>
            <div className="text-zinc-500 text-xs">Losses</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black text-zinc-400">{stats.draws}</div>
            <div className="text-zinc-500 text-xs">Draws</div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handlePlayAgain}
            className="flex-1 py-4 rounded-2xl bg-green-700 hover:bg-green-600 text-white font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-900/40"
          >
            <span>⚽</span> Play Again
          </button>
          <button
            onClick={handleShare}
            className={`px-5 py-4 rounded-2xl font-bold text-sm transition-all flex items-center gap-1.5
              ${shareCopied
                ? "bg-green-900/60 border border-green-600 text-green-300"
                : "bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-zinc-500"
              }`}
          >
            {shareCopied ? "✓ Copied!" : "Share"}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
