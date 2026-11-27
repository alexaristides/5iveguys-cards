"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import { ErrorText, Spinner } from "@/components/AppShell";
import { POSITION_BG } from "@/components/fantasy/FantasyPitch";
import type { FantasyOverview, FantasyPlayerRow } from "@/components/fantasy/types";
import { FANTASY_RULES, formatPrice, PLAYER_STATUS, POSITION_LABEL } from "@/lib/fantasy";
import type { playerDetail } from "@/lib/fantasy-db";

type Detail = Awaited<ReturnType<typeof playerDetail>>;

/** The app's sheet heights (fantasy/player/[id]: sheetAllowedDetents [0.7, 0.95]). */
const DETENTS = [0.7, 0.95];
const DURATION = 300;

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status})`);
  return data as T;
}

const WIDE = "(min-width: 640px)";

/** Wider than a phone: the sheet is a dialog in the middle. (The sheet only opens on a tap, so never on the server.) */
function useWide() {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return wide;
}

/**
 * A fantasy player's card in a sheet over the page, like the app's fantasy/player/[id] form sheet
 * (mobile/src/app/fantasy/player/[id].tsx): availability, price, form, ownership and points by gameweek.
 * Phones: slides up from the bottom (70% high, drag the grabber or scroll to 95%, drag down to close).
 * Wider screens: a dialog in the middle. Tapping outside or Escape closes it.
 */
export function PlayerSheet({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const wide = useWide();
  const [open, setOpen] = useState(false);
  const [detent, setDetent] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const dragStart = useRef<number | null>(null);
  const closing = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [detail, setDetail] = useState<Detail | null>(null);
  const [row, setRow] = useState<FantasyPlayerRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setDetail(null);
    setRow(null);
    setError(null);
    getJSON<Detail>(`/api/fantasy/players/${encodeURIComponent(playerId)}`)
      .then((d) => live && setDetail(d), (e: Error) => live && setError(e.message));
    getJSON<FantasyOverview>("/api/fantasy")
      .then((o) => live && setRow(o.players.find((p) => p.id === playerId) ?? null), () => {});
    return () => { live = false; };
  }, [playerId]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setOpen(false);
    setDrag(null);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => onCloseRef.current(), reduce ? 0 : DURATION);
  }, []);

  // Slide in, lock the page behind, Escape closes, focus goes back where it was.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.({ preventScroll: true });
    };
  }, [close]);

  // Dragging the grabber: up to the tall height, down to the short one or away.
  const onPointerDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = e.clientY;
    setDrag(0);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (dragStart.current !== null) setDrag(e.clientY - dragStart.current);
  };
  const onPointerUp = () => {
    const dy = drag ?? 0;
    dragStart.current = null;
    setDrag(null);
    if (dy < -40) setDetent(1);
    else if (dy > 80 && detent === 0) close();
    else if (dy > 160) close();
    else if (dy > 40) setDetent(0);
  };

  const name = detail?.player.name ?? row?.name ?? "Player";
  const height = `${DETENTS[detent] * 100}dvh`;
  const dragging = drag !== null;
  const panelStyle = wide
    ? { opacity: open ? 1 : 0, transform: `translate(-50%, -50%) scale(${open ? 1 : 0.96})` }
    : {
        height: drag !== null && drag < 0 ? `min(95dvh, calc(${height} + ${-drag}px))` : height,
        transform: `translateY(${open ? `${Math.max(0, drag ?? 0)}px` : "100%"})`,
      };

  return (
    <div className="fixed inset-0 z-50 [color-scheme:light]">
      <div
        aria-hidden
        onClick={close}
        className="absolute inset-0 bg-black/40 transition-opacity duration-300 motion-reduce:transition-none"
        style={{ opacity: open ? 1 : 0 }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={name}
        tabIndex={-1}
        style={panelStyle}
        className={`absolute flex flex-col bg-lilac text-ink outline-none shadow-[0_-8px_30px_rgba(22,11,46,0.18)] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none
          ${dragging ? "transition-none" : "transition-[transform,height,opacity] duration-300"}
          ${wide ? "left-1/2 top-1/2 w-[min(480px,calc(100vw-32px))] max-h-[85dvh] rounded-[24px]" : "inset-x-0 bottom-0 rounded-t-[24px]"}`}
      >
        {!wide && (
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="absolute inset-x-0 top-0 z-10 h-7 flex justify-center pt-[5px] touch-none cursor-grab active:cursor-grabbing"
            aria-hidden
          >
            <span className="w-9 h-[5px] rounded-full bg-[#857F9B]/40" />
          </div>
        )}
        <button type="button" onClick={close} className="sr-only focus:not-sr-only focus:absolute focus:right-4 focus:top-3 focus:z-20 focus:text-violet-600 focus:font-bold">
          Close
        </button>
        <div
          className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${wide ? "rounded-[24px]" : "rounded-t-[24px]"}`}
          onScroll={(e) => { if (!wide && detent === 0 && e.currentTarget.scrollTop > 0) setDetent(1); }}
        >
          {detail ? <Body detail={detail} row={row} /> : error ? <ErrorText>{error}</ErrorText> : <Spinner />}
        </div>
      </div>
    </div>
  );
}

function Body({ detail, row }: { detail: Detail; row: FantasyPlayerRow | null }) {
  const { player, gameweeks } = detail;
  const status = PLAYER_STATUS[player.status];
  const seasonChange = gameweeks.reduce((s, g) => s + g.priceChange, 0);

  return (
    <div className="px-5 pt-7 pb-12">
      <div className="flex gap-4 items-center">
        <div className="relative w-24 shrink-0 aspect-[785/1085] rounded-[10px] overflow-hidden bg-lilac-2">
          {player.imageUrl && <Image src={player.imageUrl} alt="" fill sizes="96px" className="object-cover" />}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <h2 className="text-ink text-[26px] leading-tight font-black">{player.name}</h2>
          <span className={`self-start rounded-md px-2 py-0.5 ${POSITION_BG[player.position]} text-white text-xs font-black`}>
            {POSITION_LABEL[player.position]}
          </span>
          {FANTASY_RULES.prices && <span className="text-ink text-[22px] leading-tight font-black tabular-nums">{formatPrice(player.price)}</span>}
          {FANTASY_RULES.prices && seasonChange ? (
            <span className={`text-xs font-extrabold ${seasonChange > 0 ? "text-green-500" : "text-red-600"}`}>
              {seasonChange > 0 ? "▲" : "▼"} {formatPrice(Math.abs(seasonChange))} this season
            </span>
          ) : null}
        </div>
      </div>

      {(player.status !== "a" || !player.isActive) && (
        <div className="mt-4 border rounded-xl p-3 flex flex-col gap-0.5" style={{ borderColor: player.isActive ? status.color : "#857F9B" }}>
          <span className="text-sm font-black" style={{ color: player.isActive ? status.color : "#4B4462" }}>
            {player.isActive ? status.label : "Left the squad"}
          </span>
          {player.news ? <span className="text-ink-2 text-sm">{player.news}</span> : null}
        </div>
      )}

      {row && (
        <div className="grid grid-cols-4 gap-2 mt-4">
          <Stat label="Points" value={row.totalPoints} />
          <Stat label="Form" value={row.form} />
          <Stat label="In teams" value={`${row.selectedBy}%`} />
          <Stat label="Played" value={row.appearances} />
          <Stat label="Goals" value={row.goals} />
          <Stat label="Assists" value={row.assists} />
          <Stat label="Clean sheets" value={row.cleanSheets} />
          <Stat label="Bonus" value={row.bonus} />
        </div>
      )}

      <h3 className="text-ink text-[18px] font-extrabold mt-[22px] mb-2">Gameweeks</h3>
      {gameweeks.length === 0 ? <p className="text-ink-3 text-sm">No matches played yet.</p> : (
        <div className="rounded-2xl bg-white shadow-card px-3 py-1">
          <div className="flex items-center py-2 border-b border-lilac-line text-ink-3 text-[11px] font-extrabold">
            <span className="w-10">GW</span>
            <span className="flex-1">Match</span>
            <span className="w-[34px] text-right">G</span>
            <span className="w-[34px] text-right">A</span>
            <span className="w-[34px] text-right">Bon</span>
            <span className="w-[34px] text-right">Pts</span>
          </div>
          {[...gameweeks].reverse().map((g) => (
            <div key={g.number} className="flex items-center py-2 border-b border-lilac-line text-ink-2 text-sm tabular-nums">
              <span className="w-10">{g.number}</span>
              <span className="flex-1 min-w-0 truncate">
                {[g.result, g.name].filter(Boolean).join(" ") || "–"}{g.played ? "" : " · didn't play"}
              </span>
              <span className="w-[34px] text-right">{g.goals}</span>
              <span className="w-[34px] text-right">{g.assists}</span>
              <span className="w-[34px] text-right">{g.bonus}</span>
              <span className="w-[34px] text-right text-violet-600 font-black">{g.points}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[14px] bg-white shadow-card py-2.5 flex flex-col items-center gap-0.5">
      <span className="text-ink text-[18px] leading-tight font-black tabular-nums">{value}</span>
      <span className="text-ink-3 text-[10px] font-bold text-center leading-tight">{label}</span>
    </div>
  );
}
