"use client";

import Image from "next/image";
import { PLAYER_STATUS, type FantasyPosition, type PlayerStatus } from "@/lib/fantasy";

export interface PitchPlayer { id: string; name: string; position: FantasyPosition; imageUrl: string | null; status?: PlayerStatus }

export interface PitchSlot {
  key: string;
  /** Empty slots show their position. */
  position: FantasyPosition | null;
  player: PitchPlayer | null;
  caption?: string;
  badge?: "C" | "V" | null;
  dim?: boolean;
  /** Highlighted, e.g. a new signing. */
  fresh?: boolean;
  onClick?: () => void;
}

const ROWS: FantasyPosition[] = ["FWD", "MID", "DEF", "GK"];
export const POSITION_BG: Record<FantasyPosition, string> = {
  GK: "bg-yellow-600", DEF: "bg-blue-700", MID: "bg-green-700", FWD: "bg-red-700",
};

/** The 7 on a pitch, attack at the top. */
export function FantasyPitch({ slots }: { slots: PitchSlot[] }) {
  return (
    <div className="relative rounded-2xl bg-[#1e6b2e] overflow-hidden py-5 flex flex-col justify-around gap-4 min-h-[460px]">
      <div className="absolute inset-2.5 border border-white/20 rounded" />
      <div className="absolute left-1/2 -top-9 w-20 h-20 -translate-x-1/2 rounded-full border border-white/20" />
      <div className="absolute bottom-2.5 left-[27%] right-[27%] h-[14%] border border-b-0 border-white/20" />
      {ROWS.map((pos) => (
        <div key={pos} className="relative flex justify-evenly items-start">
          {slots.filter((s) => (s.player?.position ?? s.position) === pos).map((s) => <Token key={s.key} slot={s} />)}
        </div>
      ))}
    </div>
  );
}

function Token({ slot }: { slot: PitchSlot }) {
  const { player } = slot;
  const flag = player?.status && player.status !== "a" ? PLAYER_STATUS[player.status] : null;
  return (
    <button
      type="button"
      onClick={slot.onClick}
      disabled={!slot.onClick}
      className="w-20 flex flex-col items-center enabled:hover:scale-105 transition-transform"
    >
      <div
        className={`relative w-12 aspect-[785/1085] rounded-md overflow-hidden border-[1.5px] bg-black/30 flex items-center justify-center
          ${slot.fresh ? "border-amber-400 border-2" : "border-white/70"} ${!player ? "border-dashed" : ""} ${slot.dim ? "opacity-40" : ""}`}
      >
        {player?.imageUrl ? (
          <Image src={player.imageUrl} alt={player.name} fill sizes="48px" className="object-cover" />
        ) : (
          <span className="text-white text-2xl font-light">{player ? player.name[0] : "+"}</span>
        )}
        {slot.badge && (
          <span className={`absolute top-0.5 right-0.5 w-4 h-4 rounded-full border border-black text-[9px] font-black text-black flex items-center justify-center
            ${slot.badge === "C" ? "bg-amber-400" : "bg-zinc-200"}`}>
            {slot.badge}
          </span>
        )}
        {flag && (
          <span title={flag.label} style={{ backgroundColor: flag.color }}
            className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full border border-black text-[9px] font-black text-black flex items-center justify-center">
            !
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
