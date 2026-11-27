"use client";

import Image from "next/image";
import { PLAYER_STATUS, type FantasyPosition, type PlayerStatus } from "@/lib/fantasy";

export interface PitchPlayer { id: string; name: string; position: FantasyPosition; imageUrl: string | null; status?: PlayerStatus }

/** One place on the pitch, as in the app (mobile/src/components/fantasy/FantasyPitch.tsx). */
export interface PitchSlot {
  key: string;
  /** The row this slot sits in (anyone can fill it). */
  position: FantasyPosition | null;
  player: PitchPlayer | null;
  /** Under the name, e.g. points. */
  caption?: string;
  badge?: "C" | "V" | null;
  /** Greyed out, e.g. didn't play. */
  dim?: boolean;
  /** Highlighted, e.g. a new signing. */
  fresh?: boolean;
  /** What an empty slot says (the app's default is "Add"). */
  emptyLabel?: string;
  /** Tapping the slot, as in the app. */
  onPress?: () => void;
  /** Same as onPress (older name). */
  onClick?: () => void;
}

const ROWS: FantasyPosition[] = ["FWD", "MID", "DEF", "GK"];
/** Same colours as the app (mobile/src/lib/theme.ts POSITION_COLOR). */
export const POSITION_BG: Record<FantasyPosition, string> = {
  GK: "bg-amber-500", DEF: "bg-blue-600", MID: "bg-green-600", FWD: "bg-rose-600",
};

/** Mown stripes: eight bands, the even ones the pitch colour and the odd ones a shade lighter, like the app's. */
const STRIPES = "repeating-linear-gradient(to bottom, #24A148 0 12.5%, #2BAE50 12.5% 25%)";

/** The 7 on a bright pitch, attack at the top. */
export function FantasyPitch({ slots }: { slots: PitchSlot[] }) {
  return (
    <div
      className="relative rounded-[22px] bg-pitch overflow-hidden py-[18px] flex flex-col justify-around gap-2 min-h-[450px]"
      style={{ backgroundImage: STRIPES }}
    >
      <div className="absolute inset-2.5 border-2 border-white/45 rounded-md" aria-hidden />
      <div className="absolute left-1/2 top-[-30px] w-20 h-20 -translate-x-1/2 rounded-full border-2 border-white/45" aria-hidden />
      <div className="absolute bottom-2.5 left-[27%] right-[27%] h-[14%] border-2 border-b-0 border-white/45" aria-hidden />
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
  const onPress = slot.onPress ?? slot.onClick;
  const flag = player?.status && player.status !== "a" ? PLAYER_STATUS[player.status] : null;
  const role = slot.badge === "C" ? ", captain" : slot.badge === "V" ? ", vice-captain" : "";
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={!onPress}
      aria-label={player ? `${player.name}${role}${slot.caption ? `, ${slot.caption}` : ""}` : slot.emptyLabel ?? "Empty"}
      className="relative w-[84px] flex flex-col items-center transition-transform duration-100 enabled:active:scale-[0.96] disabled:cursor-default"
    >
      <span
        className={`relative w-[54px] aspect-[785/1085] rounded-[9px] overflow-hidden flex items-center justify-center
          ${slot.fresh ? "border-[3px] border-yellow-400" : "border-2 border-white"}
          ${player ? "bg-white/[0.18]" : "border-dashed bg-white/[0.12]"} ${slot.dim ? "opacity-45" : ""}`}
      >
        {player?.imageUrl ? (
          <Image src={player.imageUrl} alt="" fill sizes="54px" className="object-cover" />
        ) : (
          <span className="text-white text-[30px] leading-none font-light">{player ? player.name[0] : "+"}</span>
        )}
        {flag && (
          <span
            title={flag.label}
            style={{ backgroundColor: flag.color }}
            className="absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full border-[1.5px] border-white text-[11px] font-black text-white flex items-center justify-center"
          >
            !
          </span>
        )}
      </span>
      {slot.badge && (
        <span
          className={`absolute -top-1.5 right-1.5 w-6 h-6 rounded-full border-2 border-white text-xs font-black text-[#111] flex items-center justify-center
            ${slot.badge === "C" ? "bg-yellow-400" : "bg-gray-200"}`}
        >
          {slot.badge}
        </span>
      )}
      <span
        className={`relative -mt-2 max-w-[84px] truncate rounded-[7px] px-1.5 py-0.5 text-xs leading-[15px] font-extrabold shadow-[0_1px_3px_rgba(0,0,0,0.15)]
          ${player ? "bg-white text-ink" : "bg-black/[0.28] text-white"}`}
      >
        {player?.name ?? slot.emptyLabel ?? "Add"}
      </span>
      {slot.caption && (
        <span className="mt-[3px] rounded-[7px] px-1.5 py-px bg-violet-600 text-white text-xs leading-[15px] font-black tabular-nums">
          {slot.caption}
        </span>
      )}
    </button>
  );
}
