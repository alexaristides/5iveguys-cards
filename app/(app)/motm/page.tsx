"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { AppShell, cardLink, PageTitle, panel, primaryButton, secondaryButton, SectionTitle, Spinner } from "@/components/AppShell";
import { SQUAD_CHANNEL } from "@/components/players/ratings";
import { timeAgo, videoThumb, type Video } from "@/components/players/videos";

interface Page { videos: Video[]; total: number; page: number; pageSize: number }

/** Man of the Match, as in the app: the 5ive Guys' videos, newest first. Pick one to vote for its best player. */
export default function MotmPage() {
  const { status } = useSession();
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [more, setMore] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (page: number) => {
    const res = await fetch(`/api/channels/${SQUAD_CHANNEL}/videos?page=${page}`);
    if (!res.ok) { setError("Couldn't load the videos."); return; }
    const data: Page = await res.json();
    setVideos((v) => (page === 1 ? data.videos : [...(v ?? []), ...data.videos]));
    setMore(data.page * data.pageSize < data.total ? data.page + 1 : null);
  }, []);

  useEffect(() => { if (status === "authenticated") load(1); }, [status, load]);

  const [latest, ...rest] = videos ?? [];
  let body;
  if (status === "unauthenticated") {
    body = (
      <section className={`${panel} space-y-3 text-center`}>
        <div className="mx-auto w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center text-2xl" aria-hidden>⭐</div>
        <h2 className="text-ink text-xl font-black">Sign in to vote</h2>
        <p className="text-ink-2">One vote per video. Pick the player who stood out and see who the fans chose.</p>
        <button onClick={() => signIn("google")} className={`${primaryButton} h-[52px] px-6 text-[17px]`}>Sign in</button>
      </section>
    );
  } else if (error) {
    body = <p className="text-red-600 font-semibold">{error}</p>;
  } else if (!videos) {
    body = <Spinner />;
  } else if (!latest) {
    body = <p className="text-ink-2 text-center pt-6">No videos yet. Check back after the next match.</p>;
  } else {
    body = (
      <>
        <Link href={`/motm/${latest.videoId}`} className={`${cardLink} block overflow-hidden rounded-[22px]`}>
          <div className="relative aspect-video bg-lilac-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={videoThumb(latest)} alt="" className="w-full h-full object-cover" />
            <span className="absolute top-3 left-3 rounded-lg bg-red-600 text-white text-xs font-black tracking-[0.06em] px-2 py-0.5">LATEST</span>
          </div>
          <div className="p-4 space-y-1.5">
            <h2 className="text-ink text-[19px] leading-6 font-black line-clamp-2">{latest.title ?? "New video"}</h2>
            <p className="text-ink-3 text-sm font-semibold">{timeAgo(latest.publishedAt)}</p>
            <span className={`${primaryButton} mt-1.5 flex items-center justify-center h-[50px] text-[17px]`}>⭐&nbsp; Vote Man of the Match</span>
          </div>
        </Link>

        {rest.length > 0 && <SectionTitle>Earlier videos</SectionTitle>}
        <div className="grid sm:grid-cols-2 gap-2.5">
          {rest.map((v) => (
            <Link key={v.videoId} href={`/motm/${v.videoId}`} className={`${cardLink} flex items-center gap-3 p-2.5`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={videoThumb(v, "mq")} alt="" className="w-[124px] aspect-video rounded-[10px] object-cover bg-lilac-2 shrink-0" />
              <span className="flex-1 min-w-0 space-y-1">
                <span className="block text-ink text-[15px] leading-5 font-extrabold line-clamp-2">{v.title ?? "Video"}</span>
                <span className="block text-ink-3 text-[13px] font-semibold">{timeAgo(v.publishedAt)}</span>
              </span>
              <span className="text-ink-3 text-2xl leading-none font-semibold" aria-hidden>›</span>
            </Link>
          ))}
        </div>
        {more !== null && (
          <button
            onClick={async () => { setLoadingMore(true); await load(more); setLoadingMore(false); }}
            disabled={loadingMore}
            className={`${secondaryButton} w-full h-[52px]`}
          >
            {loadingMore ? "Loading…" : "Show older videos"}
          </button>
        )}
      </>
    );
  }

  return (
    <AppShell>
      <PageTitle title="Man of the Match" sub="Who was the best player? Pick a video and vote for your Man of the Match." />
      {body}
    </AppShell>
  );
}
