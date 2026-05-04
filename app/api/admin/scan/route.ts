import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const maxDuration = 60;

const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID!;
const ADMIN_SECRET = process.env.ADMIN_SECRET!;
const PAGE_SIZE = 20;

type YTResponse = { _error?: string; _status?: number; items?: unknown[]; nextPageToken?: string };

async function fetchYouTube(url: string, apiKey: string): Promise<YTResponse | null> {
  const sep = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${sep}key=${apiKey}`);
  if (!res.ok) {
    const body = await res.text();
    console.error(`[Admin Scan] ${res.status} ${url.split("?")[0]}\n`, body);
    return { _error: body, _status: res.status };
  }
  return res.json();
}

// Get the channel's uploads playlist ID — costs 1 unit (vs 100 for search.list)
async function getUploadsPlaylistId(apiKey: string): Promise<{ id: string | null; error?: string }> {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${CHANNEL_ID}`;
  const data = await fetchYouTube(url, apiKey);
  if (data?._error) return { id: null, error: `YouTube API error (${data._status}): ${data._error.slice(0, 300)}` };
  const playlistId = (data?.items as { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[])?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  return { id: playlistId ?? null };
}

// Fetch all video IDs from uploads playlist — 1 unit per page (vs 100 for search.list)
async function getAllVideoIds(apiKey: string, uploadsPlaylistId: string): Promise<string[]> {
  const allIds: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const data = await fetchYouTube(url, apiKey);
    if (!data?.items) break;
    const ids = (data.items as { contentDetails?: { videoId?: string } }[])
      .map((item) => item.contentDetails?.videoId)
      .filter((id): id is string => Boolean(id));
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
  if (!apiKey) {
    return NextResponse.json({ error: "YOUTUBE_API_KEY not set" }, { status: 500 });
  }

  const { page = 0, uploadsPlaylistId: cachedPlaylistId } = await req.json().catch(() => ({ page: 0, uploadsPlaylistId: undefined }));

  // On page 0, wipe existing cache for a fresh scan
  if (page === 0) {
    await prisma.channelCommentCache.deleteMany({});
  }

  // ── Step 1: Get uploads playlist ID (only needed on page 0) ──────────────
  let uploadsPlaylistId: string = cachedPlaylistId;
  if (!uploadsPlaylistId) {
    const result = await getUploadsPlaylistId(apiKey);
    if (!result.id) {
      return NextResponse.json({ error: result.error ?? "Could not get uploads playlist — check YOUTUBE_CHANNEL_ID and YOUTUBE_API_KEY" }, { status: 400 });
    }
    uploadsPlaylistId = result.id;
  }

  // ── Step 2: Fetch all video IDs via playlistItems (1 unit/page) ───────────
  const allVideoIds = await getAllVideoIds(apiKey, uploadsPlaylistId);

  if (allVideoIds.length === 0) {
    return NextResponse.json({ error: "No videos found in uploads playlist" }, { status: 400 });
  }

  const totalVideos = allVideoIds.length;
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, totalVideos);
  const videoBatch = allVideoIds.slice(start, end);

  // ── Step 3: Scan comments for this batch (parallel, 1 page per video) ────
  const authorCounts: Record<string, number> = {};

  await Promise.all(
    videoBatch.map(async (videoId) => {
      let vtPageToken: string | undefined;
      do {
        const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet,replies&videoId=${videoId}&maxResults=100${vtPageToken ? `&pageToken=${vtPageToken}` : ""}`;
        const data = await fetchYouTube(url, apiKey);
        if (!data?.items) break;

        type Thread = {
          snippet?: { topLevelComment?: { snippet?: { authorChannelId?: { value?: string } } } };
          replies?: { comments?: { snippet?: { authorChannelId?: { value?: string } } }[] };
        };
        for (const thread of data.items as Thread[]) {
          const topAuthor = thread.snippet?.topLevelComment?.snippet?.authorChannelId?.value;
          if (topAuthor) authorCounts[topAuthor] = (authorCounts[topAuthor] ?? 0) + 1;
          for (const reply of thread.replies?.comments ?? []) {
            const replyAuthor = reply.snippet?.authorChannelId?.value;
            if (replyAuthor) authorCounts[replyAuthor] = (authorCounts[replyAuthor] ?? 0) + 1;
          }
        }
        vtPageToken = data.nextPageToken;
      } while (vtPageToken);
    })
  );

  // ── Step 4: Merge into DB ─────────────────────────────────────────────────
  await Promise.all(
    Object.entries(authorCounts).map(([authorChannelId, count]) =>
      prisma.channelCommentCache.upsert({
        where: { authorChannelId },
        create: { authorChannelId, commentCount: count },
        update: { commentCount: { increment: count } },
      })
    )
  );

  const hasMore = end < totalVideos;

  if (!hasMore) {
    const total = await prisma.channelCommentCache.aggregate({ _sum: { commentCount: true } });
    await prisma.channelScanStatus.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", lastScanned: new Date(), videoCount: totalVideos, commentCount: total._sum.commentCount ?? 0 },
      update: { lastScanned: new Date(), videoCount: totalVideos, commentCount: total._sum.commentCount ?? 0 },
    });
  }

  return NextResponse.json({
    ok: true,
    page,
    uploadsPlaylistId,
    videosInPage: videoBatch.length,
    totalVideos,
    videosProcessed: end,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
  });
}
