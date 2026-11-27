import { prisma } from "./db";

/** How often a server instance checks a channel for new uploads. */
const REFRESH_MS = 15 * 60 * 1000;
const lastRefresh = new Map<string, number>();

const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/**
 * The latest uploads (YouTube sends 15) from a channel's public RSS feed. Pure, for tests.
 * A Short's entry links to youtube.com/shorts/<id> instead of /watch?v=<id>.
 */
export function parseUploadsFeed(xml: string) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
    .map(([, entry]) => ({
      videoId: entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1] ?? "",
      title: decode(entry.match(/<title>([^<]*)<\/title>/)?.[1] ?? ""),
      publishedAt: new Date(entry.match(/<published>([^<]+)<\/published>/)?.[1] ?? 0),
      thumbnailUrl: entry.match(/<media:thumbnail url="([^"]+)"/)?.[1] ?? "",
      isShort: /<link rel="alternate" href="https:\/\/www\.youtube\.com\/shorts\//.test(entry),
    }))
    .filter((v) => v.videoId && v.publishedAt.getTime() > 0);
}

/**
 * Store a channel's newest uploads in VideoMeta, so the MOTM list stays current without anyone
 * pressing "Sync YouTube" (the iPhone app no longer does). Reads the channel's public RSS feed:
 * no API key, no quota, no fan's token. Runs at most every 15 minutes per channel per server and
 * never throws: if YouTube is down the list just shows what's already stored.
 */
export async function refreshChannelUploads(channel: { id: string; youtubeChannelId: string }) {
  if (!channel.youtubeChannelId.startsWith("UC")) return;
  const now = Date.now();
  if (now - (lastRefresh.get(channel.id) ?? 0) < REFRESH_MS) return;
  lastRefresh.set(channel.id, now);

  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channel.youtubeChannelId}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`YouTube feed ${res.status}`);
    const videos = parseUploadsFeed(await res.text());
    if (!videos.length) return;

    const existing = await prisma.videoMeta.findMany({
      where: { channelId: channel.id, videoId: { in: videos.map((v) => v.videoId) } },
      select: { videoId: true, isShort: true },
    });
    const known = new Map(existing.map((v) => [v.videoId, v.isShort]));
    const fresh = videos.filter((v) => !known.has(v.videoId));
    if (fresh.length) {
      await prisma.videoMeta.createMany({ data: fresh.map((v) => ({ ...v, channelId: channel.id })), skipDuplicates: true });
    }
    // Stored before Shorts were tagged (or by a YouTube sync): the feed says which they are.
    for (const isShort of [true, false]) {
      const ids = videos.filter((v) => v.isShort === isShort && known.has(v.videoId) && known.get(v.videoId) === null).map((v) => v.videoId);
      if (ids.length) await prisma.videoMeta.updateMany({ where: { channelId: channel.id, videoId: { in: ids } }, data: { isShort } });
    }
  } catch (err) {
    console.error("refreshChannelUploads failed", err);
    // Try again in a minute rather than waiting the full interval.
    lastRefresh.set(channel.id, now - REFRESH_MS + 60_000);
  }
}

/**
 * Whether a video is a YouTube Short: youtube.com/shorts/<id> answers 200 for a Short and redirects
 * a normal video to /watch. Anything else (YouTube down, timeout, a new consent page) is null: unknown.
 */
export async function isShortVideo(videoId: string): Promise<boolean | null> {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${encodeURIComponent(videoId)}`, {
      method: "HEAD",
      redirect: "manual",
      // "Reject all" on YouTube's cookie consent, which otherwise redirects requests from the UK/EU.
      headers: { cookie: "SOCS=CAI" },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (res.status === 200) return true;
    if (res.status >= 300 && res.status < 400 && (res.headers.get("location") ?? "").includes("/watch")) return false;
    return null;
  } catch {
    return null;
  }
}

/** How many unchecked videos one request checks, how many at once, and for how long at most. */
const CLASSIFY_BATCH = 48;
const CLASSIFY_PARALLEL = 8;
const CLASSIFY_BUDGET_MS = 2500;
/** Videos YouTube gave no answer for, so they aren't asked about again on every request. */
const RETRY_UNKNOWN_MS = 60 * 60 * 1000;
const unknownUntil = new Map<string, number>();

/**
 * Work out which of a channel's stored videos are Shorts, for the ones not checked yet (stored by a
 * YouTube sync, or before Shorts were tagged): newest first, a bounded batch per call, so the first
 * pages are right straight away and older ones follow. Never throws.
 */
export async function classifyShorts(channelId: string) {
  try {
    const now = Date.now();
    const unchecked = await prisma.videoMeta.findMany({
      where: { channelId, isShort: null },
      orderBy: { publishedAt: "desc" },
      take: CLASSIFY_BATCH * 2,
      select: { videoId: true },
    });
    const todo = unchecked.map((v) => v.videoId).filter((id) => (unknownUntil.get(id) ?? 0) < now).slice(0, CLASSIFY_BATCH);
    if (!todo.length) return;

    const results: { videoId: string; isShort: boolean | null }[] = [];
    for (let i = 0; i < todo.length && Date.now() - now < CLASSIFY_BUDGET_MS; i += CLASSIFY_PARALLEL) {
      const chunk = todo.slice(i, i + CLASSIFY_PARALLEL);
      results.push(...(await Promise.all(chunk.map(async (videoId) => ({ videoId, isShort: await isShortVideo(videoId) })))));
    }
    for (const isShort of [true, false]) {
      const ids = results.filter((r) => r.isShort === isShort).map((r) => r.videoId);
      if (ids.length) await prisma.videoMeta.updateMany({ where: { channelId, videoId: { in: ids } }, data: { isShort } });
    }
    for (const r of results) if (r.isShort === null) unknownUntil.set(r.videoId, now + RETRY_UNKNOWN_MS);
  } catch (err) {
    console.error("classifyShorts failed", err);
  }
}
