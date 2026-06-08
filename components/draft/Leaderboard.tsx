"use client";

import { useEffect, useState } from "react";

interface Entry {
  id: string;
  alias: string;
  formation: string;
  teamRating: number;
  placement: string;
  won: boolean;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  difficulty: string;
  createdAt: string;
}

type Sort = "result" | "wins" | "goals" | "rating";

const SORTS: { id: Sort; label: string }[] = [
  { id: "result", label: "Best result" },
  { id: "wins", label: "Most wins" },
  { id: "goals", label: "Most goals" },
  { id: "rating", label: "Best XI" },
];

export default function Leaderboard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [sort, setSort] = useState<Sort>("result");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/draft/leaderboard?sort=${sort}`)
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((data) => {
        if (active) {
          setEntries(data.entries ?? []);
          setLoading(false);
        }
      })
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [sort, refreshKey]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-extrabold text-white">🌍 Global Leaderboard</h3>
        <div className="flex flex-wrap gap-1">
          {SORTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                sort === s.id
                  ? "bg-[#FFC233] text-zinc-950"
                  : "bg-white/5 text-zinc-400 hover:bg-white/10"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FFC233] border-t-transparent" />
        </div>
      ) : entries.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">
          No teams yet — be the first to draft and simulate!
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-1.5">#</th>
                <th className="px-2 py-1.5">Manager</th>
                <th className="px-2 py-1.5">Result</th>
                <th className="px-2 py-1.5 text-center">W-D-L</th>
                <th className="px-2 py-1.5 text-center">GF</th>
                <th className="px-2 py-1.5 text-center">OVR</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr
                  key={e.id}
                  className={`border-t border-white/5 ${e.won ? "bg-[#FFC233]/5" : ""}`}
                >
                  <td className="px-2 py-2 font-bold text-zinc-500">{i + 1}</td>
                  <td className="px-2 py-2">
                    <div className="font-bold text-white">{e.alias}</div>
                    <div className="text-[10px] text-zinc-500">
                      {e.formation} · {e.difficulty}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <span className={`font-semibold ${e.won ? "text-[#FFC233]" : "text-zinc-300"}`}>
                      {e.won ? "🏆 " : ""}
                      {e.placement}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums text-zinc-300">
                    {e.wins}-{e.draws}-{e.losses}
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums text-zinc-300">{e.goalsFor}</td>
                  <td className="px-2 py-2 text-center font-bold tabular-nums text-white">{e.teamRating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
