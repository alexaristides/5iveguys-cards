"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { Card, Rarity } from "@/lib/cards";

const RARITY_GLOW: Record<Rarity, string> = {
  common: "",
  rare: "shadow-[0_0_60px_rgba(96,165,250,0.5)]",
  epic: "shadow-[0_0_60px_rgba(192,132,252,0.6)]",
  legendary: "shadow-[0_0_80px_rgba(251,191,36,0.7)]",
};

const RARITY_BADGE: Record<Rarity, { label: string; class: string }> = {
  common: { label: "Common", class: "bg-zinc-700 text-zinc-300" },
  rare: { label: "Rare", class: "bg-blue-900/80 text-blue-300 border border-blue-700/50" },
  epic: { label: "Epic", class: "bg-purple-900/80 text-purple-300 border border-purple-700/50" },
  legendary: { label: "Legendary", class: "bg-amber-900/80 text-amber-300 border border-amber-700/50" },
};

const RARITY_BORDER: Record<Rarity, string> = {
  common: "border-zinc-600",
  rare: "border-blue-400",
  epic: "border-purple-400",
  legendary: "border-amber-400",
};

type StatKey = "goalkeeping" | "strength" | "speed" | "agility" | "celebration" | "clutch";

const STATS: { key: StatKey; label: string; color: string; bar: string }[] = [
  { key: "goalkeeping",  label: "Goalkeeping",  color: "text-yellow-400", bar: "bg-yellow-500" },
  { key: "strength",     label: "Strength",     color: "text-green-400",  bar: "bg-green-500" },
  { key: "speed",        label: "Speed",        color: "text-blue-400",   bar: "bg-blue-500" },
  { key: "agility",      label: "Agility",      color: "text-cyan-400",   bar: "bg-cyan-500" },
  { key: "celebration",  label: "Celebration",  color: "text-purple-400", bar: "bg-purple-500" },
  { key: "clutch",       label: "Clutch",       color: "text-red-400",    bar: "bg-red-500" },
];

type StatsMap = Record<StatKey, number>;

const DEFAULT_STATS: StatsMap = { goalkeeping: 50, strength: 50, speed: 50, agility: 50, celebration: 50, clutch: 50 };

interface CardModalProps {
  card: Card;
  onClose: () => void;
}

export default function CardModal({ card, onClose }: CardModalProps) {
  const [flipped, setFlipped] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [averages, setAverages] = useState<StatsMap>(DEFAULT_STATS);
  const [voteCount, setVoteCount] = useState(0);
  const [userVote, setUserVote] = useState<StatsMap | null>(null);
  const [draft, setDraft] = useState<StatsMap>(DEFAULT_STATS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const fetchVotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/cards/${card.id}/votes`);
      if (!res.ok) return;
      const data = await res.json();
      setAverages(data.averages);
      setVoteCount(data.voteCount);
      if (data.userVote) {
        setUserVote(data.userVote);
        setDraft(data.userVote);
        setIsLoggedIn(true);
      } else {
        // userVote being null could mean not logged in or no vote yet
        // We detect login state separately via session check
        setIsLoggedIn(data.userVote !== undefined);
      }
    } catch {
      // silently ignore
    }
  }, [card.id]);

  useEffect(() => {
    setMounted(true);
    // Check login state
    fetch("/api/auth/session").then(async (r) => {
      if (r.ok) {
        const s = await r.json();
        setIsLoggedIn(!!s?.user);
      }
    });
    fetchVotes();

    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, fetchVotes]);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/cards/${card.id}/votes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (res.ok) {
        setUserVote(draft);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        await fetchVotes();
      }
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) return null;

  const badge = RARITY_BADGE[card.rarity];
  const currentImage = flipped && card.backImage ? card.backImage : card.image;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      {/* Modal container */}
      <div
        className="relative z-10 flex flex-col lg:flex-row items-center lg:items-start gap-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: card + info */}
        <div className="flex flex-col items-center gap-4 flex-shrink-0">
          <div
            className={`
              relative rounded-2xl overflow-hidden border-2 cursor-pointer
              transition-transform duration-200 hover:scale-[1.02]
              ${RARITY_BORDER[card.rarity]}
              ${RARITY_GLOW[card.rarity]}
            `}
            style={{ width: 260, height: 364 }}
            onClick={() => card.backImage && setFlipped(!flipped)}
          >
            <Image
              src={currentImage}
              alt={card.name}
              fill
              className="object-cover"
              sizes="260px"
              priority
            />
            {card.rarity === "legendary" && (
              <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 via-transparent to-amber-300/10 pointer-events-none animate-pulse" />
            )}
            {card.rarity === "epic" && (
              <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/10 via-transparent to-purple-300/10 pointer-events-none" />
            )}
            {card.backImage && (
              <div className="absolute bottom-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm">
                <svg className="w-3 h-3 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="text-white/70 text-xs">Tap to flip</span>
              </div>
            )}
          </div>

          <div className="text-center">
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${badge.class}`}>
              {badge.label}
            </span>
            <h2 className="text-white text-xl font-bold mt-2">{card.name}</h2>
            {card.kit && <p className="text-zinc-400 text-sm">{card.kit}</p>}
            {card.description && <p className="text-zinc-500 text-sm mt-1">{card.description}</p>}
          </div>

          <button
            onClick={onClose}
            className="flex items-center gap-2 px-5 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors border border-white/10"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Close
          </button>
        </div>

        {/* Right: stats panel */}
        <div className="w-full lg:w-80 bg-zinc-900/90 border border-zinc-700/50 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-bold text-base">Community Stats</h3>
            <span className="text-zinc-500 text-xs">{voteCount} {voteCount === 1 ? "vote" : "votes"}</span>
          </div>

          <div className="space-y-3 mb-5">
            {STATS.map(({ key, label, color, bar }) => (
              <div key={key}>
                <div className="flex justify-between items-center mb-1">
                  <span className={`text-xs font-semibold ${color}`}>{label}</span>
                  <span className="text-white text-xs font-bold">{averages[key]}</span>
                </div>
                <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${bar}`}
                    style={{ width: `${averages[key]}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Voting section */}
          <div className="border-t border-zinc-700/50 pt-4">
            {isLoggedIn ? (
              <>
                <p className="text-zinc-400 text-xs mb-3">
                  {userVote ? "Update your vote" : "Cast your vote"} — drag each slider to rate 0–100
                </p>
                <div className="space-y-3">
                  {STATS.map(({ key, label, color }) => (
                    <div key={key}>
                      <div className="flex justify-between items-center mb-1">
                        <span className={`text-xs font-medium ${color}`}>{label}</span>
                        <span className="text-white text-xs font-bold w-8 text-right">{draft[key]}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={draft[key]}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, [key]: parseInt(e.target.value) }))
                        }
                        className="w-full h-1.5 accent-white cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className={`mt-4 w-full py-2 rounded-lg text-sm font-semibold transition-all ${
                    saved
                      ? "bg-green-600 text-white"
                      : "bg-white text-zinc-900 hover:bg-zinc-100 disabled:opacity-50"
                  }`}
                >
                  {saved ? "Saved!" : saving ? "Saving…" : userVote ? "Update Vote" : "Submit Vote"}
                </button>
              </>
            ) : (
              <p className="text-zinc-500 text-xs text-center">Sign in to vote on this card's stats</p>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
