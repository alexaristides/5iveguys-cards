"use client";

import { useState } from "react";
import Image from "next/image";
import { Card, Rarity } from "@/lib/cards";
import CardModal from "./CardModal";

const RARITY_STYLES: Record<Rarity, string> = {
  common: "border-zinc-600 shadow-zinc-900",
  rare: "border-blue-400 shadow-blue-900",
  epic: "border-purple-400 shadow-purple-900",
  legendary: "border-amber-400 shadow-amber-900",
};

const RARITY_GLOW: Record<Rarity, string> = {
  common: "",
  rare: "shadow-[0_0_20px_rgba(96,165,250,0.4)]",
  epic: "shadow-[0_0_20px_rgba(192,132,252,0.5)]",
  legendary: "shadow-[0_0_30px_rgba(251,191,36,0.6)] animate-glow-pulse",
};

const RARITY_BADGE: Record<Rarity, { label: string; class: string }> = {
  common: { label: "Common", class: "bg-zinc-700 text-zinc-300" },
  rare: { label: "Rare", class: "bg-blue-900/80 text-blue-300" },
  epic: { label: "Epic", class: "bg-purple-900/80 text-purple-300" },
  legendary: { label: "Legendary", class: "bg-amber-900/80 text-amber-300" },
};

interface CardDisplayProps {
  card: Card;
  size?: "sm" | "md" | "lg";
  animate?: boolean;
  showDetails?: boolean;
}

export default function CardDisplay({
  card,
  size = "md",
  animate = false,
  showDetails = false,
}: CardDisplayProps) {
  const [hovered, setHovered] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const sizeClasses = {
    sm: "w-28 h-40",
    md: "w-40 h-56",
    lg: "w-52 h-72",
  };

  const badge = RARITY_BADGE[card.rarity];

  return (
    <>
      <div
        className={`relative flex flex-col items-center gap-2 ${animate ? "animate-card-reveal" : ""}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          className={`
            relative rounded-xl overflow-hidden cursor-pointer
            border-2 transition-all duration-300
            ${sizeClasses[size]}
            ${RARITY_STYLES[card.rarity]}
            ${hovered ? RARITY_GLOW[card.rarity] : ""}
            ${hovered ? "scale-105 -translate-y-1" : ""}
          `}
          onClick={() => setModalOpen(true)}
        >
          <Image
            src={card.image}
            alt={card.name}
            fill
            className="object-cover transition-opacity duration-300"
            sizes="(max-width: 768px) 120px, 200px"
          />

          {card.rarity === "legendary" && (
            <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 via-transparent to-amber-300/10 pointer-events-none" />
          )}
          {card.rarity === "epic" && (
            <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/10 via-transparent to-purple-300/10 pointer-events-none" />
          )}
        </div>

        {showDetails && (
          <div className="text-center">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.class}`}>
              {badge.label}
            </span>
            <p className="text-white text-sm font-medium mt-1 leading-tight">{card.name}</p>
            {card.kit && (
              <p className="text-zinc-500 text-xs">{card.kit}</p>
            )}
          </div>
        )}
      </div>

      {modalOpen && <CardModal card={card} onClose={() => setModalOpen(false)} />}
    </>
  );
}
