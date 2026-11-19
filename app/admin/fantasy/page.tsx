"use client";

// Fantasy admin, built for a phone: gameweeks (add, edit, enter the result and stats, score), players
// (add, edit, fitness, left the squad) and the season. Unlocked once per device with ADMIN_SECRET.
import { useCallback, useEffect, useRef, useState } from "react";
import { GameweeksTab } from "@/components/fantasy-admin/GameweeksTab";
import { GameweekScreen } from "@/components/fantasy-admin/GameweekScreen";
import { PlayersTab } from "@/components/fantasy-admin/PlayersTab";
import { SeasonTab } from "@/components/fantasy-admin/SeasonTab";
import type { Act, AdminData } from "@/components/fantasy-admin/types";
import { btnPrimary, field } from "@/components/fantasy-admin/ui";

type Tab = "gameweeks" | "players" | "season";
const SECRET_KEY = "fantasyAdminSecret";

function readSecret() {
  try { return localStorage.getItem(SECRET_KEY) ?? sessionStorage.getItem("adminSecret") ?? ""; } catch { return ""; }
}
function storeSecret(s: string | null) {
  try { if (s) localStorage.setItem(SECRET_KEY, s); else localStorage.removeItem(SECRET_KEY); } catch { /* private mode */ }
}

export default function FantasyAdminPage() {
  const [secret, setSecret] = useState<string | null>(null); // null = not read yet
  const [data, setData] = useState<AdminData | null>(null);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("gameweeks");
  const [openGw, setOpenGw] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const say = useCallback((ok: boolean, text: string) => {
    clearTimeout(toastTimer.current);
    setToast({ ok, text });
    if (ok) toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const load = useCallback(async (s: string, id?: string | null) => {
    const res = await fetch(`/api/admin/fantasy${id ? `?seasonId=${encodeURIComponent(id)}` : ""}`, { headers: { "x-admin-secret": s } });
    if (res.status === 401) return false;
    if (!res.ok) { say(false, "Couldn't load the admin data. Pull to refresh or try again."); return true; }
    const json = (await res.json()) as AdminData;
    setData(json);
    setSeasonId(json.season?.id ?? null);
    return true;
  }, [say]);

  useEffect(() => {
    const s = readSecret();
    setSecret(s);
    if (s) load(s).then((ok) => { if (!ok) { storeSecret(null); setSecret(""); } });
  }, [load]);

  // The phone's back gesture closes an open gameweek instead of leaving the page.
  useEffect(() => {
    const onPop = () => setOpenGw(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const openGameweek = (id: string) => { history.pushState({ gw: id }, ""); setOpenGw(id); window.scrollTo(0, 0); };
  const closeGameweek = () => { if (history.state?.gw) history.back(); else setOpenGw(null); };

  const act: Act = useCallback(async (body, success) => {
    try {
      const res = await fetch("/api/admin/fantasy", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret ?? "" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Something went wrong (${res.status})`);
      await load(secret ?? "", (json.season?.id as string | undefined) ?? seasonId);
      if (success) say(true, success);
      return json as Record<string, unknown>;
    } catch (err) {
      say(false, (err as Error).message);
      return null;
    }
  }, [secret, seasonId, load, say]);

  if (secret === null) return <main className="min-h-dvh bg-[#0a0a0a]" />;

  if (!secret || !data) {
    return <Unlock onUnlock={async (s) => { const ok = await load(s); if (ok) { storeSecret(s); setSecret(s); } return ok; }} />;
  }

  const season = data.season;
  const gw = openGw ? data.gameweeks.find((g) => g.id === openGw) : null;

  return (
    <main className="min-h-dvh bg-[#0a0a0a] text-white">
      <div className="max-w-lg mx-auto px-4">
        {gw && season ? (
          <GameweekScreen key={`${gw.id}-${gw.finalizedAt}-${gw.stats.length}`} season={season} gw={gw} players={data.players} act={act} onBack={closeGameweek} />
        ) : (
          <div className="pb-32">
            <header className="pt-[max(1rem,env(safe-area-inset-top))] pb-4">
              <div className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Fantasy admin</div>
              <h1 className="text-2xl font-black truncate">{season?.name ?? "No season yet"}</h1>
            </header>
            {!season || tab === "season" ? (
              <SeasonTab key={season?.id ?? "none"} data={data} act={act} onSwitch={(id) => load(secret, id)}
                onLock={() => { storeSecret(null); setSecret(""); setData(null); }} />
            ) : tab === "gameweeks" ? (
              <GameweeksTab season={season} gameweeks={data.gameweeks} act={act} onOpen={openGameweek} />
            ) : (
              <PlayersTab season={season} players={data.players} act={act} />
            )}
          </div>
        )}
      </div>

      {toast && (
        <button onClick={() => setToast(null)}
          className={`fixed left-4 right-4 z-[60] mx-auto max-w-lg rounded-2xl px-4 py-3 text-left text-sm font-semibold shadow-2xl ${gw ? "bottom-28" : "bottom-24"} ${toast.ok ? "bg-emerald-500 text-black" : "bg-red-500 text-white"}`}>
          {toast.ok ? "✓ " : ""}{toast.text}
        </button>
      )}

      {!gw && season && (
        <nav className="fixed inset-x-0 bottom-0 z-40 bg-zinc-950/95 backdrop-blur border-t border-zinc-900 pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-lg mx-auto grid grid-cols-3">
            {([["gameweeks", "📅", "Gameweeks"], ["players", "👥", "Players"], ["season", "⚙️", "Season"]] as const).map(([id, icon, label]) => (
              <button key={id} onClick={() => { setTab(id); window.scrollTo(0, 0); }}
                className={`h-16 flex flex-col items-center justify-center gap-0.5 text-xs font-bold touch-manipulation ${tab === id ? "text-white" : "text-zinc-500"}`}>
                <span className={`text-xl ${tab === id ? "" : "grayscale opacity-60"}`}>{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </nav>
      )}
    </main>
  );
}

function Unlock({ onUnlock }: { onUnlock: (secret: string) => Promise<boolean> }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <main className="min-h-dvh bg-[#0a0a0a] text-white px-6 flex flex-col justify-center">
      <form className="max-w-sm w-full mx-auto space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await onUnlock(value.trim());
        setBusy(false);
        setFailed(!ok);
      }}>
        <div className="text-5xl">⚽️</div>
        <h1 className="text-3xl font-black">Fantasy admin</h1>
        <p className="text-zinc-400">Enter the admin password once and this phone remembers it.</p>
        <input type="password" autoComplete="current-password" className={field} value={value} onChange={(e) => { setValue(e.target.value); setFailed(false); }} placeholder="Admin password" />
        {failed && <p className="text-red-400 text-sm">That password didn&apos;t work.</p>}
        <button type="submit" className={`${btnPrimary} w-full`} disabled={busy || !value.trim()}>{busy ? "Checking…" : "Unlock"}</button>
      </form>
    </main>
  );
}
