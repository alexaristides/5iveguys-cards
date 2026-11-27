import { prisma } from "./db";

/** How often a server instance checks a channel for new uploads. */
const REFRESH_MS = 15 * 60 * 1000;
const lastRefresh = new Map<string, number>();

const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** The latest uploads (YouTube sends 15) from a channel's public RSS feed. Pure, for tests. */
export function parseUploadsFeed(xml: string) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
    .map(([, entry]) => ({
      videoId: entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1] ?? "",
      title: decode(entry.match(/<title>([^<]*)<\/title>/)?.[1] ?? ""),
      publishedAt: new Date(entry.match(/<published>([^<]+)<\/published>/)?.[1] ?? 0),
      thumbnailUrl: entry.match(/<media:thumbnail url="([^"]+)"/)?.[1] ?? "",
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
      select: { videoId: true },
    });
    const known = new Set(existing.map((v) => v.videoId));
    const fresh = videos.filter((v) => !known.has(v.videoId));
    if (fresh.length) {
      await prisma.videoMeta.createMany({ data: fresh.map((v) => ({ ...v, channelId: channel.id })), skipDuplicates: true });
    }
  } catch (err) {
    console.error("refreshChannelUploads failed", err);
    // Try again in a minute rather than waiting the full interval.
    lastRefresh.set(channel.id, now - REFRESH_MS + 60_000);
  }
}
