"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  EMPTY_STATS, FANTASY_RULES, gameweekStatus, playerPoints, POSITIONS,
  type FantasyPosition, type PlayerStats,
} from "@/lib/fantasy";

interface Season { id: string; name: string; isActive: boolean; budget: number; teams?: number }
interface Player { id: string; name: string; position: FantasyPosition; price: number; imageUrl: string | null; isActive: boolean }
interface StatRow extends PlayerStats { playerId: string; points: number }
interface Gameweek { id: string; number: number; name: string | null; deadline: string; finalizedAt: string | null; entries: number; stats: StatRow[] }
interface AdminData { seasons: Season[]; season: Season | null; players: Player[]; gameweeks: Gameweek[] }

const input = "px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-sm outline-none focus:border-purple-500";
const button = "px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-sm transition-colors";
const primary = "px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors";
const card = "rounded-2xl bg-zinc-900 border border-zinc-800 p-5 space-y-4";

/** Local "YYYY-MM-DDTHH:mm" for a datetime-local input. */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function FantasyAdminPage() {
  const [secret, setSecret] = useState(() => (typeof window !== "undefined" ? sessionStorage.getItem("adminSecret") ?? "" : ""));
  const [data, setData] = useState<AdminData | null>(null);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (s: string, id?: string | null) => {
    if (!s) return;
    const res = await fetch(`/api/admin/fantasy${id ? `?seasonId=${id}` : ""}`, { headers: { "x-admin-secret": s } });
    if (!res.ok) { setMessage({ ok: false, text: "Invalid secret or server error." }); return; }
    sessionStorage.setItem("adminSecret", s);
    const json = (await res.json()) as AdminData;
    setData(json);
    setSeasonId(json.season?.id ?? null);
  }, []);

  useEffect(() => { if (secret) load(secret); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(body: Record<string, unknown>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/fantasy", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setMessage({ ok: true, text: success });
      await load(secret, (json.season?.id as string | undefined) ?? seasonId);
      return json;
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-white text-2xl font-bold">Admin — Fantasy Div 1</h1>
          <Link href="/admin" className={button}>← Admin</Link>
        </div>

        <div className="flex gap-3">
          <input type="password" placeholder="Admin secret" value={secret} onChange={(e) => setSecret(e.target.value)} className={`${input} flex-1`} />
          <button onClick={() => load(secret, seasonId)} disabled={!secret} className={button}>Load</button>
        </div>

        {message && (
          <p className={`text-sm rounded-xl p-3 ${message.ok ? "bg-green-900/40 text-green-300" : "bg-red-900/40 text-red-300"}`}>{message.text}</p>
        )}

        {data && (
          <>
            <SeasonPanel data={data} busy={busy} act={act} onSwitch={(id) => load(secret, id)} />
            {data.season && (
              <>
                <PlayersPanel season={data.season} players={data.players} busy={busy} act={act} />
                <GameweeksPanel season={data.season} gameweeks={data.gameweeks} players={data.players} busy={busy} act={act} />
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

type Act = (body: Record<string, unknown>, success: string) => Promise<Record<string, unknown> | null>;

function SeasonPanel({ data, busy, act, onSwitch }: { data: AdminData; busy: boolean; act: Act; onSwitch: (id: string) => void }) {
  const [name, setName] = useState("");
  const [budget, setBudget] = useState(String(FANTASY_RULES.defaultBudget / 10));
  const [importPlayers, setImportPlayers] = useState(true);
  const season = data.season;
  const [editBudget, setEditBudget] = useState(season ? String(season.budget / 10) : "");
  useEffect(() => { if (season) setEditBudget(String(season.budget / 10)); }, [season]);

  return (
    <section className={card}>
      <h2 className="text-white font-semibold">Season</h2>
      {season && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <select value={season.id} onChange={(e) => onSwitch(e.target.value)} className={input}>
            {data.seasons.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.isActive ? " (active)" : ""} · {s.teams ?? 0} teams</option>
            ))}
          </select>
          <label className="text-zinc-400">Budget £m</label>
          <input value={editBudget} onChange={(e) => setEditBudget(e.target.value)} className={`${input} w-24`} />
          <button
            disabled={busy}
            className={button}
            onClick={() => act({ action: "updateSeason", seasonId: season.id, budget: Math.round(Number(editBudget) * 10) }, "Budget saved")}
          >
            Save budget
          </button>
          {!season.isActive && (
            <button disabled={busy} className={button} onClick={() => act({ action: "updateSeason", seasonId: season.id, isActive: true }, "Season activated")}>
              Make active
            </button>
          )}
          {season.isActive && <span className="text-green-400">● Live in the app</span>}
        </div>
      )}
      <details className="text-sm" open={!season}>
        <summary className="text-zinc-400 cursor-pointer">New season</summary>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <input placeholder="e.g. Division 1 2026/27" value={name} onChange={(e) => setName(e.target.value)} className={`${input} flex-1 min-w-48`} />
          <label className="text-zinc-400">Budget £m</label>
          <input value={budget} onChange={(e) => setBudget(e.target.value)} className={`${input} w-24`} />
          <label className="flex items-center gap-2 text-zinc-300">
            <input type="checkbox" checked={importPlayers} onChange={(e) => setImportPlayers(e.target.checked)} />
            Import squad from the 5ive Guys cards
          </label>
          <button
            disabled={busy || !name.trim()}
            className={primary}
            onClick={async () => {
              const res = await act({ action: "createSeason", name, budget: Math.round(Number(budget) * 10), importPlayers }, "Season created");
              if (res) setName("");
            }}
          >
            Create &amp; make active
          </button>
        </div>
        <p className="text-zinc-500 mt-2">Creating a season makes it the active one in the app; the previous season is kept but hidden.</p>
      </details>
    </section>
  );
}

function PlayersPanel({ season, players, busy, act }: { season: Season; players: Player[]; busy: boolean; act: Act }) {
  const [drafts, setDrafts] = useState<Record<string, Partial<Player>>>({});
  const [adding, setAdding] = useState<{ name: string; position: FantasyPosition; price: string }>({ name: "", position: "MID", price: "5.0" });
  const edit = (id: string, patch: Partial<Player>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const counts = POSITIONS.map((p) => `${players.filter((pl) => pl.position === p && pl.isActive).length} ${p}`).join(" · ");

  return (
    <section className={card}>
      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold">Players <span className="text-zinc-500 font-normal text-sm">({counts})</span></h2>
        <button disabled={busy} className={button} onClick={() => act({ action: "importPlayers", seasonId: season.id }, "Imported missing players")}>
          Import missing from cards
        </button>
      </div>
      <p className="text-zinc-500 text-sm">
        Prices are in £m. Changing a price only affects new signings — fans keep players at what they paid.
        Untick &quot;In squad&quot; when someone leaves: owners keep them, nobody else can buy them.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-zinc-500 text-left">
            <tr><th className="py-2">Name</th><th>Position</th><th>Price £m</th><th>In squad</th><th /></tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const d = { ...p, ...drafts[p.id] };
              const dirty = !!drafts[p.id];
              return (
                <tr key={p.id} className="border-t border-zinc-800">
                  <td className="py-2 pr-2"><input value={d.name} onChange={(e) => edit(p.id, { name: e.target.value })} className={`${input} w-40`} /></td>
                  <td className="pr-2">
                    <select value={d.position} onChange={(e) => edit(p.id, { position: e.target.value as FantasyPosition })} className={input}>
                      {POSITIONS.map((pos) => <option key={pos}>{pos}</option>)}
                    </select>
                  </td>
                  <td className="pr-2">
                    <input type="number" step="0.5" min="1" value={d.price / 10} onChange={(e) => edit(p.id, { price: Math.round(Number(e.target.value) * 10) })} className={`${input} w-24`} />
                  </td>
                  <td className="pr-2"><input type="checkbox" checked={d.isActive} onChange={(e) => edit(p.id, { isActive: e.target.checked })} /></td>
                  <td>
                    <button
                      disabled={busy || !dirty}
                      className={button}
                      onClick={async () => {
                        const res = await act({ action: "savePlayer", ...d }, `${d.name} saved`);
                        if (res) setDrafts(({ [p.id]: _, ...rest }) => rest);
                      }}
                    >
                      Save
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-zinc-800">
              <td className="py-2 pr-2"><input placeholder="New player" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} className={`${input} w-40`} /></td>
              <td className="pr-2">
                <select value={adding.position} onChange={(e) => setAdding({ ...adding, position: e.target.value as FantasyPosition })} className={input}>
                  {POSITIONS.map((pos) => <option key={pos}>{pos}</option>)}
                </select>
              </td>
              <td className="pr-2"><input type="number" step="0.5" value={adding.price} onChange={(e) => setAdding({ ...adding, price: e.target.value })} className={`${input} w-24`} /></td>
              <td />
              <td>
                <button
                  disabled={busy || !adding.name.trim()}
                  className={primary}
                  onClick={async () => {
                    const res = await act(
                      { action: "savePlayer", seasonId: season.id, name: adding.name, position: adding.position, price: Math.round(Number(adding.price) * 10) },
                      `${adding.name} added`,
                    );
                    if (res) setAdding({ name: "", position: "MID", price: "5.0" });
                  }}
                >
                  Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GameweeksPanel({ season, gameweeks, players, busy, act }: { season: Season; gameweeks: Gameweek[]; players: Player[]; busy: boolean; act: Act }) {
  const [selected, setSelected] = useState<string | null>(null);
  const nextNumber = (gameweeks.at(-1)?.number ?? 0) + 1;
  const [form, setForm] = useState({ name: "", deadline: "" });
  const current = gameweeks.find((g) => g.id === selected) ?? null;

  return (
    <section className={card}>
      <h2 className="text-white font-semibold">Gameweeks</h2>
      <p className="text-zinc-500 text-sm">Teams lock at the deadline (set it to kickoff). After the match, enter stats and finalise to score every team.</p>
      <div className="space-y-2">
        {gameweeks.map((g) => (
          <GameweekRow key={g.id} gw={g} busy={busy} act={act} selected={g.id === selected} onSelect={() => setSelected(g.id === selected ? null : g.id)} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm border-t border-zinc-800 pt-4">
        <span className="text-zinc-400">Add gameweek {nextNumber}</span>
        <input placeholder="Opponent (optional)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${input} flex-1 min-w-40`} />
        <input type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className={input} />
        <button
          disabled={busy || !form.deadline}
          className={primary}
          onClick={async () => {
            const res = await act(
              { action: "saveGameweek", seasonId: season.id, number: nextNumber, name: form.name, deadline: new Date(form.deadline).toISOString() },
              `Gameweek ${nextNumber} added`,
            );
            if (res) setForm({ name: "", deadline: "" });
          }}
        >
          Add
        </button>
      </div>
      {current && <StatsEditor key={current.id} gw={current} players={players} busy={busy} act={act} />}
    </section>
  );
}

function GameweekRow({ gw, busy, act, selected, onSelect }: { gw: Gameweek; busy: boolean; act: Act; selected: boolean; onSelect: () => void }) {
  const [name, setName] = useState(gw.name ?? "");
  const [deadline, setDeadline] = useState(toLocalInput(gw.deadline));
  const status = gameweekStatus(gw);
  const dirty = name !== (gw.name ?? "") || deadline !== toLocalInput(gw.deadline);
  const badge = { upcoming: "bg-blue-900/50 text-blue-300", live: "bg-amber-900/50 text-amber-300", finished: "bg-green-900/50 text-green-300" }[status];

  return (
    <div className={`flex flex-wrap items-center gap-3 text-sm rounded-xl p-3 ${selected ? "bg-zinc-800" : "bg-zinc-950"}`}>
      <span className="text-white font-semibold w-12">GW{gw.number}</span>
      <span className={`px-2 py-0.5 rounded-md text-xs ${badge}`}>{status}</span>
      <input value={name} placeholder="Opponent" onChange={(e) => setName(e.target.value)} className={`${input} w-44`} />
      <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={input} />
      <span className="text-zinc-500">{gw.entries} teams · {gw.stats.length} stat rows</span>
      <div className="flex gap-2 ml-auto">
        {dirty && (
          <button disabled={busy} className={button}
            onClick={() => act({ action: "saveGameweek", id: gw.id, number: gw.number, name, deadline: new Date(deadline).toISOString() }, `Gameweek ${gw.number} saved`)}>
            Save
          </button>
        )}
        <button className={button} onClick={onSelect}>{selected ? "Close stats" : "Enter stats"}</button>
        {gw.entries === 0 && (
          <button disabled={busy} className={button} onClick={() => { if (confirm(`Delete gameweek ${gw.number}?`)) act({ action: "deleteGameweek", id: gw.id }, "Deleted"); }}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

const COUNT_FIELDS: { key: keyof PlayerStats; label: string }[] = [
  { key: "goals", label: "G" }, { key: "assists", label: "A" }, { key: "yellowCards", label: "YC" },
  { key: "ownGoals", label: "OG" }, { key: "penaltySaves", label: "PS" }, { key: "penaltyMisses", label: "PM" },
];
const FLAG_FIELDS: { key: keyof PlayerStats; label: string }[] = [
  { key: "cleanSheet", label: "CS" }, { key: "redCard", label: "RC" }, { key: "motm", label: "MOTM" },
];

function StatsEditor({ gw, players, busy, act }: { gw: Gameweek; players: Player[]; busy: boolean; act: Act }) {
  const initial = useMemo(() => {
    const byPlayer = new Map(gw.stats.map((s) => [s.playerId, s]));
    return Object.fromEntries(players.map((p) => {
      const s = byPlayer.get(p.id);
      return [p.id, s ? { ...EMPTY_STATS, ...s } : { ...EMPTY_STATS }];
    })) as Record<string, PlayerStats>;
  }, [gw.stats, players]);
  const [rows, setRows] = useState(initial);
  const status = gameweekStatus(gw);
  const set = (id: string, patch: Partial<PlayerStats>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  const save = (finalize: boolean) =>
    act(
      {
        action: "saveStats",
        gameweekId: gw.id,
        stats: players.map((p) => ({ playerId: p.id, ...rows[p.id] })),
      },
      gw.finalizedAt ? "Stats saved and gameweek re-scored" : "Stats saved",
    ).then((res) => (res && finalize ? act({ action: "finalize", gameweekId: gw.id }, `Gameweek ${gw.number} scored`) : res));

  return (
    <div className="border-t border-zinc-800 pt-4 space-y-3">
      <h3 className="text-white font-semibold">Gameweek {gw.number} stats{gw.name ? ` — ${gw.name}` : ""}</h3>
      <p className="text-zinc-500 text-sm">
        Tick &quot;Played&quot; for everyone who got on the pitch. CS = clean sheet (only scores for GK/DEF), YC/RC = cards,
        OG = own goals, PS/PM = penalties saved/missed. Bonus can be negative.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-zinc-500 text-left">
            <tr>
              <th className="py-2">Player</th><th>Played</th>
              {COUNT_FIELDS.map((f) => <th key={f.key}>{f.label}</th>)}
              {FLAG_FIELDS.map((f) => <th key={f.key}>{f.label}</th>)}
              <th>Bonus</th><th className="text-right">Pts</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const r = rows[p.id];
              return (
                <tr key={p.id} className={`border-t border-zinc-800 ${r.played ? "" : "opacity-50"}`}>
                  <td className="py-1.5 pr-2 text-white whitespace-nowrap">{p.name} <span className="text-zinc-500">{p.position}</span></td>
                  <td><input type="checkbox" checked={r.played} onChange={(e) => set(p.id, { played: e.target.checked })} /></td>
                  {COUNT_FIELDS.map((f) => (
                    <td key={f.key} className="pr-1">
                      <input type="number" min="0" value={r[f.key] as number} onChange={(e) => set(p.id, { [f.key]: Math.max(0, Number(e.target.value) || 0) })}
                        className={`${input} w-14 px-2 py-1`} />
                    </td>
                  ))}
                  {FLAG_FIELDS.map((f) => (
                    <td key={f.key}><input type="checkbox" checked={r[f.key] as boolean} onChange={(e) => set(p.id, { [f.key]: e.target.checked })} /></td>
                  ))}
                  <td className="pr-1">
                    <input type="number" value={r.bonus} onChange={(e) => set(p.id, { bonus: Number(e.target.value) || 0 })} className={`${input} w-14 px-2 py-1`} />
                  </td>
                  <td className="text-right text-white font-semibold">{playerPoints(r, p.position)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} className={button} onClick={() => save(false)}>Save stats</button>
        {!gw.finalizedAt && (
          <button
            disabled={busy || status === "upcoming"}
            className={primary}
            onClick={() => { if (confirm(`Score gameweek ${gw.number} for every team?`)) save(true); }}
          >
            Save &amp; finalise gameweek
          </button>
        )}
        <span className="text-zinc-500 text-sm">
          {status === "upcoming" ? "You can finalise once the deadline has passed."
            : gw.finalizedAt ? `Scored ${new Date(gw.finalizedAt).toLocaleString()} — saving again re-scores it.` : "Fans see live points as you save stats."}
        </span>
      </div>
    </div>
  );
}
