"use client";

import { POINTS_CONFIG } from "@/lib/cards";

interface SyncData {
  isSubscribed: boolean;
  likedVideoIds?: string;
  commentCount: number;
  watchMinutes: number;
}

interface PointsActivityProps {
  sync: SyncData | null;
  onSync: () => Promise<void>;
  syncing: boolean;
}

const activities = [
  {
    icon: "🔔",
    label: "Subscribe to 5iveguysfc",
    points: POINTS_CONFIG.subscribe,
    suffix: "one-time",
    key: "subscribe" as const,
  },
  {
    icon: "👍",
    label: "Like a video",
    points: POINTS_CONFIG.like,
    suffix: "per like",
    key: "like" as const,
  },
  {
    icon: "💬",
    label: "Comment on a video",
    points: POINTS_CONFIG.comment,
    suffix: "per comment",
    key: "comment" as const,
  },
];

export default function PointsActivity({ sync, onSync, syncing }: PointsActivityProps) {
  const likedCount = sync ? JSON.parse(sync.likedVideoIds ?? "[]").length : 0;

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
          <div
            key={activity.key}
            className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/50"
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
          </div>
        ))}
      </div>

      {sync && (
        <div className="mt-4 pt-4 border-t border-zinc-800 grid grid-cols-2 gap-3">
          <Stat
            label="Subscribed"
            value={sync.isSubscribed ? "✓ Yes" : "Not yet"}
            highlight={sync.isSubscribed}
          />
          <Stat label="Liked videos" value={String(likedCount)} />
          <Stat label="Comments" value={String(sync.commentCount)} />
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-zinc-800/60 rounded-xl p-3">
      <p className="text-zinc-500 text-xs">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${highlight ? "text-green-400" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}
