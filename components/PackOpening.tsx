"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, Pack } from "@/lib/cards";
import CardDisplay from "./CardDisplay";

type Phase = "idle" | "shaking" | "revealing" | "done";

interface PackOpeningProps {
  pack: Pack;
  userPoints: number;
  onOpen: (packId: string) => Promise<{ cards: Card[]; remainingPoints: number } | null>;
  onPointsUpdate: (points: number) => void;
}

export default function PackOpening({ pack, userPoints, onOpen, onPointsUpdate }: PackOpeningProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [cards, setCards] = useState<Card[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const canAfford = userPoints >= pack.cost;

  async function handleOpen() {
    if (!canAfford || phase !== "idle") return;
    setError(null);
    setPhase("shaking");

    await new Promise((r) => setTimeout(r, 700));
    setPhase("revealing");

    const result = await onOpen(pack.id);
    if (!result) {
      setError("Failed to open pack. Try again.");
      setPhase("idle");
      return;
    }

    setCards(result.cards);
    onPointsUpdate(result.remainingPoints);

    for (let i = 0; i < result.cards.length; i++) {
      await new Promise((r) => setTimeout(r, 400));
      setRevealedCount(i + 1);
    }

    setPhase("done");
  }

  function handleReset() {
    setPhase("idle");
    setCards([]);
    setRevealedCount(0);
  }

  const oddsDisplay = Object.entries(pack.odds)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} ${v}%`)
    .join(" · ");

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Pack visual */}
      <AnimatePresence mode="wait">
        {phase === "idle" || phase === "shaking" ? (
          <motion.div
            key="pack"
            className={`relative w-48 h-64 rounded-2xl cursor-pointer select-none
              bg-gradient-to-br from-purple-900 to-purple-700
              border-2 border-purple-500/50
              flex flex-col items-center justify-center gap-3
              ${phase === "shaking" ? "animate-pack-shake" : canAfford ? "hover:scale-105 transition-transform" : "opacity-50 cursor-not-allowed"}
            `}
            onClick={handleOpen}
            whileHover={canAfford && phase === "idle" ? { scale: 1.04 } : {}}
            whileTap={canAfford && phase === "idle" ? { scale: 0.97 } : {}}
          >
            {/* Shine effect */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/5 via-white/10 to-transparent pointer-events-none" />

            <div className="text-5xl">⚽</div>
            <div className="text-center px-4">
              <p className="text-white font-bold text-lg">{pack.name}</p>
              <p className="text-purple-300 text-sm mt-1">{pack.cardCount} cards</p>
            </div>

            {phase === "idle" && (
              <div className="mt-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20">
                <span className="text-white text-sm font-semibold">{pack.cost} pts</span>
              </div>
            )}
            {phase === "shaking" && (
              <div className="text-purple-300 text-sm animate-pulse">Opening...</div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Cards reveal */}
      {(phase === "revealing" || phase === "done") && cards.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-wrap justify-center gap-4 max-w-2xl"
        >
          {cards.slice(0, revealedCount).map((card, i) => (
            <motion.div
              key={`${card.id}-${i}`}
              initial={{ opacity: 0, scale: 0.5, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <CardDisplay card={card} size="lg" showDetails />
            </motion.div>
          ))}
        </motion.div>
      )}

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      {/* Actions */}
      {phase === "done" && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleReset}
          className="px-6 py-2.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-colors"
        >
          Open Another
        </motion.button>
      )}

      {/* Odds */}
      {phase === "idle" && (
        <p className="text-zinc-500 text-xs text-center">{oddsDisplay}</p>
      )}

      {/* Afford warning */}
      {phase === "idle" && !canAfford && (
        <p className="text-amber-500 text-sm">
          Need {pack.cost - userPoints} more points to open this pack
        </p>
      )}
    </div>
  );
}
