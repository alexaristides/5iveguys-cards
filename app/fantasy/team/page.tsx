"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { FantasyPitch, POSITION_BG, type PitchSlot } from "@/components/fantasy/FantasyPitch";
import { FantasyShell, panel, Spinner, type FantasyOverview, type FantasyPlayerRow } from "@/components/fantasy/FantasyShell";
import {
  CHIPS, entryError, formatCountdown, formatDeadline, formatPrice, POSITION_LABEL, priceSquad, squadCost, transferCostFor,
  transfersBetween, type Chip, type FantasyPosition, type SquadPlayer,
} from "@/lib/fantasy";
import {
  autoComplete, changeFormation, EMPTY_LINEUP, FORMATIONS, formationLabel, inLineup, lineupFromIds, lineupIds, placePlayer,
  removePlayer, slotPositions, swapWithBench, type Lineup, type Slot,
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

  const [lineup, setLineup] = useState<Lineup>(() => (draft ? lineupFromIds(draft.picks.map((p) => p.playerId), players) : EMPTY_LINEUP));
  const [captain, setCaptain] = useState<string | null>(draft?.captainId ?? null);
  const [vice, setVice] = useState<string | null>(draft?.viceCaptainId ?? null);
  const [chip, setChip] = useState<Chip | null>(draft?.chip ?? null);
  const [name, setName] = useState("");
  const [menu, setMenu] = useState<Slot | null>(null);
  const [picking, setPicking] = useState<Slot | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());

  const starters = lineup.starters.filter((id): id is string => !!id);
  const byPrice = [...starters].sort((a, b) => (players.get(b)?.price ?? 0) - (players.get(a)?.price ?? 0));
  const captainId = captain && starters.includes(captain) ? captain : byPrice[0] ?? null;
  const viceId = vice && starters.includes(vice) && vice !== captainId ? vice : byPrice.find((id) => id !== captainId) ?? null;

  const chosen = [...inLineup(lineup)];
  const ids = lineupIds(lineup);
  const bank = season.budget - squadCost(priceSquad(chosen, squad, baseline));
  const made = transfersBetween(chosen, baseline);
  const free = team?.freeTransfers ?? null;
  const transferCost = transferCostFor(made, free, chip);
  const ruleError = ids
    ? entryError({ playerIds: ids, captainId: captainId ?? "", viceCaptainId: viceId ?? "", chip }, squad, { budget: season.budget, baseline, usedChips: team?.usedChips ?? [] })
    : `Pick ${9 - chosen.length} more player${9 - chosen.length === 1 ? "" : "s"}.`;
  const error = ruleError ?? (!team && name.trim().length < 2 ? "Give your team a name." : null);

  const salePrice = (id: string | null) => (id ? (baseline?.find((p) => p.playerId === id)?.price ?? players.get(id)?.price ?? 0) : 0);
  const slotPlayer = (s: Slot) => (s.kind === "starter" ? lineup.starters[s.index] : lineup.bench[s.index]);
  const slotPosition = (s: Slot): FantasyPosition | null => (s.kind === "starter" ? slotPositions(lineup.formation)[s.index] : null);
  const onSlot = (s: Slot) => (slotPlayer(s) ? setMenu(s) : setPicking(s));

  async function save() {
    if (!ids || error) return;
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

  const starterSlots: PitchSlot[] = slotPositions(lineup.formation).map((position, i) => {
    const p = players.get(lineup.starters[i] ?? "") ?? null;
    return {
      key: `s${i}`, position, player: p, caption: p ? formatPrice(salePrice(p.id)) : undefined,
      badge: p && p.id === captainId ? "C" : p && p.id === viceId ? "V" : null,
      onClick: () => onSlot({ kind: "starter", index: i }),
    };
  });
  const benchSlots: PitchSlot[] = lineup.bench.map((id, i) => {
    const p = players.get(id ?? "") ?? null;
    return { key: `b${i}`, position: null, player: p, caption: p ? formatPrice(salePrice(p.id)) : undefined, onClick: () => onSlot({ kind: "bench", index: i }) };
  });

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-white text-2xl font-black">{team ? team.name : "Pick your team"}</h1>
        <Link href="/fantasy" className="text-zinc-400 text-sm">Cancel</Link>
      </div>
      <p className="text-zinc-400 text-sm">
        Gameweek {gameweek.number}{gameweek.name ? ` · ${gameweek.name}` : ""} · deadline {formatDeadline(gameweek.deadline)} ({formatCountdown(new Date(gameweek.deadline).getTime() - openedAt)})
      </p>

      {!team && (
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" maxLength={30}
          className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white font-bold outline-none focus:border-purple-500" />
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat value={formatPrice(bank)} label="Bank" bad={bank < 0} />
        <Stat value={free === null ? "∞" : String(free)} label="Free transfers" />
        <Stat value={transferCost ? `-${transferCost} pts` : "Free"} label={baseline ? `${made} transfer${made === 1 ? "" : "s"}` : "Transfers"} bad={transferCost > 0} />
      </div>

      <div className="flex flex-wrap gap-2">
        {FORMATIONS.map((f) => (
          <button key={formationLabel(f)} onClick={() => setLineup(changeFormation(lineup, f, players))}
            className={`px-3 py-1.5 rounded-full border text-sm font-semibold ${formationLabel(f) === formationLabel(lineup.formation) ? "bg-purple-600 border-purple-600 text-white" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}>
            {formationLabel(f)}
          </button>
        ))}
        {chosen.length < 9 && (
          <button onClick={() => setLineup(autoComplete(lineup, data.players, season.budget, salePrice))}
            className="px-3 py-1.5 rounded-full border border-zinc-700 text-zinc-300 hover:border-zinc-500 text-sm font-semibold">
            Auto-fill ✨
          </button>
        )}
      </div>

      <FantasyPitch starters={starterSlots} bench={benchSlots} />
      <p className="text-zinc-500 text-xs text-center">Click a player to make them captain, swap them with a sub or replace them.</p>

      <section className="space-y-2">
        <h2 className="text-white text-lg font-extrabold">Chips</h2>
        <div className="grid grid-cols-2 gap-2">
          {CHIPS.map((c) => {
            const used = team?.usedChips.includes(c.id) ?? false;
            const blocked = used || (c.id === "wildcard" && !baseline);
            const active = chip === c.id;
            return (
              <button key={c.id} disabled={blocked} onClick={() => setChip(active ? null : c.id)}
                className={`text-left rounded-xl border p-3 disabled:opacity-40 ${active ? "border-amber-400 bg-amber-950/40" : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"}`}>
                <div className="text-white font-bold">{c.emoji} {c.name}</div>
                <div className={`text-xs ${active ? "text-amber-400" : "text-zinc-500"}`}>
                  {used ? "Used" : active ? "Active this week" : c.id === "wildcard" && !baseline ? "After gameweek 1" : c.description}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="sticky bottom-4 space-y-2">
        {(error || saveError) && <p className="text-center text-red-400 text-sm bg-[#0a0a0a]/90 rounded-lg py-1">{saveError ?? error}</p>}
        <button onClick={save} disabled={!!error || saving}
          className="w-full rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold py-3 shadow-lg shadow-black/50">
          {saving ? "Saving…" : team ? (made > 0 && baseline ? `Confirm ${made} transfer${made === 1 ? "" : "s"}` : "Save team") : "Create team"}
        </button>
      </div>

      {menu && slotPlayer(menu) && (
        <SlotMenu
          player={players.get(slotPlayer(menu)!)!}
          actions={[
            ...(menu.kind === "starter" ? [
              ...(slotPlayer(menu) !== captainId ? [{ label: "Make captain", run: () => { const id = slotPlayer(menu)!; setCaptain(id); if (vice === id) setVice(captainId); } }] : []),
              ...(slotPlayer(menu) !== viceId ? [{ label: "Make vice-captain", run: () => { const id = slotPlayer(menu)!; setVice(id); if (captain === id) setCaptain(viceId); } }] : []),
              ...lineup.bench.flatMap((sub, b) => {
                const swapped = sub ? swapWithBench(lineup, menu.index, b, players) : null;
                return swapped ? [{ label: `Swap with ${players.get(sub!)!.name}`, run: () => setLineup(swapped) }] : [];
              }),
            ] : lineup.bench[1 - menu.index] ? [{ label: "Swap sub order", run: () => setLineup({ ...lineup, bench: [lineup.bench[1], lineup.bench[0]] }) }] : []),
            { label: "Replace…", run: () => setPicking(menu) },
            { label: "Remove", danger: true, run: () => setLineup(removePlayer(lineup, slotPlayer(menu)!)) },
          ]}
          onClose={() => setMenu(null)}
        />
      )}

      {picking && (
        <Picker
          position={slotPosition(picking)}
          players={data.players}
          taken={inLineup(lineup)}
          budgetLeft={bank + salePrice(slotPlayer(picking))}
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
        <div className="text-zinc-500 text-sm">{player.totalPoints} pts this season · picked by {player.selectedBy}%</div>
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
  const [sort, setSort] = useState<"price" | "points" | "selected">("price");
  const options = players
    .filter((p) => p.isActive && !taken.has(p.id) && (!position || p.position === position))
    .sort((a, b) =>
      Number(b.price <= budgetLeft) - Number(a.price <= budgetLeft) ||
      (sort === "points" ? b.totalPoints - a.totalPoints : sort === "selected" ? b.selectedBy - a.selectedBy : b.price - a.price));

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="text-white text-lg font-black">{position ? `Pick a ${POSITION_LABEL[position].toLowerCase()}` : "Pick a sub"}</h3>
        <button onClick={onClose} className="text-purple-400 font-semibold">Cancel</button>
      </div>
      <p className="text-zinc-400 text-sm">You can spend up to {formatPrice(budgetLeft)}.</p>
      <div className="flex gap-2">
        {(["price", "points", "selected"] as const).map((s) => (
          <button key={s} onClick={() => setSort(s)}
            className={`px-3 py-1 rounded-full border text-sm ${sort === s ? "bg-purple-600 border-purple-600 text-white" : "border-zinc-700 text-zinc-300"}`}>
            {s === "price" ? "Price" : s === "points" ? "Points" : "Most picked"}
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
                  {p.totalPoints} pts · picked by {p.selectedBy}%
                </div>
              </div>
              <span className={`font-black tabular-nums ${affordable ? "text-white" : "text-red-400"}`}>{formatPrice(p.price)}</span>
            </button>
          );
        })}
        {options.length === 0 && <p className="text-zinc-500 text-sm">Everyone in that position is already in your team.</p>}
      </div>
    </Modal>
  );
}
