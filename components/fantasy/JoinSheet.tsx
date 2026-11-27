"use client";

import { useState, type KeyboardEvent } from "react";
import { primaryButton, secondaryButton } from "@/components/AppShell";
import { api, useDismiss, useShareInvite } from "@/components/fantasy/FantasyLeagues";

export type JoinMode = "join" | "create";
type League = { id: string; name: string; code: string };

const cleanCode = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

/**
 * Join a private league with a code, or start one and share its code: the app's fantasy/join form
 * sheet (mobile/src/app/fantasy/join.tsx), as a sheet over the page on phones and a dialog on wider
 * screens. Clicking outside it or pressing Escape closes it.
 */
export function JoinSheet({ mode: startMode, code: startCode = "", hasTeam, onClose, onChanged, onNavigate }: {
  mode: JoinMode;
  /** From an invite link. */
  code?: string;
  hasTeam: boolean;
  onClose: () => void;
  /** A league was joined or started (refresh the list behind). */
  onChanged?: () => void;
  /** Leave the sheet for another screen (a league's table, the team picker). */
  onNavigate: (href: string) => void;
}) {
  const [mode, setMode] = useState<JoinMode>(startMode);
  const [code, setCode] = useState(cleanCode(startCode));
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<League | null>(null);
  const { share, copied } = useShareInvite();
  useDismiss(onClose);

  async function run(path: string, body: Record<string, string>) {
    setBusy(true);
    try {
      const { league } = await api<{ league: League }>(path, { body });
      onChanged?.();
      return league;
    } catch (err) {
      window.alert(`${mode === "join" ? "Couldn't join" : "Couldn't start the league"}\n\n${(err as Error).message}`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    const league = await run("/api/fantasy/leagues/join", { code: code.trim() });
    if (league) onNavigate(`/fantasy/league/${league.id}`);
  }

  async function create() {
    const league = await run("/api/fantasy/leagues", { name: name.trim() });
    if (league) setCreated(league);
  }

  const onEnter = (submit: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  let body;
  if (created) {
    body = (
      <>
        <h2 className={titleCls}>League started 🎉</h2>
        <p className={pCls}>Send your mates the code. They tap Leagues → Join with code in the 5iveG app, or open the link.</p>
        <div className="rounded-[18px] bg-violet-100 p-5 flex flex-col items-center gap-1">
          <div className="text-ink-2 text-[14px] font-bold">{created.name}</div>
          <div className="text-violet-600 text-[38px] leading-tight font-black tracking-[6px]">{created.code}</div>
        </div>
        <Button title={copied ? "Copied" : "Invite friends"} onClick={() => share(created)} />
        <Button title="See the table" variant="secondary" className="mt-2.5" onClick={() => onNavigate(`/fantasy/league/${created.id}`)} />
      </>
    );
  } else {
    body = (
      <>
        <h2 className={titleCls}>Leagues</h2>
        <div className="flex rounded-[14px] bg-lilac-2 p-1" role="tablist">
          {(["join", "create"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`flex-1 h-10 rounded-[11px] text-[15px] font-extrabold transition-colors ${mode === m ? "bg-violet-600 text-white" : "text-ink-2"}`}
            >
              {m === "join" ? "Join a league" : "Start a league"}
            </button>
          ))}
        </div>

        {!hasTeam ? (
          <>
            <p className={pCls}>Pick your team first, then you can start or join leagues.</p>
            <Button title="Pick your team" onClick={() => onNavigate("/fantasy/team")} />
          </>
        ) : mode === "join" ? (
          <>
            <p className={pCls}>Enter the 6-character code your friend shared.</p>
            <input
              key="code"
              className={`${inputCls} text-center text-[24px] font-black tracking-[6px]`}
              value={code}
              onChange={(e) => setCode(cleanCode(e.target.value))}
              onKeyDown={onEnter(() => code.length === 6 && !busy && join())}
              placeholder="ABC123"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="go"
              maxLength={6}
              aria-label="League code"
              autoFocus
            />
            <Button title="Join league" onClick={join} loading={busy} disabled={code.length !== 6} />
          </>
        ) : (
          <>
            <p className={pCls}>Everyone in a league is ranked on their season points. You&apos;ll get a code to share.</p>
            <input
              key="name"
              className={`${inputCls} text-[17px] font-bold`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={onEnter(() => name.trim().length >= 2 && !busy && create())}
              placeholder="League name"
              maxLength={30}
              autoCapitalize="words"
              autoComplete="off"
              enterKeyHint="go"
              aria-label="League name"
              autoFocus
            />
            <Button title="Start league" onClick={create} loading={busy} disabled={name.trim().length < 2} />
          </>
        )}
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50 [color-scheme:light]" role="dialog" aria-modal="true" aria-label={created ? "League started" : "Leagues"}>
      <button type="button" tabIndex={-1} className="absolute inset-0 bg-[#160B2E]/30 cursor-default" aria-label="Close" onClick={onClose} />
      <div
        className="absolute inset-x-0 bottom-0 h-[75dvh] overflow-y-auto overscroll-contain rounded-t-[24px] bg-lilac shadow-2xl
          md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:h-auto md:max-h-[85dvh] md:w-[440px] md:rounded-[24px]"
      >
        <div className="md:hidden absolute left-1/2 top-[5px] -translate-x-1/2 h-[5px] w-9 rounded-full bg-ink-3/40" aria-hidden />
        <div className="flex flex-col gap-3 px-5 pt-7 pb-[calc(48px+env(safe-area-inset-bottom))] md:pb-8">{body}</div>
      </div>
    </div>
  );
}

const titleCls = "text-ink text-[26px] leading-tight font-black";
const pCls = "text-ink-2 text-[15px] leading-[21px]";
const inputCls =
  "h-14 w-full min-w-0 rounded-2xl bg-white border-[1.5px] border-lilac-line px-[14px] text-ink placeholder:text-ink-3 outline-none focus:border-violet-500";

/** The app's Button, full width, with its spinner while `loading`. */
function Button({ title, onClick, variant = "primary", disabled, loading, className = "" }: {
  title: string; onClick: () => void; variant?: "primary" | "secondary"; disabled?: boolean; loading?: boolean; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => !loading && onClick()}
      disabled={disabled}
      aria-busy={loading || undefined}
      className={`${variant === "primary" ? primaryButton : secondaryButton} w-full flex items-center justify-center ${className}`}
    >
      {loading ? <span className="w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-label="Loading" /> : title}
    </button>
  );
}
