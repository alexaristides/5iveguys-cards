import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const maxDuration = 60;

const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID!;
const ADMIN_SECRET = process.env.ADMIN_SECRET!;

async function fetchYouTube(url: string, apiKey: string) {
  const sep = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${sep}key=${apiKey}`);
  if (!res.ok) {
    const body = await res.text();
    console.error(`[Admin Scan] ${res.status} ${url.split("?")[0]}\n`, body);
    return null;
  }
  return res.json();
}

export async function POST(req: NextRequest) {
  // Protect with a secret header
  const secret = req.headers.get("x-admin-secret");
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "YOUTUBE_API_KEY not set" }, { status: 500 });
  }

  // 1. Fetch all channel video IDs
  const allVideoIds: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${CHANNEL_ID}&type=video&maxResults=50&order=date${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const data = await fetchYouTube(url, apiKey);
    if (!data?.items) break;
    const ids = data.items
      .map((item: { id: { videoId: string } }) => item.id.videoId)
      .filter(Boolean);
    allVideoIds.push(...ids);
    pageToken = data.nextPageToken;
  } while (pageToken);

  console.log(`[Admin Scan] Found ${allVideoIds.length} videos`);

  // 2. For each video, fetch all comment threads (paginated), tally per author
  const authorCounts: Record<string, number> = {};

  // Process in batches of 10 videos at a time
  for (let i = 0; i < allVideoIds.length; i += 10) {
    const batch = allVideoIds.slice(i, i + 10);
    await Promise.all(
      batch.map(async (videoId) => {
        let vtPageToken: string | undefined;
        do {
          const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet,replies&videoId=${videoId}&maxResults=100${vtPageToken ? `&pageToken=${vtPageToken}` : ""}`;
          const data = await fetchYouTube(url, apiKey);
          if (!data?.items) break;

          for (const thread of data.items) {
            const topAuthor: string | undefined =
              thread.snippet?.topLevelComment?.snippet?.authorChannelId?.value;
            if (topAuthor) {
              authorCounts[topAuthor] = (authorCounts[topAuthor] ?? 0) + 1;
            }

            const replies: { snippet?: { authorChannelId?: { value?: string } } }[] =
              thread.replies?.comments ?? [];
            for (const reply of replies) {
              const replyAuthor = reply.snippet?.authorChannelId?.value;
              if (replyAuthor) {
                authorCounts[replyAuthor] = (authorCounts[replyAuthor] ?? 0) + 1;
              }
            }
          }

          vtPageToken = data.nextPageToken;
        } while (vtPageToken);
      })
    );
  }

  const totalComments = Object.values(authorCounts).reduce((a, b) => a + b, 0);
  console.log(`[Admin Scan] ${totalComments} comments from ${Object.keys(authorCounts).length} unique authors`);

  // 3. Upsert all author counts into ChannelCommentCache
  await Promise.all(
    Object.entries(authorCounts).map(([authorChannelId, commentCount]) =>
      prisma.channelCommentCache.upsert({
        where: { authorChannelId },
        create: { authorChannelId, commentCount },
        update: { commentCount },
      })
    )
  );

  // 4. Update scan status
  await prisma.channelScanStatus.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      lastScanned: new Date(),
      videoCount: allVideoIds.length,
      commentCount: totalComments,
    },
    update: {
      lastScanned: new Date(),
      videoCount: allVideoIds.length,
      commentCount: totalComments,
    },
  });

  return NextResponse.json({
    ok: true,
    videosScanned: allVideoIds.length,
    uniqueAuthors: Object.keys(authorCounts).length,
    totalComments,
  });
}
