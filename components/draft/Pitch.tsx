"use client";

import { motion } from "framer-motion";
import type { Formation, PlacedPlayer } from "@/lib/draft/types";
import { ratingTier } from "./util";

interface PitchProps {
  formation: Formation;
  placed: PlacedPlayer[];
  /** Slot indices that should glow as available (during position picking). */
  availableSlots?: number[];
  /** Slot indices explicitly marked N/A (greyed). */
  naSlots?: number[];
  /** Currently selected slot (position-first mode). */
  selectedSlot?: number | null;
  onSlotClick?: (slotIndex: number) => void;
  /** Hide ratings (Hard difficulty). */
  hideRatings?: boolean;
  className?: string;
}

export default function Pitch({
  formation,
  placed,
  availableSlots,
  naSlots,
  selectedSlot,
  onSlotClick,
  hideRatings,
  className = "",
}: PitchProps) {
  const placedBySlot = new Map(placed.map((p) => [p.slotIndex, p]));

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl ${className}`}
      style={{
        aspectRatio: "3 / 4",
        background:
          "repeating-linear-gradient(0deg, #0d7e39 0px, #0d7e39 26px, #0c7434 26px, #0c7434 52px)",
      }}
    >
      {/* Pitch markings */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-3 rounded-lg border-2 border-white/30" />
        {/* halfway line */}
        <div className="absolute left-3 right-3 top-1/2 h-0.5 -translate-y-1/2 bg-white/30" />
        {/* centre circle */}
        <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/30" />
        <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40" />
        {/* own penalty box (bottom) */}
        <div className="absolute bottom-3 left-1/2 h-[16%] w-[55%] -translate-x-1/2 border-2 border-b-0 border-white/30" />
        <div className="absolute bottom-3 left-1/2 h-[7%] w-[28%] -translate-x-1/2 border-2 border-b-0 border-white/30" />
        {/* opponent penalty box (top) */}
        <div className="absolute top-3 left-1/2 h-[16%] w-[55%] -translate-x-1/2 border-2 border-t-0 border-white/30" />
        <div className="absolute top-3 left-1/2 h-[7%] w-[28%] -translate-x-1/2 border-2 border-t-0 border-white/30" />
      </div>

      {/* Slots */}
      {formation.slots.map((slot, i) => {
        const filled = placedBySlot.get(i);
        const isAvailable = availableSlots?.includes(i);
        const isNA = naSlots?.includes(i);
        const isSelected = selectedSlot === i;
        const clickable = !!onSlotClick && (isAvailable || isSelected || (!availableSlots && !naSlots));

        return (
          <button
            key={i}
            type="button"
            disabled={!clickable}
            onClick={() => clickable && onSlotClick?.(i)}
            className="absolute -translate-x-1/2 -translate-y-1/2 focus:outline-none"
            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
          >
            {filled ? (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className="flex w-[58px] flex-col items-center gap-0.5"
              >
                <div className="relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-zinc-900 shadow-lg">
                  <span className="text-base leading-none">{filled.player.flag}</span>
                  {!hideRatings && (
                    <span
                      className={`absolute -right-1.5 -top-1.5 rounded-full px-1 text-[9px] font-extrabold leading-tight ${ratingTier(filled.player.rating).bg} ${ratingTier(filled.player.rating).text}`}
                    >
                      {filled.player.rating}
                    </span>
                  )}
                </div>
                <span className="max-w-[64px] truncate rounded bg-black/55 px-1 text-[9px] font-semibold text-white">
                  {lastName(filled.player.name)}
                </span>
              </motion.div>
            ) : (
              <div
                className={`flex flex-col items-center gap-0.5 transition ${
                  isAvailable ? "scale-110" : isNA ? "opacity-30" : ""
                }`}
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-dashed ${
                    isAvailable
                      ? "animate-pulse border-[#FFC233] bg-[#FFC233]/20"
                      : isSelected
                        ? "border-[#FFC233] bg-[#FFC233]/30"
                        : "border-white/50 bg-black/20"
                  }`}
                >
                  <span className="text-[10px] font-bold text-white/90">{slot.label}</span>
                </div>
                {isNA && <span className="text-[8px] font-bold text-rose-300">N/A</span>}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function lastName(name: string): string {
  // "K. Mbappé" -> "Mbappé"; "Vinícius Jr" -> "Vinícius"; single token kept.
  const parts = name.split(" ");
  return parts.length > 1 ? parts.slice(1).join(" ") : name;
}
