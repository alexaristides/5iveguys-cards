"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { AppShell, BackLink, card, primaryButton, secondaryButton, SectionTitle, Spinner } from "@/components/AppShell";
import type { FantasyOverview } from "@/components/fantasy/types";
import { EVEN_RATING, overallClass, SQUAD_CHANNEL, STATS, type SquadRating } from "@/components/players/ratings";
import { computeOverall, STAT_FIELDS, type StatKey, type StatsMap } from "@/lib/card-rating";

interface Votes { averages: StatsMap; userVote: StatsMap | null; voteCount: number }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * One player, as in the app: the fans' overall and their average on each stat, how they're doing in
 * fantasy, and your rating. Votes go to their squad card, the same pool as the app and 5IVE STREET.
 */
export default function PlayerPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const { status } = useSession();
  const [player, setPlayer] = useState<SquadRating | null | undefined>(undefined);
  const [votes, setVotes] = useState<Votes | null>(null);
  const [fantasy, setFantasy] = useState<FantasyOverview | null>(null);
  const [rating, setRating] = useState(false);
  const [edits, setEdits] = useState<Partial<StatsMap>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadVotes = useCallback(
    () => fetch(`/api/cards/${cardId}/votes`).then((r) => (r.ok ? r.json() : null)).then((v) => v && setVotes(v)),
    [cardId],
  );
  const loadSquad = useCallback(
    () => fetch(`/api/channels/${SQUAD_CHANNEL}/players`).then((r) => (r.ok ? r.json() : { players: [] }))
      .then((d: { players: SquadRating[] }) => setPlayer(d.players.find((p) => p.cardId === cardId) ?? null)),
    [cardId],
  );

  useEffect(() => {
    if (status === "loading") return;
    loadSquad();
    loadVotes();
    fetch("/api/fantasy").then((r) => r.json()).then(setFantasy).catch(() => {});
  }, [status, loadSquad, loadVotes]);

  const back = <BackLink href="/players" label="Players" />;
  if (player === null) return <AppShell>{back}<p className="text-red-600 font-semibold">Player not found.</p></AppShell>;
  if (!player || !votes) return <AppShell>{back}<Spinner /></AppShell>;

  const { averages, userVote, voteCount } = votes;
  const firstName = player.name.split(" ")[0];
  const fantasyRow = player.fantasyPlayerId ? fantasy?.players.find((p) => p.id === player.fantasyPlayerId) : undefined;
  // The bars start from your last rating, else the fans' average, else 50 across the board.
  const base = userVote ?? (voteCount ? averages : EVEN_RATING);
  const draft = { ...base, ...edits } as StatsMap;
  const setStat = (key: StatKey, v: number) => { setSaved(false); setEdits((d) => ({ ...d, [key]: Math.max(0, Math.min(100, Math.round(v))) })); };
  const myOverall = rating ? computeOverall(draft, player.position) : userVote ? computeOverall(userVote, player.position) : null;

  async function save() {
    setSaving(true);
    setError(null);
    const body = Object.fromEntries(STAT_FIELDS.map((f) => [f, Math.round(draft[f])]));
    const res = await fetch(`/api/cards/${cardId}/votes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) {
      await Promise.all([loadVotes(), loadSquad()]);
      setEdits({});
      setRating(false);
      setSaved(true);
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't save your rating.");
    }
    setSaving(false);
  }

  return (
    <AppShell>
      {back}
      <div className="flex gap-4 items-center">
        <div className="relative w-[120px] sm:w-[150px] shrink-0 aspect-[785/1085] rounded-2xl overflow-hidden bg-lilac-2 shadow-card">
          <Image src={player.imageUrl} alt={player.name} fill sizes="150px" className="object-cover" priority />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <h1 className="text-ink text-3xl font-black">{player.name}</h1>
          {player.position && <p className="text-ink-2 font-bold">{player.position}</p>}
          <div className="flex items-center gap-2.5 pt-2">
            <span className={`min-w-[52px] h-[52px] px-1.5 rounded-full border-[3px] border-white shadow-card flex items-center justify-center text-xl font-black tabular-nums ${overallClass(player.overall)}`}>
              {player.overall ?? "–"}
            </span>
            <div>
              <div className="text-ink-3 text-xs font-black tracking-[0.06em]">FANS&apos; OVERALL</div>
              <div className="text-ink-2 text-sm">{voteCount ? `from ${plural(voteCount, "rating")}` : "Nobody has rated them yet"}</div>
            </div>
          </div>
        </div>
      </div>

      {saved && <p className="rounded-2xl bg-green-100 text-green-700 font-extrabold text-sm px-4 py-3">✓ Rating saved. Change it any time.</p>}

      {fantasyRow && (
        <div className={`${card} grid grid-cols-4 py-3 text-center`}>
          <FantasyStat value={fantasyRow.totalPoints} label="Points" />
          <FantasyStat value={fantasyRow.form} label="Form" />
          <FantasyStat value={fantasyRow.goals} label="Goals" />
          <FantasyStat value={`${fantasyRow.selectedBy}%`} label="In teams" />
        </div>
      )}

      <SectionTitle right={myOverall != null ? <span className="text-ink-2 font-extrabold">Your overall <span className="text-violet-600">{myOverall}</span></span> : undefined}>
        {rating ? "Your rating" : "Fan ratings"}
      </SectionTitle>
      {rating && <p className="text-ink-2 text-sm -mt-1">Drag each bar, or type a number. 0 is awful, 100 is world class.</p>}

      <div className={`${card} px-4 py-2`}>
        {STATS.map((s) => (
          <div key={s.key} className="flex items-center gap-3 py-2">
            <span className="w-[104px] shrink-0 text-ink text-sm font-bold truncate">{s.label}</span>
            {rating ? (
              <>
                <input
                  type="range" min={0} max={100} step={1} value={draft[s.key]}
                  onChange={(e) => setStat(s.key, Number(e.target.value))}
                  aria-label={s.label} className="flex-1 h-9 cursor-pointer" style={{ accentColor: s.color }}
                />
                <input
                  type="number" inputMode="numeric" min={0} max={100} value={Math.round(draft[s.key])}
                  onChange={(e) => setStat(s.key, Number(e.target.value.replace(/\D/g, "") || 0))}
                  aria-label={`${s.label} value`}
                  className="w-14 h-9 rounded-xl border-[1.5px] border-lilac-line bg-lilac text-center text-ink font-black tabular-nums outline-none focus:border-violet-500"
                />
              </>
            ) : (
              <>
                <span className="relative flex-1 h-2.5 rounded-full bg-lilac-2">
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${voteCount ? averages[s.key] : 0}%`, backgroundColor: s.color }} />
                  {userVote && <span className="absolute -top-1 w-1 h-[18px] -ml-0.5 rounded-full bg-ink" style={{ left: `${userVote[s.key]}%` }} />}
                </span>
                <span className="w-9 text-right text-ink font-black tabular-nums">{voteCount ? averages[s.key] : "–"}</span>
              </>
            )}
          </div>
        ))}
      </div>
      {!rating && userVote && (
        <p className="flex items-center gap-2 text-ink-3 text-xs font-bold"><span className="w-1 h-3.5 rounded-full bg-ink" /> Your rating</p>
      )}

      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-4 space-y-2">
        {error && <p className="text-center text-red-600 text-sm font-semibold bg-red-50/95 border border-red-100 rounded-xl py-1.5 px-3">{error}</p>}
        {status !== "authenticated" ? (
          <button onClick={() => signIn("google")} className={`${primaryButton} w-full h-[52px] text-[17px] shadow-hero`}>Sign in to rate {firstName}</button>
        ) : rating ? (
          <div className="flex gap-2">
            <button onClick={() => { setEdits({}); setRating(false); }} className={`${secondaryButton} flex-1 h-[52px] text-[17px]`}>Cancel</button>
            <button onClick={save} disabled={saving} className={`${primaryButton} flex-[2] h-[52px] text-[17px] shadow-hero`}>{saving ? "Saving…" : "Save rating"}</button>
          </div>
        ) : (
          <button onClick={() => { setSaved(false); setEdits({}); setRating(true); }} className={`${primaryButton} w-full h-[52px] text-[17px] shadow-hero`}>
            {userVote ? "Change your rating" : `Rate ${firstName}`}
          </button>
        )}
      </div>
    </AppShell>
  );
}

function FantasyStat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <div className="text-ink text-lg font-black tabular-nums">{value}</div>
      <div className="text-ink-3 text-[11px] font-bold">{label}</div>
    </div>
  );
}
