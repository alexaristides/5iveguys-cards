import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POINTS_CONFIG } from "@/lib/cards";

export const maxDuration = 30;

const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID!;

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

// Returns videoId → publishedAt map. contentDetails.videoPublishedAt is free with part=contentDetails.
async function getChannelVideoMap(accessToken: string): Promise<Map<string, Date>> {
  const uploadsPlaylistId = await getUploadsPlaylistId(accessToken);
  if (!uploadsPlaylistId) return new Map();

  const videoMap = new Map<string, Date>();
  let pageToken: string | undefined;
  do {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const data = await fetchYouTube(url, accessToken);
    if (!data?.items) break;
    type Item = { contentDetails?: { videoId?: string; videoPublishedAt?: string } };
    for (const item of data.items as Item[]) {
      const videoId = item.contentDetails?.videoId;
      const publishedAt = item.contentDetails?.videoPublishedAt;
      if (videoId && publishedAt) {
        videoMap.set(videoId, new Date(publishedAt));
      } else if (videoId) {
        videoMap.set(videoId, new Date(0));
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return videoMap;
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

  const existing = await prisma.youtubeSync.findUnique({ where: { userId } });

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
  const prevEarlyLiked: string[] = existing ? JSON.parse(existing.earlyLikedVideoIds) : [];

  // ── Get user's YouTube channel ID (fetch once, then store) ────────────────
  let youtubeChannelId = existing?.youtubeChannelId ?? null;
  if (!youtubeChannelId) {
    youtubeChannelId = await getMyChannelId(accessToken);
  }

  // ── Subscription + video map in parallel ─────────────────────────────────
  const [subData, videoMap] = await Promise.all([
    fetchYouTube(
      `https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&forChannelId=${CHANNEL_ID}`,
      accessToken
    ),
    getChannelVideoMap(accessToken),
  ]);

  const isSubscribed = (subData?.pageInfo?.totalResults ?? 0) > 0;
  const videoIds = [...videoMap.keys()];

  // ── Persist video publish dates (skipDuplicates — only new videos cost a write) ──
  if (videoIds.length > 0) {
    await prisma.videoMeta.createMany({
      data: [...videoMap.entries()].map(([videoId, publishedAt]) => ({ videoId, publishedAt })),
      skipDuplicates: true,
    });
  }

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

  // Preserve likes for videos not checked in this batch (e.g. API failure on a page)
  const checkedVideoIds = new Set(videoIds);
  const preservedLikes = prevLiked.filter((id) => !checkedVideoIds.has(id));
  const finalLikedVideoIds = [...likedVideoIds, ...preservedLikes];

  // ── Tiered like points ────────────────────────────────────────────────────
  const newLikes = likedVideoIds.filter((id) => !prevLiked.includes(id));
  const earlyLikeWindowMs = POINTS_CONFIG.earlyLikeWindowHours * 60 * 60 * 1000;
  const now = Date.now();

  // Look up publish dates for new likes (may not all be in videoMap if edge cases)
  const metaRecords = await prisma.videoMeta.findMany({
    where: { videoId: { in: newLikes } },
  });
  const metaByVideoId = new Map(metaRecords.map((m) => [m.videoId, m.publishedAt]));

  const newEarlyLikes: string[] = [];
  const newRegularLikes: string[] = [];
  for (const videoId of newLikes) {
    const publishedAt = metaByVideoId.get(videoId) ?? videoMap.get(videoId);
    if (publishedAt && publishedAt.getTime() > 0 && now - publishedAt.getTime() <= earlyLikeWindowMs) {
      newEarlyLikes.push(videoId);
    } else {
      newRegularLikes.push(videoId);
    }
  }

  // ── Points delta ──────────────────────────────────────────────────────────
  let pointsDelta = 0;

  const wasSubscribed = existing?.isSubscribed ?? false;
  if (isSubscribed && !wasSubscribed) {
    pointsDelta += POINTS_CONFIG.subscribe;
  }

  pointsDelta += newEarlyLikes.length * POINTS_CONFIG.earlyLike;
  pointsDelta += newRegularLikes.length * POINTS_CONFIG.like;

  const updatedEarlyLikedVideoIds = [...prevEarlyLiked, ...newEarlyLikes];

  await prisma.youtubeSync.upsert({
    where: { userId },
    create: {
      userId,
      youtubeChannelId,
      isSubscribed,
      likedVideoIds: JSON.stringify(finalLikedVideoIds),
      earlyLikedVideoIds: JSON.stringify(updatedEarlyLikedVideoIds),
      lastSynced: new Date(),
    },
    update: {
      youtubeChannelId,
      isSubscribed,
      likedVideoIds: JSON.stringify(finalLikedVideoIds),
      earlyLikedVideoIds: JSON.stringify(updatedEarlyLikedVideoIds),
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
    likedCount: finalLikedVideoIds.length,
    earlyLikedCount: updatedEarlyLikedVideoIds.length,
    cooldown: false,
  });
}
