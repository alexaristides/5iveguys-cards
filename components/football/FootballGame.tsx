"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Formation,
  type FootballCard,
  type AssignedPlayer,
  type LineupSlot,
  type MatchSimulation,
  buildSlots,
  slotsToLineup,
  simulateMatch,
  pickCpuLineup,
} from "@/lib/football";
import FormationPitchSelector from "./FormationPitchSelector";
import FootballPitch from "./FootballPitch";

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
  } | null;
}

interface SavedSlot {
  position: string;
  posIndex: number;
  cardId: string;
}

const LS_KEY = (slug: string) => `fball_team_${slug}`;

function saveToStorage(slug: string, formation: Formation, slots: LineupSlot[]) {
  try {
    const data = {
      formation,
      slots: slots
        .filter((s) => s.card !== null)
        .map((s) => ({ position: s.position, posIndex: s.posIndex, cardId: s.card!.id })),
    };
    localStorage.setItem(LS_KEY(slug), JSON.stringify(data));
  } catch {}
}

function loadFromStorage(
  slug: string,
  cards: FootballCard[],
): { formation: Formation; lineup: LineupSlot[] } | null {
  try {
    const raw = localStorage.getItem(LS_KEY(slug));
    if (!raw) return null;
    const { formation, slots } = JSON.parse(raw) as { formation: Formation; slots: SavedSlot[] };
    const cardMap = new Map(cards.map((c) => [c.id, c]));
    const lineup = buildSlots(formation);
    for (const saved of slots) {
      const card = cardMap.get(saved.cardId) ?? null;
      const slot = lineup.find(
        (s) => s.position === saved.position && s.posIndex === saved.posIndex,
      );
      if (slot) slot.card = card;
    }
    return { formation, lineup };
  } catch {
    return null;
  }
}

export default function FootballGame({ channelSlug }: { channelSlug: string }) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [ownedCards, setOwnedCards] = useState<FootballCard[]>([]);
  const [formation, setFormation] = useState<Formation>("2-2-2");
  const [lineup, setLineup] = useState<LineupSlot[]>(() => buildSlots("2-2-2"));
  const [userLineup, setUserLineup] = useState<AssignedPlayer[]>([]);
  const [cpuLineup, setCpuLineup] = useState<AssignedPlayer[]>([]);
  const [cpuFormation, setCpuFormation] = useState<Formation>("2-2-2");
  const [simulation, setSimulation] = useState<MatchSimulation | null>(null);
  const [stats, setStats] = useState<MatchStats>({ wins: 0, losses: 0, draws: 0 });
  const [loadingCards, setLoadingCards] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  // auto-save debounce
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCards = useCallback(async () => {
    setLoadingCards(true);
    try {
      const res = await fetch(`/api/user?channelSlug=${channelSlug}`);
      if (!res.ok) return;
      const data = await res.json();
      const seen = new Set<string>();
      const cards: FootballCard[] = [];
      for (const item of (data.cards ?? []) as ApiCard[]) {
        if (!item.card || seen.has(item.card.id)) continue;
        seen.add(item.card.id);
        cards.push({
          id: item.card.id,
          name: item.card.name,
          rarity: item.card.rarity as FootballCard["rarity"],
          attribute: (item.card.attribute ?? "Skill") as FootballCard["attribute"],
          imageUrl: item.card.imageUrl,
          kit: item.card.kit,
        });
      }
      setOwnedCards(cards);

      // Restore saved lineup: localStorage first (instant), then DB
      const local = loadFromStorage(channelSlug, cards);
      if (local) {
        setFormation(local.formation);
        setLineup(local.lineup);
      }

      // Also check DB for cross-device persistence
      const teamRes = await fetch(`/api/football/team?channelSlug=${channelSlug}`);
      if (teamRes.ok) {
        const { team } = await teamRes.json();
        if (team && !local) {
          // Only use DB if nothing in localStorage
          const dbLineup = buildSlots(team.formation as Formation);
          const cardMap = new Map(cards.map((c) => [c.id, c]));
          for (const saved of (team.slots as SavedSlot[])) {
            const card = cardMap.get(saved.cardId) ?? null;
            const slot = dbLineup.find(
              (s) => s.position === saved.position && s.posIndex === saved.posIndex,
            );
            if (slot) slot.card = card;
          }
          setFormation(team.formation as Formation);
          setLineup(dbLineup);
        }
      }
    } finally {
      setLoadingCards(false);
    }
  }, [channelSlug]);

  const fetchStats = useCallback(async () => {
    const res = await fetch(`/api/football?channelSlug=${channelSlug}`);
    if (res.ok) {
      const data = await res.json();
      setStats({ wins: data.wins, losses: data.losses, draws: data.draws });
    }
  }, [channelSlug]);

  useEffect(() => {
    fetchCards();
    fetchStats();
  }, [fetchCards, fetchStats]);

  // Auto-save to localStorage whenever lineup changes
  function handleLineupChange(next: LineupSlot[]) {
    setLineup(next);
    saveToStorage(channelSlug, formation, next);
  }

  function handleFormationChange(f: Formation) {
    setFormation(f);
    // adaptSlots is handled inside FormationPitchSelector
  }

  async function saveTeamToDb(fm: Formation, slots: LineupSlot[]) {
    setSaving(true);
    try {
      await fetch("/api/football/team", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelSlug,
          formation: fm,
          slots: slots
            .filter((s) => s.card !== null)
            .map((s) => ({ position: s.position, posIndex: s.posIndex, cardId: s.card!.id })),
        }),
      });
      saveToStorage(channelSlug, fm, slots);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  function handleKickOff() {
    const assigned = slotsToLineup(lineup);
    if (assigned.length < 7) return;

    const { formation: cpuFm, lineup: cpuAssigned } = pickCpuLineup();
    setUserLineup(assigned);
    setCpuLineup(cpuAssigned);
    setCpuFormation(cpuFm);
    setSimulation(simulateMatch(assigned, cpuAssigned));
    setPhase("playing");

    // Save to DB on kick-off (fire-and-forget)
    saveTeamToDb(formation, lineup);
  }

  async function handleMatchComplete() {
    if (!simulation) return;
    setPhase("result");
    try {
      await fetch("/api/football", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelSlug,
          userCardIds: userLineup.map((p) => p.card.id),
          cpuCardIds: cpuLineup.map((p) => p.card.id),
          formation,
          userScore: simulation.userScore,
          cpuScore: simulation.cpuScore,
          result: simulation.result,
        }),
      });
      await fetchStats();
    } catch {}
  }

  function handlePlayAgain() {
    setPhase("setup");
    setSimulation(null);
  }

  const filledCount = lineup.filter((s) => s.card !== null).length;
  const canKickOff = filledCount === 7;

  // ── Setup ──────────────────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="max-w-sm mx-auto">
        {/* Record + save row */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex gap-3 text-sm font-bold">
            <span className="text-green-400">{stats.wins}W</span>
            <span className="text-red-400">{stats.losses}L</span>
            <span className="text-zinc-500">{stats.draws}D</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {savedMsg && (
              <span className="text-green-400 text-xs animate-fade-in">Team saved ✓</span>
            )}
            <button
              onClick={() => saveTeamToDb(formation, lineup)}
              disabled={saving || filledCount === 0}
              className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 disabled:opacity-40 transition-all flex items-center gap-1.5"
            >
              {saving ? (
                <span className="w-3 h-3 border border-zinc-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <span>💾</span>
              )}
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
  if (phase === "playing" && simulation) {
    return (
      <div className="w-full">
        <div className="text-center mb-4">
          <h2 className="text-zinc-300 text-sm font-semibold uppercase tracking-wider">Match in Progress</h2>
          <p className="text-zinc-600 text-xs mt-0.5">
            {formation} vs {cpuFormation}
          </p>
        </div>
        <FootballPitch
          simulation={simulation}
          userLineup={userLineup}
          cpuLineup={cpuLineup}
          userFormation={formation}
          cpuFormation={cpuFormation}
          onComplete={handleMatchComplete}
        />
      </div>
    );
  }

  // ── Result ─────────────────────────────────────────────────────────────────
  if (phase === "result" && simulation) {
    const { userScore, cpuScore, result, userOverall, cpuOverall } = simulation;
    const cfg = {
      win:  { label: "Victory!", color: "text-green-400", bg: "from-green-900/25 to-transparent", emoji: "🏆" },
      loss: { label: "Defeat",   color: "text-red-400",   bg: "from-red-900/25 to-transparent",   emoji: "😞" },
      draw: { label: "Draw",     color: "text-zinc-200",  bg: "from-zinc-700/20 to-transparent",   emoji: "🤝" },
    }[result];

    return (
      <div className="max-w-sm mx-auto text-center">
        <div className={`rounded-2xl bg-gradient-to-b ${cfg.bg} border border-zinc-800 p-8 mb-6`}>
          <div className="text-6xl mb-3">{cfg.emoji}</div>
          <h2 className={`text-3xl font-black mb-3 ${cfg.color}`}>{cfg.label}</h2>
          <div className="text-5xl font-black text-white mb-5">
            {userScore}
            <span className="text-zinc-600 text-3xl mx-2">–</span>
            {cpuScore}
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

        <button
          onClick={handlePlayAgain}
          className="w-full py-4 rounded-2xl bg-green-700 hover:bg-green-600 text-white font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-900/40"
        >
          <span>⚽</span>
          Play Again
        </button>
      </div>
    );
  }

  return null;
}
