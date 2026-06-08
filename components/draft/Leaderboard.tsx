"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FORMATIONS, getFormation } from "@/lib/draft/formations";
import type { PlacedPlayer } from "@/lib/draft/types";
import Pitch from "./Pitch";
import { ratingTier } from "./util";

interface SquadSlot {
  name: string;
  nation: string;
  flag: string;
  rating: number;
  slot: string;
}

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
  ratingsMode: string;
  createdAt: string;
  squad: SquadSlot[] | null;
}

type Sort = "result" | "wins" | "goals" | "rating";

const SORTS: { id: Sort; label: string }[] = [
  { id: "result", label: "Best result" },
  { id: "wins", label: "Most wins" },
  { id: "goals", label: "Most goals" },
  { id: "rating", label: "Best XI" },
];

const PLACEMENT_EMOJI: Record<string, string> = {
  Champions: "🏆",
  "Runners-up": "🥈",
  "Semi-finals": "🥉",
  "Quarter-finals": "⚔️",
  "Round of 16": "🎯",
  "Group stage": "😞",
};

/** Reconstruct PlacedPlayer[] from stored squad + formation name. */
function buildPlaced(squad: SquadSlot[], formationName: string): PlacedPlayer[] {
  // Match formation by name (e.g. "4-3-3")
  const formation = FORMATIONS.find((f) => f.name === formationName) ?? getFormation("433");
  const placed: PlacedPlayer[] = [];
  // Track which slot indices have been used so duplicate positions (e.g. two CBs) fill sequentially
  const usedSlots = new Set<number>();

  for (const p of squad) {
    // Find the first unfilled slot whose label matches this player's saved slot
    const slotIndex = formation.slots.findIndex(
      (s, i) => s.label === p.slot && !usedSlots.has(i),
    );
    if (slotIndex === -1) continue;
    usedSlots.add(slotIndex);
    placed.push({
      slotIndex,
      player: {
        id: p.name,
        uid: `${p.nation}:${p.name}`,
        name: p.name,
        pos: p.slot as PlacedPlayer["player"]["pos"],
        rating: p.rating,
        nationId: p.nation.toLowerCase().replace(/\s/g, "-"),
        nationName: p.nation,
        flag: p.flag,
        group: "",
      },
    });
  }
  return placed;
}

export default function Leaderboard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [sort, setSort] = useState<Sort>("result");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Entry | null>(null);

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
    return () => { active = false; };
  }, [sort, refreshKey]);

  return (
    <>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        {/* Header + sort tabs */}
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
          <div className="space-y-1.5">
            {entries.map((e, i) => (
              <EntryRow
                key={e.id}
                entry={e}
                rank={i + 1}
                onClick={() => setSelected(e)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail modal */}
      <AnimatePresence>
        {selected && (
          <EntryModal entry={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

function EntryRow({ entry: e, rank, onClick }: { entry: Entry; rank: number; onClick: () => void }) {
  const tier = ratingTier(e.teamRating);
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-[#FFC233]/50 hover:bg-[#FFC233]/5 ${
        e.won ? "border-[#FFC233]/25 bg-[#FFC233]/5" : "border-white/8 bg-white/[0.03]"
      }`}
    >
      {/* Rank */}
      <span className="w-6 shrink-0 text-center text-xs font-bold text-zinc-500">{rank}</span>

      {/* Name + meta */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-white">{e.alias}</span>
          {e.won && <span className="text-xs">🏆</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-zinc-500">
          <span>{e.formation}</span>
          <span>·</span>
          <span className="capitalize">{e.difficulty}</span>
        </div>
      </div>

      {/* Placement */}
      <span className={`shrink-0 text-xs font-semibold ${e.won ? "text-[#FFC233]" : "text-zinc-300"}`}>
        {PLACEMENT_EMOJI[e.placement] ?? ""} {e.placement}
      </span>

      {/* W-D-L */}
      <span className="hidden shrink-0 tabular-nums text-xs text-zinc-400 sm:block">
        {e.wins}-{e.draws}-{e.losses}
      </span>

      {/* Rating badge */}
      <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-extrabold ${tier.bg} ${tier.text}`}>
        {e.teamRating}
      </span>

      {/* Chevron */}
      <span className="shrink-0 text-zinc-600 transition group-hover:text-[#FFC233]">›</span>
    </button>
  );
}

function EntryModal({ entry: e, onClose }: { entry: Entry; onClose: () => void }) {
  const formation = FORMATIONS.find((f) => f.name === e.formation) ?? getFormation("433");
  const placed = e.squad ? buildPlaced(e.squad, e.formation) : [];
  const gd = e.goalsFor - e.goalsAgainst;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 16 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
        onClick={(ev) => ev.stopPropagation()}
        className="my-6 w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#0c1322] shadow-2xl"
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 ${e.won ? "bg-[#FFC233]/10" : "bg-white/5"}`}>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-extrabold text-white">{e.alias}</span>
              {e.won && <span className="text-xl">🏆</span>}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-zinc-400">
              <span>{e.formation}</span>
              <span>·</span>
              <span className="capitalize">{e.difficulty}</span>
              <span>·</span>
              <span className="capitalize">{e.ratingsMode === "current" ? "Current form" : "Peak ratings"}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-xl px-3 py-1.5 text-sm font-extrabold ${
              e.won ? "bg-[#FFC233] text-zinc-950" : "bg-white/10 text-white"
            }`}>
              {PLACEMENT_EMOJI[e.placement] ?? ""} {e.placement}
            </span>
            <button onClick={onClose} className="text-zinc-400 transition hover:text-white">✕</button>
          </div>
        </div>

        <div className="p-5">
          <div className="grid gap-5 sm:grid-cols-[240px_1fr]">
            {/* Pitch */}
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Formation</p>
              {placed.length > 0 ? (
                <Pitch formation={formation} placed={placed} className="mx-auto max-w-[240px]" />
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl bg-white/5 text-sm text-zinc-500">
                  Squad data unavailable
                </div>
              )}
            </div>

            {/* Right column */}
            <div className="space-y-4">
              {/* Stats grid */}
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Tournament stats</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <StatBox label="Record" value={`${e.wins}-${e.draws}-${e.losses}`} />
                  <StatBox label="Goals" value={e.goalsFor} />
                  <StatBox label="Conceded" value={e.goalsAgainst} />
                  <StatBox label="GD" value={gd > 0 ? `+${gd}` : String(gd)} highlight={gd > 0} />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-center">
                  <StatBox label="XI Rating" value={e.teamRating} large />
                  <StatBox label="Goals/game" value={(e.wins + e.draws + e.losses) > 0
                    ? (e.goalsFor / (e.wins + e.draws + e.losses)).toFixed(1) : "0"}
                  />
                </div>
              </div>

              {/* Squad list */}
              {e.squad && e.squad.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                    Squad ({e.squad.length} players)
                  </p>
                  <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                    {[...e.squad]
                      .sort((a, b) => b.rating - a.rating)
                      .map((p, i) => {
                        const tier = ratingTier(p.rating);
                        return (
                          <div key={i} className="flex items-center gap-2.5 rounded-lg bg-white/5 px-2.5 py-1.5">
                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-extrabold ${tier.bg} ${tier.text}`}>
                              {p.rating}
                            </span>
                            <span className="text-sm shrink-0">{p.flag}</span>
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{p.name}</span>
                            <span className="shrink-0 text-[10px] font-bold text-zinc-500">{p.slot}</span>
                            <span className="hidden shrink-0 text-[10px] text-zinc-600 sm:block">{p.nation}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StatBox({
  label, value, highlight, large,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
  large?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/5 py-2">
      <p className={`font-extrabold tabular-nums leading-none ${large ? "text-xl" : "text-base"} ${
        highlight ? "text-emerald-400" : "text-white"
      }`}>
        {value}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
    </div>
  );
}
