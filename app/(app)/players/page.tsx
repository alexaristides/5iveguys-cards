"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { AppShell, card, chipClass, PageTitle, panel, Spinner } from "@/components/AppShell";
import { overallClass, SQUAD_CHANNEL, type SquadRating } from "@/components/players/ratings";

type Sort = "top" | "name" | "todo";

/** Players, as in the app: the 5ive Guys' squad with the fans' overall for each. Pick one to see their ratings and rate them. */
export default function PlayersPage() {
  const { status } = useSession();
  const [players, setPlayers] = useState<SquadRating[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("top");

  useEffect(() => {
    if (status === "loading") return;
    fetch(`/api/channels/${SQUAD_CHANNEL}/players`)
      .then(async (r) => (r.ok ? setPlayers((await r.json()).players) : setError("Couldn't load the squad.")))
      .catch(() => setError("Couldn't load the squad."));
  }, [status]);

  const all = useMemo(() => players ?? [], [players]);
  const ratedCount = all.filter((p) => p.rated).length;
  const rows = useMemo(() => {
    if (sort === "name") return [...all].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "todo") return all.filter((p) => !p.rated);
    return all; // the API sends them best rated first
  }, [all, sort]);

  return (
    <AppShell>
      <PageTitle title="Players" sub="Rate the 5ive Guys. The fans' ratings make each player's overall." />
      {error ? <p className="text-red-600 font-semibold">{error}</p> : !players ? <Spinner /> : (
        <>
          {status === "authenticated" && (
            <div className={`${panel} space-y-1.5`}>
              <div className="text-ink font-extrabold">
                {ratedCount === all.length ? "✓ You've rated the whole squad" : `You've rated ${ratedCount} of ${all.length}`}
              </div>
              <div className="h-2 rounded-full bg-lilac-2 overflow-hidden">
                <div className="h-full rounded-full bg-green-600" style={{ width: `${all.length ? (ratedCount / all.length) * 100 : 0}%` }} />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button onClick={() => setSort("top")} className={chipClass(sort === "top")}>Top rated</button>
            <button onClick={() => setSort("name")} className={chipClass(sort === "name")}>A–Z</button>
            {status === "authenticated" && (
              <button onClick={() => setSort("todo")} className={chipClass(sort === "todo")}>To rate ({all.length - ratedCount})</button>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="text-ink-2 text-center pt-6">Nobody left to rate. You can change a rating any time.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
              {rows.map((p) => <PlayerTile key={p.cardId} player={p} />)}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

function PlayerTile({ player: p }: { player: SquadRating }) {
  return (
    <Link
      href={`/players/${p.cardId}`}
      aria-label={`${p.name}${p.overall != null ? `, rated ${p.overall}` : ", not rated yet"}${p.rated ? ", you've rated them" : ""}`}
      className={`${card} p-1.5 pb-2 hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(46,16,101,0.12)] transition`}
    >
      <div className="relative">
        <div className="relative aspect-[785/1085] rounded-[10px] overflow-hidden bg-lilac-2">
          <Image src={p.imageUrl} alt="" fill sizes="(min-width: 768px) 140px, 33vw" className="object-cover" />
        </div>
        <span className={`absolute top-1.5 left-1.5 min-w-[30px] h-[30px] px-1 rounded-full border-2 border-white flex items-center justify-center text-[13px] font-black tabular-nums ${overallClass(p.overall)}`}>
          {p.overall ?? "–"}
        </span>
        {p.rated && (
          <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full border-2 border-white bg-green-600 text-white text-xs font-black flex items-center justify-center">✓</span>
        )}
      </div>
      <div className="mt-1.5 text-center text-ink text-sm font-black truncate">{p.name}</div>
      <div className="text-center text-ink-3 text-[11px] font-bold truncate">{p.position ?? " "}</div>
    </Link>
  );
}
