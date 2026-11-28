"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { AppShell, card, ErrorText, panel, SectionTitle, Spinner } from "@/components/AppShell";
import { POSITION_BG } from "@/components/fantasy/FantasyPitch";
import { PlayerSheet } from "@/components/fantasy/PlayerSheet";
import { CHIPS } from "@/lib/fantasy";
import { LAST_SEASON, type LastSeason } from "@/lib/fantasy-last-season";
import {
  formatStat, playerTable, STAT_GROUPS, statBoards, TABLE_COLUMNS, type BoardRow, type FantasyStats, type StatBoard, type StatsPlayer,
} from "@/lib/fantasy-stats";

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status})`);
  return data as T;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The season's stats, as in the app (mobile/src/app/fantasy/stats.tsx): every player's numbers in a
 * table, who's most picked, transferred in and out and captained, the leaders on points, goals and the
 * rest, the best gameweek scores, and last season. Open to everyone (it's the same for every fan).
 * Click a player for their card.
 */
export default function FantasyStatsPage() {
  const [data, setData] = useState<FantasyStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  const load = useCallback(() => {
    getJSON<FantasyStats>("/api/fantasy/stats").then((d) => { setData(d); setError(null); }, (e: Error) => setError(e.message));
  }, []);

  // Fresh numbers whenever the browser comes back to the page (the app refetches on focus).
  useEffect(() => {
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  return (
    <AppShell title="Stats" back="/leagues" open>
      {!data ? (error ? <ErrorText>{error}</ErrorText> : <Spinner />) : <Stats data={data} onPlayer={setPlayerId} />}
      {LAST_SEASON && <LastSeasonSection season={LAST_SEASON} />}
      {playerId && <PlayerSheet playerId={playerId} onClose={() => setPlayerId(null)} />}
    </AppShell>
  );
}

function Stats({ data, onPlayer }: { data: FantasyStats; onPlayer: (id: string) => void }) {
  if (!data.season) return <p className="text-ink-2 text-[15px] text-center py-6">Fantasy isn&apos;t open yet. Stats appear once the season starts.</p>;

  const boards = statBoards(data.players);
  const chipsPlayed = Object.values(data.chips).reduce((n, c) => n + (c ?? 0), 0);
  const chipList = CHIPS.filter((c) => data.chips[c.id]).map((c) => `${c.emoji} ${c.name} ${data.chips[c.id]}`);

  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-ink-2 text-sm font-semibold">
        {data.season.name} · {data.scoredThrough ? `up to gameweek ${data.scoredThrough}` : "no gameweeks scored yet"}
      </p>
      <div className={`${panel} flex`}>
        <Summary label="Teams" value={data.teamCount} />
        <Summary label="Transfers" value={data.transfers} />
        <Summary label="Chips played" value={chipsPlayed} />
      </div>
      {chipList.length > 0 && <p className="text-ink-3 text-[13px] text-center -mt-1.5">{chipList.join("  ·  ")}</p>}

      <SectionTitle>All players</SectionTitle>
      <PlayerTable players={data.players} onPlayer={onPlayer} />

      {boards.length === 0 && (
        <p className="text-ink-2 text-[15px] text-center py-4">The lists fill up once fans pick their teams and the first gameweek is scored.</p>
      )}
      {STAT_GROUPS.map((group) => {
        const mine = boards.filter((b) => b.board.group === group.id);
        const bestWeeks = group.id === "points" && data.bestWeeks.length > 0;
        if (!mine.length && !bestWeeks) return null;
        return (
          <div key={group.id} className="flex flex-col gap-3.5">
            <SectionTitle>{group.title}</SectionTitle>
            {mine.map(({ board, rows }) => <Board key={board.id} board={board} rows={rows} onPlayer={onPlayer} />)}
            {bestWeeks && <BestWeeks weeks={data.bestWeeks} />}
          </div>
        );
      })}
    </div>
  );
}

/** Every player's season so far: played, goals, assists, clean sheets and points. Click a column to sort by it. */
function PlayerTable({ players, onPlayer }: { players: StatsPlayer[]; onPlayer: (id: string) => void }) {
  const [sortBy, setSortBy] = useState("points");
  const rows = playerTable(players, sortBy);
  return (
    <section className={`${card} overflow-hidden -mt-1`}>
      <table className="w-full table-fixed text-left">
        <colgroup>
          <col />
          {TABLE_COLUMNS.map((c, i) => <col key={c.id} style={{ width: i === TABLE_COLUMNS.length - 1 ? 52 : 40 }} />)}
        </colgroup>
        <thead>
          <tr className="text-ink-3 text-[11px] font-extrabold">
            <th scope="col" className="pl-4 py-2.5 font-extrabold">Player</th>
            {TABLE_COLUMNS.map((c) => (
              <th key={c.id} scope="col" aria-sort={sortBy === c.id ? "descending" : undefined} className="p-0 last:pr-3 text-right">
                <button
                  type="button"
                  onClick={() => setSortBy(c.id)}
                  title={`Sort by ${c.title.toLowerCase()}`}
                  className={`w-full py-2.5 text-right whitespace-nowrap font-extrabold ${sortBy === c.id ? "text-violet-600" : "hover:text-ink-2"}`}
                >
                  {c.short}{sortBy === c.id ? " ▾" : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} onClick={() => onPlayer(p.id)} className="border-t border-lilac-line cursor-pointer hover:bg-lilac-2 active:opacity-70">
              <td className="pl-4 py-2">
                <button type="button" onClick={(e) => { e.stopPropagation(); onPlayer(p.id); }} className="flex items-center gap-2 min-w-0 max-w-full text-left">
                  <span className="text-ink text-[15px] font-extrabold truncate">{p.name}</span>
                  <span className={`shrink-0 rounded-md px-1.5 py-px text-[10px] font-black text-white ${POSITION_BG[p.position]}`}>{p.position}</span>
                </button>
              </td>
              {TABLE_COLUMNS.map((c) => (
                <td
                  key={c.id}
                  className={`py-2 text-right tabular-nums text-[15px] last:pr-3 ${sortBy === c.id ? "text-violet-600 font-black" : "text-ink-2 font-bold"}`}
                >
                  {c.value(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-lilac-line px-4 py-2 text-ink-3 text-xs">Pl played · G goals · A assists · CS clean sheets · Pts points. Click a column to sort.</p>
    </section>
  );
}

/** The highest single-gameweek scores by any team. */
function BestWeeks({ weeks }: { weeks: FantasyStats["bestWeeks"] }) {
  return (
    <section className={`${card} overflow-hidden`}>
      <BoardHead emoji="🔥" title="Best gameweeks" detail="Highest team scores in a single gameweek" />
      <ol>
        {weeks.map((w, i) => (
          <li key={`${w.team}-${w.gameweek}`} className="flex items-center gap-3 px-4 py-2.5 border-t border-lilac-line">
            <Rank rank={1 + weeks.findIndex((o) => o.points === w.points)} />
            <span className="flex-1 min-w-0">
              <span className="block text-ink text-[15px] font-extrabold truncate">{w.team}</span>
              <span className="block text-ink-3 text-xs truncate">{[w.manager, `Gameweek ${w.gameweek}`].filter(Boolean).join(" · ")}</span>
            </span>
            <span className={`text-[17px] font-black tabular-nums ${i === 0 ? "text-violet-600" : "text-ink"}`}>{w.points}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1 text-center">
      <div className="text-ink text-[22px] font-black tabular-nums">{value}</div>
      <div className="text-ink-3 text-[11px] font-semibold">{label}</div>
    </div>
  );
}

function BoardHead({ emoji, title, detail }: { emoji: string; title: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
      <span className="w-10 h-10 shrink-0 rounded-full bg-violet-100 flex items-center justify-center text-[19px]" aria-hidden>{emoji}</span>
      <span className="min-w-0">
        <h2 className="text-ink text-[17px] font-black leading-tight">{title}</h2>
        <p className="text-ink-3 text-[13px] leading-snug">{detail}</p>
      </span>
    </div>
  );
}

function Rank({ rank }: { rank: number }) {
  return <span className={`w-5 shrink-0 text-[15px] font-black tabular-nums ${rank <= 3 ? "text-amber-700" : "text-ink-2"}`}>{rank}</span>;
}

/** One board: its top five, each opening the player's card. */
function Board({ board, rows, onPlayer }: { board: StatBoard; rows: BoardRow[]; onPlayer: (id: string) => void }) {
  return (
    <section className={`${card} overflow-hidden`}>
      <BoardHead emoji={board.emoji} title={board.title} detail={board.detail} />
      <ol>
        {rows.map(({ player, value, rank }, i) => (
          <li key={player.id} className="border-t border-lilac-line">
            <button
              type="button"
              onClick={() => onPlayer(player.id)}
              className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-lilac-2 active:opacity-70 transition-colors"
              aria-label={`${rank}. ${player.name}, ${formatStat(board, value)}`}
            >
              <Rank rank={rank} />
              <span className="relative block w-8 shrink-0 aspect-[785/1085] overflow-hidden rounded-[5px] bg-lilac-2">
                {player.imageUrl && <Image src={player.imageUrl} alt="" fill sizes="32px" className="object-cover" />}
              </span>
              <span className="flex-1 min-w-0 flex items-center gap-2">
                <span className="text-ink text-[15px] font-extrabold truncate">{player.name}</span>
                <span className={`shrink-0 rounded-md px-1.5 py-px text-[10px] font-black text-white ${POSITION_BG[player.position]}`}>{player.position}</span>
              </span>
              <span className={`text-[17px] font-black tabular-nums ${i === 0 ? "text-violet-600" : "text-ink"}`}>{formatStat(board, value)}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The old Fantasy 5ive game: its final table and the players' tallies (lib/fantasy-last-season.ts). */
function LastSeasonSection({ season }: { season: LastSeason }) {
  const [winner, ...rest] = season.table;
  return (
    <>
      <SectionTitle>Last season</SectionTitle>
      <p className="text-ink-2 text-sm font-semibold -mt-2">Fantasy 5ive {season.season}</p>
      {winner && (
        <section className="rounded-3xl p-5 text-white bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-600 shadow-hero">
          <div className="text-white/85 text-xs font-black tracking-[0.1em]">🏆 CHAMPIONS</div>
          <h2 className="text-[28px] leading-tight font-black mt-1">{winner.team}</h2>
          <p className="text-white/95 text-base font-semibold">{[winner.manager, plural(winner.points, "point")].filter(Boolean).join(" · ")}</p>
        </section>
      )}
      {rest.length > 0 && (
        <section className={`${card} overflow-hidden`}>
          <BoardHead emoji="📋" title="Final table" detail="Season points" />
          <ol>
            {rest.map((t) => (
              <li key={t.team} className="flex items-center gap-3 px-4 py-2.5 border-t border-lilac-line">
                <Rank rank={1 + season.table.filter((o) => o.points > t.points).length} />
                <span className="flex-1 min-w-0">
                  <span className="block text-ink text-[15px] font-extrabold truncate">{t.team}</span>
                  {t.manager && <span className="block text-ink-3 text-xs truncate">{t.manager}</span>}
                </span>
                <span className="text-ink text-[17px] font-black tabular-nums">{t.points}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {season.boards.map((b) => (
        <section key={b.title} className={`${card} overflow-hidden`}>
          <BoardHead emoji={b.emoji} title={b.title} detail={b.detail} />
          <ol>
            {b.rows.map((r, i) => (
              <li key={r.name} className="flex items-center gap-3 px-4 py-2.5 border-t border-lilac-line">
                <Rank rank={1 + b.rows.findIndex((o) => o.value === r.value)} />
                <span className="flex-1 min-w-0 text-ink text-[15px] font-extrabold truncate">{r.name}</span>
                <span className={`text-[17px] font-black tabular-nums ${i === 0 ? "text-violet-600" : "text-ink"}`}>{r.value}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}
