"use client";

import { useState, useEffect } from "react";
import { POINTS_CONFIG } from "@/lib/cards";

interface SyncData {
  isSubscribed: boolean;
  likedVideoIds?: string;
  earlyLikedVideoIds?: string;
}

interface PointsActivityProps {
  sync: SyncData | null;
  onSync: () => Promise<void>;
  syncing: boolean;
  channelSlug?: string;
  youtubeChannelId?: string;
  watchTimeSeconds?: number;
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

export default function PointsActivity({ sync, onSync, syncing, channelSlug, youtubeChannelId, watchTimeSeconds, lastDailyReward, onClaimDaily, claimingDaily }: PointsActivityProps) {
  // Prefer the real YouTube channel ID URL — avoids slug/handle mismatch bugs.
  // Fall back to @handle guess only when channel ID isn't available.
  const youtubeBase = youtubeChannelId
    ? `https://www.youtube.com/channel/${youtubeChannelId}`
    : `https://www.youtube.com/@${channelSlug ?? "5iveguysfc"}`;

  const activities = [
    {
      icon: "🔔",
      label: `Subscribe to ${channelSlug ?? "5iveguysfc"}`,
      points: POINTS_CONFIG.subscribe,
      suffix: "one-time",
      href: `${youtubeBase}?sub_confirmation=1`,
    },
    {
      icon: "⚡",
      label: `Like within ${POINTS_CONFIG.earlyLikeWindowHours}h of upload`,
      points: POINTS_CONFIG.earlyLike,
      suffix: "per early like",
      href: `${youtubeBase}/videos`,
    },
    {
      icon: "👍",
      label: "Like a video",
      points: POINTS_CONFIG.like,
      suffix: "per like",
      href: `${youtubeBase}/videos`,
    },
    {
      icon: "▶",
      label: "Watch videos",
      points: POINTS_CONFIG.watchMinute,
      suffix: "pts per min",
      href: `/${channelSlug ?? ""}/videos`,
    },
  ];

  const likedCount = sync ? JSON.parse(sync.likedVideoIds ?? "[]").length : 0;
  const earlyLikedCount = sync ? JSON.parse(sync.earlyLikedVideoIds ?? "[]").length : 0;

  return (
    <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-6 backdrop-blur">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-white font-semibold">Earn Points</h2>
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

      <div className="space-y-3">
        {activities.map((activity) => (
          <a
            key={activity.href}
            href={activity.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{activity.icon}</span>
              <div>
                <p className="text-white text-sm font-medium">{activity.label}</p>
                <p className="text-zinc-500 text-xs">{activity.suffix}</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-purple-400 font-bold text-sm">+{activity.points}</span>
              <span className="text-zinc-600 text-xs"> pts</span>
            </div>
          </a>
        ))}
      </div>

      {onClaimDaily && (
        <div className="mt-3">
          <DailyRewardRow
            lastDailyReward={lastDailyReward}
            onClaim={onClaimDaily}
            claiming={claimingDaily}
          />
        </div>
      )}

      {sync && (
        <div className="mt-4 pt-4 border-t border-zinc-800 grid grid-cols-3 gap-3">
          <Stat label="Subscribed" value={sync.isSubscribed ? "✓ Yes" : "Not yet"} highlight={sync.isSubscribed} />
          <Stat label="Liked videos" value={String(likedCount)} />
          <Stat label="Early likes" value={String(earlyLikedCount)} />
        </div>
      )}

      {watchTimeSeconds !== undefined && watchTimeSeconds > 0 && (
        <div className="mt-3 px-3 py-2 rounded-xl bg-zinc-800/50 flex items-center justify-between">
          <span className="text-zinc-400 text-xs">Watch time earned</span>
          <a href={`/${channelSlug}/videos`} className="text-purple-400 text-xs font-semibold hover:text-purple-300 transition-colors">
            {Math.floor(watchTimeSeconds / 60)} min →
          </a>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-zinc-800/60 rounded-xl p-3">
      <p className="text-zinc-500 text-xs">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${highlight ? "text-green-400" : "text-white"}`}>{value}</p>
    </div>
  );
}
