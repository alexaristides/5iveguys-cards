"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { FantasyPitch, POSITION_BG, type PitchSlot } from "@/components/fantasy/FantasyPitch";
import {
  card, chipClass, FantasyShell, inputClass, panel, primaryButton, Spinner, type FantasyOverview, type FantasyPlayerRow,
} from "@/components/fantasy/FantasyShell";
import {
  buySquad, CHIP_IDS, CHIPS, entryError, FANTASY_RULES, formatCountdown, formatDeadline, formatPrice, PLAYER_STATUS, POSITION_LABEL,
  seasonHalf, transferCostFor, transfersBetween, type Chip, type FantasyPosition, type SquadPlayer,
} from "@/lib/fantasy";
import {
  autoComplete, changeFormation, EMPTY_LINEUP, FORMATIONS, formationLabel, inLineup, lineupFromPicks, lineupIds, lineupPositions, placePlayer,
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
    return <FantasyShell><p className={`${panel} text-ink-2`}>There&apos;s no gameweek open for picks right now. <Link href="/fantasy" className="text-violet-600 font-bold">Back</Link></p></FantasyShell>;
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

  const [start] = useState<Lineup>(() => (draft ? lineupFromPicks(draft.picks, players) : EMPTY_LINEUP));
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
  const byPrice = [...chosen].sort((a, b) => (players.get(b)?.price ?? 0) - (players.get(a)?.price ?? 0)
    || (players.get(b)?.totalPoints ?? 0) - (players.get(a)?.totalPoints ?? 0));
  const captainId = captain && chosen.includes(captain) ? captain : byPrice[0] ?? null;
  const viceId = vice && chosen.includes(vice) && vice !== captainId ? vice : byPrice.find((id) => id !== captainId) ?? null;

  const ids = lineupIds(lineup);
  const { bank } = buySquad(chosen, squad, opts);
  const made = transfersBetween(chosen, baseline);
  const free = team?.freeTransfers ?? null;
  const transferCost = transferCostFor(made, free, chip);
  const missing = FANTASY_RULES.squadSize - chosen.length;
  const ruleError = ids
    ? entryError({ playerIds: ids, positions: lineupPositions(lineup), captainId: captainId ?? "", viceCaptainId: viceId ?? "", chip }, squad, { ...opts, availableChips: available })
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
      body: JSON.stringify({ gameweek: gameweek.number, playerIds: ids, positions: lineupPositions(lineup), captainId, viceCaptainId: viceId, chip, ...(team ? {} : { name: name.trim() }) }),
    });
    setSaving(false);
    if (res.ok) onSaved();
    else setSaveError((await res.json().catch(() => ({}))).error ?? "Couldn't save your team.");
  }

  const slots: PitchSlot[] = slotPositions(lineup.formation).map((position, i) => {
    const p = players.get(lineup.slots[i] ?? "") ?? null;
    return {
      key: `s${i}`, position, player: p, caption: p ? (FANTASY_RULES.prices ? formatPrice(p.price) : `${p.totalPoints} pts`) : undefined,
      badge: p && p.id === captainId ? "C" : p && p.id === viceId ? "V" : null,
      fresh: !!p && !!baseline && !before.has(p.id),
      onClick: () => (lineup.slots[i] ? setMenu(i) : setPicking(i)),
    };
  });
  const menuPlayer = menu !== null ? lineup.slots[menu] : null;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-ink text-2xl sm:text-3xl font-black truncate">{team ? team.name : "Pick your team"}</h1>
        <div className="flex gap-4 text-sm font-bold shrink-0">
          <button onClick={() => { setLineup(start); setCaptain(draft?.captainId ?? null); setVice(draft?.viceCaptainId ?? null); setChip(draft?.chip ?? null); }} className="text-violet-600 hover:text-violet-700">Reset</button>
          <Link href="/fantasy" className="text-ink-3 hover:text-ink">Cancel</Link>
        </div>
      </div>
      <div className={`${card} flex items-center gap-3 p-3.5`}>
        <div className="flex-1 min-w-0">
          <div className="text-ink font-black">Gameweek {gameweek.number}{gameweek.name ? ` · ${gameweek.name}` : ""}</div>
          <div className="text-ink-2 text-sm">Deadline {formatDeadline(gameweek.deadline)}</div>
        </div>
        <span className="rounded-xl bg-amber-100 text-amber-700 font-black tabular-nums px-3 py-1.5">
          {formatCountdown(new Date(gameweek.deadline).getTime() - openedAt)}
        </span>
      </div>

      {!team && (
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" maxLength={30}
          className={`${inputClass} w-full h-[54px] text-lg font-extrabold`} />
      )}

      <div className={`grid ${FANTASY_RULES.prices ? "grid-cols-3" : "grid-cols-2"} gap-2 text-center`}>
        {FANTASY_RULES.prices && <Stat value={formatPrice(bank)} label="Money left" bad={bank < 0} />}
        <Stat value={free === null ? "∞" : String(free)} label="Free transfers" />
        <Stat value={transferCost ? `−${transferCost} pts` : "Free"} label={baseline ? plural(made, "transfer") : "Transfers"} bad={transferCost > 0} />
      </div>

      <div className="flex flex-wrap gap-2">
        {FORMATIONS.map((f) => (
          <button key={formationLabel(f)} onClick={() => setLineup(changeFormation(lineup, f, players))}
            className={chipClass(formationLabel(f) === formationLabel(lineup.formation))}>
            {formationLabel(f)}
          </button>
        ))}
        {missing > 0 && (
          <button onClick={() => setLineup(autoComplete(lineup, data.players, FANTASY_RULES.prices ? bank : Infinity))}
            className="h-[34px] px-3.5 rounded-full border border-violet-200 bg-violet-100 text-violet-700 hover:bg-violet-200 text-sm font-bold">
            Auto-fill ✨
          </button>
        )}
      </div>

      <FantasyPitch slots={slots} />
      <p className="text-ink-2 text-sm text-center">Click a player to make them captain or transfer them out. C = captain (double points), V = vice-captain.</p>

      <section className="space-y-2">
        <h2 className="text-ink text-xl font-black pt-2">Chips <span className="text-ink-3 text-base font-bold">optional</span></h2>
        <div className="grid grid-cols-2 gap-2">
          {CHIPS.map((c) => {
            const active = chip === c.id;
            const needsTeam = (c.id === "wildcard" || c.id === "free_hit") && !baseline;
            const blocked = !active && (needsTeam || !available.includes(c.id));
            const playedAt = team?.chipsPlayed.find((p) => p.chip === c.id && seasonHalf(p.gameweek, season.secondHalfFrom) === seasonHalf(gameweek.number, season.secondHalfFrom));
            return (
              <button key={c.id} disabled={blocked} onClick={() => setChip(active ? null : c.id)}
                className={`text-left rounded-2xl border-[1.5px] p-3 space-y-1 disabled:opacity-40 transition-colors ${active ? "border-yellow-400 bg-amber-100" : "border-lilac-line bg-white enabled:hover:border-violet-300"}`}>
                <div className="text-ink font-black">{c.emoji} {c.name}</div>
                <div className={`text-xs leading-snug ${active ? "text-amber-700 font-extrabold" : "text-ink-2"}`}>
                  {active ? "Playing this gameweek" : needsTeam ? "After your first deadline" : playedAt ? `Played in GW${playedAt.gameweek}` : c.description}
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-ink-3 text-xs">One chip a gameweek; you can cancel it until the deadline.{season.secondHalfFrom ? ` Chips come back from gameweek ${season.secondHalfFrom}.` : ""}</p>
      </section>

      <div className="sticky bottom-4 space-y-2">
        {(error || saveError) && <p className="text-center text-red-600 text-sm font-semibold bg-red-50/95 border border-red-100 rounded-xl py-1.5 px-3">{saveError ?? error}</p>}
        <button onClick={save} disabled={!!error || saving}
          className={`${primaryButton} w-full h-[52px] text-[17px] shadow-hero disabled:shadow-none`}>
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
          budgetLeft={FANTASY_RULES.prices ? moneyFor(picking) : Infinity}
          onPick={(id) => { setLineup(placePlayer(lineup, picking, id)); setPicking(null); }}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  );
}

function Stat({ value, label, bad }: { value: string; label: string; bad?: boolean }) {
  return (
    <div className={`${card} py-3 px-2`}>
      <div className={`text-xl font-black tabular-nums ${bad ? "text-red-600" : "text-ink"}`}>{value}</div>
      <div className="text-ink-3 text-xs font-semibold">{label}</div>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4 [color-scheme:light]" onClick={onClose}>
      <div className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-3xl bg-lilac p-4 space-y-3 shadow-2xl shadow-violet-950/20" onClick={(e) => e.stopPropagation()}>
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
        <div className="text-ink text-lg font-black">{player.name} · {POSITION_LABEL[player.position]}{FANTASY_RULES.prices ? ` · ${formatPrice(player.price)}` : ""}</div>
        <div className="text-ink-3 text-sm">{player.totalPoints} pts · form {player.form} · picked by {player.selectedBy}%</div>
        {player.status !== "a" && (
          <div className="text-sm font-semibold" style={{ color: PLAYER_STATUS[player.status].color }}>
            {PLAYER_STATUS[player.status].label}{player.news ? ` — ${player.news}` : ""}
          </div>
        )}
      </div>
      {actions.map((a) => (
        <button key={a.label} onClick={() => { a.run(); onClose(); }}
          className={`${card} w-full h-12 font-extrabold hover:bg-violet-50 transition-colors ${a.danger ? "text-red-600" : "text-ink"}`}>
          {a.label}
        </button>
      ))}
      <button onClick={onClose} className="w-full py-2 text-ink-3 font-bold hover:text-ink">Cancel</button>
    </Modal>
  );
}

function Picker({ position, players, taken, budgetLeft, onPick, onClose }: {
  position: FantasyPosition | null; players: FantasyPlayerRow[]; taken: Set<string>; budgetLeft: number;
  onPick: (id: string) => void; onClose: () => void;
}) {
  const [sort, setSort] = useState<"price" | "points" | "form" | "selected">(FANTASY_RULES.prices ? "price" : "points");
  const value = (p: FantasyPlayerRow) => (sort === "points" ? p.totalPoints : sort === "form" ? p.form : sort === "selected" ? p.selectedBy : p.price);
  const options = players
    // Anyone can play anywhere: players who naturally play here come first.
    .filter((p) => p.isActive && !taken.has(p.id))
    .sort((a, b) => Number(b.price <= budgetLeft) - Number(a.price <= budgetLeft)
      || Number(b.position === position) - Number(a.position === position) || value(b) - value(a));

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="text-ink text-xl font-black">{position ? `Pick your ${POSITION_LABEL[position].toLowerCase()}` : "Pick a player"}</h3>
        <button onClick={onClose} className="text-violet-600 font-extrabold">Cancel</button>
      </div>
      {position && (
        <p className="text-ink-2 text-sm">
          Anyone can play here, but they score as their own position. {POSITION_LABEL[position]}s are listed first.
        </p>
      )}
      {FANTASY_RULES.prices && <p className="text-ink-2 text-sm">You can spend up to {formatPrice(Math.max(0, budgetLeft))}.</p>}
      <div className="flex flex-wrap gap-2">
        {(FANTASY_RULES.prices ? (["price", "points", "form", "selected"] as const) : (["points", "form", "selected"] as const)).map((s) => (
          <button key={s} onClick={() => setSort(s)} className={chipClass(sort === s)}>
            {s === "price" ? "Price" : s === "points" ? "Points" : s === "form" ? "Form" : "Most picked"}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {options.map((p) => {
          const affordable = p.price <= budgetLeft;
          return (
            <button key={p.id} disabled={!affordable} onClick={() => onPick(p.id)}
              className={`${card} w-full flex items-center gap-3 rounded-2xl border-2 border-transparent enabled:hover:border-violet-300 disabled:opacity-40 p-2.5 text-left transition-colors`}>
              <div className="relative w-11 aspect-[785/1085] rounded-[7px] overflow-hidden bg-lilac-2 shrink-0">
                {p.imageUrl && <Image src={p.imageUrl} alt={p.name} fill sizes="44px" className="object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-ink text-[17px] font-black">{p.name}</div>
                <div className="text-ink-3 text-[13px] flex items-center gap-1.5">
                  <span className={`${POSITION_BG[p.position]} text-white font-black rounded px-1`}>{p.position}</span>
                  {p.totalPoints} pts · form {p.form} · {p.selectedBy}%
                </div>
                {p.status !== "a" && (
                  <div className="text-xs font-semibold" style={{ color: PLAYER_STATUS[p.status].color }}>
                    {PLAYER_STATUS[p.status].label}{p.news ? ` — ${p.news}` : ""}
                  </div>
                )}
              </div>
              {FANTASY_RULES.prices && <span className="text-right">
                <span className={`block font-black tabular-nums ${affordable ? "text-ink" : "text-red-600"}`}>{formatPrice(p.price)}</span>
                {p.priceChange !== 0 && (
                  <span className={`block text-[11px] font-bold ${p.priceChange > 0 ? "text-green-600" : "text-red-600"}`}>
                    {p.priceChange > 0 ? "▲" : "▼"} {(Math.abs(p.priceChange) / 10).toFixed(1)}
                  </span>
                )}
              </span>}
            </button>
          );
        })}
        {options.length === 0 && <p className="text-ink-3 text-sm">Everyone is already in your team.</p>}
      </div>
    </Modal>
  );
}
