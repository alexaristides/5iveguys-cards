"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { type FootballCard, type Position, getPlayerRating } from "@/lib/football";

const POSITION_NAMES: Record<Position, string> = {
  GK:  "Goalkeeper",
  DEF: "Defender",
  MID: "Midfielder",
  ATT: "Attacker",
};

const RARITY_BADGE: Record<string, string> = {
  common:    "bg-zinc-700/80 text-zinc-300",
  rare:      "bg-blue-900/60 text-blue-300",
  epic:      "bg-purple-900/60 text-purple-300",
  legendary: "bg-amber-900/60 text-amber-400",
};

const RARITY_RING: Record<string, string> = {
  common:    "ring-zinc-500",
  rare:      "ring-blue-400",
  epic:      "ring-purple-400",
  legendary: "ring-amber-400",
};

const ATTR_ICON: Record<string, string> = { Pace: "⚡", Power: "💪", Skill: "🎯" };

interface Props {
  position: Position;
  ownedCards: FootballCard[];
  occupiedIds: Set<string>;     // cards already in other slots
  currentCardId?: string | null; // card in this slot (show "Remove" option)
  onPick: (card: FootballCard | null) => void;
  onClose: () => void;
}

export default function PlayerPickerModal({
  position,
  ownedCards,
  occupiedIds,
  currentCardId,
  onPick,
  onClose,
}: Props) {
  const [search, setSearch] = useState("");

  const available = useMemo(() => {
    return ownedCards
      .filter((c) => !occupiedIds.has(c.id) || c.id === currentCardId)
      .sort((a, b) => getPlayerRating(b, position) - getPlayerRating(a, position));
  }, [ownedCards, occupiedIds, currentCardId, position]);

  const filtered = useMemo(() => {
    if (!search.trim()) return available;
    const q = search.toLowerCase();
    return available.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.attribute.toLowerCase().includes(q) ||
        c.rarity.toLowerCase().includes(q),
    );
  }, [available, search]);

  const currentCard = ownedCards.find((c) => c.id === currentCardId) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full sm:max-w-sm bg-[#111] rounded-t-2xl sm:rounded-2xl border border-zinc-800 shadow-2xl flex flex-col max-h-[82vh] sm:max-h-[75vh]">
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80">
          <div>
            <h3 className="text-white font-bold text-base">
              Pick {POSITION_NAMES[position]}
            </h3>
            <p className="text-zinc-500 text-xs mt-0.5">
              Sorted by position rating · {available.length} available
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search bar */}
        <div className="px-3 py-2.5 border-b border-zinc-800/80">
          <div className="flex items-center gap-2.5 bg-zinc-900 rounded-xl px-3 py-2.5 ring-1 ring-zinc-800 focus-within:ring-zinc-600 transition-all">
            <svg className="w-4 h-4 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or attribute…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-white text-sm outline-none flex-1 placeholder:text-zinc-600"
              autoFocus
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-zinc-500 hover:text-white transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Card list */}
        <div className="overflow-y-auto flex-1 px-2 py-2">
          {/* Remove current player option */}
          {currentCard && (
            <button
              onClick={() => onPick(null)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-red-400 hover:bg-red-950/40 transition-all text-sm mb-1"
            >
              <div className="w-10 h-14 rounded-lg overflow-hidden relative ring-1 ring-red-800/50 shrink-0 flex items-center justify-center bg-red-950/30">
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <span className="font-medium">Remove {currentCard.name}</span>
            </button>
          )}

          {filtered.map((card) => {
            const rating = getPlayerRating(card, position);
            const isCurrentSlot = card.id === currentCardId;
            return (
              <button
                key={card.id}
                onClick={() => onPick(card)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left
                  ${isCurrentSlot
                    ? "bg-purple-900/30 ring-1 ring-purple-700/50"
                    : "hover:bg-zinc-800/70"
                  }`}
              >
                {/* Card thumbnail */}
                <div className={`w-10 h-14 rounded-lg overflow-hidden relative shrink-0 ring-2 ${RARITY_RING[card.rarity]}`}>
                  <Image
                    src={card.imageUrl}
                    alt={card.name}
                    fill
                    className="object-cover"
                    sizes="40px"
                  />
                </div>

                {/* Name + info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-white font-semibold text-sm truncate">{card.name}</span>
                    {isCurrentSlot && (
                      <span className="text-purple-400 text-[10px] font-bold">SELECTED</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${RARITY_BADGE[card.rarity]}`}>
                      {card.rarity}
                    </span>
                    <span className="text-zinc-500 text-xs">
                      {ATTR_ICON[card.attribute]} {card.attribute}
                    </span>
                  </div>
                </div>

                {/* Rating */}
                <div className="text-right shrink-0 ml-1">
                  <div className="text-white font-black text-xl leading-none">{rating}</div>
                  <div className="text-zinc-600 text-[10px] mt-0.5">pos rating</div>
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center py-10 text-zinc-600">
              <div className="text-3xl mb-2">🔍</div>
              <p className="text-sm">No players match your search</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
