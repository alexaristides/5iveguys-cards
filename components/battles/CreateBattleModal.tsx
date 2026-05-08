"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { CARDS_BY_ID, type Card, type Rarity } from "@/lib/cards";
import { ROLL_RANGES, MIN_WAGER } from "@/lib/battles";

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

interface CreateBattleModalProps {
  ownedCardIds: string[];
  userPoints: number;
  onClose: () => void;
  onCreate: (cardId: string, wager: number) => Promise<void>;
}

export default function CreateBattleModal({
  ownedCardIds,
  userPoints,
  onClose,
  onCreate,
}: CreateBattleModalProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [wager, setWager] = useState(MIN_WAGER);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (!mounted) return null;

  const uniqueCardIds = [...new Set(ownedCardIds)];
  const cards: Card[] = uniqueCardIds
    .map((id) => CARDS_BY_ID[id])
    .filter(Boolean) as Card[];

  const selectedCard = selectedCardId ? CARDS_BY_ID[selectedCardId] : null;
  const wagerValid = wager >= MIN_WAGER && wager <= userPoints;
  const canSubmit = selectedCardId && wagerValid && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !selectedCardId) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(selectedCardId, wager);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create challenge");
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />

      <div
        className="relative z-10 w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">Issue a Challenge</h2>
            <p className="text-zinc-500 text-sm mt-0.5">Pick a card and set a wager</p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Card picker */}
          <div>
            <p className="text-zinc-400 text-sm font-medium mb-3">
              Choose your card
              <span className="text-zinc-600 ml-2 font-normal">Higher rarity = higher roll range</span>
            </p>

            {cards.length === 0 ? (
              <p className="text-zinc-600 text-sm">You don&apos;t own any cards yet. Open some packs first!</p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                {cards.map((card) => {
                  const [min, max] = ROLL_RANGES[card.rarity];
                  const isSelected = selectedCardId === card.id;
                  return (
                    <button
                      key={card.id}
                      onClick={() => setSelectedCardId(card.id)}
                      className="flex flex-col items-center gap-1.5 group"
                    >
                      <div
                        className={`
                          relative w-full aspect-[5/7] rounded-xl overflow-hidden border-2 transition-all duration-200
                          ${RARITY_STYLES[card.rarity]}
                          ${isSelected ? "ring-2 ring-purple-500 ring-offset-2 ring-offset-zinc-900 scale-105" : "opacity-70 group-hover:opacity-100 group-hover:scale-105"}
                        `}
                      >
                        <Image src={card.image} alt={card.name} fill className="object-cover" sizes="80px" />
                      </div>
                      <span className="text-zinc-500 text-[10px] leading-tight">
                        {min}–{max}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected card summary */}
          {selectedCard && (
            <div className="flex items-center gap-3 bg-zinc-800/50 rounded-xl px-4 py-3 border border-zinc-700/40">
              <div className={`relative w-10 h-14 rounded-lg overflow-hidden border-2 shrink-0 ${RARITY_STYLES[selectedCard.rarity]}`}>
                <Image src={selectedCard.image} alt={selectedCard.name} fill className="object-cover" sizes="40px" />
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{selectedCard.name}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RARITY_BADGE[selectedCard.rarity].cls}`}>
                  {RARITY_BADGE[selectedCard.rarity].label}
                </span>
              </div>
              <div className="ml-auto text-right shrink-0">
                <p className="text-zinc-400 text-xs">Roll range</p>
                <p className="text-white font-bold text-sm">
                  {ROLL_RANGES[selectedCard.rarity][0]}–{ROLL_RANGES[selectedCard.rarity][1]}
                </p>
              </div>
            </div>
          )}

          {/* Wager input */}
          <div>
            <label className="text-zinc-400 text-sm font-medium block mb-2">
              Set your wager
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">★</span>
              <input
                type="number"
                min={MIN_WAGER}
                max={userPoints}
                step={1}
                value={wager}
                onChange={(e) => setWager(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-8 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-purple-600/60 transition-colors"
              />
            </div>
            <p className="text-zinc-600 text-xs mt-1.5">
              You have {userPoints.toLocaleString()} pts · min {MIN_WAGER} · winner takes both wagers
            </p>
            {wager > userPoints && (
              <p className="text-red-400 text-xs mt-1">Exceeds your balance</p>
            )}
            {wager < MIN_WAGER && wager > 0 && (
              <p className="text-red-400 text-xs mt-1">Minimum wager is {MIN_WAGER} points</p>
            )}
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700/40 text-red-300 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-zinc-800 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {submitting ? "Posting…" : "Issue Challenge"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
