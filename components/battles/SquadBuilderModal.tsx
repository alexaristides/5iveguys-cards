"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { CARDS_BY_ID, CAP_COSTS, SALARY_CAP, type Card, type Rarity, type Attribute } from "@/lib/cards";
import { MIN_WAGER } from "@/lib/battles";

const RARITY_STYLES: Record<Rarity, string> = {
  common:    "border-zinc-600",
  rare:      "border-blue-400",
  epic:      "border-purple-400",
  legendary: "border-amber-400",
};

const RARITY_BADGE: Record<Rarity, { label: string; cls: string }> = {
  common:    { label: "Common",    cls: "bg-zinc-700 text-zinc-300" },
  rare:      { label: "Rare",      cls: "bg-blue-900/80 text-blue-300" },
  epic:      { label: "Epic",      cls: "bg-purple-900/80 text-purple-300" },
  legendary: { label: "Legendary", cls: "bg-amber-900/80 text-amber-300" },
};

const ATTR_STYLES: Record<Attribute, { dot: string; text: string; label: string }> = {
  Pace:  { dot: "bg-blue-400",  text: "text-blue-400",  label: "Pace" },
  Power: { dot: "bg-red-400",   text: "text-red-400",   label: "Power" },
  Skill: { dot: "bg-green-400", text: "text-green-400", label: "Skill" },
};

interface SquadBuilderModalProps {
  mode: "create" | "accept";
  ownedCardIds: string[];
  userPoints: number;
  wager?: number;
  challengerName?: string;
  onClose: () => void;
  onCreate?: (cardIds: string[], wager: number) => Promise<void>;
  onAccept?: (cardIds: string[]) => Promise<void>;
}

export default function SquadBuilderModal({
  mode,
  ownedCardIds,
  userPoints,
  wager: fixedWager,
  challengerName,
  onClose,
  onCreate,
  onAccept,
}: SquadBuilderModalProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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
  const availableCards: Card[] = uniqueCardIds
    .map((id) => CARDS_BY_ID[id])
    .filter(Boolean) as Card[];

  const capCost = selectedIds.reduce((sum, id) => {
    const c = CARDS_BY_ID[id];
    return sum + (c ? CAP_COSTS[c.rarity] : 0);
  }, 0);

  const capBarPct = Math.min(100, (capCost / SALARY_CAP) * 100);
  const capBarColor =
    capCost >= SALARY_CAP ? "bg-red-500" : capCost >= 80 ? "bg-amber-400" : "bg-green-500";

  function isSelectable(cardId: string): boolean {
    if (selectedIds.includes(cardId)) return true;
    if (selectedIds.length >= 3) return false;
    const c = CARDS_BY_ID[cardId];
    if (!c) return false;
    return capCost + CAP_COSTS[c.rarity] <= SALARY_CAP;
  }

  function toggleCard(cardId: string) {
    setSelectedIds((prev) => {
      if (prev.includes(cardId)) return prev.filter((id) => id !== cardId);
      if (prev.length >= 3) return prev;
      return [...prev, cardId];
    });
  }

  const effectiveWager = mode === "accept" ? (fixedWager ?? 0) : wager;
  const wagerValid = mode === "accept"
    ? userPoints >= effectiveWager
    : wager >= MIN_WAGER && wager <= userPoints;
  const isComplete = selectedIds.length === 3 && capCost <= SALARY_CAP;
  const canSubmit = isComplete && wagerValid && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "create" && onCreate) {
        await onCreate(selectedIds, wager);
      } else if (mode === "accept" && onAccept) {
        await onAccept(selectedIds);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-zinc-800 shrink-0">
          <div>
            {mode === "create" ? (
              <>
                <h2 className="text-white font-bold text-lg">Build Your Squad</h2>
                <p className="text-zinc-500 text-sm mt-0.5">Pick 3 cards · Salary cap: 100 pts</p>
              </>
            ) : (
              <>
                <h2 className="text-white font-bold text-lg">Accept Challenge</h2>
                <p className="text-zinc-500 text-sm mt-0.5">
                  vs <span className="text-white font-medium">{challengerName}</span>
                  {" · "}Wager: <span className="text-purple-400 font-medium">{effectiveWager.toLocaleString()} pts</span>
                  {" · "}Pot: <span className="text-green-400 font-medium">{(effectiveWager * 2).toLocaleString()} pts</span>
                </p>
              </>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors p-1 mt-0.5 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Salary cap meter */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-zinc-400 text-xs font-medium">Salary Cap</span>
              <span className={`text-xs font-bold ${capCost > SALARY_CAP ? "text-red-400" : "text-zinc-300"}`}>
                {capCost} / {SALARY_CAP}
              </span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-200 ${capBarColor}`}
                style={{ width: `${capBarPct}%` }}
              />
            </div>
            <div className="flex items-center gap-4 mt-1.5 text-[10px] text-zinc-600">
              <span>Common 10</span>
              <span>Rare 25</span>
              <span>Epic 40</span>
              <span>Legendary 60</span>
            </div>
          </div>

          {/* Squad lineup slots */}
          <div>
            <p className="text-zinc-400 text-xs font-medium mb-2">Your Lineup (order = round order)</p>
            <div className="flex gap-3">
              {[0, 1, 2].map((slot) => {
                const cardId = selectedIds[slot];
                const card = cardId ? CARDS_BY_ID[cardId] : null;
                return (
                  <div
                    key={slot}
                    className={`flex-1 aspect-[5/7] rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-all ${
                      card ? RARITY_STYLES[card.rarity] + " border-solid" : "border-zinc-700"
                    }`}
                  >
                    {card ? (
                      <button
                        onClick={() => toggleCard(cardId)}
                        className="relative w-full h-full rounded-xl overflow-hidden group"
                      >
                        <Image src={card.image} alt={card.name} fill className="object-cover" sizes="100px" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                          <span className="text-white text-xs opacity-0 group-hover:opacity-100 font-bold">✕</span>
                        </div>
                        <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center">
                          <span className="text-white text-[10px] font-bold">{slot + 1}</span>
                        </div>
                      </button>
                    ) : (
                      <span className="text-zinc-700 text-2xl font-light">{slot + 1}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card grid */}
          <div>
            <p className="text-zinc-400 text-sm font-medium mb-3">
              Choose cards
              <span className="text-zinc-600 ml-2 font-normal text-xs">Greyed = would exceed cap</span>
            </p>

            {availableCards.length === 0 ? (
              <p className="text-zinc-600 text-sm">You don&apos;t own any cards yet. Open some packs first!</p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                {availableCards.map((card) => {
                  const pos = selectedIds.indexOf(card.id);
                  const selected = pos !== -1;
                  const selectable = isSelectable(card.id);
                  const attr = ATTR_STYLES[card.attribute];

                  return (
                    <button
                      key={card.id}
                      onClick={() => selectable && toggleCard(card.id)}
                      disabled={!selectable}
                      className={`flex flex-col items-center gap-1 group transition-opacity ${
                        !selectable && !selected ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                      }`}
                    >
                      <div
                        className={`
                          relative w-full aspect-[5/7] rounded-xl overflow-hidden border-2 transition-all duration-200
                          ${RARITY_STYLES[card.rarity]}
                          ${selected
                            ? "ring-2 ring-purple-500 ring-offset-1 ring-offset-zinc-900 scale-105"
                            : selectable ? "group-hover:scale-105" : ""
                          }
                        `}
                      >
                        <Image src={card.image} alt={card.name} fill className="object-cover" sizes="80px" />
                        {/* Cap cost badge */}
                        <div className="absolute bottom-0 right-0 bg-black/70 text-zinc-300 text-[9px] font-bold px-1 rounded-tl">
                          {CAP_COSTS[card.rarity]}
                        </div>
                        {/* Selection number */}
                        {selected && (
                          <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-purple-600 flex items-center justify-center">
                            <span className="text-white text-[9px] font-bold">{pos + 1}</span>
                          </div>
                        )}
                      </div>
                      {/* Attribute badge */}
                      <div className="flex items-center gap-0.5">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${attr.dot}`} />
                        <span className={`text-[9px] font-medium ${attr.text}`}>{attr.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Wager input — create mode only */}
          {mode === "create" && (
            <div>
              <label className="text-zinc-400 text-sm font-medium block mb-2">Set your wager</label>
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
                You have {userPoints.toLocaleString()} pts · min {MIN_WAGER} · winner takes the pot
              </p>
              {wager > userPoints && (
                <p className="text-red-400 text-xs mt-1">Exceeds your balance</p>
              )}
              {wager < MIN_WAGER && wager > 0 && (
                <p className="text-red-400 text-xs mt-1">Minimum wager is {MIN_WAGER} points</p>
              )}
            </div>
          )}

          {/* Accept mode — show cap summary of selected squad */}
          {mode === "accept" && isComplete && (
            <div className="bg-zinc-800/50 rounded-xl px-4 py-3 border border-zinc-700/40 text-sm">
              <div className="flex items-center justify-between text-zinc-400">
                <span>Your squad cap cost</span>
                <span className="text-white font-bold">{capCost} / {SALARY_CAP}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-400 mt-1">
                <span>You need for wager</span>
                <span className={userPoints >= effectiveWager ? "text-green-400" : "text-red-400"}>
                  {effectiveWager.toLocaleString()} pts
                </span>
              </div>
            </div>
          )}

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
            {submitting
              ? mode === "create" ? "Posting…" : "Entering…"
              : mode === "create" ? "Issue Challenge" : "Enter Battle"
            }
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
