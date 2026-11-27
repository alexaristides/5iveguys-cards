"use client";

import Image from "next/image";
import { PLAYER_STATUS, type FantasyPosition, type PlayerStatus } from "@/lib/fantasy";

export interface PitchPlayer { id: string; name: string; position: FantasyPosition; imageUrl: string | null; status?: PlayerStatus }

export interface PitchSlot {
  key: string;
  /** The position this slot plays (anyone can fill it); empty slots show it. */
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
/** Same colours as the app (mobile/src/lib/theme.ts POSITION_COLOR). */
export const POSITION_BG: Record<FantasyPosition, string> = {
  GK: "bg-amber-500", DEF: "bg-blue-600", MID: "bg-green-600", FWD: "bg-rose-600",
};

/** Mown stripes, eight bands like the app's pitch. */
const STRIPES = "repeating-linear-gradient(to bottom, #24A148 0 12.5%, #2BAE50 12.5% 25%)";

/** The 7 on a bright pitch, attack at the top. */
export function FantasyPitch({ slots }: { slots: PitchSlot[] }) {
  return (
    <div className="relative rounded-[22px] bg-pitch overflow-hidden py-5 flex flex-col justify-around gap-3 min-h-[460px] shadow-card" style={{ backgroundImage: STRIPES }}>
      <div className="absolute inset-2.5 border-2 border-white/45 rounded-md" />
      <div className="absolute left-1/2 -top-10 w-20 h-20 -translate-x-1/2 rounded-full border-2 border-white/45" />
      <div className="absolute bottom-2.5 left-[27%] right-[27%] h-[14%] border-2 border-b-0 border-white/45" />
      {ROWS.map((pos) => (
        <div key={pos} className="relative flex justify-evenly items-start">
          {slots.filter((s) => (s.position ?? s.player?.position) === pos).map((s) => <Token key={s.key} slot={s} />)}
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
      className="relative w-[84px] flex flex-col items-center enabled:hover:scale-105 transition-transform"
    >
      <div
        className={`relative w-[54px] aspect-[785/1085] rounded-[9px] overflow-hidden flex items-center justify-center
          ${slot.fresh ? "border-[3px] border-yellow-400" : "border-2 border-white"} ${player ? "bg-white/20" : "border-dashed bg-white/10"} ${slot.dim ? "opacity-45" : ""}`}
      >
        {player?.imageUrl ? (
          <Image src={player.imageUrl} alt={player.name} fill sizes="54px" className="object-cover" />
        ) : (
          <span className="text-white text-3xl font-light">{player ? player.name[0] : "+"}</span>
        )}
        {flag && (
          <span title={flag.label} style={{ backgroundColor: flag.color }}
            className="absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full border-[1.5px] border-white text-[11px] font-black text-white flex items-center justify-center">
            !
          </span>
        )}
      </div>
      {slot.badge && (
        <span className={`absolute -top-1.5 right-1.5 w-6 h-6 rounded-full border-2 border-white text-xs font-black text-[#111] flex items-center justify-center
          ${slot.badge === "C" ? "bg-yellow-400" : "bg-gray-200"}`}>
          {slot.badge}
        </span>
      )}
      <span className={`relative -mt-2 max-w-[84px] truncate rounded-[7px] px-1.5 py-0.5 text-xs font-extrabold shadow-[0_1px_3px_rgba(0,0,0,0.15)]
        ${player ? "bg-white text-ink" : `${POSITION_BG[slot.position ?? "MID"]} text-white`}`}>
        {player?.name ?? slot.position ?? "Any"}
      </span>
      {slot.caption && (
        <span className={`mt-[3px] rounded-[7px] px-1.5 text-xs font-black tabular-nums ${slot.dim ? "bg-white/70 text-ink-3" : "bg-violet-600 text-white"}`}>
          {slot.caption}
        </span>
      )}
    </button>
  );
}
