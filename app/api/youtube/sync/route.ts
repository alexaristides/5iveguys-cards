import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { POINTS_CONFIG } from "@/lib/cards";

export const maxDuration = 30;

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

async function getUploadsPlaylistId(channelYtId: string, accessToken: string): Promise<string | null> {
  const data = await fetchYouTube(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelYtId}`,
    accessToken
  );
  return (data as { items?: { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] })
    ?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;
}

async function getChannelVideoMap(channelYtId: string, accessToken: string): Promise<Map<string, Date>> {
  const uploadsPlaylistId = await getUploadsPlaylistId(channelYtId, accessToken);
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

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const body = await req.json().catch(() => ({})) as { channelSlug?: string };
  const channelSlug = body.channelSlug ?? null;

  // Resolve channel
  let channel: { id: string; youtubeChannelId: string } | null = null;
  if (channelSlug) {
    channel = await prisma.channel.findUnique({
      where: { slug: channelSlug },
      select: { id: true, youtubeChannelId: true },
    });
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
  } else {
    // Legacy: use YOUTUBE_CHANNEL_ID env
    const ytChannelId = process.env.YOUTUBE_CHANNEL_ID;
    if (!ytChannelId) return NextResponse.json({ error: "No channel configured" }, { status: 400 });
    channel = await prisma.channel.findFirst({
      where: { youtubeChannelId: ytChannelId },
      select: { id: true, youtubeChannelId: true },
    });
    if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const { id: channelId, youtubeChannelId: ytChannelId } = channel;

  const existing = await prisma.youtubeSync.findFirst({ where: { userId, channelId } });

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

  let youtubeChannelId = existing?.youtubeChannelId ?? null;
  if (!youtubeChannelId) {
    youtubeChannelId = await getMyChannelId(accessToken);
  }

  const [subData, videoMap] = await Promise.all([
    fetchYouTube(
      `https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&forChannelId=${ytChannelId}`,
      accessToken
    ),
    getChannelVideoMap(ytChannelId, accessToken),
  ]);

  const isSubscribed = (subData?.pageInfo?.totalResults ?? 0) > 0;
  const videoIds = [...videoMap.keys()];

  if (videoIds.length > 0) {
    // Insert new video publish dates, skip duplicates per channel
    const existing_videos = await prisma.videoMeta.findMany({
      where: { videoId: { in: videoIds }, channelId },
      select: { videoId: true, title: true },
    });
    const existingVideoIds = new Set(existing_videos.map((v) => v.videoId));
    const untitledVideoIds = existing_videos.filter((v) => !v.title).map((v) => v.videoId);
    const newVideoEntries = [...videoMap.entries()].filter(([videoId]) => !existingVideoIds.has(videoId));

    // Fetch snippets for: (a) new videos, and (b) existing rows still missing a title
    const needsSnippet = [...newVideoEntries.map(([id]) => id), ...untitledVideoIds];
    const snippetMap = new Map<string, { title: string; thumbnailUrl: string }>();
    if (needsSnippet.length > 0) {
      const snippetChunks: string[][] = [];
      for (let i = 0; i < needsSnippet.length; i += 50) snippetChunks.push(needsSnippet.slice(i, i + 50));
      const snippetResults = await Promise.all(
        snippetChunks.map((chunk) =>
          fetchYouTube(
            `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${chunk.join(",")}`,
            accessToken
          )
        )
      );
      type SnippetItem = { id: string; snippet?: { title?: string; thumbnails?: { medium?: { url?: string } } } };
      for (const result of snippetResults) {
        for (const item of (result?.items ?? []) as SnippetItem[]) {
          if (item.id && item.snippet) {
            snippetMap.set(item.id, {
              title: item.snippet.title ?? "",
              thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? "",
            });
          }
        }
      }
    }

    // Create new rows
    const newVideos = newVideoEntries.map(([videoId, publishedAt]) => ({
      videoId,
      publishedAt,
      channelId,
      ...(snippetMap.get(videoId) ?? {}),
    }));
    if (newVideos.length > 0) {
      await prisma.videoMeta.createMany({ data: newVideos, skipDuplicates: true });
    }

    // Backfill titles on existing untitled rows
    if (untitledVideoIds.length > 0) {
      await Promise.all(
        untitledVideoIds
          .filter((id) => snippetMap.has(id))
          .map((id) =>
            prisma.videoMeta.updateMany({
              where: { videoId: id, channelId },
              data: snippetMap.get(id)!,
            })
          )
      );
    }
  }

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

  const checkedVideoIds = new Set(videoIds);
  const preservedLikes = prevLiked.filter((id) => !checkedVideoIds.has(id));
  const finalLikedVideoIds = [...likedVideoIds, ...preservedLikes];

  const newLikes = likedVideoIds.filter((id) => !prevLiked.includes(id));
  const earlyLikeWindowMs = POINTS_CONFIG.earlyLikeWindowHours * 60 * 60 * 1000;
  const now = Date.now();

  const metaRecords = await prisma.videoMeta.findMany({
    where: { videoId: { in: newLikes }, channelId },
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

  let pointsDelta = 0;

  const wasSubscribed = existing?.isSubscribed ?? false;
  if (isSubscribed && !wasSubscribed) {
    pointsDelta += POINTS_CONFIG.subscribe;
  }

  pointsDelta += newEarlyLikes.length * POINTS_CONFIG.earlyLike;
  pointsDelta += newRegularLikes.length * POINTS_CONFIG.like;

  const updatedEarlyLikedVideoIds = [...prevEarlyLiked, ...newEarlyLikes];

  const syncFields = {
    youtubeChannelId,
    isSubscribed,
    likedVideoIds: JSON.stringify(finalLikedVideoIds),
    earlyLikedVideoIds: JSON.stringify(updatedEarlyLikedVideoIds),
    lastSynced: new Date(),
    ...(isSubscribed && !wasSubscribed ? { subscribedAt: new Date() } : {}),
  };

  const ops: Prisma.PrismaPromise<unknown>[] = [
    existing
      ? prisma.youtubeSync.update({ where: { id: existing.id }, data: syncFields })
      : prisma.youtubeSync.create({ data: { userId, channelId, ...syncFields } }),
  ];

  if (pointsDelta > 0) {
    // Update per-channel stats (upsert in case it doesn't exist yet)
    ops.push(
      prisma.userChannelStats.upsert({
        where: { userId_channelId: { userId, channelId } },
        create: { userId, channelId, points: pointsDelta, totalEarned: pointsDelta },
        update: { points: { increment: pointsDelta }, totalEarned: { increment: pointsDelta } },
      })
    );

    if (isSubscribed && !wasSubscribed) {
      ops.push(
        prisma.pointsEvent.create({
          data: { userId, channelId, type: "subscribe", points: POINTS_CONFIG.subscribe, videoCount: 0 },
        })
      );
    }
    if (newEarlyLikes.length > 0) {
      ops.push(
        prisma.pointsEvent.create({
          data: {
            userId,
            channelId,
            type: "earlyLike",
            points: newEarlyLikes.length * POINTS_CONFIG.earlyLike,
            videoCount: newEarlyLikes.length,
          },
        })
      );
    }
    if (newRegularLikes.length > 0) {
      ops.push(
        prisma.pointsEvent.create({
          data: {
            userId,
            channelId,
            type: "like",
            points: newRegularLikes.length * POINTS_CONFIG.like,
            videoCount: newRegularLikes.length,
          },
        })
      );
    }
  }

  await prisma.$transaction(ops);

  const channelStats = await prisma.userChannelStats.findUnique({
    where: { userId_channelId: { userId, channelId } },
  });

  return NextResponse.json({
    pointsEarned: pointsDelta,
    points: channelStats?.points ?? 0,
    isSubscribed,
    likedCount: finalLikedVideoIds.length,
    earlyLikedCount: updatedEarlyLikedVideoIds.length,
    cooldown: false,
  });
}
