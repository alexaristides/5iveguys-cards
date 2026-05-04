import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const maxDuration = 60;

const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID!;
const ADMIN_SECRET = process.env.ADMIN_SECRET!;
const PAGE_SIZE = 20; // videos per request

async function fetchYouTube(url: string, apiKey: string): Promise<{ _error?: string; _status?: number; items?: unknown[]; nextPageToken?: string; pageInfo?: unknown } | null> {
  const sep = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${sep}key=${apiKey}`);
  if (!res.ok) {
    const body = await res.text();
    console.error(`[Admin Scan] ${res.status} ${url.split("?")[0]}\n`, body);
    return { _error: body, _status: res.status };
  }
  return res.json();
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

  const { page = 0 } = await req.json().catch(() => ({ page: 0 }));

  // On page 0, wipe the existing cache so we start fresh
  if (page === 0) {
    await prisma.channelCommentCache.deleteMany({});
  }

  // ── Step 1: Fetch all video IDs ───────────────────────────────────────────
  const allVideoIds: string[] = [];
  let pageToken: string | undefined;
  let firstError: string | undefined;
  do {
    const url = `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${CHANNEL_ID}&type=video&maxResults=50&order=date${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const data = await fetchYouTube(url, apiKey);
    if (!data?.items) {
      if (data?._error) firstError = `YouTube API error (${data._status}): ${data._error.slice(0, 300)}`;
      break;
    }
    const ids = (data.items as { id: { videoId: string } }[])
      .map((item) => item.id.videoId)
      .filter(Boolean);
    allVideoIds.push(...ids);
    pageToken = data.nextPageToken;
  } while (pageToken);

  if (allVideoIds.length === 0) {
    return NextResponse.json({ error: firstError ?? "No videos found — check YOUTUBE_CHANNEL_ID and YOUTUBE_API_KEY", totalVideos: 0 }, { status: 400 });
  }

  const totalVideos = allVideoIds.length;
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, totalVideos);
  const videoBatch = allVideoIds.slice(start, end);

  // ── Step 2: Scan comments for this batch of videos ────────────────────────
  const authorCounts: Record<string, number> = {};

  await Promise.all(
    videoBatch.map(async (videoId) => {
      let vtPageToken: string | undefined;
      do {
        const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet,replies&videoId=${videoId}&maxResults=100${vtPageToken ? `&pageToken=${vtPageToken}` : ""}`;
        const data = await fetchYouTube(url, apiKey);
        if (!data?.items) break;

        type Thread = { snippet?: { topLevelComment?: { snippet?: { authorChannelId?: { value?: string } } } }; replies?: { comments?: { snippet?: { authorChannelId?: { value?: string } } }[] } };
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

  // ── Step 3: Merge into DB (increment, don't replace, so pages accumulate) ─
  await Promise.all(
    Object.entries(authorCounts).map(async ([authorChannelId, count]) => {
      await prisma.channelCommentCache.upsert({
        where: { authorChannelId },
        create: { authorChannelId, commentCount: count },
        update: { commentCount: { increment: count } },
      });
    })
  );

  const hasMore = end < totalVideos;

  // On final page, update scan status
  if (!hasMore) {
    const total = await prisma.channelCommentCache.aggregate({ _sum: { commentCount: true } });
    await prisma.channelScanStatus.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        lastScanned: new Date(),
        videoCount: totalVideos,
        commentCount: total._sum.commentCount ?? 0,
      },
      update: {
        lastScanned: new Date(),
        videoCount: totalVideos,
        commentCount: total._sum.commentCount ?? 0,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    page,
    videosInPage: videoBatch.length,
    totalVideos,
    videosProcessed: end,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
  });
}
