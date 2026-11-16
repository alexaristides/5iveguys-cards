"use client";

import { useState, useEffect } from "react";

interface PointsActivityProps {
  channelName: string;
  onSync: () => Promise<void>;
  syncing: boolean;
  lastDailyReward?: string | null;
  onClaimDaily?: () => Promise<void>;
  claimingDaily?: boolean;
}

const DAILY_REWARD_POINTS = 50;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

function DailyRewardRow({
  lastDailyReward,
  onClaim,
  claiming,
}: {
  lastDailyReward?: string | null;
  onClaim: () => Promise<void>;
  claiming?: boolean;
}) {
  const [, setTick] = useState(0);

  // Re-render every minute so the countdown stays live
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();
  const lastMs = lastDailyReward ? new Date(lastDailyReward).getTime() : 0;
  const msUntilNext = lastMs + COOLDOWN_MS - now;
  const isReady = msUntilNext <= 0;
  const hours = Math.floor(msUntilNext / 3_600_000);
  const mins = Math.floor((msUntilNext % 3_600_000) / 60_000);

  return (
    <button
      onClick={isReady && !claiming ? onClaim : undefined}
      disabled={!isReady || claiming}
      className={`w-full flex items-center justify-between p-3 rounded-xl transition-colors text-left
        ${isReady
          ? "bg-amber-900/25 hover:bg-amber-900/40 border border-amber-700/40 cursor-pointer"
          : "bg-zinc-800/50 border border-zinc-700/30 cursor-default"
        }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl select-none">🎁</span>
        <div>
          <p className="text-white text-sm font-medium">{claiming ? "Claiming…" : "Daily reward"}</p>
          <p className="text-zinc-500 text-xs">
            {isReady ? "Available now!" : `Next in ${hours}h ${mins}m`}
          </p>
        </div>
      </div>
      <div className="text-right">
        <span className={`font-bold text-sm ${isReady ? "text-amber-400" : "text-zinc-600"}`}>
          +{DAILY_REWARD_POINTS}
        </span>
        <span className="text-zinc-600 text-xs"> pts</span>
      </div>
    </button>
  );
}

export default function PointsActivity({ channelName, onSync, syncing, lastDailyReward, onClaimDaily, claimingDaily }: PointsActivityProps) {
  return (
    <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-6 backdrop-blur">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white font-semibold">Fan Points</h2>
        <button
          onClick={onSync}
          disabled={syncing}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all
            ${syncing
              ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              : "bg-purple-900/60 text-purple-300 hover:bg-purple-800/60 border border-purple-700/50"
            }`}
        >
          <svg
            className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {syncing ? "Syncing..." : "Sync YouTube"}
        </button>
      </div>

      <p className="text-zinc-400 text-sm">
        You get points for being a fan of {channelName}. Hit sync to collect them.
      </p>

      {onClaimDaily && (
        <div className="mt-4">
          <DailyRewardRow
            lastDailyReward={lastDailyReward}
            onClaim={onClaimDaily}
            claiming={claimingDaily}
          />
        </div>
      )}
    </div>
  );
}
