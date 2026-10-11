"use client";

import Image from "next/image";
import type { FantasyPosition } from "@/lib/fantasy";

export interface PitchPlayer { id: string; name: string; position: FantasyPosition; imageUrl: string | null }

export interface PitchSlot {
  key: string;
  /** Empty starting slots show their position; empty subs take anyone. */
  position: FantasyPosition | null;
  player: PitchPlayer | null;
  caption?: string;
  badge?: "C" | "V" | null;
  dim?: boolean;
  onClick?: () => void;
}

const ROWS: FantasyPosition[] = ["FWD", "MID", "DEF", "GK"];
export const POSITION_BG: Record<FantasyPosition, string> = {
  GK: "bg-yellow-600", DEF: "bg-blue-700", MID: "bg-green-700", FWD: "bg-red-700",
};

/** The starting 7 on a pitch (attack at the top) with the 2 subs underneath. */
export function FantasyPitch({ starters, bench }: { starters: PitchSlot[]; bench: PitchSlot[] }) {
  return (
    <div className="space-y-3">
      <div className="relative rounded-2xl bg-[#1e6b2e] overflow-hidden py-5 flex flex-col justify-around gap-4 min-h-[460px]">
        <div className="absolute inset-2.5 border border-white/20 rounded" />
        <div className="absolute left-1/2 -top-9 w-20 h-20 -translate-x-1/2 rounded-full border border-white/20" />
        <div className="absolute bottom-2.5 left-[27%] right-[27%] h-[14%] border border-b-0 border-white/20" />
        {ROWS.map((pos) => (
          <div key={pos} className="relative flex justify-evenly items-start">
            {starters.filter((s) => (s.player?.position ?? s.position) === pos).map((s) => <Token key={s.key} slot={s} />)}
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-10 rounded-2xl bg-zinc-900 border border-zinc-800 py-3">
        {bench.map((s, i) => (
          <div key={s.key} className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-black tracking-wider text-zinc-500">SUB {i + 1}</span>
            <Token slot={s} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Token({ slot }: { slot: PitchSlot }) {
  const { player } = slot;
  return (
    <button
      type="button"
      onClick={slot.onClick}
      disabled={!slot.onClick}
      className="w-20 flex flex-col items-center enabled:hover:scale-105 transition-transform"
    >
      <div
        className={`relative w-12 aspect-[785/1085] rounded-md overflow-hidden border-[1.5px] border-white/70 bg-black/30 flex items-center justify-center
          ${!player ? "border-dashed" : ""} ${slot.dim ? "opacity-40" : ""}`}
      >
        {player?.imageUrl ? (
          <Image src={player.imageUrl} alt={player.name} fill sizes="48px" className="object-cover" />
        ) : (
          <span className="text-white text-2xl font-light">+</span>
        )}
        {slot.badge && (
          <span className={`absolute top-0.5 right-0.5 w-4 h-4 rounded-full border border-black text-[9px] font-black text-black flex items-center justify-center
            ${slot.badge === "C" ? "bg-amber-400" : "bg-zinc-200"}`}>
            {slot.badge}
          </span>
        )}
      </div>
      <span className={`-mt-1.5 max-w-20 truncate rounded px-1.5 text-[11px] font-extrabold text-white
        ${player ? "bg-black/75" : POSITION_BG[slot.position ?? "MID"]}`}>
        {player?.name ?? slot.position ?? "Any"}
      </span>
      {slot.caption && (
        <span className={`mt-0.5 rounded px-1.5 text-[11px] font-black tabular-nums ${slot.dim ? "bg-white/60 text-zinc-500" : "bg-white/90 text-zinc-900"}`}>
          {slot.caption}
        </span>
      )}
    </button>
  );
}
