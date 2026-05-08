import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const maxDuration = 60;

const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID!;
const ADMIN_SECRET = process.env.ADMIN_SECRET!;
const VIDEOS_PER_PAGE = 25;

type YTResponse = {
  _error?: string;
  _status?: number;
  items?: unknown[];
  nextPageToken?: string;
};

async function ytFetch(url: string, apiKey: string): Promise<YTResponse | null> {
  const sep = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${sep}key=${apiKey}`);
  if (!res.ok) {
    const body = await res.text();
    return { _error: body, _status: res.status };
  }
  return res.json();
}

async function getUploadsPlaylistId(apiKey: string): Promise<{ id: string | null; error?: string }> {
  const data = await ytFetch(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${CHANNEL_ID}`,
    apiKey
  );
  if (data?._error) return { id: null, error: `YouTube API error (${data._status}): ${data._error.slice(0, 300)}` };
  type Ch = { contentDetails?: { relatedPlaylists?: { uploads?: string } } };
  const id = (data?.items as Ch[])?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;
  return { id };
}

async function getAllVideoIds(apiKey: string, uploadsPlaylistId: string): Promise<string[]> {
  const allIds: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const data = await ytFetch(url, apiKey);
    if (!data?.items) break;
    type Item = { contentDetails?: { videoId?: string } };
    const ids = (data.items as Item[]).map((i) => i.contentDetails?.videoId).filter((id): id is string => Boolean(id));
    allIds.push(...ids);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return allIds;
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "YOUTUBE_API_KEY not set" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const page: number = body.page ?? 0;
  const uploadsPlaylistId: string | undefined = body.uploadsPlaylistId;
  const isFullReset: boolean = body.fullReset ?? false;

  // Page 0: optionally wipe VideoScanStatus for a full re-scan
  if (page === 0 && isFullReset) {
    await prisma.videoScanStatus.deleteMany({});
    await prisma.channelCommentCache.deleteMany({});
  }

  // Resolve uploads playlist ID
  let playlistId = uploadsPlaylistId;
  if (!playlistId) {
    const result = await getUploadsPlaylistId(apiKey);
    if (!result.id) return NextResponse.json({ error: result.error ?? "Could not get uploads playlist" }, { status: 400 });
    playlistId = result.id;
  }

  // Fetch all video IDs (cheap: 1 unit per 50 videos)
  const allVideoIds = await getAllVideoIds(apiKey, playlistId);
  if (allVideoIds.length === 0) return NextResponse.json({ error: "No videos found" }, { status: 400 });

  const totalVideos = allVideoIds.length;
  const start = page * VIDEOS_PER_PAGE;
  const end = Math.min(start + VIDEOS_PER_PAGE, totalVideos);
  const videoBatch = allVideoIds.slice(start, end);

  // Load existing scan timestamps for this batch
  const existingStatuses = await prisma.videoScanStatus.findMany({
    where: { videoId: { in: videoBatch } },
  });
  const statusMap = new Map(existingStatuses.map((s) => [s.videoId, s]));

  // Collect new comment counts per author for this batch
  const newCounts: Record<string, { count: number; displayName: string }> = {};

  await Promise.all(
    videoBatch.map(async (videoId) => {
      const existing = statusMap.get(videoId);
      const cutoff = existing?.newestCommentAt ?? null;
      // First-ever scan: only fetch 1 page (most recent 100 comments) — fast, captures active commenters
      // Re-scans: paginate until we hit the cutoff timestamp — usually stops after 0-1 pages
      const isFirstScan = !cutoff;
      let newestSeen: Date | null = null;
      let pageToken: string | undefined;
      let done = false;
      let pagesScanned = 0;

      do {
        const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet,replies&videoId=${videoId}&maxResults=100&order=time${pageToken ? `&pageToken=${pageToken}` : ""}`;
        const data = await ytFetch(url, apiKey);
        pagesScanned++;
        if (!data?.items) break;

        type Thread = {
          snippet?: {
            topLevelComment?: {
              snippet?: {
                authorChannelId?: { value?: string };
                authorDisplayName?: string;
                publishedAt?: string;
              };
            };
            totalReplyCount?: number;
          };
          replies?: {
            comments?: {
              snippet?: {
                authorChannelId?: { value?: string };
                authorDisplayName?: string;
                publishedAt?: string;
              };
            }[];
          };
        };

        for (const thread of data.items as Thread[]) {
          const top = thread.snippet?.topLevelComment?.snippet;
          const publishedAt = top?.publishedAt ? new Date(top.publishedAt) : null;

          // Stop paginating once we hit comments older than our last scan
          if (cutoff && publishedAt && publishedAt <= cutoff) {
            done = true;
            break;
          }

          if (publishedAt && (!newestSeen || publishedAt > newestSeen)) {
            newestSeen = publishedAt;
          }

          const authorId = top?.authorChannelId?.value;
          if (authorId) {
            if (!newCounts[authorId]) newCounts[authorId] = { count: 0, displayName: top?.authorDisplayName ?? "" };
            newCounts[authorId].count++;
          }

          // Count replies (inline only — stays within 1 API call per video page)
          for (const reply of thread.replies?.comments ?? []) {
            const rId = reply.snippet?.authorChannelId?.value;
            if (rId) {
              if (!newCounts[rId]) newCounts[rId] = { count: 0, displayName: reply.snippet?.authorDisplayName ?? "" };
              newCounts[rId].count++;
            }
          }
        }

        if (done) break;
        // First scan: stop after 1 page — captures recent commenters without timing out
        if (isFirstScan && pagesScanned >= 1) break;
        pageToken = data.nextPageToken;
      } while (pageToken);

      // Update per-video scan status
      const newNewest = newestSeen ?? existing?.newestCommentAt ?? null;
      await prisma.videoScanStatus.upsert({
        where: { videoId },
        create: { videoId, lastScanned: new Date(), newestCommentAt: newNewest },
        update: { lastScanned: new Date(), newestCommentAt: newNewest ?? undefined },
      });
    })
  );

  // Write comment counts to DB in serial batches of 50 to avoid connection exhaustion
  const entries = Object.entries(newCounts);
  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);
    await Promise.all(
      batch.map(([authorChannelId, { count, displayName }]) =>
        prisma.channelCommentCache.upsert({
          where: { authorChannelId },
          create: { authorChannelId, displayName, commentCount: count },
          update: {
            commentCount: { increment: count },
            displayName: displayName || undefined,
          },
        })
      )
    );
  }

  const hasMore = end < totalVideos;

  // On final page, update overall scan status
  if (!hasMore) {
    const agg = await prisma.channelCommentCache.aggregate({ _sum: { commentCount: true } });
    await prisma.channelScanStatus.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", lastScanned: new Date(), videoCount: totalVideos, commentCount: agg._sum.commentCount ?? 0 },
      update: { lastScanned: new Date(), videoCount: totalVideos, commentCount: agg._sum.commentCount ?? 0 },
    });
  }

  return NextResponse.json({
    ok: true,
    page,
    uploadsPlaylistId: playlistId,
    videosInPage: videoBatch.length,
    totalVideos,
    videosProcessed: end,
    newAuthorsFound: Object.keys(newCounts).length,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
  });
}
