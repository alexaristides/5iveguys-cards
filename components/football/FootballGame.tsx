"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  type Formation,
  type FootballCard,
  type AssignedPlayer,
  type MatchSimulation,
  FORMATIONS,
  assignPositions,
  simulateMatch,
  pickCpuLineup,
  getPlayerRating,
} from "@/lib/football";
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

const RARITY_BORDER: Record<string, string> = {
  common:    "border-zinc-500",
  rare:      "border-blue-500",
  epic:      "border-purple-500",
  legendary: "border-amber-500",
};

const RARITY_LABEL: Record<string, string> = {
  common:    "text-zinc-400",
  rare:      "text-blue-400",
  epic:      "text-purple-400",
  legendary: "text-amber-400",
};

const ATTR_ICON: Record<string, string> = { Pace: "⚡", Power: "💪", Skill: "🎯" };

export default function FootballGame({ channelSlug }: { channelSlug: string }) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [ownedCards, setOwnedCards] = useState<FootballCard[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [formation, setFormation] = useState<Formation>("2-2-2");
  const [userLineup, setUserLineup] = useState<AssignedPlayer[]>([]);
  const [cpuLineup, setCpuLineup] = useState<AssignedPlayer[]>([]);
  const [cpuFormation, setCpuFormation] = useState<Formation>("2-2-2");
  const [simulation, setSimulation] = useState<MatchSimulation | null>(null);
  const [stats, setStats] = useState<MatchStats>({ wins: 0, losses: 0, draws: 0 });
  const [saving, setSaving] = useState(false);
  const [loadingCards, setLoadingCards] = useState(true);

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

  function toggleCard(cardId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else if (next.size < 7) {
        next.add(cardId);
      }
      return next;
    });
  }

  function handleKickOff() {
    const selected = ownedCards.filter((c) => selectedIds.has(c.id));
    if (selected.length < 7) return;

    const userAssigned = assignPositions(selected, formation);
    const { formation: cpuFm, lineup: cpuAssigned } = pickCpuLineup();

    setUserLineup(userAssigned);
    setCpuLineup(cpuAssigned);
    setCpuFormation(cpuFm);
    setSimulation(simulateMatch(userAssigned, cpuAssigned));
    setPhase("playing");
  }

  async function handleMatchComplete() {
    if (!simulation) return;
    setPhase("result");
    setSaving(true);
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
    } finally {
      setSaving(false);
    }
  }

  function handlePlayAgain() {
    setPhase("setup");
    setSelectedIds(new Set());
    setSimulation(null);
  }

  // ── Setup phase ──────────────────────────────────────────────────────────
  if (phase === "setup") {
    const selectedCards = ownedCards.filter((c) => selectedIds.has(c.id));
    const previewLineup = selectedCards.length === 7 ? assignPositions(selectedCards, formation) : [];

    return (
      <div className="max-w-2xl mx-auto">
        {/* W/L/D record */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex gap-3 text-sm">
            <span className="text-green-400 font-bold">{stats.wins}W</span>
            <span className="text-red-400 font-bold">{stats.losses}L</span>
            <span className="text-zinc-400 font-bold">{stats.draws}D</span>
          </div>
          <div className="ml-auto text-zinc-500 text-xs">{stats.wins + stats.losses + stats.draws} played</div>
        </div>

        {/* Formation picker */}
        <div className="mb-6">
          <h2 className="text-zinc-300 text-sm font-semibold mb-3 uppercase tracking-wider">Formation</h2>
          <div className="grid grid-cols-4 gap-2">
            {(Object.entries(FORMATIONS) as [Formation, { label: string; desc: string }][]).map(([fm, { label, desc }]) => (
              <button
                key={fm}
                onClick={() => setFormation(fm)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  formation === fm
                    ? "bg-purple-900/50 border-purple-500 text-white"
                    : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
                }`}
              >
                <div className="font-bold text-sm">{label}</div>
                <div className="text-xs mt-0.5 opacity-70">{desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Card selection */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-zinc-300 text-sm font-semibold uppercase tracking-wider">
            Pick Your Squad
          </h2>
          <span className={`text-sm font-bold ${selectedIds.size === 7 ? "text-green-400" : "text-zinc-500"}`}>
            {selectedIds.size}/7 selected
          </span>
        </div>

        {loadingCards ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : ownedCards.length < 7 ? (
          <div className="text-center py-16 text-zinc-500">
            <div className="text-4xl mb-3">⚽</div>
            <p className="font-semibold text-zinc-400">Need at least 7 cards to play</p>
            <p className="text-sm mt-1">Open some packs to build your squad!</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-6 max-h-80 overflow-y-auto pr-1">
            {ownedCards.map((card) => {
              const selected = selectedIds.has(card.id);
              return (
                <button
                  key={card.id}
                  onClick={() => toggleCard(card.id)}
                  className={`relative rounded-xl border overflow-hidden text-left transition-all ${
                    selected
                      ? `${RARITY_BORDER[card.rarity]} ring-2 ring-offset-1 ring-offset-zinc-950 ring-${card.rarity === "legendary" ? "amber" : card.rarity === "epic" ? "purple" : card.rarity === "rare" ? "blue" : "zinc"}-500 opacity-100`
                      : `border-zinc-800 opacity-60 hover:opacity-80`
                  } ${!selected && selectedIds.size === 7 ? "cursor-not-allowed" : ""}`}
                >
                  <div className="aspect-[3/4] relative bg-zinc-900">
                    <Image
                      src={card.imageUrl}
                      alt={card.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 110px, 130px"
                    />
                    {selected && (
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-black font-black text-xs">✓</div>
                      </div>
                    )}
                  </div>
                  <div className="px-2 py-1.5 bg-zinc-900">
                    <p className="text-white text-xs font-semibold truncate">{card.name}</p>
                    <p className={`text-[10px] ${RARITY_LABEL[card.rarity]}`}>
                      {ATTR_ICON[card.attribute]} {card.attribute}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Lineup preview */}
        {previewLineup.length === 7 && (
          <div className="mb-6 rounded-xl bg-zinc-900/60 border border-zinc-800 p-4">
            <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3">Lineup Preview</h3>
            <div className="space-y-2">
              {(["GK", "DEF", "MID", "ATT"] as const).map((pos) => {
                const players = previewLineup.filter((p) => p.position === pos);
                if (players.length === 0) return null;
                return (
                  <div key={pos} className="flex items-center gap-2">
                    <span className="text-zinc-600 text-xs w-8 shrink-0">{pos}</span>
                    <div className="flex gap-2 flex-wrap">
                      {players.map((p) => (
                        <div key={p.card.id} className="flex items-center gap-1">
                          <span className={`text-xs font-medium ${RARITY_LABEL[p.card.rarity]}`}>{p.card.name}</span>
                          <span className="text-zinc-600 text-[10px]">
                            ({getPlayerRating(p.card, p.position)})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={handleKickOff}
          disabled={selectedIds.size < 7}
          className="w-full py-4 rounded-2xl bg-green-700 hover:bg-green-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-bold text-lg transition-all flex items-center justify-center gap-2"
        >
          <span>⚽</span>
          {selectedIds.size < 7 ? `Select ${7 - selectedIds.size} more players` : "Kick Off!"}
        </button>
      </div>
    );
  }

  // ── Playing phase ────────────────────────────────────────────────────────
  if (phase === "playing" && simulation) {
    return (
      <div className="w-full">
        <div className="text-center mb-4">
          <h2 className="text-zinc-300 text-sm font-semibold uppercase tracking-wider">Match in Progress</h2>
          <p className="text-zinc-600 text-xs mt-0.5">You vs CPU · {formation} vs {cpuFormation}</p>
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

  // ── Result phase ─────────────────────────────────────────────────────────
  if (phase === "result" && simulation) {
    const { userScore, cpuScore, result, userOverall, cpuOverall } = simulation;
    const resultConfig = {
      win:  { label: "Victory!", color: "text-green-400", bg: "from-green-900/30 to-transparent", emoji: "🏆" },
      loss: { label: "Defeat", color: "text-red-400",   bg: "from-red-900/30 to-transparent",   emoji: "😞" },
      draw: { label: "Draw!",   color: "text-zinc-300", bg: "from-zinc-700/30 to-transparent",   emoji: "🤝" },
    }[result];

    return (
      <div className="max-w-md mx-auto text-center">
        <div className={`rounded-2xl bg-gradient-to-b ${resultConfig.bg} border border-zinc-800 p-8 mb-6`}>
          <div className="text-6xl mb-3">{resultConfig.emoji}</div>
          <h2 className={`text-3xl font-black mb-2 ${resultConfig.color}`}>{resultConfig.label}</h2>
          <div className="text-5xl font-black text-white mb-4">
            {userScore} <span className="text-zinc-600 text-3xl">–</span> {cpuScore}
          </div>
          <div className="flex justify-center gap-6 text-sm text-zinc-500">
            <div>
              <div className="text-white font-bold">{Math.round(userOverall)}</div>
              <div>Your OVR</div>
            </div>
            <div>
              <div className="text-white font-bold">{Math.round(cpuOverall)}</div>
              <div>CPU OVR</div>
            </div>
          </div>
        </div>

        {/* Updated record */}
        <div className="flex justify-center gap-6 mb-6">
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
            disabled={saving}
            className="flex-1 py-3.5 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:opacity-60 text-white font-bold transition-all flex items-center justify-center gap-2"
          >
            <span>⚽</span>
            Play Again
          </button>
        </div>
      </div>
    );
  }

  return null;
}
