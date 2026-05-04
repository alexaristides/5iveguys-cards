import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POINTS_CONFIG } from "@/lib/cards";

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

async function getAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account) return null;

  // If token is expired or about to expire, refresh it
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
      return tokens.access_token;
    }
  }

  return account.access_token ?? null;
}

async function getChannelVideoIds(accessToken: string): Promise<string[]> {
  const allIds: string[] = [];
  let pageToken: string | undefined;
  // Paginate through ALL channel videos (up to 500)
  do {
    const url = `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${CHANNEL_ID}&type=video&maxResults=50&order=date${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const data = await fetchYouTube(url, accessToken);
    if (!data?.items) break;
    const ids = data.items.map((item: { id: { videoId: string } }) => item.id.videoId).filter(Boolean);
    allIds.push(...ids);
    pageToken = data.nextPageToken;
  } while (pageToken && allIds.length < 500);
  return allIds;
}

// Get the authed user's own YouTube channel ID so we can match their comments
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
  const accessToken = await getAccessToken(userId);
  if (!accessToken) {
    return NextResponse.json({ error: "No YouTube access token" }, { status: 400 });
  }

  const existing = await prisma.youtubeSync.findUnique({ where: { userId } });
  const prevLiked: string[] = existing ? JSON.parse(existing.likedVideoIds) : [];

  // Check subscription
  const subUrl = `https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&forChannelId=${CHANNEL_ID}`;
  const subData = await fetchYouTube(subUrl, accessToken);
  const isSubscribed = (subData?.pageInfo?.totalResults ?? 0) > 0;

  // Get channel video IDs
  const videoIds = await getChannelVideoIds(accessToken);

  // Check liked videos using getRating (requires youtube.force-ssl scope)
  let likedVideoIds: string[] = [];
  if (videoIds.length > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < videoIds.length; i += 50) chunks.push(videoIds.slice(i, i + 50));
    for (const chunk of chunks) {
      const ratingUrl = `https://www.googleapis.com/youtube/v3/videos/getRating?id=${chunk.join(",")}`;
      const ratingData = await fetchYouTube(ratingUrl, accessToken);
      if (ratingData?.items) {
        const liked = ratingData.items
          .filter((item: { rating: string }) => item.rating === "like")
          .map((item: { videoId: string }) => item.videoId);
        likedVideoIds = [...likedVideoIds, ...liked];
      }
    }
  }

  // Count user's comments on the channel using allThreadsRelatedToChannelId
  let commentCount = 0;
  const myChannelId = await getMyChannelId(accessToken);
  if (myChannelId && videoIds.length > 0) {
    for (const videoId of videoIds) {
      let pageToken: string | undefined;
      // Scan every page of top-level comment threads on this video
      do {
        const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet,replies&videoId=${videoId}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ""}`;
        const data = await fetchYouTube(url, accessToken);
        if (!data?.items) break;

        for (const thread of data.items) {
          // Count top-level comment if authored by this user
          const topAuthor = thread.snippet?.topLevelComment?.snippet?.authorChannelId?.value;
          if (topAuthor === myChannelId) commentCount++;

          // Count replies in this thread authored by this user
          // The API returns up to 5 replies inline; fetch more if replyCount > 5
          const replyCount: number = thread.snippet?.totalReplyCount ?? 0;
          const inlineReplies: { snippet: { authorChannelId: { value: string } } }[] =
            thread.replies?.comments ?? [];

          if (replyCount <= 5) {
            // All replies are inline
            for (const reply of inlineReplies) {
              if (reply.snippet?.authorChannelId?.value === myChannelId) commentCount++;
            }
          } else {
            // Fetch all replies for this thread
            const threadId: string = thread.id;
            let replyPageToken: string | undefined;
            do {
              const replyUrl = `https://www.googleapis.com/youtube/v3/comments?part=snippet&parentId=${threadId}&maxResults=100${replyPageToken ? `&pageToken=${replyPageToken}` : ""}`;
              const replyData = await fetchYouTube(replyUrl, accessToken);
              if (!replyData?.items) break;
              for (const reply of replyData.items) {
                if (reply.snippet?.authorChannelId?.value === myChannelId) commentCount++;
              }
              replyPageToken = replyData.nextPageToken;
            } while (replyPageToken);
          }
        }

        pageToken = data.nextPageToken;
      } while (pageToken);
    }
  }

  // Calculate points delta
  let pointsDelta = 0;

  const wasSubscribed = existing?.isSubscribed ?? false;
  if (isSubscribed && !wasSubscribed) {
    pointsDelta += POINTS_CONFIG.subscribe;
  }

  const newLikes = likedVideoIds.filter((id) => !prevLiked.includes(id));
  pointsDelta += newLikes.length * POINTS_CONFIG.like;

  const prevComments = existing?.commentCount ?? 0;
  const newComments = Math.max(0, commentCount - prevComments);
  pointsDelta += newComments * POINTS_CONFIG.comment;

  await prisma.youtubeSync.upsert({
    where: { userId },
    create: {
      userId,
      isSubscribed,
      likedVideoIds: JSON.stringify(likedVideoIds),
      commentCount,
      lastSynced: new Date(),
    },
    update: {
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
  });
}
