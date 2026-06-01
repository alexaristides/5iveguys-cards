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
  common:    { label: "Common",    class: "bg-zinc-700/80 text-zinc-300" },
  rare:      { label: "Rare",      class: "bg-blue-900/80 text-blue-300 border border-blue-700/50" },
  epic:      { label: "Epic",      class: "bg-purple-900/80 text-purple-300 border border-purple-700/50" },
  legendary: { label: "Legendary", class: "bg-amber-900/80 text-amber-300 border border-amber-700/50" },
};

const RARITY_BORDER: Record<Rarity, string> = {
  common:    "border-zinc-600",
  rare:      "border-blue-400",
  epic:      "border-purple-400",
  legendary: "border-amber-400",
};

/* OVR ring + accent colours per rarity */
const OVR_STYLE: Record<Rarity, { ring: string; text: string; glow: string; bar: string }> = {
  common:    { ring: "border-zinc-400",  text: "text-zinc-200",  glow: "",                                          bar: "from-zinc-400 to-zinc-300" },
  rare:      { ring: "border-blue-400",  text: "text-blue-200",  glow: "shadow-[0_0_24px_rgba(96,165,250,0.45)]",   bar: "from-blue-500 to-blue-300" },
  epic:      { ring: "border-purple-400",text: "text-purple-200",glow: "shadow-[0_0_24px_rgba(192,132,252,0.5)]",   bar: "from-purple-500 to-purple-300" },
  legendary: { ring: "border-amber-400", text: "text-amber-200", glow: "shadow-[0_0_32px_rgba(251,191,36,0.55)]",   bar: "from-amber-500 to-amber-300" },
};

type StatKey = "attack" | "defense" | "speed" | "strength" | "skillMoves" | "iq" | "aura" | "goalkeeping" | "agility" | "celebration" | "clutch";

const STATS: { key: StatKey; label: string; abbrev: string; color: string; bar: string }[] = [
  { key: "attack",      label: "Attack",      abbrev: "ATK", color: "text-red-400",    bar: "bg-red-500" },
  { key: "defense",     label: "Defense",     abbrev: "DEF", color: "text-blue-400",   bar: "bg-blue-500" },
  { key: "speed",       label: "Speed",       abbrev: "SPD", color: "text-yellow-400", bar: "bg-yellow-400" },
  { key: "strength",    label: "Strength",    abbrev: "STR", color: "text-green-400",  bar: "bg-green-500" },
  { key: "skillMoves",  label: "Skill Moves", abbrev: "SKL", color: "text-purple-400", bar: "bg-purple-500" },
  { key: "iq",          label: "IQ",          abbrev: "IQ",  color: "text-cyan-400",   bar: "bg-cyan-500" },
  { key: "aura",        label: "Aura",        abbrev: "AUR", color: "text-orange-400", bar: "bg-orange-500" },
  { key: "goalkeeping", label: "Goalkeeping", abbrev: "GKP", color: "text-amber-400",  bar: "bg-amber-500" },
  { key: "agility",     label: "Agility",     abbrev: "AGI", color: "text-teal-400",   bar: "bg-teal-500" },
  { key: "celebration", label: "Celebration", abbrev: "CLB", color: "text-pink-400",   bar: "bg-pink-500" },
  { key: "clutch",      label: "Clutch",      abbrev: "CLT", color: "text-rose-400",   bar: "bg-rose-500" },
];

type StatsMap = Record<StatKey, number>;

const DEFAULT_STATS: StatsMap = {
  attack: 50, defense: 50, speed: 50, strength: 50, skillMoves: 50,
  iq: 50, aura: 50, goalkeeping: 50, agility: 50, celebration: 50, clutch: 50,
};

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
  const [pointsFlash, setPointsFlash] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [voteOpen, setVoteOpen] = useState(false);

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
        setIsLoggedIn(data.userVote !== undefined);
      }
    } catch { /* silently ignore */ }
  }, [card.id]);

  useEffect(() => {
    setMounted(true);
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
        const data = await res.json();
        setUserVote(draft);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        if (data.pointsEarned > 0) {
          setPointsFlash(true);
          setTimeout(() => setPointsFlash(false), 3000);
        }
        await fetchVotes();
      }
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) return null;

  const badge = RARITY_BADGE[card.rarity];
  const ovrStyle = OVR_STYLE[card.rarity];
  const currentImage = flipped && card.backImage ? card.backImage : card.image;
  const overall = Math.round(STATS.reduce((sum, { key }) => sum + averages[key], 0) / STATS.length);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-xl" />

      {/* Modal */}
      <div
        className="relative z-10 flex flex-col lg:flex-row items-start gap-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Left: card image + meta ── */}
        <div className="flex flex-col items-center gap-4 flex-shrink-0 w-full lg:w-auto">
          <div
            className={`
              relative rounded-2xl overflow-hidden border-2 cursor-pointer
              transition-transform duration-200 hover:scale-[1.02]
              ${RARITY_BORDER[card.rarity]}
              ${RARITY_GLOW[card.rarity]}
            `}
            style={{ width: 240, height: 336 }}
            onClick={() => card.backImage && setFlipped(!flipped)}
          >
            <Image src={currentImage} alt={card.name} fill className="object-cover" sizes="240px" priority />

            {card.rarity === "legendary" && (
              <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 via-transparent to-amber-300/10 pointer-events-none animate-pulse" />
            )}
            {card.rarity === "epic" && (
              <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/10 via-transparent to-purple-300/10 pointer-events-none" />
            )}

            {/* OVR overlay — FIFA-style bottom-left */}
            <div className={`absolute bottom-3 left-3 flex flex-col items-center justify-center w-[52px] h-[52px] rounded-full border-2 ${ovrStyle.ring} ${ovrStyle.glow} bg-black/70 backdrop-blur-sm`}>
              <span className={`text-[9px] font-bold uppercase tracking-widest ${ovrStyle.text} leading-none opacity-75`}>OVR</span>
              <span className={`text-[22px] font-black leading-tight tabular-nums ${ovrStyle.text}`}>{overall}</span>
            </div>

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
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${badge.class}`}>{badge.label}</span>
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

        {/* ── Right: stats panel ── */}
        <div className="w-full lg:w-72 flex flex-col gap-3">

          {/* Overall rating */}
          <div className="bg-zinc-950/80 border border-white/8 rounded-2xl p-6 text-center backdrop-blur-xl">
            <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-zinc-500 mb-5">
              Community Rating
            </p>

            {/* Big OVR circle */}
            <div className="flex justify-center mb-5">
              <div className={`relative flex flex-col items-center justify-center w-28 h-28 rounded-full border-2 ${ovrStyle.ring} ${ovrStyle.glow}`}>
                {/* subtle inner gradient */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/5 to-transparent" />
                <span className={`text-5xl font-black tabular-nums leading-none ${ovrStyle.text}`}>{overall}</span>
                <span className={`text-[9px] font-bold uppercase tracking-[0.25em] mt-1 ${ovrStyle.text} opacity-60`}>OVR</span>
              </div>
            </div>

            {/* Rarity-coloured thin bar */}
            <div className="h-px w-full bg-white/6 rounded-full overflow-hidden mb-4">
              <div className={`h-full bg-gradient-to-r ${ovrStyle.bar} transition-all duration-700`} style={{ width: `${overall}%` }} />
            </div>

            <p className="text-[11px] text-zinc-600 tabular-nums">
              {voteCount} {voteCount === 1 ? "community rating" : "community ratings"}
            </p>
          </div>

          {/* Attributes grid */}
          <div className="bg-zinc-950/80 border border-white/8 rounded-2xl p-5 backdrop-blur-xl">
            <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-zinc-500 mb-4">Attributes</p>

            <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
              {STATS.map(({ key, abbrev, color, bar }) => {
                const val = averages[key];
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[11px] font-bold uppercase tracking-wide ${color}`}>{abbrev}</span>
                      <span className="text-white text-xs font-bold tabular-nums">{val}</span>
                    </div>
                    <div className="h-[2px] bg-white/8 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${bar} transition-all duration-700`} style={{ width: `${val}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Vote section */}
          {isLoggedIn ? (
            <div className="bg-zinc-950/80 border border-white/8 rounded-2xl overflow-hidden backdrop-blur-xl">
              {/* Collapsible header */}
              <button
                onClick={() => setVoteOpen((o) => !o)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
              >
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-zinc-500">
                    {userVote ? "Your Vote" : "Cast a Vote"}
                  </p>
                  {userVote && (
                    <p className="text-[11px] text-zinc-600 mt-0.5">Tap to update</p>
                  )}
                </div>
                <svg
                  className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${voteOpen ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {voteOpen && (
                <div className="px-5 pb-5 border-t border-white/6">
                  <div className="space-y-4 mt-4">
                    {STATS.map(({ key, label, color }) => (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`text-xs font-semibold ${color}`}>{label}</span>
                          <span className="text-white text-xs font-bold tabular-nums w-7 text-right">{draft[key]}</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={draft[key]}
                          onChange={(e) =>
                            setDraft((prev) => ({ ...prev, [key]: parseInt(e.target.value) }))
                          }
                          className="w-full h-[3px] rounded-full appearance-none cursor-pointer"
                          style={{
                            background: `linear-gradient(to right, white ${draft[key]}%, rgba(255,255,255,0.12) ${draft[key]}%)`,
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleSubmit}
                    disabled={saving}
                    className={`mt-5 w-full py-2.5 rounded-xl text-sm font-semibold tracking-wide transition-all ${
                      saved
                        ? "bg-green-600 text-white"
                        : "bg-white text-zinc-900 hover:bg-zinc-100 active:scale-[0.98] disabled:opacity-40"
                    }`}
                  >
                    {saved ? "Saved!" : saving ? "Saving…" : userVote ? "Update Vote" : "Submit Vote"}
                  </button>

                  {pointsFlash && (
                    <div className="mt-2 text-center text-green-400 text-xs font-semibold animate-bounce">
                      +10 points for rating!
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-zinc-950/80 border border-white/8 rounded-2xl px-5 py-4 backdrop-blur-xl text-center">
              <p className="text-zinc-500 text-xs">Sign in to rate this card&apos;s attributes</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
