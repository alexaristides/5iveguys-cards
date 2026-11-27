"use client";

import Link from "next/link";
import { AppShell, ErrorText, SectionTitle, Spinner } from "@/components/AppShell";
import { useVideos } from "@/components/players/queries";
import { Button } from "@/components/players/ui";
import { timeAgo, videoThumb } from "@/components/players/videos";

/**
 * Man of the Match, as in the app (mobile/src/app/(tabs)/motm.tsx): the 5ive Guys' videos, newest
 * first. Pick one to vote for its best player.
 */
export default function MotmPage() {
  // Like the app's tab, look for new videos every time the tab opens, quietly (no spinner).
  const videos = useVideos({ always: true });
  const list = videos.videos ?? [];
  const [latest, ...rest] = list;

  let body;
  if (!videos.data) {
    body = videos.error ? <ErrorText>{videos.error.message}</ErrorText> : <Spinner />;
  } else if (!latest) {
    body = <p className="text-ink-2 text-[15px] text-center pt-6">No videos yet. Check back after the next match.</p>;
  } else {
    body = (
      <>
        <Link
          href={`/motm/${latest.videoId}`}
          aria-label={`Vote Man of the Match for ${latest.title ?? "the latest video"}`}
          className="block rounded-[22px] bg-white shadow-card overflow-hidden active:opacity-90 transition-opacity"
        >
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={videoThumb(latest)} alt="" className="block w-full aspect-video object-cover bg-lilac-2" />
            <span className="absolute top-3 left-3 rounded-lg bg-red-600 px-2 py-[3px] text-white text-[12px] font-black tracking-[0.8px]">LATEST</span>
          </div>
          <div className="p-4 flex flex-col gap-1.5">
            <h2 className="text-ink text-[19px] leading-6 font-black line-clamp-2">{latest.title ?? "New video"}</h2>
            <p className="text-ink-3 text-[13px] font-semibold">{timeAgo(latest.publishedAt)}</p>
            <span className="mt-1.5 h-[50px] rounded-[14px] bg-violet-600 flex items-center justify-center text-white text-[17px] font-black whitespace-pre">
              ⭐  Vote Man of the Match
            </span>
          </div>
        </Link>

        {rest.length > 0 && <SectionTitle>Earlier videos</SectionTitle>}
        <div className="flex flex-col gap-2.5">
          {rest.map((v) => (
            <Link
              key={v.videoId}
              href={`/motm/${v.videoId}`}
              aria-label={`Vote Man of the Match for ${v.title ?? "this video"}`}
              className="flex items-center gap-3 rounded-[18px] bg-white shadow-card p-2.5 active:opacity-80 transition-opacity"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={videoThumb(v, "mq")} alt="" className="w-[124px] shrink-0 aspect-video rounded-[10px] object-cover bg-lilac-2" />
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <p className="text-ink text-[15px] leading-5 font-extrabold line-clamp-2">{v.title ?? "Video"}</p>
                <p className="text-ink-3 text-[13px] font-semibold">{timeAgo(v.publishedAt)}</p>
              </div>
              <span className="text-ink-3 text-[22px] leading-none font-semibold" aria-hidden>›</span>
            </Link>
          ))}
        </div>
        {videos.hasNextPage && (
          <Button
            title="Show older videos"
            variant="secondary"
            loading={videos.isFetchingNextPage}
            onPress={() => videos.fetchNextPage()}
            className="w-full mt-1.5"
          />
        )}
      </>
    );
  }

  return (
    <AppShell title="Man of the Match">
      <div className="flex flex-col gap-3 leading-[1.2]">
        <p className="text-ink-2 text-[16px] leading-[22px] font-medium">Who was the best player? Pick a video and vote for your Man of the Match.</p>
        {body}
      </div>
    </AppShell>
  );
}
