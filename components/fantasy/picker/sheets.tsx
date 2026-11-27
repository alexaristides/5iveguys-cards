"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The iOS pop-ups the app's team picker uses (mobile/src/app/fantasy/edit.tsx), drawn in the page:
 * ActionSheetIOS → <ActionSheet>, Alert.alert / Alert.prompt → <AlertDialog>. Same look as iOS
 * (system blue, red for destructive, Cancel on its own), so the website reads like the phone.
 */

const BLUE = "text-[#007AFF]";
const RED = "text-[#FF3B30]";

/** Keeps something on screen long enough to slide or fade out after it's closed. */
export function usePresence(visible: boolean, ms = 260) {
  const [mounted, setMounted] = useState(visible);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setShown(true)); });
      return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [visible, ms]);
  return { mounted: mounted || visible, shown };
}

export function useEscape(active: boolean, onEscape: () => void) {
  const latest = useRef(onEscape);
  useEffect(() => { latest.current = onEscape; });
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") latest.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active]);
}

/** The last thing shown, so it stays drawn while it animates away. */
function useLast<T>(value: T | null) {
  const [last, setLast] = useState(value);
  if (value !== null && value !== last) setLast(value);
  return value ?? last;
}

// ── Action sheet (ActionSheetIOS) ─────────────────────────────────────────────

export interface SheetAction { label: string; run: () => void; destructive?: boolean }
export interface SheetSpec { title: string; message?: string; actions: SheetAction[] }

/** Options from the bottom, Cancel on its own underneath; tapping outside cancels. */
export function ActionSheet({ sheet, onClose }: { sheet: SheetSpec | null; onClose: () => void }) {
  const spec = useLast(sheet);
  const visible = !!sheet;
  const { mounted, shown } = usePresence(visible);
  useEscape(visible, onClose);
  if (!mounted || !spec) return null;

  const pick = (action?: SheetAction) => {
    onClose();
    action?.run();
  };
  return (
    <div
      className={`fixed inset-0 z-[60] [color-scheme:light] ${visible ? "" : "pointer-events-none"}`}
      role="dialog"
      aria-modal="true"
      aria-label={spec.title}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cancel"
        onClick={() => pick()}
        className={`absolute inset-0 cursor-default bg-black/30 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 mx-auto max-w-[420px] px-2 pb-[calc(8px+env(safe-area-inset-bottom))] transition-transform duration-300 ease-out ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="overflow-hidden rounded-[14px] bg-white/95 text-center backdrop-blur-xl divide-y divide-[#3C3C43]/20">
          <div className="px-4 py-3.5">
            <p className="text-[13px] font-semibold text-[#8A8A8E]">{spec.title}</p>
            {spec.message && <p className="mt-0.5 whitespace-pre-line text-[13px] text-[#8A8A8E]">{spec.message}</p>}
          </div>
          {spec.actions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pick(a)}
              className={`block h-[57px] w-full px-4 text-[20px] hover:bg-black/[0.04] active:bg-black/[0.08] ${a.destructive ? RED : BLUE}`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => pick()}
          className={`mt-2 block h-[57px] w-full rounded-[14px] bg-white text-[20px] font-semibold hover:bg-[#F2F2F7] active:bg-[#E5E5EA] ${BLUE}`}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Alert (Alert.alert, Alert.prompt) ─────────────────────────────────────────

export interface AlertButton {
  text: string;
  style?: "cancel" | "destructive";
  /** Gets what was typed when the alert is a prompt. */
  onPress?: (value: string) => void;
}
export interface AlertSpec {
  title: string;
  message?: string;
  /** None = a single OK, like Alert.alert. */
  buttons?: AlertButton[];
  /** Makes it a prompt (Alert.prompt) with this text already in the box. */
  prompt?: string;
}

/** A small box in the middle: two buttons side by side (Cancel on the left), more stacked. */
export function AlertDialog({ alert, onClose }: { alert: AlertSpec | null; onClose: () => void }) {
  const spec = useLast(alert);
  const visible = !!alert;
  const { mounted, shown } = usePresence(visible, 200);
  const [value, setValue] = useState("");
  const [valueFor, setValueFor] = useState<AlertSpec | null>(null);
  if (alert && alert !== valueFor) {
    setValueFor(alert);
    setValue(alert.prompt ?? "");
  }

  const buttons: AlertButton[] = spec?.buttons?.length ? spec.buttons : [{ text: "OK" }];
  const cancel = buttons.find((b) => b.style === "cancel");
  const rest = buttons.filter((b) => b !== cancel);
  const side = buttons.length === 2;
  const ordered = side ? [...(cancel ? [cancel] : []), ...rest] : [...rest, ...(cancel ? [cancel] : [])];

  const press = (b: AlertButton) => {
    onClose();
    b.onPress?.(value);
  };
  useEscape(visible, () => {
    const b = cancel ?? (buttons.length === 1 ? buttons[0] : null);
    if (b) press(b);
  });
  if (!mounted || !spec) return null;

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center px-4 [color-scheme:light] ${visible ? "" : "pointer-events-none"}`}
      role="alertdialog"
      aria-modal="true"
      aria-label={spec.title}
    >
      <div className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`} />
      <div
        className={`relative w-[270px] overflow-hidden rounded-[14px] bg-white/95 text-center text-black backdrop-blur-xl transition duration-200 ${
          shown ? "scale-100 opacity-100" : "scale-110 opacity-0"
        }`}
      >
        <div className="px-4 pt-[19px] pb-[19px]">
          <p className="text-[17px] font-semibold leading-[22px]">{spec.title}</p>
          {spec.message && <p className="mt-0.5 whitespace-pre-line text-[13px] leading-[18px]">{spec.message}</p>}
          {spec.prompt !== undefined && (
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && rest.length) press(rest[rest.length - 1]);
              }}
              aria-label={spec.title}
              className="mt-3.5 h-[30px] w-full rounded-[7px] border-[0.5px] border-[#C7C7CC] bg-white px-1.5 text-left text-base text-black outline-none"
            />
          )}
        </div>
        <div className={`border-t border-[#3C3C43]/20 ${side ? "grid grid-cols-2 divide-x" : "divide-y"} divide-[#3C3C43]/20`}>
          {ordered.map((b, i) => (
            <button
              key={i}
              type="button"
              onClick={() => press(b)}
              className={`block h-11 w-full px-2 text-[17px] hover:bg-black/[0.04] active:bg-black/[0.08] ${
                b.style === "destructive" ? RED : BLUE
              } ${b.style === "cancel" ? "font-semibold" : ""}`}
            >
              {b.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
