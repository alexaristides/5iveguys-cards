"use client";

import Image from "next/image";
import {
  standings, entrant, STAGE_LABEL, USER_ID,
} from "@/lib/worldcup/tournament";
import type { Entrant, TournamentState, Fixture, Stage } from "@/lib/worldcup/types";

export function Flag({ e, size = 20 }: { e: Entrant; size?: number }) {
  if (e.isUser && !e.flagUrl) {
    return <span style={{ fontSize: size }} aria-label="You">🟢</span>;
  }
  if (!e.flagUrl) return <span style={{ fontSize: size }}>🏳️</span>;
  return (
    <Image
      src={e.flagUrl}
      alt={e.name}
      width={Math.round(size * 1.4)}
      height={size}
      className={`rounded-sm object-cover ${e.isUser ? "rounded-full" : ""}`}
      style={{ width: Math.round(size * 1.4), height: size }}
      unoptimized={e.isUser}
    />
  );
}

export function EntrantRow({ e, highlight, right }: { e: Entrant; highlight?: boolean; right?: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-2 ${highlight ? "text-green-300 font-bold" : "text-zinc-300"}`}>
      <Flag e={e} size={16} />
      <span className="truncate text-sm">{e.name}</span>
      {right}
    </div>
  );
}

export function GroupTable({ state, groupId }: { state: TournamentState; groupId: string }) {
  const rows = standings(state, groupId);
  return (
    <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 overflow-hidden">
      <div className="px-3 py-2 bg-zinc-800/60 text-xs font-bold text-zinc-300 flex justify-between">
        <span>Group {groupId}</span>
        <span className="text-zinc-500">Pld · GD · Pts</span>
      </div>
      {rows.map((r, i) => {
        const e = entrant(state, r.entrantId);
        const qualifies = i < 2;
        return (
          <div
            key={r.entrantId}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm border-t border-zinc-800/60 ${
              e.id === USER_ID ? "bg-green-900/30" : ""
            }`}
          >
            <span className={`w-4 text-center text-[10px] font-bold ${qualifies ? "text-green-400" : i === 2 ? "text-amber-400" : "text-zinc-600"}`}>{i + 1}</span>
            <Flag e={e} size={16} />
            <span className={`flex-1 truncate ${e.id === USER_ID ? "text-green-300 font-bold" : "text-zinc-200"}`}>{e.name}</span>
            <span className="text-zinc-500 tabular-nums text-xs">{r.p}</span>
            <span className="text-zinc-500 tabular-nums text-xs w-6 text-right">{r.gd > 0 ? `+${r.gd}` : r.gd}</span>
            <span className="text-white font-bold tabular-nums text-xs w-5 text-right">{r.pts}</span>
          </div>
        );
      })}
    </div>
  );
}

const KO_STAGES: Stage[] = ["R32", "R16", "QF", "SF", "final"];

function scoreText(f: Fixture) {
  if (!f.played) return "vs";
  const base = `${f.homeGoals}–${f.awayGoals}`;
  if (f.homePens != null && f.awayPens != null) return `${base} (${f.homePens}–${f.awayPens})`;
  return base;
}

export function BracketView({ state }: { state: TournamentState }) {
  const stagesPresent = KO_STAGES.filter((s) => state.fixtures.some((f) => f.stage === s));
  if (stagesPresent.length === 0) {
    return <p className="text-zinc-500 text-sm text-center py-6">The bracket forms once the group stage ends.</p>;
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {stagesPresent.map((stage) => {
        const fixtures = state.fixtures.filter((f) => f.stage === stage).sort((a, b) => a.round - b.round);
        return (
          <div key={stage} className="shrink-0 w-44">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5 text-center">{STAGE_LABEL[stage]}</div>
            <div className="space-y-1.5">
              {fixtures.map((f) => {
                const h = entrant(state, f.homeId), a = entrant(state, f.awayId);
                const involvesUser = f.isUser;
                return (
                  <div key={f.id} className={`rounded-lg border p-1.5 text-xs ${involvesUser ? "border-green-700/60 bg-green-900/20" : "border-zinc-800 bg-zinc-900/50"}`}>
                    {[h, a].map((e, idx) => {
                      const isWinner = f.played && f.winnerId === e.id;
                      return (
                        <div key={e.id} className={`flex items-center gap-1.5 ${idx === 0 ? "mb-0.5" : ""} ${isWinner ? "text-green-300 font-bold" : "text-zinc-400"}`}>
                          <Flag e={e} size={12} />
                          <span className="flex-1 truncate">{e.name}</span>
                          <span className="tabular-nums">{f.played ? (idx === 0 ? f.homeGoals : f.awayGoals) : ""}</span>
                        </div>
                      );
                    })}
                    {f.homePens != null && (
                      <div className="text-[9px] text-amber-400/80 text-right mt-0.5">pens {f.homePens}–{f.awayPens}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function NextOpponentCard({ state, opponent, stageLabel }: { state: TournamentState; opponent: Entrant; stageLabel: string }) {
  const you = entrant(state, USER_ID);
  return (
    <div className="rounded-2xl bg-gradient-to-br from-green-900/40 to-zinc-900 border border-green-800/50 p-5">
      <div className="text-[10px] font-bold uppercase tracking-widest text-green-400 mb-3 text-center">{stageLabel} · Next match</div>
      <div className="flex items-center justify-center gap-4">
        <div className="flex flex-col items-center gap-1.5 w-24">
          <Flag e={you} size={34} />
          <span className="text-white text-sm font-bold truncate max-w-full">{you.name}</span>
          <span className="text-zinc-500 text-[10px]">OVR {you.overall}</span>
        </div>
        <span className="text-zinc-600 font-black text-lg">VS</span>
        <div className="flex flex-col items-center gap-1.5 w-24">
          <Flag e={opponent} size={34} />
          <span className="text-white text-sm font-bold truncate max-w-full">{opponent.name}</span>
          <span className="text-zinc-500 text-[10px]">OVR {opponent.overall}</span>
        </div>
      </div>
    </div>
  );
}
