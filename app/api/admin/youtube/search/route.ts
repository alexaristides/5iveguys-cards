import { NextRequest, NextResponse } from "next/server";

function checkAdmin(req: NextRequest) {
  return req.headers.get("x-admin-secret") === process.env.ADMIN_SECRET;
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "YOUTUBE_API_KEY not configured" }, { status: 500 });

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "channel");
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", "5");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json({ error: (err as { error?: { message?: string } }).error?.message ?? "YouTube API error" }, { status: 502 });
  }

  const data = await res.json() as {
    items: Array<{
      snippet: {
        channelId: string;
        title: string;
        description: string;
        thumbnails: { default?: { url: string }; medium?: { url: string }; high?: { url: string } };
      };
    }>;
  };

  const results = (data.items ?? []).map((item) => ({
    channelId: item.snippet.channelId,
    name: item.snippet.title,
    description: item.snippet.description,
    thumbnailUrl:
      item.snippet.thumbnails.high?.url ??
      item.snippet.thumbnails.medium?.url ??
      item.snippet.thumbnails.default?.url ??
      null,
  }));

  return NextResponse.json({ results });
}
