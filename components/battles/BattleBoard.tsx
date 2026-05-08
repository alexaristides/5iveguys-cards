"use client";

import { useState } from "react";
import Image from "next/image";
import { type BattleEntry } from "@/lib/battles";
import SquadBuilderModal from "./SquadBuilderModal";

interface BattleBoardProps {
  battles: BattleEntry[];
  currentUserId: string;
  ownedCardIds: string[];
  userPoints: number;
  onAccept: (battleId: string, cardIds: string[]) => Promise<void>;
  onCancel: (battleId: string) => Promise<void>;
  loading: boolean;
}

export default function BattleBoard({
  battles,
  currentUserId,
  ownedCardIds,
  userPoints,
  onAccept,
  onCancel,
  loading,
}: BattleBoardProps) {
  const [acceptingBattleId, setAcceptingBattleId] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  async function handleCancel(battleId: string) {
    setActingId(battleId);
    try {
      await onCancel(battleId);
    } finally {
      setActingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-zinc-800/50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (battles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">⚔️</div>
        <p className="text-zinc-400 font-medium">No active challenges</p>
        <p className="text-zinc-600 text-sm mt-1">Be the first to issue one!</p>
      </div>
    );
  }

  const acceptingBattle = acceptingBattleId
    ? battles.find((b) => b.id === acceptingBattleId)
    : null;

  return (
    <>
      <div className="space-y-3">
        {battles.map((battle) => {
          const isOwn = battle.challengerId === currentUserId;
          const isActing = actingId === battle.id;

          return (
            <div
              key={battle.id}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden"
            >
              <div className="flex items-center gap-4 px-4 py-3">
                {/* Hidden card placeholder — blind wager */}
                <div className="w-12 h-[68px] rounded-lg border-2 border-dashed border-zinc-700 shrink-0 flex items-center justify-center">
                  <span className="text-zinc-600 text-xl select-none">?</span>
                </div>

                {/* Challenger info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {battle.challenger.image && (
                      <Image
                        src={battle.challenger.image}
                        alt={battle.challenger.name ?? ""}
                        width={20}
                        height={20}
                        className="rounded-full shrink-0"
                      />
                    )}
                    <span className="text-white text-sm font-medium truncate">
                      {isOwn ? "You" : (battle.challenger.name ?? "Unknown")}
                    </span>
                  </div>
                  <p className="text-zinc-600 text-xs mt-0.5">Squad hidden · 3v3 best-of-3</p>
                </div>

                {/* Wager */}
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 justify-end">
                    <span className="text-amber-400 text-sm">★</span>
                    <span className="text-white font-bold text-sm">{battle.wager.toLocaleString()}</span>
                  </div>
                  <p className="text-zinc-600 text-[10px] mt-0.5">pts · winner takes</p>
                  <p className="text-zinc-500 text-[10px]">{(battle.wager * 2).toLocaleString()} pot</p>
                </div>

                {/* Action */}
                <div className="shrink-0 ml-1">
                  {isOwn ? (
                    <button
                      onClick={() => handleCancel(battle.id)}
                      disabled={isActing}
                      className="text-xs px-3 py-1.5 rounded-lg border border-red-800/60 text-red-400 hover:bg-red-900/20 disabled:opacity-40 transition-colors"
                    >
                      {isActing ? "…" : "Cancel"}
                    </button>
                  ) : (
                    <button
                      onClick={() => setAcceptingBattleId(battle.id)}
                      disabled={isActing}
                      className="text-xs px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white font-medium transition-colors"
                    >
                      {isActing ? "…" : "Accept ▸"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Squad builder modal for accepting */}
      {acceptingBattle && (
        <SquadBuilderModal
          mode="accept"
          ownedCardIds={ownedCardIds}
          userPoints={userPoints}
          wager={acceptingBattle.wager}
          challengerName={acceptingBattle.challenger.name ?? "Unknown"}
          onClose={() => setAcceptingBattleId(null)}
          onAccept={async (cardIds) => {
            setActingId(acceptingBattle.id);
            try {
              await onAccept(acceptingBattle.id, cardIds);
            } finally {
              setActingId(null);
              setAcceptingBattleId(null);
            }
          }}
        />
      )}
    </>
  );
}
