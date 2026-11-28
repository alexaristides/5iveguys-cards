"use client";

import Image from "next/image";
import Link from "next/link";
import { card, SectionTitle } from "@/components/AppShell";
import { formatStat, statHighlights, type FantasyStats } from "@/lib/fantasy-stats";

/**
 * My Team's "Season stats", as in the app (mobile/src/components/fantasy/StatHighlights.tsx): the leaders
 * on the main boards (most picked, points, goals, transfers in), each opening the player's card, and
 * "See all" for /fantasy/stats. Nothing until someone leads.
 */
export function StatHighlights({ stats, openPlayer }: { stats: FantasyStats | null; openPlayer: (id: string) => void }) {
  const highlights = stats ? statHighlights(stats.players) : [];
  if (!highlights.length) return null;
  return (
    <>
      <SectionTitle
        right={<Link href="/fantasy/stats" className="shrink-0 whitespace-nowrap text-violet-600 hover:text-violet-700 text-[16px] font-extrabold">See all</Link>}
      >
        Season stats
      </SectionTitle>
      <div className="grid grid-cols-2 gap-2.5">
        {highlights.map(({ board, player, value, tied }) => (
          <button
            key={board.id}
            type="button"
            onClick={() => openPlayer(player.id)}
            aria-label={`${board.title}: ${player.name}, ${formatStat(board, value)}`}
            className={`${card} p-3 flex flex-col gap-2 text-left hover:shadow-[0_6px_18px_rgba(46,16,101,0.12)] active:opacity-70 transition`}
          >
            <span className="text-ink-3 text-[11px] leading-snug font-black tracking-[0.5px] uppercase line-clamp-2">{board.emoji} {board.title}</span>
            <span className="flex items-center gap-2.5">
              <span className="relative block w-10 shrink-0 aspect-[785/1085] overflow-hidden rounded-md bg-lilac-2">
                {player.imageUrl && <Image src={player.imageUrl} alt="" fill sizes="40px" className="object-cover" />}
              </span>
              <span className="min-w-0">
                <span className="block text-ink text-base font-black truncate">{player.name}</span>
                <span className="block text-violet-600 text-[20px] leading-tight font-black tabular-nums">{formatStat(board, value)}</span>
                {tied > 0 && <span className="block text-ink-3 text-xs font-semibold">& {tied} more</span>}
              </span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
