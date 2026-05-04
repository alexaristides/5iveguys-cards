import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POINTS_CONFIG } from "@/lib/cards";

export const maxDuration = 60;

const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID!;
const SYNC_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

async function fetchYouTube(url: string, accessToken: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[YouTube API] ${res.status} ${url.split("?")[0]}\n`, body);
    return null;
  }
  return res.json();
}

// Run promises in batches to avoid hitting YouTube rate limits
async function batchAll<T>(items: T[], batchSize: number, fn: (item: T) => Promise<unknown>) {
  const results: unknown[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

async function getAccessToken(userId: string): Promise<{ token: string; hasYoutubeScope: boolean } | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account) return null;

  const scope = account.scope ?? "";
  const hasYoutubeScope = scope.includes("youtube");

  const expiresAt = account.expires_at ? account.expires_at * 1000 : 0;
  const isExpired = expiresAt < Date.now() + 60_000;

  if (isExpired && account.refresh_token) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: account.refresh_token,
      }),
    });
    if (res.ok) {
      const tokens = await res.json();
      await prisma.account.update({
        where: { id: account.id },
        data: {
          access_token: tokens.access_token,
          expires_at: Math.floor(Date.now() / 1000 + tokens.expires_in),
        },
      });
      return { token: tokens.access_token, hasYoutubeScope };
    }
  }

  if (!account.access_token) return null;
  return { token: account.access_token, hasYoutubeScope };
}

// Fetch ALL channel video IDs (every page)
async function getAllChannelVideoIds(accessToken: string): Promise<string[]> {
  const allIds: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${CHANNEL_ID}&type=video&maxResults=50&order=date${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const data = await fetchYouTube(url, accessToken);
    if (!data?.items) break;
    const ids = data.items
      .map((item: { id: { videoId: string } }) => item.id.videoId)
      .filter(Boolean);
    allIds.push(...ids);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return allIds;
}

async function getMyChannelId(accessToken: string): Promise<string | null> {
  const data = await fetchYouTube(
    "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true",
    accessToken
  );
  return data?.items?.[0]?.id ?? null;
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // ── 24h cooldown: return cached data without hitting YouTube ─────────────
  const existing = await prisma.youtubeSync.findUnique({ where: { userId } });
  if (existing?.lastSynced) {
    const msSinceLast = Date.now() - new Date(existing.lastSynced).getTime();
    if (msSinceLast < SYNC_COOLDOWN_MS) {
      const hoursLeft = Math.ceil((SYNC_COOLDOWN_MS - msSinceLast) / (60 * 60 * 1000));
      const user = await prisma.user.findUnique({ where: { id: userId } });
      return NextResponse.json({
        pointsEarned: 0,
        points: user?.points ?? 0,
        isSubscribed: existing.isSubscribed,
        likedCount: JSON.parse(existing.likedVideoIds).length,
        commentCount: existing.commentCount,
        cooldown: true,
        hoursLeft,
      });
    }
  }

  // ── Get access token ──────────────────────────────────────────────────────
  const tokenResult = await getAccessToken(userId);
  if (!tokenResult) {
    return NextResponse.json({ error: "No YouTube access token" }, { status: 400 });
  }

  const { token: accessToken, hasYoutubeScope } = tokenResult;

  if (!hasYoutubeScope) {
    return NextResponse.json(
      { error: "reauth_required", message: "Please sign out and sign back in to grant YouTube access." },
      { status: 403 }
    );
  }

  const prevLiked: string[] = existing ? JSON.parse(existing.likedVideoIds) : [];
  const prevCommentCount = existing?.commentCount ?? 0;

  // ── Fetch subscription + all video IDs in parallel ───────────────────────
  const [subData, videoIds] = await Promise.all([
    fetchYouTube(
      `https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&forChannelId=${CHANNEL_ID}`,
      accessToken
    ),
    getAllChannelVideoIds(accessToken),
  ]);

  const isSubscribed = (subData?.pageInfo?.totalResults ?? 0) > 0;

  // ── Check all liked videos — batched parallel (50 per call) ─────────────
  let likedVideoIds: string[] = [];
  if (videoIds.length > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < videoIds.length; i += 50) chunks.push(videoIds.slice(i, i + 50));
    const ratingResults = await Promise.all(
      chunks.map((chunk) =>
        fetchYouTube(
          `https://www.googleapis.com/youtube/v3/videos/getRating?id=${chunk.join(",")}`,
          accessToken
        )
      )
    );
    for (const ratingData of ratingResults) {
      if (ratingData?.items) {
        const liked = ratingData.items
          .filter((item: { rating: string }) => item.rating === "like")
          .map((item: { videoId: string }) => item.videoId);
        likedVideoIds = [...likedVideoIds, ...liked];
      }
    }
  }

  // ── Count comments on every video — batched 20 at a time ─────────────────
  let commentCount = 0;
  const myChannelId = await getMyChannelId(accessToken);

  if (myChannelId && videoIds.length > 0) {
    const results = await batchAll(videoIds, 20, (videoId) =>
      fetchYouTube(
        `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet,replies&videoId=${videoId}&maxResults=100`,
        accessToken
      )
    );

    for (const data of results) {
      const d = data as { items?: { snippet?: { topLevelComment?: { snippet?: { authorChannelId?: { value?: string } } }; totalReplyCount?: number }; replies?: { comments?: { snippet?: { authorChannelId?: { value?: string } } }[] } }[] } | null;
      if (!d?.items) continue;
      for (const thread of d.items) {
        const topAuthor = thread.snippet?.topLevelComment?.snippet?.authorChannelId?.value;
        if (topAuthor === myChannelId) commentCount++;

        const inlineReplies = thread.replies?.comments ?? [];
        for (const reply of inlineReplies) {
          if (reply.snippet?.authorChannelId?.value === myChannelId) commentCount++;
        }
      }
    }
  }

  // Never lose comments found in previous syncs
  const storedCommentCount = Math.max(commentCount, prevCommentCount);
  const newComments = Math.max(0, commentCount - prevCommentCount);

  // ── Calculate points delta ────────────────────────────────────────────────
  let pointsDelta = 0;

  const wasSubscribed = existing?.isSubscribed ?? false;
  if (isSubscribed && !wasSubscribed) {
    pointsDelta += POINTS_CONFIG.subscribe;
  }

  const newLikes = likedVideoIds.filter((id) => !prevLiked.includes(id));
  pointsDelta += newLikes.length * POINTS_CONFIG.like;
  pointsDelta += newComments * POINTS_CONFIG.comment;

  await prisma.youtubeSync.upsert({
    where: { userId },
    create: {
      userId,
      isSubscribed,
      likedVideoIds: JSON.stringify(likedVideoIds),
      commentCount: storedCommentCount,
      lastSynced: new Date(),
    },
    update: {
      isSubscribed,
      likedVideoIds: JSON.stringify(likedVideoIds),
      commentCount: storedCommentCount,
      lastSynced: new Date(),
    },
  });

  if (pointsDelta > 0) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        points: { increment: pointsDelta },
        totalEarned: { increment: pointsDelta },
      },
    });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });

  return NextResponse.json({
    pointsEarned: pointsDelta,
    points: user?.points ?? 0,
    isSubscribed,
    likedCount: likedVideoIds.length,
    commentCount: storedCommentCount,
    cooldown: false,
  });
}
