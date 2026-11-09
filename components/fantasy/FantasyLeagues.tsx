"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { panel } from "@/components/fantasy/FantasyShell";

export interface LeagueRow {
  rank: number; previousRank: number | null; id: string; name: string; manager: string | null; totalPoints: number; lastPoints: number | null; mine?: boolean;
}

export function RankMove({ rank, previous }: { rank: number; previous: number | null }) {
  if (previous === null) return <span className="inline-block w-4" />;
  const up = rank < previous, down = rank > previous;
  return (
    <span className={`inline-flex w-4 h-4 rounded-full items-center justify-center text-[8px] text-white ${up ? "bg-green-600" : down ? "bg-red-600" : "bg-zinc-700"}`}>
      {up ? "▲" : down ? "▼" : "•"}
    </span>
  );
}

/** A league table; team names link to their latest gameweek. */
export function LeagueTable({ rows, lastGameweek, meId }: { rows: LeagueRow[]; lastGameweek: number | null; meId?: string | null }) {
  return (
    <div className="rounded-2xl border border-zinc-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-zinc-500 text-left">
          <tr><th className="px-3 py-2 w-16">Rank</th><th className="py-2">Team</th><th className="text-right py-2">GW</th><th className="text-right px-3 py-2">Total</th></tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className={`border-t border-zinc-800 ${t.mine || t.id === meId ? "bg-purple-900/30" : ""}`}>
              <td className="px-3 py-2">
                <span className="flex items-center gap-2">
                  <RankMove rank={t.rank} previous={t.previousRank} />
                  <span className={`font-black ${t.rank <= 3 ? "text-amber-400" : "text-zinc-400"}`}>{t.rank}</span>
                </span>
              </td>
              <td className="py-2">
                {lastGameweek ? (
                  <a href={`/fantasy/gameweek/${lastGameweek}?teamId=${t.id}`} className="text-white font-bold hover:underline">{t.name}</a>
                ) : <span className="text-white font-bold">{t.name}</span>}
                {t.manager && <span className="text-zinc-500 ml-2">{t.manager}</span>}
              </td>
              <td className="text-right text-zinc-400 tabular-nums">{t.lastPoints ?? "–"}</td>
              <td className="text-right px-3 text-white font-black tabular-nums">{t.totalPoints}</td>
            </tr>
          ))}
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

  const input = "flex-1 min-w-0 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white outline-none focus:border-purple-500";
  const button = "px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-semibold";
  return (
    <div className={`${panel} space-y-3`}>
      <div className="flex gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} maxLength={6}
          placeholder="League code" className={`${input} tracking-widest font-bold`} />
        <button disabled={busy || code.length !== 6} onClick={() => post("/api/fantasy/leagues/join", { code })} className={button}>Join</button>
      </div>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="New league name" className={input} />
        <button disabled={busy || name.trim().length < 2} onClick={() => post("/api/fantasy/leagues", { name: name.trim() })} className={button}>Start</button>
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}
