import { describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({ videoMeta: { findMany: vi.fn(), updateMany: vi.fn() } }));
vi.mock("../db", () => ({ prisma }));
const { classifyShorts, isShortVideo, parseUploadsFeed } = await import("../youtube-uploads");

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <title>5ive Guys</title>
 <published>2020-01-01T00:00:00+00:00</published>
 <entry>
  <id>yt:video:AFDHEeR_Dv4</id>
  <yt:videoId>AFDHEeR_Dv4</yt:videoId>
  <title>THIS MATCH WAS A NIGHTMARE &amp; &quot;WE&quot; WON&#39;T FORGET</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=AFDHEeR_Dv4"/>
  <published>2026-11-23T18:00:07+00:00</published>
  <media:group>
   <media:title>THIS MATCH WAS A NIGHTMARE &amp; &quot;WE&quot; WON&#39;T FORGET</media:title>
   <media:thumbnail url="https://i2.ytimg.com/vi/AFDHEeR_Dv4/hqdefault.jpg" width="480" height="360"/>
  </media:group>
 </entry>
 <entry>
  <yt:videoId>Uv7fXAt6PFM</yt:videoId>
  <title>WE WENT BACK TO SCHOOL</title>
  <link rel="alternate" href="https://www.youtube.com/shorts/Uv7fXAt6PFM"/>
  <published>2026-11-16T18:00:00+00:00</published>
  <media:group><media:thumbnail url="https://i3.ytimg.com/vi/Uv7fXAt6PFM/hqdefault.jpg" width="480" height="360"/></media:group>
 </entry>
</feed>`;

describe("parseUploadsFeed", () => {
  it("reads each upload's id, title, date and thumbnail, skipping the channel's own fields", () => {
    const videos = parseUploadsFeed(FEED);
    expect(videos).toHaveLength(2);
    expect(videos[0]).toEqual({
      videoId: "AFDHEeR_Dv4",
      title: `THIS MATCH WAS A NIGHTMARE & "WE" WON'T FORGET`,
      publishedAt: new Date("2026-11-23T18:00:07+00:00"),
      thumbnailUrl: "https://i2.ytimg.com/vi/AFDHEeR_Dv4/hqdefault.jpg",
      isShort: false,
    });
    expect(videos[1].videoId).toBe("Uv7fXAt6PFM");
  });

  it("marks Shorts, whose links go to youtube.com/shorts/", () => {
    expect(parseUploadsFeed(FEED).map((v) => v.isShort)).toEqual([false, true]);
  });

  it("returns nothing for an empty or broken feed", () => {
    expect(parseUploadsFeed("")).toEqual([]);
    expect(parseUploadsFeed("<feed><entry><title>no id</title></entry></feed>")).toEqual([]);
  });
});

describe("isShortVideo", () => {
  const answer = (status: number, location?: string) =>
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status, headers: location ? { location } : {} }));

  it("is a Short when /shorts/<id> answers 200", async () => {
    answer(200);
    expect(await isShortVideo("HJ8fCFfvwE0")).toBe(true);
  });

  it("is a normal video when /shorts/<id> redirects to /watch", async () => {
    answer(303, "https://www.youtube.com/watch?v=AFDHEeR_Dv4");
    expect(await isShortVideo("AFDHEeR_Dv4")).toBe(false);
  });

  it("doesn't know when YouTube sends anything else or can't be reached", async () => {
    answer(302, "https://consent.youtube.com/m?continue=x");
    expect(await isShortVideo("a")).toBeNull();
    answer(500);
    expect(await isShortVideo("b")).toBeNull();
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));
    expect(await isShortVideo("c")).toBeNull();
  });
});

describe("classifyShorts", () => {
  it("checks unchecked videos and saves which are Shorts, leaving unknowns unchecked", async () => {
    prisma.videoMeta.findMany.mockResolvedValueOnce([{ videoId: "short1" }, { videoId: "long1" }, { videoId: "down1" }]);
    prisma.videoMeta.updateMany.mockResolvedValue({ count: 1 });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const id = String(url).split("/shorts/")[1];
      if (id === "short1") return new Response(null, { status: 200 });
      if (id === "long1") return new Response(null, { status: 303, headers: { location: `https://www.youtube.com/watch?v=${id}` } });
      return new Response(null, { status: 503 });
    });

    await classifyShorts("ch1");

    expect(prisma.videoMeta.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { channelId: "ch1", isShort: null } }));
    expect(prisma.videoMeta.updateMany).toHaveBeenCalledWith({ where: { channelId: "ch1", videoId: { in: ["short1"] } }, data: { isShort: true } });
    expect(prisma.videoMeta.updateMany).toHaveBeenCalledWith({ where: { channelId: "ch1", videoId: { in: ["long1"] } }, data: { isShort: false } });
    expect(prisma.videoMeta.updateMany).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it("never throws", async () => {
    prisma.videoMeta.findMany.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(classifyShorts("ch1")).resolves.toBeUndefined();
    vi.restoreAllMocks();
  });
});
