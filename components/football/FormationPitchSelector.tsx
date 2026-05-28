"use client";

import Image from "next/image";
import { useState, useMemo } from "react";
import {
  type Formation,
  type FootballCard,
  type Position,
  type LineupSlot,
  FORMATIONS,
  adaptSlots,
  getPlayerRating,
} from "@/lib/football";
import PlayerPickerModal from "./PlayerPickerModal";

// [x%, y%] from top-left of pitch, referring to centre of each slot
// y=0 = top (CPU goal), y=100 = bottom (user goal)
// User team lives in the lower 55% (y ~42–90)
type PosCoords = Record<Position, [number, number][]>;

const SLOT_COORDS: Record<Formation, PosCoords> = {
  "2-2-2": {
    GK:  [[50, 88]],
    DEF: [[25, 74], [75, 74]],
    MID: [[25, 58], [75, 58]],
    ATT: [[33, 42], [67, 42]],
  },
  "3-2-1": {
    GK:  [[50, 88]],
    DEF: [[16, 74], [50, 74], [84, 74]],
    MID: [[33, 58], [67, 58]],
    ATT: [[50, 42]],
  },
  "1-3-2": {
    GK:  [[50, 88]],
    DEF: [[50, 74]],
    MID: [[16, 58], [50, 58], [84, 58]],
    ATT: [[33, 42], [67, 42]],
  },
  "2-3-1": {
    GK:  [[50, 88]],
    DEF: [[28, 74], [72, 74]],
    MID: [[16, 58], [50, 58], [84, 58]],
    ATT: [[50, 42]],
  },
};

const RARITY_RING: Record<string, string> = {
  common:    "ring-zinc-400/80",
  rare:      "ring-blue-400",
  epic:      "ring-purple-400",
  legendary: "ring-amber-400",
};

const POS_LABEL_COLOR: Record<Position, string> = {
  GK:  "bg-yellow-600/80 text-yellow-100",
  DEF: "bg-blue-700/80 text-blue-100",
  MID: "bg-green-700/80 text-green-100",
  ATT: "bg-red-700/80 text-red-100",
};

interface Props {
  ownedCards: FootballCard[];
  formation: Formation;
  lineup: LineupSlot[];
  onFormationChange: (f: Formation) => void;
  onLineupChange: (slots: LineupSlot[]) => void;
}

export default function FormationPitchSelector({
  ownedCards,
  formation,
  lineup,
  onFormationChange,
  onLineupChange,
}: Props) {
  const [pickingSlotIdx, setPickingSlotIdx] = useState<number | null>(null);

  // ids of cards currently placed in OTHER slots (not the one being picked)
  const occupiedIds = useMemo(() => {
    const set = new Set<string>();
    lineup.forEach((s, i) => {
      if (s.card && i !== pickingSlotIdx) set.add(s.card.id);
    });
    return set;
  }, [lineup, pickingSlotIdx]);

  function handleFormationChange(f: Formation) {
    onFormationChange(f);
    onLineupChange(adaptSlots(lineup, f));
  }

  function handlePick(card: FootballCard | null) {
    if (pickingSlotIdx === null) return;
    const next = lineup.map((s, i) =>
      i === pickingSlotIdx ? { ...s, card } : s,
    );
    onLineupChange(next);
    setPickingSlotIdx(null);
  }

  const filledCount = lineup.filter((s) => s.card !== null).length;
  const pickingSlot = pickingSlotIdx !== null ? lineup[pickingSlotIdx] : null;

  // Group slots by position for coord lookup
  const posCounters: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };

  return (
    <>
      {/* Formation tabs */}
      <div className="flex gap-1 mb-4 bg-zinc-900/60 rounded-xl p-1 border border-zinc-800">
        {(Object.entries(FORMATIONS) as [Formation, { label: string; desc: string }][]).map(([fm, info]) => (
          <button
            key={fm}
            onClick={() => handleFormationChange(fm)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              formation === fm
                ? "bg-green-700 text-white shadow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <div>{info.label}</div>
            <div className={`text-[9px] font-medium mt-0.5 ${formation === fm ? "text-green-200" : "text-zinc-600"}`}>
              {info.desc}
            </div>
          </button>
        ))}
      </div>

      {/* Pitch */}
      <div
        className="relative w-full overflow-hidden rounded-2xl shadow-2xl"
        style={{
          paddingTop: "150%",
          background: "linear-gradient(180deg, #173d20 0%, #1c5228 35%, #1e5a2a 50%, #1c5228 65%, #173d20 100%)",
        }}
      >
        <div className="absolute inset-0">
          {/* Pitch stripes */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className={i % 2 === 0 ? "absolute inset-x-0 bg-black/[0.05]" : "absolute inset-x-0"}
              style={{ top: `${i * 12.5}%`, height: "12.5%" }}
            />
          ))}

          {/* Boundary */}
          <div className="absolute inset-[3%] border border-white/20 rounded-sm" />

          {/* Halfway line */}
          <div className="absolute left-[3%] right-[3%] border-t border-white/20" style={{ top: "50%" }} />

          {/* Centre circle */}
          <div
            className="absolute rounded-full border border-white/20"
            style={{ width: "22%", aspectRatio: "1", left: "39%", top: "calc(50% - 11%)" }}
          />
          <div
            className="absolute w-1.5 h-1.5 rounded-full bg-white/30"
            style={{ left: "50%", top: "50%", transform: "translate(-50%,-50%)" }}
          />

          {/* Top penalty area */}
          <div
            className="absolute border border-white/15 border-t-0"
            style={{ width: "46%", left: "27%", top: "3%", height: "14%" }}
          />
          {/* Bottom penalty area */}
          <div
            className="absolute border border-white/15 border-b-0"
            style={{ width: "46%", left: "27%", bottom: "3%", height: "14%" }}
          />

          {/* Top goal */}
          <div
            className="absolute bg-white/8 border border-white/30 border-t-0"
            style={{ width: "20%", left: "40%", top: 0, height: "3.5%" }}
          />
          {/* Bottom goal */}
          <div
            className="absolute bg-white/8 border border-white/30 border-b-0"
            style={{ width: "20%", left: "40%", bottom: 0, height: "3.5%" }}
          />

          {/* CPU label */}
          <div
            className="absolute left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/30 text-white/25 text-[9px] font-bold uppercase tracking-widest"
            style={{ top: "22%" }}
          >
            CPU Team
          </div>

          {/* Divider accent on user side */}
          <div
            className="absolute left-0 right-0 h-px bg-white/10"
            style={{ top: "50%" }}
          />

          {/* Player slots */}
          {lineup.map((slot, slotIdx) => {
            const localIdx = posCounters[slot.position]++;
            const coords = SLOT_COORDS[formation][slot.position];
            const [x, y] = coords[localIdx] ?? coords[0];
            const { card } = slot;
            const isActive = pickingSlotIdx === slotIdx;

            return (
              <div
                key={`${slot.position}-${slot.posIndex}`}
                className="absolute"
                style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
              >
                <button
                  onClick={() => setPickingSlotIdx(slotIdx)}
                  className="flex flex-col items-center gap-1 group"
                >
                  {card ? (
                    /* Filled slot */
                    <div
                      className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden ring-2 ring-offset-2 ring-offset-transparent
                        ${RARITY_RING[card.rarity]} shadow-lg
                        ${isActive ? "ring-white scale-110" : "group-hover:scale-105"}
                        transition-all duration-200`}
                    >
                      <div className="relative w-full h-full">
                        <Image
                          src={card.imageUrl}
                          alt={card.name}
                          fill
                          className="object-cover object-top"
                          sizes="56px"
                        />
                      </div>
                    </div>
                  ) : (
                    /* Empty slot */
                    <div
                      className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-dashed flex items-center justify-center
                        ${isActive
                          ? "border-white bg-white/15 scale-110"
                          : "border-white/30 bg-white/5 group-hover:border-white/60 group-hover:bg-white/10"
                        }
                        transition-all duration-200 shadow-sm`}
                    >
                      <svg className="w-5 h-5 text-white/40 group-hover:text-white/70 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                  )}

                  {/* Position badge + name */}
                  <div className="flex flex-col items-center gap-0.5 pointer-events-none">
                    {card ? (
                      <span className="text-white/90 text-[8px] font-bold max-w-[56px] truncate text-center leading-tight drop-shadow-lg">
                        {card.name}
                      </span>
                    ) : (
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${POS_LABEL_COLOR[slot.position]}`}>
                        {slot.position}
                      </span>
                    )}
                  </div>
                </button>
              </div>
            );
          })}

          {/* Filled count badge */}
          <div
            className="absolute left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/50 backdrop-blur-sm text-xs font-bold flex items-center gap-1.5"
            style={{ bottom: "1%" }}
          >
            <span className={filledCount === 7 ? "text-green-400" : "text-zinc-400"}>
              {filledCount}/7
            </span>
            <span className="text-zinc-600">players selected</span>
          </div>
        </div>
      </div>

      {/* Player picker modal */}
      {pickingSlotIdx !== null && pickingSlot && (
        <PlayerPickerModal
          position={pickingSlot.position}
          ownedCards={ownedCards}
          occupiedIds={occupiedIds}
          currentCardId={pickingSlot.card?.id ?? null}
          onPick={handlePick}
          onClose={() => setPickingSlotIdx(null)}
        />
      )}
    </>
  );
}
