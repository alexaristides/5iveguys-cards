import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ prisma: {} }));
const { parseUploadsFeed } = await import("../youtube-uploads");

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <title>5ive Guys</title>
 <published>2020-01-01T00:00:00+00:00</published>
 <entry>
  <id>yt:video:AFDHEeR_Dv4</id>
  <yt:videoId>AFDHEeR_Dv4</yt:videoId>
  <title>THIS MATCH WAS A NIGHTMARE &amp; &quot;WE&quot; WON&#39;T FORGET</title>
  <published>2026-11-23T18:00:07+00:00</published>
  <media:group>
   <media:title>THIS MATCH WAS A NIGHTMARE &amp; &quot;WE&quot; WON&#39;T FORGET</media:title>
   <media:thumbnail url="https://i2.ytimg.com/vi/AFDHEeR_Dv4/hqdefault.jpg" width="480" height="360"/>
  </media:group>
 </entry>
 <entry>
  <yt:videoId>Uv7fXAt6PFM</yt:videoId>
  <title>WE WENT BACK TO SCHOOL</title>
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
    });
    expect(videos[1].videoId).toBe("Uv7fXAt6PFM");
  });

  it("returns nothing for an empty or broken feed", () => {
    expect(parseUploadsFeed("")).toEqual([]);
    expect(parseUploadsFeed("<feed><entry><title>no id</title></entry></feed>")).toEqual([]);
  });
});
