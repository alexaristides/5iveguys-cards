"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AppShell, chipClass, ErrorText, Spinner } from "@/components/AppShell";
import { useSquadRatings } from "@/components/players/queries";
import { overallClass, type SquadRating } from "@/components/players/ratings";

type Sort = "top" | "name" | "todo";

/**
 * Players, as in the app (mobile/src/app/(tabs)/players.tsx): the 5ive Guys' squad with the fans'
 * overall for each. Tap one to see their ratings and rate them.
 */
export default function PlayersPage() {
  // Like the app's tab, pick up new ratings every time the tab opens, quietly (no spinner).
  const players = useSquadRatings({ always: true });
  const [sort, setSort] = useState<Sort>("top");

  const all = useMemo(() => players.data ?? [], [players.data]);
  const ratedCount = all.filter((p) => p.rated).length;
  const rows = useMemo(() => {
    if (sort === "name") return [...all].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "todo") return all.filter((p) => !p.rated);
    return all; // the API sends them best rated first
  }, [all, sort]);

  let body;
  if (!players.data) {
    body = players.error ? <ErrorText>{players.error.message}</ErrorText> : <Spinner />;
  } else {
    body = (
      <>
        <div className="flex items-center rounded-[18px] bg-white shadow-card p-3.5">
          <div className="flex-1 flex flex-col gap-1.5">
            <p className="text-ink text-[15px] font-extrabold">
              {ratedCount === all.length ? "✓ You've rated the whole squad" : `You've rated ${ratedCount} of ${all.length}`}
            </p>
            <div className="h-2 rounded bg-lilac-2 overflow-hidden">
              <div className="h-2 rounded bg-green-600" style={{ width: `${all.length ? (ratedCount / all.length) * 100 : 0}%` }} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={sort === "top"} onClick={() => setSort("top")} className={chipClass(sort === "top")}>Top rated</button>
          <button type="button" aria-pressed={sort === "name"} onClick={() => setSort("name")} className={chipClass(sort === "name")}>A–Z</button>
          <button type="button" aria-pressed={sort === "todo"} onClick={() => setSort("todo")} className={chipClass(sort === "todo")}>
            {`To rate (${all.length - ratedCount})`}
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="text-ink-2 text-[15px] text-center pt-6">Nobody left to rate. You can change a rating any time.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2.5">
            {rows.map((p) => <PlayerTile key={p.cardId} player={p} />)}
          </div>
        )}
      </>
    );
  }

  return (
    <AppShell title="Players">
      <div className="flex flex-col gap-3 leading-[1.2]">
        <p className="text-ink-2 text-[16px] leading-[22px] font-medium">Rate the 5ive Guys. The fans&apos; ratings make each player&apos;s overall.</p>
        {body}
      </div>
    </AppShell>
  );
}

function PlayerTile({ player: p }: { player: SquadRating }) {
  return (
    <Link
      href={`/players/${p.cardId}`}
      aria-label={`${p.name}${p.overall != null ? `, rated ${p.overall}` : ", not rated yet"}${p.rated ? ", you've rated them" : ""}`}
      className="min-w-0 rounded-2xl bg-white shadow-card p-1.5 pb-2 transition active:opacity-80 active:scale-[0.97]"
    >
      <div className="relative">
        <div className="relative w-full aspect-[785/1085] rounded-[10px] overflow-hidden bg-lilac-2">
          <Image src={p.imageUrl} alt="" fill sizes="(min-width: 672px) 210px, 33vw" className="object-cover" />
        </div>
        <span
          className={`absolute top-[5px] left-[5px] min-w-[30px] h-[30px] px-[5px] rounded-full border-2 border-white flex items-center justify-center text-[13px] font-black tabular-nums ${overallClass(p.overall)}`}
        >
          {p.overall ?? "–"}
        </span>
        {p.rated && (
          <span className="absolute top-[5px] right-[5px] w-6 h-6 rounded-full border-2 border-white bg-green-600 flex items-center justify-center text-white text-[12px] font-black">
            ✓
          </span>
        )}
      </div>
      <p className="mt-1.5 text-center text-ink text-[14px] font-black truncate">{p.name}</p>
      <p className="text-center text-ink-3 text-[11px] font-bold truncate">{p.position ?? " "}</p>
    </Link>
  );
}
