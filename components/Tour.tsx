"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/** Bump with the app's key (mobile/src/lib/tour.ts) to show the intro to everyone again. */
const KEY = "tour_seen_v2";

/** Whether this browser has seen the intro (null until known), and a way to mark it seen. */
export function useTourSeen(): [boolean | null, () => void] {
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      setSeen(window.localStorage.getItem(KEY) === "1");
    } catch {
      setSeen(true);
    }
  }, []);
  const markSeen = useCallback(() => {
    setSeen(true);
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      // Private mode: the intro just shows again next time.
    }
  }, []);
  return [seen, markSeen];
}

type Photo = { name: string; imageUrl: string };

/** The squad's Home Kit photos for the pictures (public endpoint, so it works before sign-in). */
function useSquadPhotos() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  useEffect(() => {
    fetch("/api/channels/5iveguysfc/cards")
      .then((r) => (r.ok ? r.json() : { cards: [] }))
      .then((d: { cards: { name: string; kit: string | null; imageUrl: string }[] }) =>
        setPhotos(d.cards.filter((c) => c.kit === "Home Kit").map((c) => ({ name: c.name, imageUrl: c.imageUrl }))),
      )
      .catch(() => {});
  }, []);
  return photos;
}

function Face({ photo, size, ring = "#FFFFFF" }: { photo?: Photo; size: number; ring?: string }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full border-[3px] bg-violet-100 shadow-card"
      style={{ width: size, height: size, borderColor: ring }}
    >
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
      )}
    </div>
  );
}

function Welcome() {
  return (
    <div className="flex flex-col items-center gap-[18px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/5iveg-app-icon.png" alt="" className="h-[170px] w-[170px] rounded-[40px] shadow-[0_3px_10px_rgba(46,16,101,0.3)]" />
      <div className="rounded-2xl bg-white px-3.5 py-2 shadow-card">
        <span className="text-ink text-[15px] font-black">⚽ Fantasy Div 1</span>
      </div>
    </div>
  );
}

/** Seven faces on a little pitch, attack at the top. */
function PickSeven({ photos }: { photos: Photo[] }) {
  const rows = [[0], [1, 2], [3, 4, 5], [6]];
  return (
    <div className="relative flex h-[310px] w-[260px] flex-col justify-around overflow-hidden rounded-[24px] bg-pitch py-[18px] shadow-[0_3px_10px_rgba(46,16,101,0.2)]">
      <div className="absolute inset-2.5 rounded-lg border-2 border-white/45" />
      {rows.map((row, r) => (
        <div key={r} className="relative flex justify-evenly">
          {row.map((i) => <Face key={i} photo={photos[i]} size={58} />)}
        </div>
      ))}
    </div>
  );
}

function Points({ photo }: { photo?: Photo }) {
  const chips = [
    { label: "Goal", pts: "+4", style: { top: 8, left: -6 } },
    { label: "Assist", pts: "+3", style: { top: 70, right: -24 } },
    { label: "Clean sheet", pts: "+5", style: { top: 150, left: -40 } },
  ];
  return (
    <div className="relative flex h-[260px] w-[200px] flex-col items-center justify-center">
      <div className="relative">
        <Face photo={photo} size={150} ring="#FACC15" />
        <div className="absolute right-1 top-1 flex h-[38px] w-[38px] items-center justify-center rounded-full border-[3px] border-white bg-yellow-400">
          <span className="text-[18px] font-black text-[#111]">C</span>
        </div>
      </div>
      <div className="mt-3.5 rounded-xl bg-amber-100 px-3 py-1.5">
        <span className="text-[15px] font-black text-amber-700">Captain = ×2</span>
      </div>
      {chips.map((c) => (
        <div key={c.label} className="absolute flex items-center gap-1.5 rounded-[14px] bg-white px-2.5 py-1.5 shadow-[0_3px_10px_rgba(46,16,101,0.15)]" style={c.style}>
          <span className="text-[16px] font-black text-green-600">{c.pts}</span>
          <span className="text-ink text-[13px] font-extrabold">{c.label}</span>
        </div>
      ))}
    </div>
  );
}

/** A video card with the vote on it. */
function Motm({ photo }: { photo?: Photo }) {
  return (
    <div className="w-[290px] overflow-hidden rounded-[22px] bg-white shadow-[0_3px_10px_rgba(46,16,101,0.15)]">
      <div className="flex h-[150px] items-center justify-center bg-violet-600">
        <div className="flex h-[46px] w-16 items-center justify-center rounded-[14px] bg-[#FF0033]">
          <div className="ml-1 h-0 w-0 border-y-[10px] border-l-[17px] border-y-transparent border-l-white" />
        </div>
      </div>
      <div className="flex items-center gap-3 p-3.5">
        <Face photo={photo} size={52} ring="#FACC15" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-black tracking-[0.07em] text-amber-700">⭐ MAN OF THE MATCH</div>
          <div className="text-ink truncate text-[20px] font-black">{photo?.name ?? "Your pick"}</div>
        </div>
        <div className="rounded-xl bg-green-600 px-2.5 py-[7px]">
          <span className="text-[13px] font-black text-white">✓ Voted</span>
        </div>
      </div>
    </div>
  );
}

function League() {
  const rows = [
    { rank: 1, name: "Sunday Legends", pts: 312, me: false },
    { rank: 2, name: "You", pts: 298, me: true },
    { rank: 3, name: "Big Sam's XI", pts: 271, me: false },
  ];
  return (
    <div className="w-[290px] space-y-2.5">
      {rows.map((r) => (
        <div
          key={r.rank}
          className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 shadow-card ${r.me ? "border-violet-600 bg-violet-100" : "border-transparent bg-white"}`}
        >
          <span className={`w-[18px] text-[18px] font-black ${r.rank === 1 ? "text-amber-700" : "text-ink-2"}`}>{r.rank}</span>
          <span className="text-ink flex-1 text-[17px] font-black">{r.name}</span>
          <span className="text-[18px] font-black tabular-nums text-violet-600">{r.pts}</span>
        </div>
      ))}
    </div>
  );
}

interface PageSpec {
  key: string;
  title: string;
  body: string;
  art: ReactNode;
}

/** The app's intro (mobile/src/components/Tour.tsx) in five swipeable pages. Shown once; replay it from the menu. */
export function Tour({ onDone }: { onDone: () => void }) {
  const photos = useSquadPhotos();
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const pages: PageSpec[] = [
    { key: "welcome", title: "Fantasy football for the 5ive Guys", body: "Play along with their real Division 1 season. It's free.", art: <Welcome /> },
    { key: "pick", title: "Pick any 7 players", body: "Choose 7 of the 5ive Guys. No prices, no budget: just the players you rate.", art: <PickSeven photos={photos} /> },
    { key: "points", title: "Score from real matches", body: "Goals, assists and clean sheets in their real games score you points. Your captain scores double.", art: <Points photo={photos[0]} /> },
    { key: "motm", title: "Vote Man of the Match", body: "After every video, pick the player of the match and see who the fans chose.", art: <Motm photo={photos[3]} /> },
    { key: "league", title: "Beat your mates", body: "Start a league, share the code, and see who finishes top.", art: <League /> },
  ];
  const last = index === pages.length - 1;

  // The page under the dots and the button follows the scroll, however it got there (swipe, arrows or Next).
  function onScroll() {
    const el = scroller.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  function next() {
    if (last) return onDone();
    const el = scroller.current;
    el?.scrollTo({ left: (index + 1) * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-lilac text-ink [color-scheme:light] pt-[env(safe-area-inset-top)] pb-[calc(16px+env(safe-area-inset-bottom))]">
      <div className="absolute inset-x-0 top-0 h-[60dvh] bg-gradient-to-b from-violet-100 to-lilac" aria-hidden />
      <div className="relative flex h-11 items-center justify-end px-5">
        {!last && (
          <button type="button" onClick={onDone} className="text-ink-2 hover:text-ink text-base font-bold">
            Skip
          </button>
        )}
      </div>

      <div
        ref={scroller}
        onScroll={onScroll}
        className="relative flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {pages.map((p, i) => (
          <section
            key={p.key}
            aria-hidden={i !== index}
            className={`flex w-full shrink-0 snap-center flex-col justify-center px-7 transition-opacity duration-300 ${i === index ? "opacity-100" : "opacity-0"}`}
          >
            <div className={`flex h-[320px] items-center justify-center transition-transform duration-300 ${i === index ? "scale-100" : "scale-[0.85]"}`}>
              {p.art}
            </div>
            <div className="mx-auto mt-6 max-w-md space-y-2.5 text-center">
              <h1 className="text-[30px] leading-tight font-black">{p.title}</h1>
              <p className="text-ink-2 text-[17px] leading-6">{p.body}</p>
            </div>
          </section>
        ))}
      </div>

      <div className="relative mx-auto flex w-full max-w-md flex-col items-center gap-5 px-6">
        <div className="flex gap-2" aria-hidden>
          {pages.map((p, i) => (
            <span key={p.key} className={`h-2 rounded-full transition-all ${i === index ? "w-[22px] bg-violet-600" : "w-2 bg-lilac-line"}`} />
          ))}
        </div>
        <button
          type="button"
          onClick={next}
          className="h-[52px] w-full rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-[17px] font-extrabold transition-colors"
        >
          {last ? "Let's play" : "Next"}
        </button>
      </div>
    </div>
  );
}
