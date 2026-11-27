"use client";

import { useEffect } from "react";
import Image from "next/image";
import type { FantasyOverview } from "@/components/fantasy/types";
import { FANTASY_RULES, PLAYER_STATUS, POSITION_LABEL, POSITIONS, type FantasyPosition } from "@/lib/fantasy";
import { useEscape, usePresence } from "./sheets";

type FantasyPlayer = FantasyOverview["players"][number];

const SIZE = FANTASY_RULES.squadSize;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const SECTION_TITLE = { GK: "Goalkeepers", DEF: "Defenders", MID: "Midfielders", FWD: "Forwards" } as const;
/** The app's POSITION_COLOR (mobile/src/lib/theme.ts). */
const POSITION_COLOR: Record<FantasyPosition, string> = { GK: "#F59E0B", DEF: "#2563EB", MID: "#16A34A", FWD: "#E11D48" };

/**
 * Pick the 7, as in the app's team picker: a page sheet over the team with every player by position,
 * tap to add, tap again to take out. The page closes it once the 7th is in.
 */
export function PlayerPicker({
  visible, players, picked, onToggle, onClose,
}: {
  visible: boolean; players: FantasyPlayer[]; picked: string[]; onToggle: (id: string) => void; onClose: () => void;
}) {
  const { mounted, shown } = usePresence(visible, 300);
  useEscape(visible, onClose);
  useEffect(() => {
    if (!visible) return;
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => { html.style.overflow = before; };
  }, [visible]);
  if (!mounted) return null;

  const full = picked.length >= SIZE;
  const sections = POSITIONS.map((pos) => ({
    pos,
    title: SECTION_TITLE[pos],
    data: players
      .filter((p) => p.position === pos && (p.isActive || picked.includes(p.id)))
      .sort((a, b) => b.totalPoints - a.totalPoints || b.selectedBy - a.selectedBy || a.name.localeCompare(b.name)),
  })).filter((s) => s.data.length);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end md:items-center justify-center [color-scheme:light] ${visible ? "" : "pointer-events-none"}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Pick ${SIZE} players`}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Done"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-black/40 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`}
      />
      <div
        className={`relative flex w-full flex-col bg-lilac px-4 pt-2.5 text-ink shadow-2xl transition-transform duration-300 ease-out
          h-[calc(100dvh-env(safe-area-inset-top)-10px)] rounded-t-[12px] md:h-[90dvh] md:max-w-[600px] md:rounded-[16px]
          ${shown ? "translate-y-0" : "translate-y-[100dvh]"}`}
      >
        <div className="mt-2 flex items-center justify-between">
          <h2 className="text-ink text-[24px] font-black">Pick {SIZE} players</h2>
          <button type="button" onClick={onClose} className="text-violet-600 hover:text-violet-700 text-[17px] font-extrabold">Done</button>
        </div>
        <div className="mt-3 flex items-center gap-2.5">
          <div className="h-2.5 flex-1 overflow-hidden rounded-[5px] bg-lilac-2">
            <div
              className="h-full rounded-[5px] bg-green-600 transition-[width] duration-200"
              style={{ width: `${(Math.min(picked.length, SIZE) / SIZE) * 100}%` }}
            />
          </div>
          <span className="text-ink text-[15px] font-black tabular-nums">{picked.length} of {SIZE}</span>
        </div>
        <p className="mt-2 mb-1 text-ink-2 text-[14px]">
          {full ? "That's your 7! Tap a player to take them out and make room." : "Tap a player to add them. Tap again to take them out."}
        </p>

        <div className="-mx-4 flex-1 overflow-y-auto overscroll-contain px-4 pb-12">
          {sections.map((section) => (
            <section key={section.pos}>
              <div className="mt-4 mb-2 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: POSITION_COLOR[section.pos] }} aria-hidden />
                <h3 className="text-ink text-[16px] font-black">{section.title}</h3>
              </div>
              {section.data.map((p) => {
                const on = picked.includes(p.id);
                const flagged = p.status !== "a";
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onToggle(p.id)}
                    aria-pressed={on}
                    aria-label={`${p.name}, ${POSITION_LABEL[p.position]}${on ? ", in your team" : ""}`}
                    className={`mb-2 flex w-full items-center gap-3 rounded-2xl border-2 p-2.5 text-left shadow-card transition-opacity active:opacity-70
                      ${on ? "border-green-600 bg-[#F3FDF6]" : "border-transparent bg-white"} ${!on && full ? "opacity-[0.45]" : ""}`}
                  >
                    <span className="relative block w-11 shrink-0 aspect-[785/1085] overflow-hidden rounded-[7px] bg-lilac-2">
                      {p.imageUrl && <Image src={p.imageUrl} alt="" fill sizes="44px" className="object-cover" />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-ink text-[17px] font-black">{p.name}</span>
                      <span className="text-ink-3 text-[13px]">{plural(p.totalPoints, "pt")} · in {p.selectedBy}% of teams</span>
                      {flagged && (
                        <span className="line-clamp-2 text-[12px] font-bold" style={{ color: PLAYER_STATUS[p.status].color }}>
                          {PLAYER_STATUS[p.status].label}{p.news ? ` — ${p.news}` : ""}
                        </span>
                      )}
                    </span>
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-[20px] leading-none font-black
                        ${on ? "border-green-600 bg-green-600 text-white" : "border-violet-600 text-violet-600"}`}
                      aria-hidden
                    >
                      {on ? "✓" : "+"}
                    </span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
