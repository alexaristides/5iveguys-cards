"use client";

// Phone-first building blocks for the Fantasy admin: big touch targets (44px+), 16px inputs so iOS
// doesn't zoom on focus, and bottom sheets that sit above the home indicator.
import { useEffect, type ReactNode } from "react";
import type { FantasyPosition } from "@/lib/fantasy";

export const field =
  "w-full h-12 px-4 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-base outline-none focus:border-purple-500 placeholder:text-zinc-600";
export const btnPrimary =
  "h-12 px-5 rounded-xl bg-purple-600 active:bg-purple-700 disabled:opacity-40 text-white text-base font-bold touch-manipulation";
export const btnSecondary =
  "h-12 px-5 rounded-xl bg-zinc-800 active:bg-zinc-700 disabled:opacity-40 text-white text-base font-semibold touch-manipulation";
export const btnDanger =
  "h-12 px-5 rounded-xl bg-red-950/60 active:bg-red-900/60 disabled:opacity-40 text-red-300 text-base font-semibold touch-manipulation";

export const POSITION_STYLE: Record<FantasyPosition, string> = {
  GK: "bg-amber-500 text-black",
  DEF: "bg-sky-500 text-black",
  MID: "bg-emerald-500 text-black",
  FWD: "bg-rose-500 text-white",
};

/** A short buzz on Android (iOS Safari ignores it). */
export const tap = () => {
  try { navigator.vibrate?.(8); } catch { /* not supported */ }
};

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[92dvh] flex flex-col rounded-t-3xl bg-zinc-950 border-t border-zinc-800 animate-[sheetUp_.18s_ease-out]">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-white text-xl font-black">{title}</h2>
          <button onClick={onClose} className="w-11 h-11 -mr-2 rounded-full text-zinc-400 active:bg-zinc-800 text-2xl leading-none" aria-label="Close">×</button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-4 space-y-5">{children}</div>
        {footer && <div className="px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-zinc-900 flex gap-3">{footer}</div>}
      </div>
      <style>{"@keyframes sheetUp{from{transform:translateY(24px);opacity:.6}to{transform:none;opacity:1}}"}</style>
    </div>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-2">
      <div className="text-zinc-300 text-sm font-semibold">{children}</div>
      {hint && <div className="text-zinc-500 text-xs mt-0.5">{hint}</div>}
    </div>
  );
}

/** − value + with big buttons. */
export function Stepper({ label, value, onChange, min = 0, max = 99, size = "md" }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; size?: "md" | "lg";
}) {
  const h = size === "lg" ? "h-14 w-14 text-3xl" : "h-11 w-11 text-2xl";
  const set = (v: number) => { tap(); onChange(Math.min(max, Math.max(min, v))); };
  return (
    <div className="flex flex-col items-center gap-1">
      {label && <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">{label}</span>}
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label={`${label || "Score"} minus one`} disabled={value <= min} onClick={() => set(value - 1)}
          className={`${h} rounded-full bg-zinc-800 active:bg-zinc-700 disabled:opacity-30 text-white font-bold leading-none touch-manipulation`}>−</button>
        <span className={`${size === "lg" ? "w-12 text-4xl" : "w-8 text-2xl"} text-center text-white font-black tabular-nums`}>{value}</span>
        <button type="button" aria-label={`${label || "Score"} plus one`} disabled={value >= max} onClick={() => set(value + 1)}
          className={`${h} rounded-full bg-purple-600 active:bg-purple-700 disabled:opacity-30 text-white font-bold leading-none touch-manipulation`}>+</button>
      </div>
    </div>
  );
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => { tap(); onChange(!checked); }}
      className="w-full min-h-12 flex items-center justify-between gap-4 text-left touch-manipulation">
      <span>
        <span className="block text-white text-base font-semibold">{label}</span>
        {hint && <span className="block text-zinc-500 text-xs mt-0.5">{hint}</span>}
      </span>
      <span className={`shrink-0 w-14 h-8 rounded-full p-1 transition-colors ${checked ? "bg-purple-600" : "bg-zinc-700"}`}>
        <span className={`block w-6 h-6 rounded-full bg-white transition-transform ${checked ? "translate-x-6" : ""}`} />
      </span>
    </button>
  );
}

/** A row of equal buttons where one is chosen. */
export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; className?: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => { tap(); onChange(o.value); }}
          className={`h-12 rounded-xl text-base font-bold touch-manipulation border ${o.value === value
            ? `${o.className ?? "bg-purple-600 text-white"} border-transparent` : "bg-zinc-900 text-zinc-400 border-zinc-800"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ src, name, size = 44 }: { src: string | null; name: string; size?: number }) {
  // Card art is a portrait card with the face about a third of the way down: zoom in on it.
  return src ? (
    <span role="img" aria-label={name} className="rounded-full bg-zinc-800 shrink-0 bg-no-repeat"
      style={{ width: size, height: size, backgroundImage: `url("${src}")`, backgroundSize: "150%", backgroundPosition: "50% 17%" }} />
  ) : (
    <span className="rounded-full bg-zinc-800 text-zinc-300 font-black grid place-items-center shrink-0" style={{ width: size, height: size }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function PositionTag({ position }: { position: FantasyPosition }) {
  return <span className={`px-1.5 py-0.5 rounded text-[11px] font-black ${POSITION_STYLE[position]}`}>{position}</span>;
}

// ── Kick-off and deadline ─────────────────────────────────────────────────────

/** Teams lock this long before kick-off (FPL uses 90 minutes). */
export const LOCK_MINUTES = 90;
export const kickoffOf = (deadline: string | Date) => new Date(new Date(deadline).getTime() + LOCK_MINUTES * 60_000);
export const deadlineOf = (kickoff: Date) => new Date(kickoff.getTime() - LOCK_MINUTES * 60_000);

const pad = (n: number) => String(n).padStart(2, "0");
/** Local YYYY-MM-DD and HH:mm for date/time inputs. */
export const dateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const timeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fromInputs = (date: string, time: string) => (date && time ? new Date(`${date}T${time}`) : null);

export const formatDay = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
export const formatTime = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** "3d 4h", "5h 20m", "12m". */
export function untilText(ms: number) {
  const m = Math.max(0, Math.round(ms / 60_000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), min = m % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${min}m` : `${min}m`;
}
