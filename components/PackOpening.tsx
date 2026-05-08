"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CardResult, Pack, Rarity } from "@/lib/cards";
import CardDisplay from "./CardDisplay";

type Phase = "idle" | "shaking" | "revealing" | "done";
type DupPhase = "entering" | "overlay" | "dissolving" | "ghost";

const RARITY_TEXT: Record<Rarity, string> = {
  common: "text-zinc-300",
  rare: "text-blue-400",
  epic: "text-purple-400",
  legendary: "text-amber-400",
};

const RARITY_OVERLAY_BG: Record<Rarity, string> = {
  common: "bg-zinc-800/70 border-zinc-500",
  rare: "bg-blue-950/70 border-blue-400",
  epic: "bg-purple-950/70 border-purple-500",
  legendary: "bg-amber-950/70 border-amber-400",
};

function DuplicateCardSlot({ card }: { card: CardResult }) {
  const [dupPhase, setDupPhase] = useState<DupPhase>("entering");

  return (
    <div className="relative flex flex-col items-center gap-2" style={{ width: "13rem", minHeight: "18rem" }}>
      <AnimatePresence>
        {dupPhase !== "ghost" && (
          <motion.div
            key="card-wrapper"
            className="relative"
            initial={dupPhase === "entering" ? { opacity: 0, scale: 0.5, y: 40 } : false}
            animate={
              dupPhase === "dissolving"
                ? { opacity: 0, scale: 0.8 }
                : { opacity: 1, scale: 1, y: 0 }
            }
            transition={
              dupPhase === "entering"
                ? { type: "spring", stiffness: 300, damping: 20 }
                : dupPhase === "dissolving"
                ? { duration: 0.45 }
                : { duration: 0.3 }
            }
            onAnimationComplete={() => {
              if (dupPhase === "entering") setDupPhase("overlay");
              if (dupPhase === "dissolving") setDupPhase("ghost");
            }}
          >
            <CardDisplay card={card} size="lg" showDetails />

            {/* ALREADY OWNED overlay */}
            {(dupPhase === "overlay" || dupPhase === "dissolving") && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25 }}
                onAnimationComplete={() => {
                  if (dupPhase === "overlay") setDupPhase("dissolving");
                }}
                className={`absolute inset-0 rounded-xl border-2 backdrop-blur-sm flex flex-col items-center justify-center gap-1 ${RARITY_OVERLAY_BG[card.rarity]}`}
              >
                <span className={`font-bold text-base tracking-wide ${RARITY_TEXT[card.rarity]}`}>
                  ALREADY OWNED
                </span>
                <span className="text-zinc-400 text-xs">Converting to points...</span>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* +X pts floater — mounts when dissolving begins */}
      <AnimatePresence>
        {dupPhase === "dissolving" && (
          <motion.div
            key="floater"
            className={`absolute inset-0 flex items-center justify-center pointer-events-none`}
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: [0, 1, 1, 0], y: -50 }}
            transition={{ duration: 0.75, times: [0, 0.15, 0.65, 1] }}
          >
            <span className={`text-2xl font-extrabold drop-shadow-lg ${RARITY_TEXT[card.rarity]}`}>
              +{card.refundPoints} pts
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ghost placeholder preserves grid layout */}
      {dupPhase === "ghost" && (
        <div className="w-52 h-72 rounded-xl border-2 border-dashed border-zinc-700/40 bg-zinc-900/20 flex items-center justify-center">
          <span className={`text-sm font-semibold ${RARITY_TEXT[card.rarity]}`}>
            +{card.refundPoints} pts
          </span>
        </div>
      )}
    </div>
  );
}

interface PackOpeningProps {
  pack: Pack;
  userPoints: number;
  onOpen: (packId: string) => Promise<{ cards: CardResult[]; remainingPoints: number; totalRefund: number; duplicateCount: number } | null>;
  onPointsUpdate: (points: number) => void;
}

export default function PackOpening({ pack, userPoints, onOpen, onPointsUpdate }: PackOpeningProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [cards, setCards] = useState<CardResult[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [totalRefund, setTotalRefund] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);

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
    setTotalRefund(result.totalRefund);
    setDuplicateCount(result.duplicateCount);
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
    setTotalRefund(0);
    setDuplicateCount(0);
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
          {cards.slice(0, revealedCount).map((card, i) =>
            card.isDuplicate ? (
              <DuplicateCardSlot key={`${card.id}-${i}`} card={card} />
            ) : (
              <motion.div
                key={`${card.id}-${i}`}
                initial={{ opacity: 0, scale: 0.5, y: 40 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <CardDisplay card={card} size="lg" showDetails />
              </motion.div>
            )
          )}
        </motion.div>
      )}

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      {/* Duplicate refund summary */}
      {phase === "done" && duplicateCount > 0 && (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-zinc-400 text-sm text-center"
        >
          {duplicateCount} duplicate{duplicateCount !== 1 ? "s" : ""} — +{totalRefund} pts refunded
        </motion.p>
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
