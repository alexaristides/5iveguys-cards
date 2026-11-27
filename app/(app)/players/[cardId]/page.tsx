"use client";

import { useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { AppShell, ErrorText, Spinner } from "@/components/AppShell";
import { PlayerSheet } from "@/components/fantasy/PlayerSheet";
import { api, dismissKeyboard, useFantasy, useSquadRatings, useVotes } from "@/components/players/queries";
import { EVEN_RATING, overallClass, STATS } from "@/components/players/ratings";
import { Button } from "@/components/players/ui";
import { computeOverall, STAT_FIELDS, type StatKey, type StatsMap } from "@/lib/card-rating";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * One player, as in the app (mobile/src/app/player/[cardId].tsx): the fans' overall and their average
 * on each stat, how they're doing in fantasy, and your rating. Votes go to their squad card, the same
 * pool as the app and 5IVE STREET.
 */
export default function PlayerPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const squad = useSquadRatings();
  const votes = useVotes(cardId);
  const fantasy = useFantasy();
  const player = squad.data?.find((p) => p.cardId === cardId);
  const fantasyRow = player?.fantasyPlayerId ? fantasy.data?.players.find((p) => p.id === player.fantasyPlayerId) : undefined;

  const [rating, setRating] = useState(false);
  const [edits, setEdits] = useState<Partial<StatsMap>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const savingRef = useRef(false);

  if (!player || !votes.data) {
    const error = squad.error ?? votes.error ?? (squad.data && !player ? new Error("Player not found") : null);
    return (
      <AppShell title="Player" back="/players">
        {error ? <ErrorText>{error.message}</ErrorText> : <Spinner />}
      </AppShell>
    );
  }

  const { averages, userVote, voteCount } = votes.data;
  const firstName = player.name.split(" ")[0];
  // Sliders start from your last rating, else the fans' average, else 50 across the board.
  const base = userVote ?? (voteCount ? averages : EVEN_RATING);
  const draft = { ...base, ...edits } as StatsMap;
  // Save stays off until a stat moves, so a double tap on "Rate" can't save the starting values.
  const changed = STAT_FIELDS.some((f) => edits[f] !== undefined && Math.round(edits[f]!) !== Math.round(base[f]));
  const setStat = (key: StatKey, v: number) => { setSaved(false); setEdits((d) => ({ ...d, [key]: v })); };
  const overall = player.overall;
  const myOverall = rating ? computeOverall(draft, player.position) : userVote ? computeOverall(userVote, player.position) : null;

  function startRating() {
    setSaved(false);
    setEdits({});
    setRating(true);
  }

  function cancel() {
    dismissKeyboard();
    setEdits({});
    setRating(false);
  }

  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    dismissKeyboard();
    setSaving(true);
    try {
      const body = Object.fromEntries(STAT_FIELDS.map((f) => [f, Math.round(draft[f])]));
      await api(`/api/cards/${cardId}/votes`, { body });
      await Promise.all([votes.refetch(), squad.refetch()]);
      setEdits({});
      setRating(false);
      setSaved(true);
    } catch (err) {
      window.alert(`Couldn't save your rating\n\n${(err as Error).message}`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const footer = rating ? (
    <div className="flex gap-2.5">
      <Button title="Cancel" variant="secondary" onPress={cancel} className="flex-1" />
      <Button title="Save rating" onPress={save} loading={saving} disabled={!changed} className="flex-[2]" />
    </div>
  ) : (
    <Button title={userVote ? "Change your rating" : `Rate ${firstName}`} onPress={startRating} className="w-full" />
  );

  return (
    <AppShell title={player.name} back="/players" footer={footer}>
      <div className="leading-[1.2]">
        <div className="flex gap-4 items-center mt-1">
          <div className="relative w-[112px] shrink-0 aspect-[785/1085] rounded-xl overflow-hidden bg-lilac-2 shadow-card">
            <Image src={player.imageUrl} alt="" fill sizes="112px" className="object-cover" priority />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <h2 className="text-ink text-[26px] font-black">{player.name}</h2>
            {player.position ? <p className="text-ink-3 text-[14px] font-extrabold">{player.position}</p> : null}
            <div className="flex items-center gap-2.5 mt-2">
              <span
                className={`w-[52px] h-[52px] shrink-0 rounded-full border-[3px] border-white shadow-card flex items-center justify-center text-[21px] font-black tabular-nums ${overallClass(overall)}`}
              >
                {overall ?? "–"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-ink-2 text-[11px] font-black tracking-[0.8px]">FANS&apos; OVERALL</p>
                <p className="text-ink-3 text-[13px] font-semibold">{voteCount ? `from ${plural(voteCount, "rating")}` : "Nobody has rated them yet"}</p>
              </div>
            </div>
          </div>
        </div>

        {saved && (
          <div className="mt-3.5 rounded-[14px] bg-green-100 p-3">
            <p className="text-green-600 text-[14px] font-extrabold">✓ Rating saved. Change it any time.</p>
          </div>
        )}

        {fantasyRow && (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label={`${player.name}'s fantasy stats`}
            className="w-full flex items-center mt-3.5 rounded-[18px] bg-white shadow-card py-3 px-2 active:opacity-80 transition-opacity"
          >
            <FantasyStat value={fantasyRow.totalPoints} label="Points" />
            <FantasyStat value={fantasyRow.form} label="Form" />
            <FantasyStat value={fantasyRow.goals} label="Goals" />
            <FantasyStat value={`${fantasyRow.selectedBy}%`} label="In teams" />
            <span className="text-ink-3 text-[22px] leading-none font-semibold px-1.5" aria-hidden>›</span>
          </button>
        )}

        <div className="flex justify-between items-baseline mt-[22px] mb-1.5">
          <h2 className="text-ink text-[19px] font-black">{rating ? "Your rating" : "Fan ratings"}</h2>
          {myOverall != null && (
            <p className="text-ink-2 text-[14px] font-extrabold">Your overall <span className="text-violet-600">{myOverall}</span></p>
          )}
        </div>
        {rating && <p className="text-ink-3 text-[13px] font-semibold mb-1.5">Drag each bar, or tap a number to type it. 0 is awful, 100 is world class.</p>}

        <div className="rounded-[18px] bg-white shadow-card px-3.5 py-2">
          {STATS.map((s) => rating ? (
            <div key={s.key} className="flex items-center gap-2.5 min-h-9">
              <span className="w-24 shrink-0 text-ink-2 text-[14px] font-bold truncate">{s.label}</span>
              <StatSlider label={s.label} color={s.color} value={draft[s.key]} onChange={(v) => setStat(s.key, v)} />
              <StatInput label={s.label} value={draft[s.key]} onChange={(v) => setStat(s.key, v)} />
            </div>
          ) : (
            <div key={s.key} className="flex items-center gap-2.5 min-h-9">
              <span className="w-24 shrink-0 text-ink-2 text-[14px] font-bold truncate">{s.label}</span>
              <span className="relative flex-1 h-2.5 rounded-[5px] bg-lilac-2">
                <span
                  className="absolute inset-y-0 left-0 rounded-[5px]"
                  style={{ width: `${voteCount ? averages[s.key] : 0}%`, backgroundColor: s.color }}
                />
                {userVote && (
                  <span className="absolute top-1/2 -translate-y-1/2 w-[3px] h-[18px] -ml-[1.5px] rounded-[1.5px] bg-ink" style={{ left: `${userVote[s.key]}%` }} />
                )}
              </span>
              <span className="w-10 shrink-0 text-right text-ink text-[15px] font-black tabular-nums whitespace-nowrap">{voteCount ? averages[s.key] : "–"}</span>
            </div>
          ))}
        </div>
        {!rating && userVote && (
          <div className="flex items-center justify-end gap-1.5 mt-2">
            <span className="w-[3px] h-3 rounded-[1.5px] bg-ink" />
            <span className="text-ink-3 text-[12px] font-bold">Your rating</span>
          </div>
        )}

        {sheetOpen && fantasyRow && <PlayerSheet playerId={fantasyRow.id} onClose={() => setSheetOpen(false)} />}
      </div>
    </AppShell>
  );
}

function FantasyStat({ value, label }: { value: number | string; label: string }) {
  return (
    <span className="flex-1 flex flex-col items-center gap-0.5">
      <span className="text-ink text-[18px] font-black tabular-nums">{value}</span>
      <span className="text-ink-3 text-[10px] font-extrabold">{label}</span>
    </span>
  );
}

// The iOS slider: a thin track filled in the stat's colour up to the thumb, and a white round thumb.
const sliderClass = [
  "flex-1 min-w-0 h-9 appearance-none bg-transparent cursor-pointer outline-none",
  "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full",
  "[&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--fill-color)_var(--fill),#EEEBF8_var(--fill))]",
  "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:-mt-3",
  "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white",
  "[&::-webkit-slider-thumb]:shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16),0_0_0_0.5px_rgba(0,0,0,0.04)]",
  "[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-lilac-2",
  "[&::-moz-range-progress]:h-1 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-[var(--fill-color)]",
  "[&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white",
  "[&::-moz-range-thumb]:shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16),0_0_0_0.5px_rgba(0,0,0,0.04)]",
  "rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400",
].join(" ");

/** The slider beside each stat (the app's @react-native-community/slider, 0 to 100 in steps of 1). */
function StatSlider({ label, color, value, onChange }: { label: string; color: string; value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="range"
      min={0}
      max={100}
      step={1}
      value={Math.round(value)}
      onPointerDown={dismissKeyboard}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={label}
      className={sliderClass}
      style={{ "--fill": `${value}%`, "--fill-color": color } as CSSProperties}
    />
  );
}

/** The number beside each slider; tap it to type a value instead of dragging. */
function StatInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  // Local text while editing; null shows the live value. Focus clears the box (the value stays as
  // the placeholder) so typing replaces it.
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      enterKeyHint="done"
      value={text ?? String(Math.round(value))}
      placeholder={String(Math.round(value))}
      onFocus={() => setText("")}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "");
        if (!digits) return setText("");
        const n = Math.min(100, Number(digits));
        setText(String(n));
        onChange(n);
      }}
      onBlur={() => setText(null)}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      maxLength={3}
      autoComplete="off"
      aria-label={`${label} value`}
      className="w-12 shrink-0 py-1.5 rounded-[10px] border-[1.5px] border-lilac-line bg-lilac text-ink text-[16px] font-black text-center tabular-nums placeholder:text-ink-3 outline-none focus:border-violet-500"
    />
  );
}
