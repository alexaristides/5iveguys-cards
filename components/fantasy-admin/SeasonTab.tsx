"use client";

import { useState } from "react";
import { FANTASY_RULES } from "@/lib/fantasy";
import type { Act, AdminData } from "./types";
import { btnDanger, btnPrimary, btnSecondary, field, Label, Switch } from "./ui";

export function SeasonTab({ data, act, onSwitch, onLock }: {
  data: AdminData; act: Act; onSwitch: (seasonId: string) => void; onLock: () => void;
}) {
  const season = data.season;
  const [name, setName] = useState(season?.name ?? "");
  const [half, setHalf] = useState(season?.secondHalfFrom ? String(season.secondHalfFrom) : "");
  const [creating, setCreating] = useState(!season);
  const [newName, setNewName] = useState("");
  const [importPlayers, setImportPlayers] = useState(true);
  const [busy, setBusy] = useState(false);
  const run = async (body: Record<string, unknown>, msg: string) => { setBusy(true); const r = await act(body, msg); setBusy(false); return r; };

  return (
    <div className="space-y-6">
      {season && (
        <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${season.isActive ? "bg-emerald-950 text-emerald-300" : "bg-zinc-800 text-zinc-400"}`}>
              {season.isActive ? "● Live in the app" : "Not live"}
            </span>
            <span className="text-zinc-500 text-sm">{season.teams ?? data.seasons.find((s) => s.id === season.id)?.teams ?? 0} teams</span>
          </div>
          <div>
            <Label>Season name</Label>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label hint="Fantasy Premier League gives everyone a second set of chips for the second half. Leave blank for one set all season.">
              Second set of chips from gameweek
            </Label>
            <input className={field} inputMode="numeric" value={half} onChange={(e) => setHalf(e.target.value.replace(/\D/g, ""))} placeholder="One set all season" />
          </div>
          <button className={`${btnPrimary} w-full`} disabled={busy || !name.trim()}
            onClick={() => run({ action: "updateSeason", seasonId: season.id, name: name.trim(), secondHalfFrom: half ? Number(half) : null }, "Season saved")}>
            Save
          </button>
          {!season.isActive && (
            <div className="grid grid-cols-2 gap-3">
              <button className={btnSecondary} disabled={busy} onClick={() => run({ action: "updateSeason", seasonId: season.id, isActive: true }, "Season is live")}>Make live</button>
              <button className={btnDanger} disabled={busy} onClick={() => {
                if (confirm(`Delete "${season.name}" with all its teams, gameweeks and leagues? This can't be undone.`)) run({ action: "deleteSeason", seasonId: season.id }, "Season deleted");
              }}>Delete</button>
            </div>
          )}
        </section>
      )}

      {data.seasons.length > 1 && season && (
        <section>
          <Label>Other seasons</Label>
          <select className={field} value={season.id} onChange={(e) => onSwitch(e.target.value)}>
            {data.seasons.map((s) => <option key={s.id} value={s.id}>{s.name}{s.isActive ? " (live)" : ""} · {s.teams ?? 0} teams</option>)}
          </select>
        </section>
      )}

      <section className="rounded-2xl border border-zinc-800 p-4 space-y-4">
        {!creating ? (
          <button className={`${btnSecondary} w-full`} onClick={() => setCreating(true)}>Start a new season</button>
        ) : (
          <>
            <h2 className="text-white text-lg font-black">New season</h2>
            <input className={field} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Division 1 2027/28" />
            <Switch checked={importPlayers} onChange={setImportPlayers} label="Bring in the squad from the cards" />
            <p className="text-zinc-500 text-xs">The new season goes live straight away. The current one is kept but hidden from fans.</p>
            <button className={`${btnPrimary} w-full`} disabled={busy || !newName.trim()} onClick={async () => {
              if (season && !confirm(`Start "${newName.trim()}" and take "${season.name}" off the app?`)) return;
              const r = await run({ action: "createSeason", name: newName.trim(), budget: FANTASY_RULES.defaultBudget, importPlayers }, "New season is live");
              if (r) { setNewName(""); setCreating(false); }
            }}>Create & go live</button>
          </>
        )}
      </section>

      <button className="w-full h-12 text-zinc-500 text-sm" onClick={onLock}>Lock admin on this phone</button>
    </div>
  );
}
