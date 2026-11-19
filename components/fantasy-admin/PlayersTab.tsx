"use client";

import { useState } from "react";
import { FANTASY_RULES, PLAYER_STATUS, POSITION_LABEL, POSITIONS, type FantasyPosition, type PlayerStatus } from "@/lib/fantasy";
import type { Act, Player, Season } from "./types";
import { Avatar, btnPrimary, btnSecondary, field, Label, PositionTag, POSITION_STYLE, Segmented, Sheet, Switch } from "./ui";

const STATUS_ORDER: PlayerStatus[] = ["a", "d", "i", "s", "u"];

export function PlayersTab({ season, players, act }: { season: Season; players: Player[]; act: Act }) {
  const [editing, setEditing] = useState<Player | "new" | null>(null);
  const [showLeft, setShowLeft] = useState(false);
  const left = players.filter((p) => !p.isActive);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <button className={btnPrimary} onClick={() => setEditing("new")}>+ Add player</button>
        <button className={btnSecondary} onClick={() => act({ action: "importPlayers", seasonId: season.id }, "Added any new players from the cards")}>
          Add from cards
        </button>
      </div>

      {POSITIONS.map((pos) => {
        const group = players.filter((p) => p.position === pos && p.isActive).sort((a, b) => a.name.localeCompare(b.name));
        return (
          <section key={pos}>
            <h2 className="flex items-center gap-2 text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
              {POSITION_LABEL[pos]}s <span className="text-zinc-600">{group.length}</span>
            </h2>
            {group.length === 0 ? (
              <p className="text-zinc-600 text-sm">None yet.</p>
            ) : (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 divide-y divide-zinc-800 overflow-hidden">
                {group.map((p) => <PlayerRow key={p.id} player={p} onClick={() => setEditing(p)} />)}
              </div>
            )}
          </section>
        );
      })}

      {left.length > 0 && (
        <section>
          <button onClick={() => setShowLeft(!showLeft)} className="h-11 text-zinc-400 text-sm font-semibold">
            {showLeft ? "▾" : "▸"} Left the squad ({left.length})
          </button>
          {showLeft && (
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 divide-y divide-zinc-800 overflow-hidden opacity-70">
              {left.map((p) => <PlayerRow key={p.id} player={p} onClick={() => setEditing(p)} />)}
            </div>
          )}
        </section>
      )}

      {editing && <PlayerSheet season={season} player={editing === "new" ? null : editing} act={act} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PlayerRow({ player, onClick }: { player: Player; onClick: () => void }) {
  const flagged = player.status !== "a";
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-3 py-2.5 text-left active:bg-zinc-800 touch-manipulation">
      <Avatar src={player.imageUrl} name={player.name} size={48} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white text-base font-bold truncate">{player.name}</span>
          <PositionTag position={player.position} />
        </div>
        {flagged ? (
          <div className="text-xs font-semibold truncate" style={{ color: PLAYER_STATUS[player.status].color }}>
            {PLAYER_STATUS[player.status].label}{player.news ? ` · ${player.news}` : ""}
          </div>
        ) : (
          <div className="text-zinc-500 text-xs">{player.isActive ? "Available" : "Left the squad"}</div>
        )}
      </div>
      <span className="text-zinc-600 text-xl">›</span>
    </button>
  );
}

function PlayerSheet({ season, player, act, onClose }: { season: Season; player: Player | null; act: Act; onClose: () => void }) {
  const [name, setName] = useState(player?.name ?? "");
  const [position, setPosition] = useState<FantasyPosition>(player?.position ?? "MID");
  const [status, setStatus] = useState<PlayerStatus>(player?.status ?? "a");
  const [news, setNews] = useState(player?.news ?? "");
  const [isActive, setIsActive] = useState(player?.isActive ?? true);
  const [imageUrl, setImageUrl] = useState(player?.imageUrl ?? "");
  const [price, setPrice] = useState(player ? (player.price / 10).toFixed(1) : "5.0");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await act({
      action: "savePlayer", id: player?.id, seasonId: season.id, name: name.trim(), position, status,
      news: status === "a" ? null : news.trim(), isActive, imageUrl: imageUrl.trim() || null,
      price: FANTASY_RULES.prices ? Math.round(Number(price) * 10) : player?.price ?? 0,
    }, player ? `${name.trim()} saved` : `${name.trim()} added`);
    setBusy(false);
    if (res) onClose();
  }

  return (
    <Sheet
      title={player ? player.name : "Add player"}
      onClose={onClose}
      footer={<button className={`${btnPrimary} flex-1`} disabled={busy || !name.trim()} onClick={save}>{player ? "Save" : "Add player"}</button>}
    >
      <div className="flex justify-center">
        <Avatar src={imageUrl.trim() || null} name={name || "?"} size={96} />
      </div>
      <div>
        <Label>Name</Label>
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Neymar" autoCapitalize="words" />
      </div>
      <div>
        <Label>Position</Label>
        <Segmented options={POSITIONS.map((p) => ({ value: p, label: p, className: POSITION_STYLE[p] }))} value={position} onChange={setPosition} />
      </div>
      {FANTASY_RULES.prices && (
        <div>
          <Label>Price (£m)</Label>
          <input className={field} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
      )}
      <div>
        <Label hint="Shows as a flag on the player in the app, like Fantasy Premier League.">Fitness</Label>
        <div className="flex flex-wrap gap-2">
          {STATUS_ORDER.map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)}
              className={`h-11 px-4 rounded-full text-sm font-bold border touch-manipulation ${status === s ? "bg-white text-black border-white" : "bg-zinc-900 text-zinc-300 border-zinc-800"}`}>
              <span className="inline-block w-2 h-2 rounded-full mr-2 align-middle" style={{ background: PLAYER_STATUS[s].color }} />
              {PLAYER_STATUS[s].label}
            </button>
          ))}
        </div>
        {status !== "a" && (
          <input className={`${field} mt-3`} value={news} onChange={(e) => setNews(e.target.value)} placeholder="e.g. Hamstring, 50% chance of playing" />
        )}
      </div>
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 px-4 py-2">
        <Switch checked={isActive} onChange={setIsActive} label="In the squad"
          hint="Switch off when someone leaves: fans who own them keep them, nobody else can pick them." />
      </div>
      <details className="text-sm">
        <summary className="h-11 flex items-center text-zinc-400 font-semibold cursor-pointer">Photo</summary>
        <input className={field} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="/cards/home/Name_Home.jpg" autoCapitalize="none" autoCorrect="off" />
        <p className="text-zinc-500 text-xs mt-1">Players imported from the cards already have their card photo.</p>
      </details>
    </Sheet>
  );
}
