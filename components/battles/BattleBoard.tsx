"use client";

import { useState } from "react";
import Image from "next/image";
import { CARDS_BY_ID, type Rarity } from "@/lib/cards";
import { ROLL_RANGES, type BattleEntry } from "@/lib/battles";

const RARITY_STYLES: Record<Rarity, string> = {
  common: "border-zinc-600",
  rare: "border-blue-400",
  epic: "border-purple-400",
  legendary: "border-amber-400",
};

const RARITY_BADGE: Record<Rarity, { label: string; cls: string }> = {
  common: { label: "Common", cls: "bg-zinc-700 text-zinc-300" },
  rare: { label: "Rare", cls: "bg-blue-900/80 text-blue-300" },
  epic: { label: "Epic", cls: "bg-purple-900/80 text-purple-300" },
  legendary: { label: "Legendary", cls: "bg-amber-900/80 text-amber-300" },
};

interface BattleBoardProps {
  battles: BattleEntry[];
  currentUserId: string;
  ownedCardIds: string[];
  onAccept: (battleId: string, cardId: string) => Promise<void>;
  onCancel: (battleId: string) => Promise<void>;
  loading: boolean;
}

export default function BattleBoard({
  battles,
  currentUserId,
  ownedCardIds,
  onAccept,
  onCancel,
  loading,
}: BattleBoardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const uniqueOwnedIds = [...new Set(ownedCardIds)];

  async function handleConfirmAccept(battleId: string) {
    if (!selectedCard) return;
    setActingId(battleId);
    try {
      await onAccept(battleId, selectedCard);
    } finally {
      setActingId(null);
      setExpandedId(null);
      setSelectedCard(null);
    }
  }

  async function handleCancel(battleId: string) {
    setActingId(battleId);
    try {
      await onCancel(battleId);
    } finally {
      setActingId(null);
    }
  }

  function toggleExpand(battleId: string) {
    if (expandedId === battleId) {
      setExpandedId(null);
      setSelectedCard(null);
    } else {
      setExpandedId(battleId);
      setSelectedCard(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-zinc-800/50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (battles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">⚔️</div>
        <p className="text-zinc-400 font-medium">No active challenges</p>
        <p className="text-zinc-600 text-sm mt-1">Be the first to issue one!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {battles.map((battle) => {
        const card = CARDS_BY_ID[battle.challengerCardId];
        const isOwn = battle.challengerId === currentUserId;
        const isExpanded = expandedId === battle.id;
        const isActing = actingId === battle.id;
        const [rollMin, rollMax] = card ? ROLL_RANGES[card.rarity] : [0, 0];
        const badge = card ? RARITY_BADGE[card.rarity] : null;

        return (
          <div
            key={battle.id}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden"
          >
            {/* Main row */}
            <div className="flex items-center gap-4 px-4 py-3">
              {/* Challenger card thumbnail */}
              {card && (
                <div
                  className={`relative w-12 h-[68px] rounded-lg overflow-hidden border-2 shrink-0 ${RARITY_STYLES[card.rarity]}`}
                >
                  <Image src={card.image} alt={card.name} fill className="object-cover" sizes="48px" />
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {battle.challenger.image && (
                    <Image
                      src={battle.challenger.image}
                      alt={battle.challenger.name ?? ""}
                      width={20}
                      height={20}
                      className="rounded-full shrink-0"
                    />
                  )}
                  <span className="text-white text-sm font-medium truncate">
                    {isOwn ? "You" : (battle.challenger.name ?? "Unknown")}
                  </span>
                  {card && badge && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${badge.cls}`}>
                      {badge.label}
                    </span>
                  )}
                </div>
                {card && (
                  <p className="text-zinc-500 text-xs mt-0.5">
                    Rolls {rollMin}–{rollMax} · {card.name}
                  </p>
                )}
              </div>

              {/* Wager */}
              <div className="text-right shrink-0">
                <div className="flex items-center gap-1 justify-end">
                  <span className="text-amber-400 text-sm">★</span>
                  <span className="text-white font-bold text-sm">{battle.wager.toLocaleString()}</span>
                </div>
                <p className="text-zinc-600 text-[10px] mt-0.5">pts · winner takes</p>
                <p className="text-zinc-500 text-[10px]">{(battle.wager * 2).toLocaleString()} pot</p>
              </div>

              {/* Action */}
              <div className="shrink-0 ml-1">
                {isOwn ? (
                  <button
                    onClick={() => handleCancel(battle.id)}
                    disabled={isActing}
                    className="text-xs px-3 py-1.5 rounded-lg border border-red-800/60 text-red-400 hover:bg-red-900/20 disabled:opacity-40 transition-colors"
                  >
                    {isActing ? "…" : "Cancel"}
                  </button>
                ) : (
                  <button
                    onClick={() => toggleExpand(battle.id)}
                    disabled={isActing}
                    className="text-xs px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white font-medium transition-colors"
                  >
                    {isActing ? "…" : isExpanded ? "Close" : "Accept ▸"}
                  </button>
                )}
              </div>
            </div>

            {/* Expanded card picker for accepting */}
            {!isOwn && isExpanded && (
              <div className="border-t border-zinc-800 px-4 py-4 bg-zinc-800/30">
                <p className="text-zinc-400 text-sm font-medium mb-3">Pick your card to battle with</p>

                {uniqueOwnedIds.length === 0 ? (
                  <p className="text-zinc-600 text-sm">You don&apos;t own any cards yet.</p>
                ) : (
                  <>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {uniqueOwnedIds.map((id) => {
                        const c = CARDS_BY_ID[id];
                        if (!c) return null;
                        const [min, max] = ROLL_RANGES[c.rarity];
                        const isSel = selectedCard === id;
                        return (
                          <button
                            key={id}
                            onClick={() => setSelectedCard(id)}
                            className="flex flex-col items-center gap-1 shrink-0"
                          >
                            <div
                              className={`
                                relative w-14 h-20 rounded-lg overflow-hidden border-2 transition-all duration-150
                                ${RARITY_STYLES[c.rarity]}
                                ${isSel ? "ring-2 ring-purple-500 ring-offset-1 ring-offset-zinc-800 scale-110" : "opacity-60 hover:opacity-100 hover:scale-105"}
                              `}
                            >
                              <Image src={c.image} alt={c.name} fill className="object-cover" sizes="56px" />
                            </div>
                            <span className="text-zinc-500 text-[10px]">{min}–{max}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex gap-3 mt-3">
                      <button
                        onClick={() => { setExpandedId(null); setSelectedCard(null); }}
                        className="text-sm px-4 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleConfirmAccept(battle.id)}
                        disabled={!selectedCard || isActing}
                        className="text-sm px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors"
                      >
                        {isActing ? "Resolving…" : "Confirm Battle"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
