"use client";

import { useState } from "react";
import { gameweekStatus } from "@/lib/fantasy";
import type { Act, Gameweek, Season } from "./types";
import {
  btnDanger, btnPrimary, dateInput, deadlineOf, field, formatDay, formatTime, fromInputs, kickoffOf, Label, LOCK_MINUTES,
  Sheet, timeInput, untilText,
} from "./ui";

/** Next Sunday at 11:00, or a week after the last gameweek's kick-off. */
function suggestedKickoff(gameweeks: Gameweek[]) {
  const last = gameweeks.at(-1);
  if (last) return new Date(kickoffOf(last.deadline).getTime() + 7 * 86_400_000);
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  d.setHours(11, 0, 0, 0);
  return d;
}

export function GameweeksTab({ season, gameweeks, act, onOpen }: {
  season: Season; gameweeks: Gameweek[]; act: Act; onOpen: (id: string) => void;
}) {
  const [editing, setEditing] = useState<Gameweek | "new" | null>(null);
  const now = Date.now();
  const nextNumber = (gameweeks.at(-1)?.number ?? 0) + 1;
  // Newest first once a few have been played, so this week's match is at the top.
  const ordered = [...gameweeks].sort((a, b) => {
    const rank = (g: Gameweek) => ({ live: 0, upcoming: 1, finished: 2 })[gameweekStatus(g, now)];
    return rank(a) - rank(b) || (rank(a) === 2 ? b.number - a.number : a.number - b.number);
  });

  return (
    <div className="space-y-4">
      <button className={`${btnPrimary} w-full`} onClick={() => setEditing("new")}>+ Add gameweek {nextNumber}</button>

      {ordered.length === 0 && (
        <p className="text-zinc-400 text-center py-10">No gameweeks yet. Add one for the next match: fans can pick teams until 90 minutes before kick-off.</p>
      )}

      {ordered.map((gw) => {
        const status = gameweekStatus(gw, now);
        const kickoff = kickoffOf(gw.deadline);
        return (
          <button key={gw.id} onClick={() => (status === "upcoming" ? setEditing(gw) : onOpen(gw.id))}
            className="w-full text-left rounded-2xl bg-zinc-900 border border-zinc-800 active:bg-zinc-800 p-4 touch-manipulation">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Gameweek {gw.number}</div>
                <div className="text-white text-lg font-black truncate">{gw.name ? `vs ${gw.name}` : "Opponent TBC"}</div>
                <div className="text-zinc-400 text-sm">{formatDay(kickoff)} · kick-off {formatTime(kickoff)}</div>
              </div>
              {status === "finished" && gw.goalsFor !== null && gw.goalsAgainst !== null && (
                <div className="text-white text-2xl font-black tabular-nums shrink-0">{gw.goalsFor}–{gw.goalsAgainst}</div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              {status === "upcoming" && (
                <span className="px-2.5 py-1 rounded-full bg-sky-950 text-sky-300 text-xs font-bold">Picks open · locks in {untilText(new Date(gw.deadline).getTime() - now)}</span>
              )}
              {status === "live" && <span className="px-2.5 py-1 rounded-full bg-amber-500 text-black text-xs font-black">Enter the result →</span>}
              {status === "finished" && <span className="px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 text-xs font-bold">✓ Scored</span>}
              <span className="text-zinc-500 text-xs">{gw.entries} {gw.entries === 1 ? "team" : "teams"}</span>
            </div>
          </button>
        );
      })}

      {editing && (
        <GameweekSheet
          season={season}
          gw={editing === "new" ? null : editing}
          number={editing === "new" ? nextNumber : editing.number}
          suggested={suggestedKickoff(gameweeks)}
          act={act}
          onClose={() => setEditing(null)}
          onOpenResult={editing !== "new" ? () => { setEditing(null); onOpen(editing.id); } : undefined}
        />
      )}
    </div>
  );
}

/** Add a gameweek or change its opponent and kick-off. */
export function GameweekSheet({ season, gw, number, suggested, act, onClose, onOpenResult }: {
  season: Season; gw: Gameweek | null; number: number; suggested?: Date; act: Act; onClose: () => void; onOpenResult?: () => void;
}) {
  const start = gw ? kickoffOf(gw.deadline) : suggested ?? new Date();
  const [name, setName] = useState(gw?.name ?? "");
  const [date, setDate] = useState(dateInput(start));
  const [time, setTime] = useState(timeInput(start));
  const [busy, setBusy] = useState(false);
  const kickoff = fromInputs(date, time);
  const deadline = kickoff ? deadlineOf(kickoff) : null;

  async function save() {
    if (!deadline) return;
    setBusy(true);
    const res = await act({
      action: "saveGameweek", seasonId: season.id, id: gw?.id, number, name: name.trim(), deadline: deadline.toISOString(),
      goalsFor: gw?.goalsFor ?? null, goalsAgainst: gw?.goalsAgainst ?? null,
    }, gw ? `Gameweek ${number} saved` : `Gameweek ${number} added`);
    setBusy(false);
    if (res) onClose();
  }

  async function remove() {
    if (!gw || !confirm(`Delete gameweek ${gw.number}?`)) return;
    setBusy(true);
    const res = await act({ action: "deleteGameweek", id: gw.id }, `Gameweek ${gw.number} deleted`);
    setBusy(false);
    if (res) onClose();
  }

  return (
    <Sheet
      title={gw ? `Gameweek ${number}` : `Add gameweek ${number}`}
      onClose={onClose}
      footer={<button className={`${btnPrimary} flex-1`} disabled={busy || !deadline} onClick={save}>{gw ? "Save" : "Add gameweek"}</button>}
    >
      <div>
        <Label>Opponent</Label>
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hackney Wick" autoCapitalize="words" enterKeyHint="next" />
      </div>
      <div>
        <Label>Kick-off</Label>
        <div className="grid grid-cols-[1.4fr_1fr] gap-3">
          <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} step={300} />
        </div>
        {deadline && (
          <p className="text-zinc-400 text-sm mt-2">
            Teams lock at <span className="text-white font-semibold">{formatDay(deadline)} {formatTime(deadline)}</span> ({LOCK_MINUTES} min before kick-off).
            {deadline.getTime() < Date.now() && <span className="text-amber-400"> That&apos;s in the past, so picks are closed.</span>}
          </p>
        )}
      </div>
      {gw && onOpenResult && (
        <button className="w-full h-12 rounded-xl border border-zinc-700 text-zinc-200 font-semibold" onClick={onOpenResult}>Enter the result and stats</button>
      )}
      {gw && gw.entries === 0 && <button className={`${btnDanger} w-full`} disabled={busy} onClick={remove}>Delete gameweek</button>}
      {gw && gw.entries > 0 && <p className="text-zinc-500 text-xs">{gw.entries} fans have picked teams for this gameweek, so it can&apos;t be deleted. Change the date instead.</p>}
    </Sheet>
  );
}
