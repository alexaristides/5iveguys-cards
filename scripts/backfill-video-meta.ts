/**
 * One-time backfill: fetch titles + thumbnails for all VideoMeta rows with null title.
 * Run with: npx tsx scripts/backfill-video-meta.ts
 */
import { prisma } from "../lib/db";

async function fetchSnippets(videoIds: string[], accessToken: string) {
  const chunks: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) chunks.push(videoIds.slice(i, i + 50));

  const results: { id: string; title: string; thumbnailUrl: string }[] = [];
  for (const chunk of chunks) {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${chunk.join(",")}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      console.error(`YouTube API ${res.status}:`, await res.text());
      continue;
    }
    const data = await res.json();
    for (const item of data.items ?? []) {
      results.push({
        id: item.id,
        title: item.snippet?.title ?? "",
        thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? "",
      });
    }
  }
  return results;
}

async function main() {
  // Grab the most recently used Google OAuth token
  const account = await prisma.account.findFirst({
    where: { provider: "google", access_token: { not: null } },
    orderBy: { expires_at: "desc" },
  });

  if (!account?.access_token) {
    console.error("No Google OAuth token found in DB. Ask a user to sign in first.");
    process.exit(1);
  }

  console.log("Using token from account:", account.userId);

  const untitled = await prisma.videoMeta.findMany({
    where: { title: null },
    select: { videoId: true },
  });

  console.log(`Found ${untitled.length} untitled VideoMeta rows`);
  if (untitled.length === 0) { console.log("Nothing to do."); return; }

  const videoIds = untitled.map((v) => v.videoId);
  const snippets = await fetchSnippets(videoIds, account.access_token);
  console.log(`Fetched ${snippets.length} snippets from YouTube`);

  let updated = 0;
  for (const s of snippets) {
    await prisma.videoMeta.updateMany({
      where: { videoId: s.id },
      data: { title: s.title, thumbnailUrl: s.thumbnailUrl },
    });
    updated++;
  }

  console.log(`✓ Updated ${updated} rows`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
