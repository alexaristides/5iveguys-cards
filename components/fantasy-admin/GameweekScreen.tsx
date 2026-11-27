"use client";

import { useMemo, useState } from "react";
import { awardBonus, EMPTY_STATS, FANTASY_POINTS, gameweekStatus, pointsBreakdown, POSITIONS, type PlayerStats } from "@/lib/fantasy";
import type { Act, Gameweek, Player, Season } from "./types";
import { GameweekSheet } from "./GameweeksTab";
import { Avatar, btnPrimary, btnSecondary, formatDay, formatTime, kickoffOf, PositionTag, Segmented, Stepper, tap } from "./ui";

type Rows = Record<string, PlayerStats>;

/** The match result and every player's stats for one gameweek, laid out for a phone. */
export function GameweekScreen({ season, gw, players, act, onBack }: {
  season: Season; gw: Gameweek; players: Player[]; act: Act; onBack: () => void;
}) {
  const initialRows = useMemo<Rows>(() => {
    const byPlayer = new Map(gw.stats.map((s) => [s.playerId, s]));
    return Object.fromEntries(players.map((p) => {
      const s = byPlayer.get(p.id);
      return [p.id, s ? pickStats(s) : { ...EMPTY_STATS }];
    }));
  }, [gw.stats, players]);

  const [rows, setRows] = useState<Rows>(initialRows);
  const [goalsFor, setGoalsFor] = useState(gw.goalsFor ?? 0);
  const [goalsAgainst, setGoalsAgainst] = useState(gw.goalsAgainst ?? 0);
  // The score comes first: it decides clean sheets and goals conceded, so nobody gets a clean sheet
  // from a 0–0 that was never entered.
  const savedScore = gw.goalsFor !== null && gw.goalsAgainst !== null;
  const [scoreSet, setScoreSet] = useState(savedScore);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const status = gameweekStatus(gw);
  const kickoff = kickoffOf(gw.deadline);
  const dirty = scoreSet !== savedScore || goalsFor !== (gw.goalsFor ?? 0) || goalsAgainst !== (gw.goalsAgainst ?? 0)
    || JSON.stringify(rows) !== JSON.stringify(initialRows);
  const canSave = dirty;

  // Squad order: GK, DEF, MID, FWD; players who left only show if they have stats here.
  const squad = players
    .filter((p) => p.isActive || rows[p.id]?.played)
    .sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) || a.name.localeCompare(b.name));
  const played = squad.filter((p) => rows[p.id].played);
  const bonus = awardBonus(players.map((p) => ({ id: p.id, position: p.position, stats: rows[p.id] })));
  const goalsGiven = played.reduce((n, p) => n + rows[p.id].goals, 0);

  const set = (id: string, patch: Partial<PlayerStats>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  // Playing assumes over half the game and the team's goals against, as most players do in 7-a-side.
  const togglePlayed = (id: string) => {
    tap();
    set(id, rows[id].played ? { ...EMPTY_STATS } : { played: true, playedMost: true, goalsConceded: goalsAgainst });
  };
  const changeFor = (v: number) => { setScoreSet(true); setGoalsFor(v); };
  const changeAgainst = (v: number) => {
    setScoreSet(true);
    // Keep "conceded" in step for everyone who was on for the whole match and hadn't been changed by hand.
    setRows((r) => Object.fromEntries(Object.entries(r).map(([id, s]) =>
      [id, s.played && s.playedMost && s.goalsConceded === goalsAgainst ? { ...s, goalsConceded: v }
        : s.goalsConceded > v ? { ...s, goalsConceded: v } : s])));
    setGoalsAgainst(v);
  };

  async function save(finalize: boolean) {
    setBusy(true);
    const ok = await act({
      action: "saveGameweek", seasonId: season.id, id: gw.id, number: gw.number, name: gw.name ?? "", deadline: gw.deadline,
      goalsFor: scoreSet ? goalsFor : null, goalsAgainst: scoreSet ? goalsAgainst : null,
    }) && await act(
      { action: "saveStats", gameweekId: gw.id, stats: players.map((p) => ({ playerId: p.id, ...rows[p.id] })) },
      finalize ? undefined : gw.finalizedAt ? `Saved and re-scored gameweek ${gw.number}` : "Saved",
    ) && (!finalize || await act({ action: "finalize", gameweekId: gw.id }, `Gameweek ${gw.number} scored for every team`));
    setBusy(false);
    if (ok && finalize) onBack();
  }

  function back() {
    if (dirty && !confirm("Leave without saving?")) return;
    onBack();
  }

  return (
    <div className="pb-36">
      <div className="sticky top-0 z-20 -mx-4 px-4 pt-[max(.5rem,env(safe-area-inset-top))] pb-2 bg-[#0a0a0a]/95 backdrop-blur border-b border-zinc-900 flex items-center gap-2">
        <button onClick={back} className="h-11 pr-3 -ml-1 text-purple-400 text-base font-semibold">‹ Back</button>
        <div className="flex-1 min-w-0 text-center">
          <div className="text-white font-black truncate">GW{gw.number}{gw.name ? ` · ${gw.name}` : ""}</div>
          <div className="text-zinc-500 text-xs">{formatDay(kickoff)} · {formatTime(kickoff)}</div>
        </div>
        <button onClick={() => setEditing(true)} className="h-11 pl-3 text-purple-400 text-base font-semibold">Edit</button>
      </div>

      {status === "upcoming" && (
        <p className="mt-4 rounded-xl bg-sky-950/60 text-sky-200 text-sm p-3">
          This match hasn&apos;t kicked off yet. You can fill things in now, but you can only score the gameweek once teams have locked.
        </p>
      )}
      {gw.finalizedAt && (
        <p className="mt-4 rounded-xl bg-emerald-950/60 text-emerald-200 text-sm p-3">
          Already scored. Fix anything below and save: every team is re-scored straight away.
        </p>
      )}

      <section className={`mt-4 rounded-2xl bg-zinc-900 border p-4 ${scoreSet ? "border-zinc-800" : "border-purple-500"}`}>
        <h2 className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-1">{scoreSet ? "Final score" : "Step 1 · What was the final score?"}</h2>
        <div className={`divide-y divide-zinc-800 ${scoreSet ? "" : "opacity-60"}`}>
          <ScoreRow team="5ive Guys" value={goalsFor} onChange={changeFor} />
          <ScoreRow team={gw.name || "Opponent"} value={goalsAgainst} onChange={changeAgainst} />
        </div>
        {!scoreSet && (
          <div className="mt-3 space-y-2">
            <p className="text-zinc-400 text-sm">The score decides clean sheets and goals conceded, so it comes first.</p>
            <button onClick={() => { tap(); setScoreSet(true); }} className="w-full h-11 rounded-xl border border-zinc-700 text-zinc-200 font-semibold">
              It finished 0–0
            </button>
          </div>
        )}
        {played.length > 0 && (
          <p className={`mt-3 text-center text-sm ${goalsGiven === goalsFor ? "text-emerald-400" : "text-amber-400"}`}>
            {goalsGiven === goalsFor
              ? `✓ All ${goalsFor} goals given to scorers`
              : goalsGiven < goalsFor
                ? `${goalsGiven} of ${goalsFor} goals given to scorers so far`
                : `${goalsGiven} goals given to scorers, but the score says ${goalsFor}`}
          </p>
        )}
      </section>

      {!scoreSet ? (
        <p className="mt-6 rounded-2xl border border-dashed border-zinc-800 text-zinc-500 text-sm text-center p-6">
          Enter the score above, then pick who played and add their stats.
        </p>
      ) : (<>
      <section className="mt-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-white text-lg font-black">Who played?</h2>
          <span className="text-zinc-500 text-sm">{played.length} picked</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {squad.map((p) => {
            const on = rows[p.id].played;
            return (
              <button key={p.id} onClick={() => togglePlayed(p.id)} aria-pressed={on}
                className={`relative rounded-2xl p-2 pt-3 flex flex-col items-center gap-1.5 border-2 touch-manipulation ${on ? "bg-purple-950/60 border-purple-500" : "bg-zinc-900 border-zinc-800 opacity-70"}`}>
                {on && <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-purple-500 text-white text-xs font-black grid place-items-center">✓</span>}
                <Avatar src={p.imageUrl} name={p.name} size={52} />
                <span className="text-white text-sm font-bold truncate max-w-full">{p.name}</span>
                <PositionTag position={p.position} />
              </button>
            );
          })}
        </div>
      </section>

      {played.length > 0 && (
        <section className="mt-6 space-y-3">
          <h2 className="text-white text-lg font-black">Stats</h2>
          {played.map((p) => (
            <PlayerStatCard key={p.id} player={p} stats={rows[p.id]} bonus={bonus.get(p.id) ?? 0} maxConceded={goalsAgainst} onChange={(patch) => set(p.id, patch)} />
          ))}
          <p className="text-zinc-500 text-xs">
            Points are for each player&apos;s own position. Bonus goes 3-2-1 to the three best players in the match, ranked by
            Fantasy Premier League&apos;s Bonus Points System from what you&apos;ve entered (so in a clean-sheet game it often goes to the defence).
          </p>
        </section>
      )}
      </>)}

      <div className="fixed inset-x-0 bottom-0 z-30 bg-[#0a0a0a]/95 backdrop-blur border-t border-zinc-900 px-4 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-lg mx-auto flex gap-3">
          {gw.finalizedAt ? (
            <button className={`${btnPrimary} flex-1`} disabled={busy || !canSave} onClick={() => save(false)}>{busy ? "Saving…" : "Save & re-score"}</button>
          ) : (
            <>
              <button className={`${btnSecondary} flex-1`} disabled={busy || !canSave} onClick={() => save(false)}>{busy ? "Saving…" : "Save"}</button>
              <button className={`${btnPrimary} flex-[1.4]`} disabled={busy || status === "upcoming"}
                onClick={() => { if (confirm(`Score gameweek ${gw.number} for every team? Make sure the score and stats are right.`)) save(true); }}>
                Save & score GW
              </button>
            </>
          )}
        </div>
      </div>

      {editing && <GameweekSheet season={season} gw={gw} number={gw.number} act={act} onClose={() => setEditing(false)} />}
    </div>
  );
}

function PlayerStatCard({ player, stats, bonus, maxConceded, onChange }: {
  player: Player; stats: PlayerStats; bonus: number; maxConceded: number; onChange: (patch: Partial<PlayerStats>) => void;
}) {
  const [more, setMore] = useState(false);
  const pos = player.position;
  const lines = pointsBreakdown({ ...stats, bonus }, pos);
  const points = lines.reduce((sum, l) => sum + l.points, 0);
  const keeper = pos === "GK";
  const defends = keeper || pos === "DEF";

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
      <div className="flex items-center gap-3">
        <Avatar src={player.imageUrl} name={player.name} size={44} />
        <div className="flex-1 min-w-0">
          <div className="text-white font-black truncate">{player.name}</div>
          <PositionTag position={pos} />
        </div>
        <div className="text-right">
          <div className="text-white text-2xl font-black tabular-nums leading-none">{points}</div>
          <div className="text-zinc-500 text-xs">pts</div>
        </div>
      </div>

      <div className="mt-4">
        <Segmented
          options={[{ value: "long", label: "Over half" }, { value: "short", label: "Under half" }]}
          value={stats.playedMost ? "long" : "short"}
          onChange={(v) => onChange({ playedMost: v === "long" })}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-y-4">
        <Stepper label="Goals" value={stats.goals} onChange={(v) => onChange({ goals: v })} />
        <Stepper label="Assists" value={stats.assists} onChange={(v) => onChange({ assists: v })} />
        {keeper && <Stepper label="Saves" value={stats.saves} onChange={(v) => onChange({ saves: v })} />}
        {defends && <ConcededStat value={stats.goalsConceded} max={maxConceded} onChange={(v) => onChange({ goalsConceded: v })} />}
      </div>

      <div className="mt-4 flex gap-2">
        <ToggleChip on={stats.yellowCards > 0} onClick={() => onChange({ yellowCards: stats.yellowCards > 0 ? 0 : 1 })} label="🟨 Yellow" />
        <ToggleChip on={stats.redCard} onClick={() => onChange({ redCard: !stats.redCard })} label="🟥 Red" />
      </div>

      <div className="mt-4 rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm">
        {lines.map((l) => (
          <div key={l.label} className="flex justify-between py-0.5">
            <span className={l.label === "Bonus" ? "text-amber-400" : "text-zinc-300"}>{l.label}</span>
            <span className={`tabular-nums font-semibold ${l.points < 0 ? "text-red-400" : l.label === "Bonus" ? "text-amber-400" : "text-white"}`}>
              {l.points > 0 ? `+${l.points}` : l.points}
            </span>
          </div>
        ))}
        <div className="flex justify-between pt-1 mt-1 border-t border-zinc-800 font-black text-white">
          <span>Total</span><span className="tabular-nums">{points}</span>
        </div>
      </div>

      <button onClick={() => setMore(!more)} className="mt-2 w-full h-11 text-purple-400 text-sm font-semibold">
        {more ? "Fewer stats ▴" : "More stats ▾"}
      </button>
      {more && (
        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-y-4">
            {!defends && <ConcededStat value={stats.goalsConceded} max={maxConceded} onChange={(v) => onChange({ goalsConceded: v })} />}
            <Stepper label="Own goals" value={stats.ownGoals} onChange={(v) => onChange({ ownGoals: v })} />
            <Stepper label="Pens missed" value={stats.penaltyMisses} onChange={(v) => onChange({ penaltyMisses: v })} />
            <Stepper label="Yellows" value={stats.yellowCards} onChange={(v) => onChange({ yellowCards: v })} max={2} />
            {keeper && <Stepper label="Pens saved" value={stats.penaltySaves} onChange={(v) => onChange({ penaltySaves: v })} />}
          </div>
          {!keeper && (
            <div>
              <div className="grid grid-cols-2 gap-y-4">
                <Stepper label="Saves" value={stats.saves} onChange={(v) => onChange({ saves: v })} />
                <Stepper label="Pens saved" value={stats.penaltySaves} onChange={(v) => onChange({ penaltySaves: v })} />
              </div>
              <p className="text-zinc-500 text-xs text-center mt-1">If he went in goal: +1 every {FANTASY_POINTS.savesPerPoint} saves, +{FANTASY_POINTS.penaltySave} a penalty save.</p>
            </div>
          )}
          <div>
            <Stepper label="Defensive actions" value={stats.defensiveContributions} onChange={(v) => onChange({ defensiveContributions: v })} />
            <p className="text-zinc-500 text-xs text-center mt-1">
              {keeper
                ? "Keepers don't score for defensive actions."
                : `Tackles, blocks, interceptions and clearances${pos === "DEF" ? "" : " plus ball recoveries"}: +${FANTASY_POINTS.defensiveContribution} points once he reaches ${FANTASY_POINTS.defensiveThreshold[pos]}.`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Goals conceded comes from the final score: it starts at the opponent's goals and can only go down
 * (for someone who wasn't on for all of them). With a clean sheet there's nothing to change, so it's
 * shown as a plain number rather than a stepper with both buttons greyed out.
 */
function ConcededStat({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  if (max === 0) {
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Conceded</span>
        <span className="h-11 flex items-center text-white text-2xl font-black tabular-nums">0</span>
        <span className="text-emerald-400 text-xs font-semibold">Clean sheet</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <Stepper label="Conceded" value={value} max={max} onChange={onChange} />
      <span className="text-zinc-500 text-xs">Up to {max}, from the score</span>
    </div>
  );
}

function ScoreRow({ team, value, onChange }: { team: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-white text-lg font-bold truncate">{team}</span>
      <Stepper label="" value={value} onChange={onChange} size="lg" />
    </div>
  );
}

function ToggleChip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={() => { tap(); onClick(); }}
      className={`flex-1 h-11 rounded-xl text-sm font-bold border touch-manipulation ${on ? "bg-white text-black border-white" : "bg-zinc-950 text-zinc-400 border-zinc-800"}`}>
      {label}
    </button>
  );
}

/** Just the editable stat fields from a saved row (bonus is worked out on save, so it's left at 0 here). */
function pickStats(s: PlayerStats): PlayerStats {
  const out = { ...EMPTY_STATS };
  for (const k of Object.keys(EMPTY_STATS) as (keyof PlayerStats)[]) (out as Record<string, unknown>)[k] = s[k];
  return { ...out, bonus: 0 };
}
