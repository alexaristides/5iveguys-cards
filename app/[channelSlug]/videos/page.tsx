"use client";

import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import YouTube, { YouTubePlayer, YouTubeEvent } from "react-youtube";

interface Video {
  videoId: string;
  title: string | null;
  thumbnailUrl: string | null;
  publishedAt: string;
  watchedByMe: boolean;
}

function formatWatchTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 86400) return "Today";
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export default function VideosPage() {
  const { data: session, status } = useSession();
  const params = useParams<{ channelSlug: string }>();
  const { channelSlug } = params;

  const [videos, setVideos] = useState<Video[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [activeVideo, setActiveVideo] = useState<Video | null>(null);
  const [sessionPts, setSessionPts] = useState(0);         // pts earned this modal session
  const [pendingSeconds, setPendingSeconds] = useState(0); // qualifying seconds not yet sent
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());

  const playerRef = useRef<YouTubePlayer | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingRef = useRef(0);  // mirror of pendingSeconds for use inside interval closure
  const channelSlugRef = useRef(channelSlug);
  channelSlugRef.current = channelSlug;

  const PAGE_SIZE = 24;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page) });
    if (debouncedSearch) qs.set("q", debouncedSearch);
    const res = await fetch(`/api/channels/${channelSlug}/videos?${qs}`);
    if (res.ok) {
      const data = await res.json();
      setVideos(data.videos);
      setTotal(data.total);
      // Seed watchedIds from server data
      setWatchedIds((prev) => {
        const next = new Set(prev);
        for (const v of data.videos as Video[]) {
          if (v.watchedByMe) next.add(v.videoId);
        }
        return next;
      });
    }
    setLoading(false);
  }, [channelSlug, page, debouncedSearch]);

  useEffect(() => {
    if (status === "authenticated") fetchVideos();
  }, [status, fetchVideos]);

  // ── Watch time tracking ──────────────────────────────────────────────────
  async function flushSeconds(secs: number) {
    if (secs < 1 || !activeVideo) return;
    const videoId = activeVideo.videoId;
    const res = await fetch(`/api/channels/${channelSlugRef.current}/videos/${videoId}/watch-time`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seconds: secs }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.pointsEarned > 0) {
        setSessionPts((p) => p + data.pointsEarned);
        setWatchedIds((prev) => new Set([...prev, videoId]));
      }
    }
  }

  function startTracking() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    pendingRef.current = 0;
    setPendingSeconds(0);

    intervalRef.current = setInterval(async () => {
      const player = playerRef.current;
      if (!player) return;

      const isVisible = document.visibilityState === "visible";
      let isPlaying = false;
      let volumeOk = false;
      try {
        isPlaying = player.getPlayerState() === 1; // YT.PlayerState.PLAYING
        volumeOk = player.getVolume() > 10 && !player.isMuted();
      } catch {
        return;
      }

      if (isVisible && isPlaying && volumeOk) {
        pendingRef.current += 5;
        setPendingSeconds(pendingRef.current);

        // Flush every full 60 seconds
        if (pendingRef.current >= 60) {
          const toSend = Math.floor(pendingRef.current / 60) * 60;
          pendingRef.current -= toSend;
          setPendingSeconds(pendingRef.current);
          await flushSeconds(toSend);
        }
      }
    }, 5000);
  }

  function stopTracking() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // Flush any remaining sub-60s (no points, but keeps secondsAwarded accurate)
    if (pendingRef.current >= 5) {
      flushSeconds(pendingRef.current);
    }
    pendingRef.current = 0;
    setPendingSeconds(0);
  }

  function openVideo(video: Video) {
    setActiveVideo(video);
    setSessionPts(0);
    setPendingSeconds(0);
    pendingRef.current = 0;
  }

  function closeModal() {
    stopTracking();
    setActiveVideo(null);
    setSessionPts(0);
  }

  // Pause tracking when tab loses focus
  useEffect(() => {
    function onVisibilityChange() {
      // Interval already checks visibilityState on each tick — no extra action needed
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const isWatched = (videoId: string) => watchedIds.has(videoId);

  // ── Loading / auth ───────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <main className="max-w-4xl mx-auto px-4 pt-24 pb-24">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-white">Videos</h1>
            {total > 0 && <p className="text-zinc-500 text-sm mt-0.5">{total} videos</p>}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5">
            <span className="text-purple-400">▶</span>
            <span>2 pts / min watched</span>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search videos…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-sm outline-none focus:border-purple-500 placeholder:text-zinc-600"
          />
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-24 text-zinc-600">
            {debouncedSearch ? "No videos match your search." : "No videos yet — sync YouTube to load them."}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {videos.map((video) => (
              <button
                key={video.videoId}
                onClick={() => openVideo(video)}
                className="group relative rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 overflow-hidden text-left transition-all focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {/* Thumbnail */}
                <div className="relative w-full aspect-video bg-zinc-800">
                  {video.thumbnailUrl ? (
                    <Image
                      src={video.thumbnailUrl}
                      alt={video.title ?? "Video"}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, 33vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600 text-3xl">▶</div>
                  )}
                  {/* Play overlay */}
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                      <span className="text-white text-lg ml-0.5">▶</span>
                    </div>
                  </div>
                  {/* Watched badge */}
                  {isWatched(video.videoId) && (
                    <div className="absolute top-2 right-2 bg-green-600/90 rounded-full px-1.5 py-0.5 flex items-center gap-0.5">
                      <span className="text-white text-[10px] font-semibold">✓</span>
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className="p-2.5">
                  <p className="text-white text-xs font-medium leading-snug line-clamp-2 mb-1">
                    {video.title ?? "Untitled video"}
                  </p>
                  <p className="text-zinc-600 text-[10px]">{timeAgo(video.publishedAt)}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-sm disabled:opacity-40 hover:border-zinc-700 transition-colors"
            >
              ← Prev
            </button>
            <span className="text-zinc-500 text-sm">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-sm disabled:opacity-40 hover:border-zinc-700 transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </main>

      {/* ── Watch modal ── */}
      {activeVideo && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm"
            onClick={closeModal}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div
              className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden pointer-events-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* YouTube embed */}
              <div className="relative w-full aspect-video bg-black">
                <YouTube
                  videoId={activeVideo.videoId}
                  className="w-full h-full"
                  iframeClassName="w-full h-full"
                  opts={{ width: "100%", height: "100%", playerVars: { autoplay: 0 } }}
                  onReady={(e: YouTubeEvent) => { playerRef.current = e.target; }}
                  onPlay={() => startTracking()}
                  onPause={() => { /* interval naturally skips non-playing ticks */ }}
                  onEnd={() => stopTracking()}
                />
              </div>

              {/* Footer */}
              <div className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold leading-snug line-clamp-2 mb-1">
                    {activeVideo.title ?? "Untitled video"}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-zinc-500 text-xs">
                      {isWatched(activeVideo.videoId) ? "Already watched" : "2 pts / min"}
                    </span>
                    <span className="text-zinc-700 text-xs">·</span>
                    <span className="text-zinc-500 text-xs">volume &gt; 10% · tab active</span>
                    {(sessionPts > 0 || pendingSeconds > 0) && (
                      <>
                        <span className="text-zinc-700 text-xs">·</span>
                        <span className="text-green-400 text-xs font-semibold">
                          +{sessionPts} pts earned
                          {pendingSeconds > 0 && (
                            <span className="text-zinc-500 font-normal">
                              {" "}({formatWatchTime(pendingSeconds)} buffering)
                            </span>
                          )}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={closeModal}
                  className="shrink-0 text-zinc-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
