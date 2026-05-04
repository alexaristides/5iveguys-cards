import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POINTS_CONFIG } from "@/lib/cards";

export const maxDuration = 30;

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

async function getUploadsPlaylistId(accessToken: string): Promise<string | null> {
  const data = await fetchYouTube(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${CHANNEL_ID}`,
    accessToken
  );
  return (data as { items?: { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] })
    ?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;
}

// Uses playlistItems API (1 unit/page) instead of search (100 units/page)
async function getChannelVideoIds(accessToken: string): Promise<string[]> {
  const uploadsPlaylistId = await getUploadsPlaylistId(accessToken);
  if (!uploadsPlaylistId) return [];

  const allIds: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const data = await fetchYouTube(url, accessToken);
    if (!data?.items) break;
    const ids = (data.items as { contentDetails?: { videoId?: string } }[])
      .map((item) => item.contentDetails?.videoId)
      .filter((id): id is string => Boolean(id));
    allIds.push(...ids);
    pageToken = data.nextPageToken;
  } while (pageToken && allIds.length < 100);
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

  // ── 24h cooldown ─────────────────────────────────────────────────────────
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

  // ── Get user's YouTube channel ID (fetch once, then store) ────────────────
  let youtubeChannelId = existing?.youtubeChannelId ?? null;
  if (!youtubeChannelId) {
    youtubeChannelId = await getMyChannelId(accessToken);
  }

  // ── Subscription + video IDs in parallel ─────────────────────────────────
  const [subData, videoIds] = await Promise.all([
    fetchYouTube(
      `https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&forChannelId=${CHANNEL_ID}`,
      accessToken
    ),
    getChannelVideoIds(accessToken),
  ]);

  const isSubscribed = (subData?.pageInfo?.totalResults ?? 0) > 0;

  // ── Liked videos — parallel batch calls ──────────────────────────────────
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

  // ── Comment count from pre-built cache (no YouTube scanning) ─────────────
  let commentCount = prevCommentCount;
  if (youtubeChannelId) {
    const cached = await prisma.channelCommentCache.findUnique({
      where: { authorChannelId: youtubeChannelId },
    });
    // Use cached count; never go below what we've previously counted
    commentCount = Math.max(cached?.commentCount ?? 0, prevCommentCount);
  }

  const newComments = Math.max(0, commentCount - prevCommentCount);

  // ── Points delta ──────────────────────────────────────────────────────────
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
      youtubeChannelId,
      isSubscribed,
      likedVideoIds: JSON.stringify(likedVideoIds),
      commentCount,
      lastSynced: new Date(),
    },
    update: {
      youtubeChannelId,
      isSubscribed,
      likedVideoIds: JSON.stringify(likedVideoIds),
      commentCount,
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
    commentCount,
    cooldown: false,
  });
}
