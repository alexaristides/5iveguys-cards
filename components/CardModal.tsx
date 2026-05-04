"use client";

import { useEffect, useState } from "react";
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

interface CardModalProps {
  card: Card;
  onClose: () => void;
}

export default function CardModal({ card, onClose }: CardModalProps) {
  const [flipped, setFlipped] = useState(false);
  const [mounted, setMounted] = useState(false);

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

  const badge = RARITY_BADGE[card.rarity];
  const currentImage = flipped && card.backImage ? card.backImage : card.image;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      {/* Card container */}
      <div
        className="relative z-10 flex flex-col items-center gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* The card */}
        <div
          className={`
            relative rounded-2xl overflow-hidden border-2 cursor-pointer
            transition-transform duration-200 hover:scale-[1.02]
            ${RARITY_BORDER[card.rarity]}
            ${RARITY_GLOW[card.rarity]}
          `}
          style={{ width: 320, height: 448 }}
          onClick={() => card.backImage && setFlipped(!flipped)}
        >
          <Image
            src={currentImage}
            alt={card.name}
            fill
            className="object-cover"
            sizes="320px"
            priority
          />

          {/* Legendary shimmer */}
          {card.rarity === "legendary" && (
            <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 via-transparent to-amber-300/10 pointer-events-none animate-pulse" />
          )}
          {card.rarity === "epic" && (
            <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/10 via-transparent to-purple-300/10 pointer-events-none" />
          )}

          {/* Flip hint */}
          {card.backImage && (
            <div className="absolute bottom-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm">
              <svg className="w-3 h-3 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-white/70 text-xs">Tap to flip</span>
            </div>
          )}
        </div>

        {/* Card info */}
        <div className="text-center">
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${badge.class}`}>
            {badge.label}
          </span>
          <h2 className="text-white text-xl font-bold mt-2">{card.name}</h2>
          {card.kit && <p className="text-zinc-400 text-sm">{card.kit}</p>}
          {card.description && <p className="text-zinc-500 text-sm mt-1">{card.description}</p>}
        </div>

        {/* Close button */}
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
    </div>,
    document.body
  );
}
