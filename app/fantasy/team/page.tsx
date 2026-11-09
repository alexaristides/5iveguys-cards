"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { FantasyPitch, POSITION_BG, type PitchSlot } from "@/components/fantasy/FantasyPitch";
import { FantasyShell, panel, Spinner, type FantasyOverview, type FantasyPlayerRow } from "@/components/fantasy/FantasyShell";
import {
  buySquad, CHIP_IDS, CHIPS, entryError, FANTASY_RULES, formatCountdown, formatDeadline, formatPrice, PLAYER_STATUS, POSITION_LABEL,
  seasonHalf, transferCostFor, transfersBetween, type Chip, type FantasyPosition, type SquadPlayer,
} from "@/lib/fantasy";
import {
  autoComplete, changeFormation, EMPTY_LINEUP, FORMATIONS, formationLabel, inLineup, lineupFromIds, lineupIds, placePlayer,
  removePlayer, slotPositions, type Lineup,
} from "@/lib/fantasy-lineup";

/** Pick your team for the next gameweek on the website. */
export default function FantasyTeamPage() {
  const { status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<FantasyOverview | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/fantasy");
    if (status === "authenticated") fetch("/api/fantasy").then((r) => r.json()).then(setData);
  }, [status, router]);

  if (!data) return <FantasyShell><Spinner /></FantasyShell>;
  if (!data.season || data.nextGameweek === null) {
    return <FantasyShell><p className="text-zinc-400">There&apos;s no gameweek open for picks right now. <Link href="/fantasy" className="text-purple-400">Back</Link></p></FantasyShell>;
  }
  return <FantasyShell><Editor data={data} onSaved={() => router.push("/fantasy")} /></FantasyShell>;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Editor({ data, onSaved }: { data: FantasyOverview; onSaved: () => void }) {
  const season = data.season!;
  const team = data.team;
  const gameweek = data.gameweeks.find((g) => g.number === data.nextGameweek)!;
  const players = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players]);
  const squad = useMemo(
    () => new Map<string, SquadPlayer>(data.players.map((p) => [p.id, { id: p.id, position: p.position, price: p.price, isActive: p.isActive }])),
    [data.players],
  );
  const baseline = team?.baseline ?? null;
  const draft = team?.draft ?? null;
  const opts = { budget: season.budget, from: baseline, draft: draft?.saved ? draft.picks : null };
  const available = team?.availableChips ?? CHIP_IDS;

  const [start] = useState<Lineup>(() => (draft ? lineupFromIds(draft.picks.map((p) => p.playerId), players) : EMPTY_LINEUP));
  const [lineup, setLineup] = useState<Lineup>(start);
  const [captain, setCaptain] = useState<string | null>(draft?.captainId ?? null);
  const [vice, setVice] = useState<string | null>(draft?.viceCaptainId ?? null);
  const [chip, setChip] = useState<Chip | null>(draft?.chip ?? null);
  const [name, setName] = useState("");
  const [menu, setMenu] = useState<number | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());

  const chosen = [...inLineup(lineup)];
  const byPrice = [...chosen].sort((a, b) => (players.get(b)?.price ?? 0) - (players.get(a)?.price ?? 0));
  const captainId = captain && chosen.includes(captain) ? captain : byPrice[0] ?? null;
  const viceId = vice && chosen.includes(vice) && vice !== captainId ? vice : byPrice.find((id) => id !== captainId) ?? null;

  const ids = lineupIds(lineup);
  const { bank } = buySquad(chosen, squad, opts);
  const made = transfersBetween(chosen, baseline);
  const free = team?.freeTransfers ?? null;
  const transferCost = transferCostFor(made, free, chip);
  const missing = FANTASY_RULES.squadSize - chosen.length;
  const ruleError = ids
    ? entryError({ playerIds: ids, captainId: captainId ?? "", viceCaptainId: viceId ?? "", chip }, squad, { ...opts, availableChips: available })
    : `Pick ${plural(missing, "more player")}.`;
  const error = ruleError ?? (!team && name.trim().length < 2 ? "Give your team a name." : null);

  const before = new Set(baseline?.picks.map((p) => p.playerId) ?? []);
  const transfersOut = baseline ? baseline.picks.map((p) => p.playerId).filter((id) => !chosen.includes(id)) : [];
  const transfersIn = baseline ? chosen.filter((id) => !before.has(id)) : [];
  const moneyFor = (index: number) => {
    const current = lineup.slots[index];
    return current ? buySquad(chosen.filter((id) => id !== current), squad, opts).bank : bank;
  };

  async function save() {
    if (!ids || error) return;
    if (transfersIn.length) {
      const names = (list: string[]) => list.map((id) => players.get(id)?.name ?? "?").join(", ");
      const ok = confirm(`Confirm ${plural(transfersIn.length, "transfer")}?\n\nOut: ${names(transfersOut)}\nIn: ${names(transfersIn)}\n\n${transferCost ? `This costs ${transferCost} points.` : "No points deducted."}`);
      if (!ok) return;
    }
    setSaving(true);
    setSaveError(null);
    const res = await fetch("/api/fantasy/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameweek: gameweek.number, playerIds: ids, captainId, viceCaptainId: viceId, chip, ...(team ? {} : { name: name.trim() }) }),
    });
    setSaving(false);
    if (res.ok) onSaved();
    else setSaveError((await res.json().catch(() => ({}))).error ?? "Couldn't save your team.");
  }

  const slots: PitchSlot[] = slotPositions(lineup.formation).map((position, i) => {
    const p = players.get(lineup.slots[i] ?? "") ?? null;
    return {
      key: `s${i}`, position, player: p, caption: p ? formatPrice(p.price) : undefined,
      badge: p && p.id === captainId ? "C" : p && p.id === viceId ? "V" : null,
      fresh: !!p && !!baseline && !before.has(p.id),
      onClick: () => (lineup.slots[i] ? setMenu(i) : setPicking(i)),
    };
  });
  const menuPlayer = menu !== null ? lineup.slots[menu] : null;

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-white text-2xl font-black">{team ? team.name : "Pick your team"}</h1>
        <div className="flex gap-4 text-sm">
          <button onClick={() => { setLineup(start); setCaptain(draft?.captainId ?? null); setVice(draft?.viceCaptainId ?? null); setChip(draft?.chip ?? null); }} className="text-zinc-400 hover:text-white">Reset</button>
          <Link href="/fantasy" className="text-zinc-400 hover:text-white">Cancel</Link>
        </div>
      </div>
      <p className="text-zinc-400 text-sm">
        Gameweek {gameweek.number}{gameweek.name ? ` · ${gameweek.name}` : ""} · deadline {formatDeadline(gameweek.deadline)} ({formatCountdown(new Date(gameweek.deadline).getTime() - openedAt)})
      </p>

      {!team && (
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" maxLength={30}
          className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white font-bold outline-none focus:border-purple-500" />
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat value={formatPrice(bank)} label="Money left" bad={bank < 0} />
        <Stat value={free === null ? "∞" : String(free)} label="Free transfers" />
        <Stat value={transferCost ? `−${transferCost} pts` : "Free"} label={baseline ? plural(made, "transfer") : "Transfers"} bad={transferCost > 0} />
      </div>

      <div className="flex flex-wrap gap-2">
        {FORMATIONS.map((f) => (
          <button key={formationLabel(f)} onClick={() => setLineup(changeFormation(lineup, f, players))}
            className={`px-3 py-1.5 rounded-full border text-sm font-semibold ${formationLabel(f) === formationLabel(lineup.formation) ? "bg-purple-600 border-purple-600 text-white" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}>
            {formationLabel(f)}
          </button>
        ))}
        {missing > 0 && (
          <button onClick={() => setLineup(autoComplete(lineup, data.players, bank))}
            className="px-3 py-1.5 rounded-full border border-zinc-700 text-zinc-300 hover:border-zinc-500 text-sm font-semibold">
            Auto-fill ✨
          </button>
        )}
      </div>

      <FantasyPitch slots={slots} />
      <p className="text-zinc-500 text-xs text-center">Click a player to make them captain or transfer them out.</p>

      <section className="space-y-2">
        <h2 className="text-white text-lg font-extrabold">Chips</h2>
        <div className="grid grid-cols-2 gap-2">
          {CHIPS.map((c) => {
            const active = chip === c.id;
            const needsTeam = (c.id === "wildcard" || c.id === "free_hit") && !baseline;
            const blocked = !active && (needsTeam || !available.includes(c.id));
            const playedAt = team?.chipsPlayed.find((p) => p.chip === c.id && seasonHalf(p.gameweek, season.secondHalfFrom) === seasonHalf(gameweek.number, season.secondHalfFrom));
            return (
              <button key={c.id} disabled={blocked} onClick={() => setChip(active ? null : c.id)}
                className={`text-left rounded-xl border p-3 disabled:opacity-40 ${active ? "border-amber-400 bg-amber-950/40" : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"}`}>
                <div className="text-white font-bold">{c.emoji} {c.name}</div>
                <div className={`text-xs ${active ? "text-amber-400" : "text-zinc-500"}`}>
                  {active ? "Playing this gameweek" : needsTeam ? "After your first deadline" : playedAt ? `Played in GW${playedAt.gameweek}` : c.description}
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-zinc-500 text-xs">One chip a gameweek; you can cancel it until the deadline.{season.secondHalfFrom ? ` Chips come back from gameweek ${season.secondHalfFrom}.` : ""}</p>
      </section>

      <div className="sticky bottom-4 space-y-2">
        {(error || saveError) && <p className="text-center text-red-400 text-sm bg-[#0a0a0a]/90 rounded-lg py-1">{saveError ?? error}</p>}
        <button onClick={save} disabled={!!error || saving}
          className="w-full rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold py-3 shadow-lg shadow-black/50">
          {saving ? "Saving…" : !team ? "Create team" : transfersIn.length ? `Confirm ${plural(transfersIn.length, "transfer")}${transferCost ? ` (−${transferCost} pts)` : ""}` : "Save team"}
        </button>
      </div>

      {menu !== null && menuPlayer && (
        <SlotMenu
          player={players.get(menuPlayer)!}
          actions={[
            ...(menuPlayer !== captainId ? [{ label: "Make captain", run: () => { setCaptain(menuPlayer); if (viceId === menuPlayer) setVice(captainId); } }] : []),
            ...(menuPlayer !== viceId ? [{ label: "Make vice-captain", run: () => { setVice(menuPlayer); if (captainId === menuPlayer) setCaptain(viceId); } }] : []),
            { label: baseline && before.has(menuPlayer) ? "Transfer out…" : "Replace…", run: () => setPicking(menu) },
            { label: "Remove", danger: true, run: () => setLineup(removePlayer(lineup, menuPlayer)) },
          ]}
          onClose={() => setMenu(null)}
        />
      )}

      {picking !== null && (
        <Picker
          position={slotPositions(lineup.formation)[picking]}
          players={data.players}
          taken={inLineup(lineup)}
          budgetLeft={moneyFor(picking)}
          onPick={(id) => { setLineup(placePlayer(lineup, picking, id)); setPicking(null); }}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  );
}

function Stat({ value, label, bad }: { value: string; label: string; bad?: boolean }) {
  return (
    <div className={`${panel} py-3 px-2`}>
      <div className={`text-lg font-black tabular-nums ${bad ? "text-red-400" : "text-white"}`}>{value}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function SlotMenu({ player, actions, onClose }: {
  player: FantasyPlayerRow; actions: { label: string; run: () => void; danger?: boolean }[]; onClose: () => void;
}) {
  return (
    <Modal onClose={onClose}>
      <div>
        <div className="text-white font-bold">{player.name} · {POSITION_LABEL[player.position]} · {formatPrice(player.price)}</div>
        <div className="text-zinc-500 text-sm">{player.totalPoints} pts · form {player.form} · picked by {player.selectedBy}%</div>
        {player.status !== "a" && (
          <div className="text-sm font-semibold" style={{ color: PLAYER_STATUS[player.status].color }}>
            {PLAYER_STATUS[player.status].label}{player.news ? ` — ${player.news}` : ""}
          </div>
        )}
      </div>
      {actions.map((a) => (
        <button key={a.label} onClick={() => { a.run(); onClose(); }}
          className={`w-full rounded-xl bg-zinc-800 hover:bg-zinc-700 py-2.5 font-semibold ${a.danger ? "text-red-400" : "text-white"}`}>
          {a.label}
        </button>
      ))}
      <button onClick={onClose} className="w-full py-2 text-zinc-400">Cancel</button>
    </Modal>
  );
}

function Picker({ position, players, taken, budgetLeft, onPick, onClose }: {
  position: FantasyPosition | null; players: FantasyPlayerRow[]; taken: Set<string>; budgetLeft: number;
  onPick: (id: string) => void; onClose: () => void;
}) {
  const [sort, setSort] = useState<"price" | "points" | "form" | "selected">("price");
  const value = (p: FantasyPlayerRow) => (sort === "points" ? p.totalPoints : sort === "form" ? p.form : sort === "selected" ? p.selectedBy : p.price);
  const options = players
    .filter((p) => p.isActive && !taken.has(p.id) && (!position || p.position === position))
    .sort((a, b) => Number(b.price <= budgetLeft) - Number(a.price <= budgetLeft) || value(b) - value(a));

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="text-white text-lg font-black">{position ? `Pick a ${POSITION_LABEL[position].toLowerCase()}` : "Pick a player"}</h3>
        <button onClick={onClose} className="text-purple-400 font-semibold">Cancel</button>
      </div>
      <p className="text-zinc-400 text-sm">You can spend up to {formatPrice(Math.max(0, budgetLeft))}.</p>
      <div className="flex gap-2">
        {(["price", "points", "form", "selected"] as const).map((s) => (
          <button key={s} onClick={() => setSort(s)}
            className={`px-3 py-1 rounded-full border text-sm ${sort === s ? "bg-purple-600 border-purple-600 text-white" : "border-zinc-700 text-zinc-300"}`}>
            {s === "price" ? "Price" : s === "points" ? "Points" : s === "form" ? "Form" : "Most picked"}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {options.map((p) => {
          const affordable = p.price <= budgetLeft;
          return (
            <button key={p.id} disabled={!affordable} onClick={() => onPick(p.id)}
              className="w-full flex items-center gap-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 p-2 text-left">
              <div className="relative w-9 aspect-[785/1085] rounded overflow-hidden bg-zinc-700 shrink-0">
                {p.imageUrl && <Image src={p.imageUrl} alt={p.name} fill sizes="36px" className="object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-bold">{p.name}</div>
                <div className="text-zinc-500 text-xs flex items-center gap-1.5">
                  <span className={`${POSITION_BG[p.position]} text-white font-black rounded px-1`}>{p.position}</span>
                  {p.totalPoints} pts · form {p.form} · {p.selectedBy}%
                </div>
                {p.status !== "a" && (
                  <div className="text-xs font-semibold" style={{ color: PLAYER_STATUS[p.status].color }}>
                    {PLAYER_STATUS[p.status].label}{p.news ? ` — ${p.news}` : ""}
                  </div>
                )}
              </div>
              <span className="text-right">
                <span className={`block font-black tabular-nums ${affordable ? "text-white" : "text-red-400"}`}>{formatPrice(p.price)}</span>
                {p.priceChange !== 0 && (
                  <span className={`block text-[11px] font-bold ${p.priceChange > 0 ? "text-green-400" : "text-red-400"}`}>
                    {p.priceChange > 0 ? "▲" : "▼"} {(Math.abs(p.priceChange) / 10).toFixed(1)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
        {options.length === 0 && <p className="text-zinc-500 text-sm">Everyone in that position is already in your team.</p>}
      </div>
    </Modal>
  );
}
