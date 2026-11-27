"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { card, inputClass, panel, primaryButton, secondaryButton } from "@/components/AppShell";

export interface LeagueRow {
  rank: number; previousRank: number | null; id: string; name: string; manager: string | null; totalPoints: number; lastPoints: number | null; mine?: boolean;
}

/** Green up, red down or grey level, from the rank a gameweek ago. */
export function RankMove({ rank, previous }: { rank: number; previous: number | null }) {
  if (previous === null) return <span className="inline-block w-4" />;
  const up = rank < previous, down = rank > previous;
  return (
    <span className={`inline-flex shrink-0 w-4 h-4 rounded-full items-center justify-center text-[8px] font-black text-white ${up ? "bg-green-600" : down ? "bg-red-600" : "bg-ink-3"}`}>
      {up ? "▲" : down ? "▼" : "•"}
    </span>
  );
}

/** A league table; team names link to their latest gameweek. */
export function LeagueTable({ rows, lastGameweek, meId }: { rows: LeagueRow[]; lastGameweek: number | null; meId?: string | null }) {
  return (
    <div className={`${card} overflow-hidden`}>
      <table className="w-full text-sm">
        <thead className="text-ink-3 text-xs font-extrabold text-left">
          <tr><th className="pl-4 pr-2 pt-3 pb-2 w-20">Rank</th><th className="pt-3 pb-2">Team</th><th className="text-right pt-3 pb-2 px-2">Last GW</th><th className="text-right pl-2 pr-4 pt-3 pb-2">Total</th></tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const mine = t.mine || t.id === meId;
            return (
              <tr key={t.id} className={`border-t border-lilac-line ${mine ? "bg-violet-50 shadow-[inset_3px_0_0_#7C3AED]" : ""}`}>
                <td className="pl-4 pr-2 py-3">
                  <span className="flex items-center gap-2">
                    <RankMove rank={t.rank} previous={t.previousRank} />
                    <span className={`font-black tabular-nums ${t.rank <= 3 ? "text-amber-700" : "text-ink-2"}`}>{t.rank}</span>
                  </span>
                </td>
                <td className="py-3 min-w-0">
                  {lastGameweek ? (
                    <a href={`/fantasy/gameweek/${lastGameweek}?teamId=${t.id}`} className={`font-extrabold hover:text-violet-700 ${mine ? "text-violet-700" : "text-ink"}`}>{t.name}</a>
                  ) : <span className={`font-extrabold ${mine ? "text-violet-700" : "text-ink"}`}>{t.name}</span>}
                  {t.manager && <span className="block text-ink-3 text-xs">{t.manager}</span>}
                </td>
                <td className="text-right px-2 text-ink-2 font-bold tabular-nums">{t.lastPoints ?? "–"}</td>
                <td className="text-right pl-2 pr-4 text-ink font-black tabular-nums">{t.totalPoints}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Join a league with a code, or start one. */
export function LeagueForms({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(path: string, body: Record<string, string>) {
    setBusy(true);
    setError(null);
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(json.error ?? "Something went wrong."); return; }
    onDone?.();
    router.push(`/fantasy/league/${json.league.id}`);
  }

  const input = `${inputClass} flex-1 h-12`;
  return (
    <div className={`${panel} space-y-3`}>
      <div>
        <h3 className="text-ink text-lg font-black">Play your mates 🏆</h3>
        <p className="text-ink-2 text-sm">Start a league and send the code to your mates, or join theirs. Everyone&apos;s ranked on their season points.</p>
      </div>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="New league name" className={input} />
        <button disabled={busy || name.trim().length < 2} onClick={() => post("/api/fantasy/leagues", { name: name.trim() })} className={`${primaryButton} h-12 px-5`}>Start</button>
      </div>
      <div className="flex gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} maxLength={6}
          placeholder="League code" className={`${input} tracking-widest`} />
        <button disabled={busy || code.length !== 6} onClick={() => post("/api/fantasy/leagues/join", { code })} className={`${secondaryButton} h-12 px-5`}>Join</button>
      </div>
      {error && <p className="text-red-600 text-sm font-semibold">{error}</p>}
    </div>
  );
}
