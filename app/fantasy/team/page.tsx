"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AppShell, ErrorText, primaryButton, secondaryButton, Spinner } from "@/components/AppShell";
import { FantasyPitch, type PitchSlot } from "@/components/fantasy/FantasyPitch";
import { PlayerSheet } from "@/components/fantasy/PlayerSheet";
import { PlayerPicker } from "@/components/fantasy/picker/PlayerPicker";
import { ActionSheet, AlertDialog, type AlertSpec, type SheetAction, type SheetSpec } from "@/components/fantasy/picker/sheets";
import { useLeaveGuard } from "@/components/fantasy/picker/useLeaveGuard";
import type { FantasyOverview } from "@/components/fantasy/types";
import {
  CHIP_IDS, CHIPS, entryError, FANTASY_RULES, formatCountdown, formatDeadline, PLAYER_STATUS, POSITION_LABEL, seasonHalf,
  transferCostFor, transfersBetween, type Chip, type SquadPlayer,
} from "@/lib/fantasy";
import {
  addPlayer, arrangeLineup, changeFormation, EMPTY_LINEUP, FORMATIONS, formationLabel, lineupFromPicks, lineupIds, lineupPositions,
  removePlayer, slotPositions, swapSlots, type Formation, type Lineup,
} from "@/lib/fantasy-lineup";

const SIZE = FANTASY_RULES.squadSize;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** Defensive to attacking: 4-1-1 … 2-1-3. */
const SHAPES = [...FORMATIONS].sort((a, b) => b.DEF - a.DEF || b.MID - a.MID);
const ROW_NAME = { GK: "in goal", DEF: "in defence", MID: "in midfield", FWD: "up front" } as const;

/** JSON from the site's API, failing with the server's error message like the app's api(). */
async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? undefined : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status})`);
  return data as T;
}

/**
 * Pick your team for the next gameweek, one step at a time, as in the app (mobile/src/app/fantasy/edit.tsx):
 * 7 players in a formation (lined up for you until you choose one or move someone), a captain, a team
 * name the first time, and optional chips. The big button always does the next step.
 */
export default function FantasyTeamPage() {
  const { status } = useSession();
  const [data, setData] = useState<FantasyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    api<FantasyOverview>("/api/fantasy").then(setData, (err: Error) => setError(err.message));
  }, [status]);

  if (!data) {
    return <AppShell title="Your team" back="/fantasy">{error ? <ErrorText>{error}</ErrorText> : <Spinner />}</AppShell>;
  }
  if (!data.season || data.nextGameweek === null) {
    return (
      <AppShell title="Your team" back="/fantasy">
        <p className="text-ink-2 text-[15px] leading-[21px]">There&apos;s no gameweek open for picks right now.</p>
      </AppShell>
    );
  }
  return <Editor data={data} />;
}

function Editor({ data }: { data: FantasyOverview }) {
  const router = useRouter();
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

  const [start] = useState<Lineup | null>(() => (draft ? lineupFromPicks(draft.picks, players) : null));
  const [lineup, setLineup] = useState<Lineup>(start ?? EMPTY_LINEUP);
  // A new team lines itself up around the players picked until the fan chooses a formation or moves
  // someone. A saved team keeps its formation, and new signings take the free spots.
  const [auto, setAuto] = useState(!start);
  const [captain, setCaptain] = useState<string | null>(draft?.captainId ?? null);
  const [vice, setVice] = useState<string | null>(draft?.viceCaptainId ?? null);
  const [chip, setChip] = useState<Chip | null>(draft?.chip ?? null);
  const [name, setName] = useState("");
  const [picking, setPicking] = useState(false);
  const [showChips, setShowChips] = useState(!!draft?.chip);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const [openedAt] = useState(() => Date.now());
  // The app's native pop-ups, drawn in the page.
  const [sheet, setSheet] = useState<SheetSpec | null>(null);
  const [alert, setAlert] = useState<AlertSpec | null>(null);
  const [statsFor, setStatsFor] = useState<string | null>(null);

  const ordered = useMemo(() => lineup.slots.filter((id): id is string => !!id), [lineup]);
  const picked = ordered;

  const captainId = captain && picked.includes(captain) ? captain : null;
  // The vice defaults to someone else in the team, but only once there's a captain to stand in for.
  const viceId = !captainId ? null : vice && picked.includes(vice) && vice !== captainId ? vice : ordered.find((id) => id !== captainId) ?? null;

  const ids = lineupIds(lineup);
  const made = transfersBetween(picked, baseline);
  const free = team?.freeTransfers ?? null;
  const transferCost = transferCostFor(made, free, chip);
  const before = new Set(baseline?.picks.slice(0, SIZE).map((p) => p.playerId) ?? []);
  const transfersOut = baseline ? [...before].filter((id) => !picked.includes(id)) : [];
  const transfersIn = baseline ? picked.filter((id) => !before.has(id)) : [];
  const error = ids && captainId && viceId
    ? entryError({ playerIds: ids, positions: lineupPositions(lineup), captainId, viceCaptainId: viceId, chip }, squad, { ...opts, availableChips: available })
    : null;
  const needsName = !team && name.trim().length < 2;
  const nameOf = (id: string) => players.get(id)?.name ?? "?";

  // Back (and any other link off the page) asks first while there are changes.
  useLeaveGuard(touched, (leave) => setAlert({
    title: "Leave without saving?",
    message: "Your changes haven't been saved.",
    buttons: [{ text: "Keep editing", style: "cancel" }, { text: "Leave", style: "destructive", onPress: leave }],
  }));
  const done = () => router.replace("/fantasy");

  function change<T>(set: (v: T) => void, v: T) {
    set(v);
    setTouched(true);
  }

  const without = (id: string) => (auto ? arrangeLineup(picked.filter((x) => x !== id), players) : removePlayer(lineup, id));

  function toggle(id: string) {
    if (picked.includes(id)) {
      change(setLineup, without(id));
      return;
    }
    if (picked.length >= SIZE) return;
    change(setLineup, auto ? arrangeLineup([...picked, id], players) : addPlayer(lineup, id, players));
    // That's the 7: back to the team, where the captain is the next step.
    if (picked.length + 1 === SIZE) setTimeout(() => setPicking(false), 350);
  }

  function makeCaptain(id: string) {
    if (viceId === id && captainId) setVice(captainId);
    change(setCaptain, id);
  }

  function makeVice(id: string) {
    if (captainId === id) setCaptain(viceId);
    change(setVice, id);
  }

  function chooseFrom(title: string, message: string, choose: (id: string) => void, except?: string | null) {
    const options = ordered.filter((id) => id !== except);
    setSheet({ title, message, actions: options.map((id) => ({ label: nameOf(id), run: () => choose(id) })) });
  }

  const chooseCaptain = () => chooseFrom("Who's your captain?", "Your captain scores double points.", makeCaptain);
  const chooseVice = () => chooseFrom("Who's your vice-captain?", "They score double if your captain doesn't play.", makeVice, captainId);

  function chooseFormation(f: Formation) {
    if (formationLabel(f) === formationLabel(lineup.formation)) return;
    setAuto(false);
    change(setLineup, changeFormation(lineup, f, players));
  }

  /** Move a player to another spot: swap with whoever is there (or into an empty spot). */
  function move(index: number) {
    const id = lineup.slots[index]!;
    const spots = slotPositions(lineup.formation).map((pos, j) => ({ j, pos })).filter(({ j }) => j !== index);
    setSheet({
      title: `Move ${nameOf(id)} to…`,
      message: `They still score as a ${POSITION_LABEL[players.get(id)!.position].toLowerCase()}, wherever they play.`,
      actions: spots.map(({ j, pos }) => ({
        label: lineup.slots[j] ? `Swap with ${nameOf(lineup.slots[j]!)} (${ROW_NAME[pos]})` : `Empty spot ${ROW_NAME[pos]}`,
        run: () => { setAuto(false); change(setLineup, swapSlots(lineup, index, j)); },
      })),
    });
  }

  function onSlot(index: number) {
    const id = lineup.slots[index];
    if (!id) { setPicking(true); return; }
    const p = players.get(id)!;
    const actions: SheetAction[] = [];
    if (id !== captainId) actions.push({ label: "Make captain (double points)", run: () => makeCaptain(id) });
    if (captainId && id !== captainId && id !== viceId) actions.push({ label: "Make vice-captain", run: () => makeVice(id) });
    actions.push({ label: "Swap for someone else", run: () => { change(setLineup, without(id)); setPicking(true); } });
    // Let the first sheet slide away before the second comes up, as on the phone.
    actions.push({ label: "Move to another spot", run: () => setTimeout(() => move(index), 300) });
    actions.push({ label: "See their stats", run: () => setStatsFor(id) });
    actions.push({ label: "Take out of my team", destructive: true, run: () => change(setLineup, without(id)) });

    setSheet({
      title: `${p.name} · ${POSITION_LABEL[p.position]}`,
      message: p.status !== "a"
        ? `${PLAYER_STATUS[p.status].label}${p.news ? ` — ${p.news}` : ""}`
        : `${plural(p.totalPoints, "point")} so far · in ${p.selectedBy}% of teams`,
      actions,
    });
  }

  function toggleChip(c: Chip) {
    change(setChip, chip === c ? null : c);
  }

  function reset() {
    setLineup(start ?? EMPTY_LINEUP);
    setAuto(!start);
    setCaptain(draft?.captainId ?? null);
    setVice(draft?.viceCaptainId ?? null);
    setChip(draft?.chip ?? null);
    setTouched(false);
  }

  async function submit(teamName = name) {
    if (!ids || !captainId || !viceId || error) return;
    setSaving(true);
    try {
      await api<FantasyOverview>("/api/fantasy/team", {
        gameweek: gameweek.number, playerIds: ids, positions: lineupPositions(lineup), captainId, viceCaptainId: viceId, chip,
        ...(team ? {} : { name: teamName.trim() }),
      });
      if (!team) {
        setAlert({
          title: "You're in! 🎉",
          message: `Your team is set for gameweek ${gameweek.number}. You can change it as much as you like until the deadline.`,
          buttons: [{ text: "Great", onPress: done }],
        });
      } else {
        done();
      }
    } catch (err) {
      setAlert({ title: "Couldn't save your team", message: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  /** New teams: ask for the name in a box, then save. */
  function askName() {
    setAlert({
      title: "Name your team",
      message: "Your mates will see it in the league tables.",
      prompt: name,
      buttons: [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save my team",
          onPress: (value) => {
            const v = value.trim();
            if (v.length < 2) return setAlert({ title: "Pick a longer name", message: "Your team name needs at least 2 letters." });
            change(setName, v);
            submit(v);
          },
        },
      ],
    });
  }

  function save() {
    if (!transfersIn.length) return submit();
    const names = (list: string[]) => list.map(nameOf).join(", ");
    setAlert({
      title: `Confirm ${plural(transfersIn.length, "change")}?`,
      message: `Out: ${names(transfersOut)}\nIn: ${names(transfersIn)}\n\n${transferCost ? `This costs ${transferCost} points.` : "It's free."}`,
      buttons: [{ text: "Cancel", style: "cancel" }, { text: "Confirm", onPress: () => submit() }],
    });
  }

  // The big button always does the next thing the team needs.
  let next: { label: string; hint?: string; bad?: boolean; action?: "pick" | "captain" | "name" | "save" };
  if (picked.length < SIZE) {
    next = {
      label: picked.length ? `Pick ${SIZE - picked.length} more player${SIZE - picked.length === 1 ? "" : "s"}` : `Pick your ${SIZE} players`,
      hint: `${picked.length} of ${SIZE} picked`,
      action: "pick",
    };
  } else if (!captainId) {
    next = { label: "Choose your captain", hint: "Your captain scores double points.", action: "captain" };
  } else if (needsName) {
    next = { label: "Name your team & save", hint: "Last step: give your team a name.", action: "name" };
  } else if (error) {
    next = { label: "Save my team", hint: error, bad: true };
  } else if (!touched && draft?.saved) {
    next = { label: "Team saved ✓", hint: `You can make changes until ${formatDeadline(gameweek.deadline)}.` };
  } else {
    next = {
      label: !team ? "Save my team"
        : transfersIn.length ? `Confirm ${plural(transfersIn.length, "change")}${transferCost ? ` (−${transferCost} pts)` : ""}`
          : "Save my team",
      hint: transferCost ? `${plural(transfersIn.length, "change")} with ${plural(free ?? 0, "free change")}: costs ${transferCost} points.` : undefined,
      bad: transferCost > 0,
      action: "save",
    };
  }

  function doNext() {
    if (next.action === "pick") setPicking(true);
    else if (next.action === "captain") chooseCaptain();
    else if (next.action === "name") askName();
    else if (next.action === "save") save();
  }

  const slots: PitchSlot[] = slotPositions(lineup.formation).map((position, i) => {
    const p = players.get(lineup.slots[i] ?? "") ?? null;
    return {
      key: `s${i}`, position, player: p,
      badge: p && p.id === captainId ? "C" : p && p.id === viceId ? "V" : null,
      fresh: !!p && !!baseline && !before.has(p.id),
      emptyLabel: "Add",
      onPress: () => onSlot(i),
    };
  });

  const stepPlayers = picked.length === SIZE;
  const stepCaptain = stepPlayers && !!captainId;

  return (
    <AppShell
      title={team ? team.name : "Pick your team"}
      back="/fantasy"
      right={touched ? <button type="button" onClick={reset} className="text-violet-600 hover:text-violet-700 text-[16px] font-bold">Undo</button> : null}
      footer={
        <div className="flex flex-col gap-2">
          {next.hint ? <p className={`text-center text-[13px] font-semibold ${next.bad ? "text-red-600" : "text-ink-2"}`}>{next.hint}</p> : null}
          <Button title={next.label} onPress={doNext} loading={saving} disabled={!next.action} />
        </div>
      }
    >
      {/* One child, so the app's own spacing applies rather than the shell's (and the pop-ups get no margin). */}
      <div>
        <div className="flex items-center gap-3 rounded-[18px] bg-white p-3.5 shadow-card">
          <div className="min-w-0 flex-1">
            <p className="text-ink text-[16px] font-black">Gameweek {gameweek.number}{gameweek.name ? ` · ${gameweek.name}` : ""}</p>
            <p className="mt-0.5 text-ink-2 text-[14px]">Locks {formatDeadline(gameweek.deadline)}</p>
          </div>
          <span className="rounded-xl bg-amber-100 px-3 py-[7px] text-amber-700 text-[15px] font-black tabular-nums">
            {formatCountdown(new Date(gameweek.deadline).getTime() - openedAt)}
          </span>
        </div>

        {baseline && free !== null && <Transfers made={made} free={free} cost={transferCost} chip={chip} />}

        <Step n={1} done={stepPlayers} title={`Pick ${SIZE} players`} right={<span className="text-violet-600 text-[16px] font-black tabular-nums">{picked.length}/{SIZE}</span>}>
          Any {SIZE} of the 5ive Guys, in any formation. Tap a player to swap or move them. Everyone scores as their own position.
        </Step>
        <div role="radiogroup" aria-label="Formation" className="mb-3 flex gap-1.5">
          {SHAPES.map((f) => {
            const label = formationLabel(f);
            const on = label === formationLabel(lineup.formation);
            return (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`Formation ${label}`}
                onClick={() => chooseFormation(f)}
                className={`h-10 min-w-0 flex-1 rounded-xl border-[1.5px] text-[15px] font-black tabular-nums transition-colors ${
                  on ? "border-violet-600 bg-violet-600 text-white" : "border-lilac-line bg-white text-ink hover:border-violet-300 active:opacity-70"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <FantasyPitch slots={slots} />
        <Button
          title={picked.length ? "Change players" : `Choose your ${SIZE} players`}
          variant={picked.length ? "secondary" : "primary"}
          onPress={() => setPicking(true)}
          className="mt-3"
        />

        <Step n={2} done={stepCaptain} title="Choose your captain">
          Your captain scores double points. If they don&apos;t play, your vice-captain does instead.
        </Step>
        {ordered.length ? (
          <>
            <div className="flex gap-3 overflow-x-auto py-1 pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {ordered.map((id) => {
                const p = players.get(id)!;
                const isCaptain = id === captainId;
                const isVice = id === viceId;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => makeCaptain(id)}
                    aria-label={`${p.name}${isCaptain ? ", captain" : ", make captain"}`}
                    className="relative flex w-[70px] shrink-0 flex-col items-center gap-1.5 active:opacity-70"
                  >
                    <span className={`relative block h-[62px] w-[62px] overflow-hidden rounded-full border-[3px] bg-lilac-2 shadow-card ${isCaptain ? "border-yellow-400" : "border-white"}`}>
                      {p.imageUrl && <Image src={p.imageUrl} alt="" fill sizes="62px" className="object-cover object-top" />}
                    </span>
                    {isCaptain || isVice ? (
                      <span
                        className={`absolute top-10 right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[#111] text-[12px] font-black ${
                          isCaptain ? "bg-yellow-400" : "bg-gray-200"
                        }`}
                      >
                        {isCaptain ? "C" : "V"}
                      </span>
                    ) : null}
                    <span className={`max-w-full truncate text-[12px] ${isCaptain ? "text-ink font-black" : "text-ink-2 font-bold"}`}>{p.name}</span>
                  </button>
                );
              })}
            </div>
            {captainId && viceId ? (
              <button type="button" onClick={chooseVice} className="mt-2.5 flex w-full items-center gap-2.5 text-left">
                <span className="min-w-0 flex-1 truncate text-ink-2 text-[14px]">
                  Captain <strong className="text-ink font-black">{nameOf(captainId)}</strong> · Vice <strong className="text-ink font-black">{nameOf(viceId)}</strong>
                </span>
                <span className="text-violet-600 text-[15px] font-extrabold">Change vice</span>
              </button>
            ) : (
              <p className={stepHint}>Tap a player to make them captain.</p>
            )}
          </>
        ) : (
          <p className={stepHint}>Pick your players first.</p>
        )}

        {!team && (
          <>
            <Step n={3} done={!needsName} title="Name your team">Your mates will see it in the league tables.</Step>
            <input
              value={name}
              onChange={(e) => change(setName, e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              placeholder="e.g. Sunday Legends"
              maxLength={30}
              autoCapitalize="words"
              enterKeyHint="done"
              aria-label="Team name"
              className="h-[54px] w-full rounded-2xl border-[1.5px] border-lilac-line bg-white px-4 text-ink text-[18px] font-extrabold outline-none placeholder:text-ink-3 focus:border-violet-500"
            />
          </>
        )}

        <button
          type="button"
          onClick={() => setShowChips((s) => !s)}
          aria-expanded={showChips}
          className="mt-[26px] mb-2.5 flex w-full items-center gap-3 rounded-[18px] bg-white p-3.5 text-left shadow-card"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-ink text-[17px] font-black">Chips <span className="text-ink-3 font-bold">· optional</span></span>
            <span className={`block ${stepHint}`}>{chip ? `${CHIPS.find((c) => c.id === chip)!.name} is on this gameweek.` : "Power-ups you can play once in a while."}</span>
          </span>
          <span className="text-violet-600 text-[15px] font-extrabold">{showChips ? "Hide" : "Show"}</span>
        </button>
        {showChips && (
          <>
            <div className="mb-2 grid grid-cols-2 gap-2">
              {CHIPS.map((c) => {
                const active = chip === c.id;
                const needsTeam = (c.id === "wildcard" || c.id === "free_hit") && !baseline;
                const playedAt = team?.chipsPlayed.find((p) => p.chip === c.id && seasonHalf(p.gameweek, season.secondHalfFrom) === seasonHalf(gameweek.number, season.secondHalfFrom));
                const blocked = !active && (needsTeam || !available.includes(c.id));
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={blocked}
                    onClick={() => toggleChip(c.id)}
                    aria-pressed={active}
                    className={`flex flex-col gap-1 rounded-2xl border-[1.5px] p-3 text-left disabled:opacity-[0.45] ${
                      active ? "border-yellow-400 bg-amber-100" : "border-lilac-line bg-white"
                    }`}
                  >
                    <span className="text-ink text-[15px] font-black">{c.emoji} {c.name}</span>
                    <span className="text-ink-2 text-[12px] leading-4">{c.description}</span>
                    <span className={`mt-0.5 text-[12px] font-extrabold ${active ? "text-amber-700" : "text-violet-600"}`}>
                      {active ? "✓ On this gameweek" : needsTeam ? "From your second gameweek" : playedAt ? `Used in gameweek ${playedAt.gameweek}` : "Tap to play it"}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className={stepHint}>
              One chip a gameweek, and you can cancel it until the deadline.
              {season.secondHalfFrom ? ` They all come back from gameweek ${season.secondHalfFrom}.` : ""}
            </p>
          </>
        )}

        <PlayerPicker visible={picking} players={data.players} picked={picked} onToggle={toggle} onClose={() => setPicking(false)} />
        <ActionSheet sheet={sheet} onClose={() => setSheet(null)} />
        <AlertDialog alert={alert} onClose={() => setAlert(null)} />
        {statsFor && <PlayerSheet playerId={statsFor} onClose={() => setStatsFor(null)} />}
      </div>
    </AppShell>
  );
}

const stepHint = "text-ink-2 text-[14px] leading-5";

/** The app's Button: primary or secondary, a spinner in place of the title while it works. */
function Button({ title, onPress, variant = "primary", disabled, loading, className = "" }: {
  title: string; onPress: () => void; variant?: "primary" | "secondary"; disabled?: boolean; loading?: boolean; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={loading ? undefined : onPress}
      disabled={disabled}
      aria-busy={loading || undefined}
      className={`${variant === "secondary" ? secondaryButton : primaryButton} flex w-full items-center justify-center active:opacity-[0.85] ${className}`}
    >
      {loading ? (
        <span className={`h-5 w-5 animate-spin rounded-full border-2 border-t-transparent ${variant === "secondary" ? "border-violet-600" : "border-white"}`} aria-label="Saving" />
      ) : title}
    </button>
  );
}

function Step({ n, done, title, right, children }: { n: number; done: boolean; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-[22px] mb-3 flex flex-col gap-1">
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[14px] font-black ${
            done ? "border-green-600 bg-green-600 text-white" : "border-violet-600 text-violet-600"
          }`}
        >
          {done ? "✓" : n}
        </span>
        <h2 className="flex-1 text-ink text-[20px] font-black">{title}</h2>
        {right}
      </div>
      <p className={stepHint}>{children}</p>
    </div>
  );
}

function Transfers({ made, free, cost, chip }: { made: number; free: number; cost: number; chip: Chip | null }) {
  const unlimited = chip === "wildcard" || chip === "free_hit";
  const text = unlimited ? `${CHIPS.find((c) => c.id === chip)!.name} is on: every change is free this gameweek.`
    : made === 0 ? `You have ${plural(free, "free change")} this gameweek. Each extra one costs ${FANTASY_RULES.transferCost} points.`
      : cost ? `${plural(made, "change")}, ${free} free: that costs ${cost} points.`
        : `${plural(made, "change")}: free ✓`;
  return (
    <div className={`mt-2.5 rounded-[14px] p-3 ${cost > 0 ? "bg-red-100" : "bg-violet-100"}`}>
      <p className={`whitespace-pre-wrap text-[14px] font-bold leading-[19px] ${cost > 0 ? "text-red-600" : "text-violet-600"}`}>🔁  {text}</p>
    </div>
  );
}
