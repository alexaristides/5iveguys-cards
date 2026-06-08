"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { DraftPlayer, Formation, Nation, PlacedPlayer, Pos } from "@/lib/draft/types";
import { NATIONS, nationSquad, playerPositions, randomNation } from "@/lib/draft/nations";
import { playerFitsSlot } from "@/lib/draft/formations";
import type { DraftConfig } from "./SetupScreen";
import Pitch from "./Pitch";
import { ratingTier, posGroupColor } from "./util";

interface DraftScreenProps {
  config: DraftConfig;
  formation: Formation;
  placed: PlacedPlayer[];
  setPlaced: (p: PlacedPlayer[]) => void;
  rerollsLeft: number;
  setRerollsLeft: (n: number) => void;
  onComplete: () => void;
}

export default function DraftScreen({
  config,
  formation,
  placed,
  setPlaced,
  rerollsLeft,
  setRerollsLeft,
  onComplete,
}: DraftScreenProps) {
  const hideRatings = config.difficulty === "hard";
  const positionFirst = config.draftMode === "position";

  const [currentNation, setCurrentNation] = useState<Nation | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [reel, setReel] = useState<Nation>(NATIONS[0]);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [pickingFor, setPickingFor] = useState<DraftPlayer | null>(null); // nation-first picker overlay
  const reelRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const usedNationIds = Array.from(new Set(placed.map((p) => p.player.nationId)));
  const filledSlots = new Set(placed.map((p) => p.slotIndex));
  const remaining = formation.slots.length - placed.length;

  const stopReel = () => {
    if (reelRef.current) {
      clearInterval(reelRef.current);
      reelRef.current = null;
    }
  };

  useEffect(() => () => stopReel(), []);

  const doSpin = useCallback(() => {
    if (spinning) return;
    if (positionFirst && selectedSlot == null) return;
    setPickingFor(null);
    setSpinning(true);
    const chosen = randomNation(usedNationIds);
    stopReel();
    reelRef.current = setInterval(() => {
      setReel(NATIONS[Math.floor(Math.random() * NATIONS.length)]);
    }, 70);
    window.setTimeout(() => {
      stopReel();
      setReel(chosen);
      setCurrentNation(chosen);
      setSpinning(false);
    }, 1300);
  }, [spinning, positionFirst, selectedSlot, usedNationIds]);

  const reroll = () => {
    if (rerollsLeft <= 0 || spinning) return;
    setRerollsLeft(rerollsLeft - 1);
    setCurrentNation(null);
    doSpin();
  };

  // Which empty slots can a given player fill?
  const availableSlotsFor = (player: DraftPlayer): number[] =>
    formation.slots
      .map((slot, i) => ({ slot, i }))
      .filter(({ slot, i }) => !filledSlots.has(i) && playerFitsSlot(playerPositions(player), slot.label))
      .map(({ i }) => i);

  const placePlayer = (player: DraftPlayer, slotIndex: number) => {
    if (filledSlots.has(slotIndex)) return;
    const next = [...placed, { slotIndex, player }];
    setPlaced(next);
    setPickingFor(null);
    setCurrentNation(null);
    setSelectedSlot(null);
    if (next.length === formation.slots.length) {
      setTimeout(onComplete, 450);
    }
  };

  // Player tapped in the squad list.
  const onPlayerClick = (player: DraftPlayer) => {
    if (positionFirst) {
      if (selectedSlot == null) return;
      if (playerFitsSlot(playerPositions(player), formation.slots[selectedSlot].label)) {
        placePlayer(player, selectedSlot);
      }
      return;
    }
    // Nation-first: open the position picker if the player fits anywhere.
    if (availableSlotsFor(player).length === 0) return;
    setPickingFor(player);
  };

  const squad = currentNation ? nationSquad(currentNation, config.ratingsMode) : [];
  const displayNation = spinning ? reel : currentNation;

  return (
    <div className="mx-auto max-w-5xl px-4 py-5">
      {/* Counter */}
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-bold text-white">
          {remaining > 0 ? (
            <>
              <span className="text-[#FFC233]">{remaining}</span> position{remaining !== 1 ? "s" : ""} left to fill
            </>
          ) : (
            <span className="text-emerald-400">Squad complete!</span>
          )}
        </div>
        <div className="text-xs font-semibold text-zinc-400">
          {config.difficulty === "hard"
            ? "Hard · ratings hidden"
            : `${rerollsLeft} reroll${rerollsLeft !== 1 ? "s" : ""} left`}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* Pitch */}
        <div>
          <Pitch
            formation={formation}
            placed={placed}
            hideRatings={hideRatings}
            selectedSlot={selectedSlot}
            availableSlots={positionFirst && !spinning ? emptySlotIndices(formation, filledSlots) : undefined}
            naSlots={positionFirst ? Array.from(filledSlots) : undefined}
            onSlotClick={
              positionFirst
                ? (i) => {
                    if (filledSlots.has(i)) return;
                    setSelectedSlot(i);
                    setCurrentNation(null);
                  }
                : undefined
            }
            className="mx-auto max-w-[320px]"
          />
          {positionFirst && (
            <p className="mt-2 text-center text-xs text-zinc-400">
              {selectedSlot == null
                ? "Tap an empty slot on the pitch to choose a position"
                : `Filling ${formation.slots[selectedSlot].label} — spin for a nation`}
            </p>
          )}
        </div>

        {/* Spin + squad */}
        <div>
          {/* Spin panel */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-4">
              <motion.div
                animate={spinning ? { rotate: [0, 12, -12, 0] } : {}}
                transition={{ repeat: spinning ? Infinity : 0, duration: 0.4 }}
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-black/40 text-4xl"
              >
                {displayNation ? displayNation.flag : "🎯"}
              </motion.div>
              <div className="min-w-0 flex-1">
                {displayNation ? (
                  <>
                    <div className="truncate text-lg font-extrabold text-white">{displayNation.name}</div>
                    <div className="text-xs font-semibold text-zinc-400">
                      Group {displayNation.group}
                      {!spinning && currentNation && ` · ${currentNation.players.length} players`}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-zinc-400">
                    {positionFirst && selectedSlot == null
                      ? "Pick a position first, then spin."
                      : "Spin to land on one of 48 nations."}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={doSpin}
                disabled={spinning || !!currentNation || (positionFirst && selectedSlot == null) || remaining === 0}
                className="flex-1 rounded-xl bg-[#FFC233] py-3 text-sm font-extrabold text-zinc-950 transition hover:bg-[#ffce5c] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {spinning ? "Spinning…" : currentNation ? "Pick a player first" : "Spin"}
              </button>
              {config.difficulty !== "hard" && (
                <button
                  onClick={reroll}
                  disabled={rerollsLeft <= 0 || spinning || !currentNation}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ↻ Reroll
                </button>
              )}
            </div>
          </div>

          {/* Squad list */}
          {currentNation && !spinning && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">
                  {currentNation.flag} {currentNation.name} squad
                </h3>
                {positionFirst && selectedSlot != null && (
                  <span className="text-[11px] font-semibold text-[#FFC233]">
                    Tap a player who can play {formation.slots[selectedSlot].label}
                  </span>
                )}
              </div>
              <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                {squad.map((player) => {
                  const slots = availableSlotsFor(player);
                  const fitsSelected =
                    positionFirst && selectedSlot != null
                      ? playerFitsSlot(playerPositions(player), formation.slots[selectedSlot].label)
                      : slots.length > 0;
                  const disabled = positionFirst ? !fitsSelected : slots.length === 0;
                  return (
                    <PlayerRow
                      key={player.uid}
                      player={player}
                      disabled={disabled}
                      hideRatings={hideRatings}
                      onClick={() => onPlayerClick(player)}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nation-first position picker overlay */}
      <AnimatePresence>
        {pickingFor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setPickingFor(null)}
          >
            <motion.div
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0c1322] p-4 shadow-2xl"
            >
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">
                  Place {pickingFor.flag} {pickingFor.name}
                </h3>
                <button onClick={() => setPickingFor(null)} className="text-zinc-400 hover:text-white">✕</button>
              </div>
              <p className="mb-3 text-xs text-zinc-400">
                Highlighted slots fit this player ({playerPositions(pickingFor).join(", ")}). Tap one to place.
              </p>
              <Pitch
                formation={formation}
                placed={placed}
                hideRatings={hideRatings}
                availableSlots={availableSlotsFor(pickingFor)}
                naSlots={formation.slots
                  .map((_, i) => i)
                  .filter((i) => !availableSlotsFor(pickingFor).includes(i))}
                onSlotClick={(i) => placePlayer(pickingFor, i)}
                className="mx-auto max-w-[260px]"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function emptySlotIndices(formation: Formation, filled: Set<number>): number[] {
  return formation.slots.map((_, i) => i).filter((i) => !filled.has(i));
}

function PlayerRow({
  player,
  disabled,
  hideRatings,
  onClick,
}: {
  player: DraftPlayer;
  disabled: boolean;
  hideRatings: boolean;
  onClick: () => void;
}) {
  const tier = ratingTier(player.rating);
  const positions = playerPositions(player);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
        disabled
          ? "cursor-not-allowed border-white/5 bg-white/[0.02] opacity-45"
          : "border-white/10 bg-white/5 hover:border-[#FFC233]/60 hover:bg-[#FFC233]/5"
      }`}
    >
      {!hideRatings ? (
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold ${tier.bg} ${tier.text}`}>
          {player.rating}
        </span>
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-700 text-sm font-extrabold text-zinc-300">
          ?
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-white">{player.name}</div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className={`font-bold ${posGroupColor(player.pos as Pos)}`}>{player.pos}</span>
          {player.alt && player.alt.length > 0 && (
            <span className="text-zinc-500">· {player.alt.join(" ")}</span>
          )}
          {player.club && <span className="truncate text-zinc-600">· {player.club}</span>}
        </div>
      </div>
      {positions.length > 1 && (
        <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
          {positions.length} pos
        </span>
      )}
    </button>
  );
}
