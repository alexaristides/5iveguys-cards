"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { FantasyOverview } from "@/components/fantasy/types";
import type { StatsMap } from "@/lib/card-rating";
import { SQUAD_CHANNEL, type SquadRating } from "./ratings";
import type { MotmResults, Video } from "./videos";

/**
 * The app's data hooks (mobile/src/lib/queries.ts) on the website, over the same API routes, with the
 * app's react-query behaviour: answers are kept between screens (so a player opens straight from the
 * squad), refetched on open once 15 s old (the app's staleTime) and when the window comes back, and a
 * failed request is tried once more.
 */

const STALE_MS = 15_000;

interface Entry { data: unknown; error: Error | null; at: number }

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};
const isStale = (key: string) => {
  const e = store.get(key);
  return !e || Date.now() - e.at > STALE_MS;
};

/** JSON request to the site's API, like the app's api(): POST when there's a body; throws the route's error message. */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: opts.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status})`);
  return data as T;
}

function setEntry(key: string, data: unknown) {
  store.set(key, { data, error: null, at: Date.now() });
  emit();
}

/** One request per key at a time; one retry after a second, as react-query's `retry: 1`. */
function load(key: string, fetcher: () => Promise<unknown>): Promise<void> {
  const running = inflight.get(key);
  if (running) return running;
  const run = (async () => {
    try {
      let data: unknown;
      try {
        data = await fetcher();
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
        data = await fetcher();
      }
      store.set(key, { data, error: null, at: Date.now() });
    } catch (err) {
      const prev = store.get(key);
      store.set(key, { data: prev?.data, error: err as Error, at: 0 });
    } finally {
      inflight.delete(key);
      emit();
    }
  })();
  inflight.set(key, run);
  return run;
}

/**
 * A cached GET. `always` refetches every time the screen opens (the tabs' useFocusEffect refetch),
 * otherwise only when stale. Refetching never clears what's shown: no spinner for a quiet refresh.
 */
function useCached<T>(key: string, fetcher: () => Promise<T>, always = false) {
  const entry = useSyncExternalStore(subscribe, () => store.get(key), () => undefined);
  const refetch = useCallback(() => load(key, fetcher), [key, fetcher]);

  useEffect(() => {
    if (always || isStale(key)) refetch();
    const onFocus = () => { if (document.visibilityState === "visible" && isStale(key)) refetch(); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [key, refetch, always]);

  const setData = useCallback((data: T) => setEntry(key, data), [key]);
  return { data: entry?.data as T | undefined, error: entry?.error ?? null, refetch, setData };
}

function useGet<T>(path: string, always = false) {
  const fetcher = useCallback(() => api<T>(path), [path]);
  return useCached<T>(path, fetcher, always);
}

/** The squad with the fans' overall for each player and whether you've rated them. */
export function useSquadRatings({ always = false } = {}) {
  const path = `/api/channels/${SQUAD_CHANNEL}/players`;
  const fetcher = useCallback(() => api<{ players: SquadRating[] }>(path).then((r) => r.players), [path]);
  return useCached<SquadRating[]>(path, fetcher, always);
}

/** The fans' average on each stat for one player, and your rating. */
export interface VotesResponse { averages: StatsMap; userVote: StatsMap | null; voteCount: number; position: string | null }
export const useVotes = (cardId: string) => useGet<VotesResponse>(`/api/cards/${cardId}/votes`);

/** Fantasy Div 1: the season, players, gameweeks and your team. */
export const useFantasy = () => useGet<FantasyOverview>("/api/fantasy");

/** Man of the Match standings for one video, and your vote. */
export const motmPath = (videoId: string) => `/api/channels/${SQUAD_CHANNEL}/videos/${videoId}/motm`;
export const useMotm = (videoId: string) => useGet<MotmResults>(motmPath(videoId));

interface VideoPage { videos: Video[]; total: number; page: number; pageSize: number }
const VIDEOS = `/api/channels/${SQUAD_CHANNEL}/videos`;
const hasMore = (p: VideoPage) => p.page * p.pageSize < p.total;

/** The team's videos, newest first, 24 a page (the app's infinite query: a refetch reloads every page shown). */
export function useVideos({ always = false } = {}) {
  const fetcher = useCallback(async () => {
    const shown = (store.get(VIDEOS)?.data as VideoPage[] | undefined)?.length ?? 1;
    const pages: VideoPage[] = [];
    for (let n = 1; n <= shown; n++) {
      const page = await api<VideoPage>(`${VIDEOS}?page=${n}`);
      pages.push(page);
      if (!hasMore(page)) break;
    }
    return pages;
  }, []);
  const query = useCached<VideoPage[]>(VIDEOS, fetcher, always);
  const [isFetchingNextPage, setFetchingNext] = useState(false);
  const last = query.data?.[query.data.length - 1];
  const hasNextPage = !!last && hasMore(last);

  async function fetchNextPage() {
    const pages = store.get(VIDEOS)?.data as VideoPage[] | undefined;
    const end = pages?.[pages.length - 1];
    if (!pages || !end || !hasMore(end) || isFetchingNextPage) return;
    setFetchingNext(true);
    try {
      const next = await api<VideoPage>(`${VIDEOS}?page=${end.page + 1}`);
      setEntry(VIDEOS, [...pages, next]);
    } catch {
      // Like the app: the button stays, so it can be tried again.
    } finally {
      setFetchingNext(false);
    }
  }

  return { ...query, videos: query.data?.flatMap((p) => p.videos), hasNextPage, isFetchingNextPage, fetchNextPage };
}

/** Puts the keyboard away (the app's Keyboard.dismiss). */
export function dismissKeyboard() {
  if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) document.activeElement.blur();
}
