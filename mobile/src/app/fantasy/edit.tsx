import { useMemo, useState, type ReactNode } from "react";
import { ActionSheetIOS, Alert, Modal, Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import {
  CHIP_IDS, CHIPS, entryError, FANTASY_RULES, PLAYER_STATUS, POSITION_LABEL, POSITIONS, seasonHalf,
  transferCostFor, transfersBetween, type Chip, type SquadPlayer,
} from "@shared/fantasy";
import { FantasyPitch, type PitchSlot } from "@/components/fantasy/FantasyPitch";
import { Screen } from "@/components/Screen";
import { Button, ErrorText, Loading } from "@/components/ui";
import { api } from "@/lib/api";
import { arrangeLineup, formatCountdown, formatDeadline, lineupFromPicks, lineupIds, lineupPositions, slotPositions } from "@/lib/fantasy";
import { imageUri } from "@/lib/images";
import { useFantasy } from "@/lib/queries";
import { colors, POSITION_COLOR, shadow } from "@/lib/theme";
import type { FantasyOverview, FantasyPlayer } from "@/lib/types";

const SIZE = FANTASY_RULES.squadSize;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Pick your team for the next gameweek, one step at a time: 7 players (lined up for you), a
 * captain, a team name the first time, and optional chips. The big button always does the next step.
 */
export default function FantasyEditScreen() {
  const fantasy = useFantasy();
  if (!fantasy.data) {
    return <Screen title="Your team">{fantasy.error ? <ErrorText>{fantasy.error.message}</ErrorText> : <Loading />}</Screen>;
  }
  if (!fantasy.data.season || fantasy.data.nextGameweek === null) {
    return <Screen title="Your team"><Text style={styles.muted}>There&apos;s no gameweek open for picks right now.</Text></Screen>;
  }
  return <Editor data={fantasy.data} />;
}

function Editor({ data }: { data: FantasyOverview }) {
  const queryClient = useQueryClient();
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

  // The saved team keeps its layout until its players change; then the app lines them up again.
  const [start] = useState(() => (draft ? lineupFromPicks(draft.picks, players) : null));
  const startIds = useMemo(() => (start?.slots.filter((id): id is string => !!id) ?? []), [start]);
  const [picked, setPicked] = useState<string[]>(startIds);
  const [captain, setCaptain] = useState<string | null>(draft?.captainId ?? null);
  const [vice, setVice] = useState<string | null>(draft?.viceCaptainId ?? null);
  const [chip, setChip] = useState<Chip | null>(draft?.chip ?? null);
  const [name, setName] = useState("");
  const [picking, setPicking] = useState(false);
  const [showChips, setShowChips] = useState(!!draft?.chip);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const [openedAt] = useState(() => Date.now());

  const unchanged = !!start && picked.length === startIds.length && picked.every((id) => startIds.includes(id));
  const lineup = unchanged ? start! : arrangeLineup(picked, players);
  const ordered = lineup.slots.filter((id): id is string => !!id);

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

  function change<T>(set: (v: T) => void, v: T) {
    set(v);
    setTouched(true);
  }

  function toggle(id: string) {
    if (picked.includes(id)) {
      Haptics.selectionAsync();
      change(setPicked, picked.filter((x) => x !== id));
      return;
    }
    if (picked.length >= SIZE) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    const next = [...picked, id];
    change(setPicked, next);
    if (next.length === SIZE) {
      // That's the 7: back to the team, where the captain is the next step.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setPicking(false), 350);
    } else {
      Haptics.selectionAsync();
    }
  }

  function makeCaptain(id: string) {
    Haptics.selectionAsync();
    if (viceId === id && captainId) setVice(captainId);
    change(setCaptain, id);
  }

  function makeVice(id: string) {
    Haptics.selectionAsync();
    if (captainId === id) setCaptain(viceId);
    change(setVice, id);
  }

  function chooseFrom(title: string, message: string, choose: (id: string) => void, except?: string | null) {
    const options = ordered.filter((id) => id !== except);
    ActionSheetIOS.showActionSheetWithOptions(
      { title, message, options: [...options.map(nameOf), "Cancel"], cancelButtonIndex: options.length, userInterfaceStyle: "light" },
      (i) => { if (i < options.length) choose(options[i]); },
    );
  }

  const chooseCaptain = () => chooseFrom("Who's your captain?", "Your captain scores double points.", makeCaptain);
  const chooseVice = () => chooseFrom("Who's your vice-captain?", "They score double if your captain doesn't play.", makeVice, captainId);

  function onSlot(index: number) {
    const id = lineup.slots[index];
    if (!id) { setPicking(true); return; }
    const p = players.get(id)!;
    const actions: { label: string; run: () => void; destructive?: boolean }[] = [];
    if (id !== captainId) actions.push({ label: "Make captain (double points)", run: () => makeCaptain(id) });
    if (captainId && id !== captainId && id !== viceId) actions.push({ label: "Make vice-captain", run: () => makeVice(id) });
    actions.push({ label: "Swap for someone else", run: () => { change(setPicked, picked.filter((x) => x !== id)); setPicking(true); } });
    actions.push({ label: "See their stats", run: () => router.push({ pathname: "/fantasy/player/[id]", params: { id } }) });
    actions.push({ label: "Take out of my team", destructive: true, run: () => change(setPicked, picked.filter((x) => x !== id)) });

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: `${p.name} · ${POSITION_LABEL[p.position]}`,
        message: p.status !== "a"
          ? `${PLAYER_STATUS[p.status].label}${p.news ? ` — ${p.news}` : ""}`
          : `${plural(p.totalPoints, "point")} so far · in ${p.selectedBy}% of teams`,
        options: [...actions.map((a) => a.label), "Cancel"],
        destructiveButtonIndex: actions.findIndex((a) => a.destructive),
        cancelButtonIndex: actions.length,
        userInterfaceStyle: "light",
      },
      (i) => { if (i < actions.length) { Haptics.selectionAsync(); actions[i].run(); } },
    );
  }

  function toggleChip(c: Chip) {
    Haptics.selectionAsync();
    change(setChip, chip === c ? null : c);
  }

  function reset() {
    Haptics.selectionAsync();
    setPicked(startIds);
    setCaptain(draft?.captainId ?? null);
    setVice(draft?.viceCaptainId ?? null);
    setChip(draft?.chip ?? null);
    setTouched(false);
  }

  async function submit(teamName = name) {
    if (!ids || !captainId || !viceId || error) return;
    setSaving(true);
    try {
      const res = await api<FantasyOverview>("/api/fantasy/team", {
        body: {
          gameweek: gameweek.number, playerIds: ids, positions: lineupPositions(lineup), captainId, viceCaptainId: viceId, chip,
          ...(team ? {} : { name: teamName.trim() }),
        },
      });
      queryClient.setQueryData(["fantasy"], res);
      queryClient.invalidateQueries({ queryKey: ["fantasy-leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["fantasy-leagues"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (!team) {
        Alert.alert(
          "You're in! 🎉",
          `Your team is set for gameweek ${gameweek.number}. You can change it as much as you like until the deadline.`,
          [{ text: "Great", onPress: () => router.back() }],
        );
      } else {
        router.back();
      }
    } catch (err) {
      Alert.alert("Couldn't save your team", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  /** New teams: ask for the name in a box (the keyboard can't hide it), then save. */
  function askName() {
    Alert.prompt(
      "Name your team",
      "Your mates will see it in the league tables.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save my team",
          onPress: (value?: string) => {
            const v = (value ?? "").trim();
            if (v.length < 2) return Alert.alert("Pick a longer name", "Your team name needs at least 2 letters.");
            change(setName, v);
            submit(v);
          },
        },
      ],
      "plain-text",
      name,
    );
  }

  function save() {
    if (!transfersIn.length) return submit();
    const names = (list: string[]) => list.map(nameOf).join(", ");
    Alert.alert(
      `Confirm ${plural(transfersIn.length, "change")}?`,
      `Out: ${names(transfersOut)}\nIn: ${names(transfersIn)}\n\n${transferCost ? `This costs ${transferCost} points.` : "It's free."}`,
      [{ text: "Cancel", style: "cancel" }, { text: "Confirm", onPress: submit }],
    );
  }

  function back() {
    if (!touched) return router.back();
    Alert.alert("Leave without saving?", "Your changes haven't been saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => router.back() },
    ]);
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
    <Screen
      title={team ? team.name : "Pick your team"}
      onBack={back}
      right={touched ? <Pressable onPress={reset} hitSlop={10}><Text style={styles.reset}>Undo</Text></Pressable> : null}
      footer={
        <View style={{ gap: 8 }}>
          {next.hint ? <Text style={[styles.footerHint, next.bad && { color: colors.danger }]}>{next.hint}</Text> : null}
          <Button title={next.label} onPress={doNext} loading={saving} disabled={!next.action} />
        </View>
      }
    >
      <View style={styles.deadline}>
        <View style={{ flex: 1 }}>
          <Text style={styles.deadlineTitle}>Gameweek {gameweek.number}{gameweek.name ? ` · ${gameweek.name}` : ""}</Text>
          <Text style={styles.deadlineSub}>Locks {formatDeadline(gameweek.deadline)}</Text>
        </View>
        <View style={styles.countdown}>
          <Text style={styles.countdownText}>{formatCountdown(new Date(gameweek.deadline).getTime() - openedAt)}</Text>
        </View>
      </View>

      {baseline && free !== null && <Transfers made={made} free={free} cost={transferCost} chip={chip} />}

      <Step n={1} done={stepPlayers} title={`Pick ${SIZE} players`} right={<Text style={styles.count}>{picked.length}/{SIZE}</Text>}>
        Any {SIZE} of the 5ive Guys. We line them up for you, and they always score as their own position.
      </Step>
      <FantasyPitch slots={slots} />
      <Button
        title={picked.length ? "Change players" : `Choose your ${SIZE} players`}
        variant={picked.length ? "secondary" : "primary"}
        onPress={() => setPicking(true)}
        style={{ marginTop: 12 }}
      />

      <Step n={2} done={stepCaptain} title="Choose your captain">
        Your captain scores double points. If they don&apos;t play, your vice-captain does instead.
      </Step>
      {ordered.length ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.captains}>
            {ordered.map((id) => {
              const p = players.get(id)!;
              const isCaptain = id === captainId;
              const isVice = id === viceId;
              return (
                <Pressable
                  key={id}
                  onPress={() => makeCaptain(id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.name}${isCaptain ? ", captain" : ", make captain"}`}
                  style={({ pressed }) => [styles.capItem, pressed && { opacity: 0.7 }]}
                >
                  <View style={[styles.capArt, isCaptain && styles.capArtOn]}>
                    <Image source={{ uri: imageUri(p.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" />
                  </View>
                  {isCaptain || isVice ? (
                    <View style={[styles.capBadge, isCaptain ? { backgroundColor: colors.gold } : { backgroundColor: "#E5E7EB" }]}>
                      <Text style={styles.capBadgeText}>{isCaptain ? "C" : "V"}</Text>
                    </View>
                  ) : null}
                  <Text style={[styles.capName, isCaptain && { color: colors.text, fontWeight: "900" }]} numberOfLines={1}>{p.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {captainId && viceId ? (
            <Pressable onPress={chooseVice} hitSlop={6} style={styles.viceRow} accessibilityRole="button">
              <Text style={styles.viceText} numberOfLines={1}>
                Captain <Text style={styles.strong}>{nameOf(captainId)}</Text> · Vice <Text style={styles.strong}>{nameOf(viceId)}</Text>
              </Text>
              <Text style={styles.link}>Change vice</Text>
            </Pressable>
          ) : (
            <Text style={styles.stepHint}>Tap a player to make them captain.</Text>
          )}
        </>
      ) : (
        <Text style={styles.stepHint}>Pick your players first.</Text>
      )}

      {!team && (
        <>
          <Step n={3} done={!needsName} title="Name your team">Your mates will see it in the league tables.</Step>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={(t) => change(setName, t)}
            placeholder="e.g. Sunday Legends"
            placeholderTextColor={colors.text3}
            maxLength={30}
            autoCapitalize="words"
            returnKeyType="done"
            accessibilityLabel="Team name"
          />
        </>
      )}

      <Pressable onPress={() => setShowChips((s) => !s)} style={styles.chipsHead} accessibilityRole="button" accessibilityState={{ expanded: showChips }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.chipsTitle}>Chips <Text style={styles.optional}>· optional</Text></Text>
          <Text style={styles.stepHint}>{chip ? `${CHIPS.find((c) => c.id === chip)!.name} is on this gameweek.` : "Power-ups you can play once in a while."}</Text>
        </View>
        <Text style={styles.link}>{showChips ? "Hide" : "Show"}</Text>
      </Pressable>
      {showChips && (
        <>
          <View style={styles.chips}>
            {CHIPS.map((c) => {
              const active = chip === c.id;
              const needsTeam = (c.id === "wildcard" || c.id === "free_hit") && !baseline;
              const playedAt = team?.chipsPlayed.find((p) => p.chip === c.id && seasonHalf(p.gameweek, season.secondHalfFrom) === seasonHalf(gameweek.number, season.secondHalfFrom));
              const blocked = !active && (needsTeam || !available.includes(c.id));
              return (
                <Pressable
                  key={c.id}
                  disabled={blocked}
                  onPress={() => toggleChip(c.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled: blocked }}
                  style={[styles.chip, active && styles.chipActive, blocked && { opacity: 0.45 }]}
                >
                  <Text style={styles.chipName}>{c.emoji} {c.name}</Text>
                  <Text style={styles.chipDesc}>{c.description}</Text>
                  <Text style={[styles.chipState, active && { color: colors.goldText }]}>
                    {active ? "✓ On this gameweek" : needsTeam ? "From your second gameweek" : playedAt ? `Used in gameweek ${playedAt.gameweek}` : "Tap to play it"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.stepHint}>
            One chip a gameweek, and you can cancel it until the deadline.
            {season.secondHalfFrom ? ` They all come back from gameweek ${season.secondHalfFrom}.` : ""}
          </Text>
        </>
      )}

      <PlayerPicker
        visible={picking}
        players={data.players}
        picked={picked}
        onToggle={toggle}
        onClose={() => setPicking(false)}
      />
    </Screen>
  );
}

function Step({ n, done, title, right, children }: { n: number; done: boolean; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepHead}>
        <View style={[styles.stepNum, done && styles.stepNumDone]}>
          <Text style={[styles.stepNumText, done && { color: colors.white }]}>{done ? "✓" : n}</Text>
        </View>
        <Text style={styles.stepTitle}>{title}</Text>
        {right}
      </View>
      <Text style={styles.stepHint}>{children}</Text>
    </View>
  );
}

function Transfers({ made, free, cost, chip }: { made: number; free: number; cost: number; chip: Chip | null }) {
  const unlimited = chip === "wildcard" || chip === "free_hit";
  const text = unlimited ? `${CHIPS.find((c) => c.id === chip)!.name} is on: every change is free this gameweek.`
    : made === 0 ? `You have ${plural(free, "free change")} this gameweek. Each extra one costs ${FANTASY_RULES.transferCost} points.`
      : cost ? `${plural(made, "change")}, ${free} free: that costs ${cost} points.`
        : `${plural(made, "change")}: free ✓`;
  return (
    <View style={[styles.transfers, cost > 0 && { backgroundColor: colors.dangerSoft }]}>
      <Text style={[styles.transfersText, cost > 0 && { color: colors.danger }]}>🔁  {text}</Text>
    </View>
  );
}

const SECTION_TITLE = { GK: "Goalkeepers", DEF: "Defenders", MID: "Midfielders", FWD: "Forwards" } as const;

function PlayerPicker({
  visible, players, picked, onToggle, onClose,
}: {
  visible: boolean; players: FantasyPlayer[]; picked: string[]; onToggle: (id: string) => void; onClose: () => void;
}) {
  const full = picked.length >= SIZE;
  const sections = POSITIONS.map((pos) => ({
    pos,
    title: SECTION_TITLE[pos],
    data: players
      .filter((p) => p.position === pos && (p.isActive || picked.includes(p.id)))
      .sort((a, b) => b.totalPoints - a.totalPoints || b.selectedBy - a.selectedBy || a.name.localeCompare(b.name)),
  })).filter((s) => s.data.length);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>Pick {SIZE} players</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button"><Text style={styles.done}>Done</Text></Pressable>
        </View>
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(Math.min(picked.length, SIZE) / SIZE) * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>{picked.length} of {SIZE}</Text>
        </View>
        <Text style={styles.sheetHint}>
          {full ? "That's your 7! Tap a player to take them out and make room." : "Tap a player to add them. Tap again to take them out."}
        </Text>
        <SectionList
          sections={sections}
          keyExtractor={(p) => p.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: 48 }}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHead}>
              <View style={[styles.dot, { backgroundColor: POSITION_COLOR[section.pos] }]} />
              <Text style={styles.sectionText}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item: p }) => {
            const on = picked.includes(p.id);
            const flagged = p.status !== "a";
            return (
              <Pressable
                onPress={() => onToggle(p.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${p.name}, ${POSITION_LABEL[p.position]}${on ? ", in your team" : ""}`}
                style={({ pressed }) => [styles.option, on && styles.optionOn, !on && full && { opacity: 0.45 }, pressed && { opacity: 0.7 }]}
              >
                <Image source={{ uri: imageUri(p.imageUrl) }} style={styles.optionArt} contentFit="cover" />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.optionName}>{p.name}</Text>
                  <Text style={styles.optionSub}>{plural(p.totalPoints, "pt")} · in {p.selectedBy}% of teams</Text>
                  {flagged ? (
                    <Text style={[styles.news, { color: PLAYER_STATUS[p.status].color }]} numberOfLines={2}>
                      {PLAYER_STATUS[p.status].label}{p.news ? ` — ${p.news}` : ""}
                    </Text>
                  ) : null}
                </View>
                <View style={[styles.toggle, on && styles.toggleOn]}>
                  <Text style={[styles.toggleText, on && { color: colors.white }]}>{on ? "✓" : "+"}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.text2, fontSize: 15, lineHeight: 21 },
  reset: { color: colors.accent, fontSize: 16, fontWeight: "700" },
  deadline: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 18, padding: 14, ...shadow,
  },
  deadlineTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  deadlineSub: { color: colors.text2, fontSize: 14, marginTop: 2 },
  countdown: { backgroundColor: colors.goldSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 },
  countdownText: { color: colors.goldText, fontSize: 15, fontWeight: "900", fontVariant: ["tabular-nums"] },
  transfers: { marginTop: 10, backgroundColor: colors.accentSoft, borderRadius: 14, padding: 12 },
  transfersText: { color: colors.accent, fontSize: 14, fontWeight: "700", lineHeight: 19 },
  step: { marginTop: 22, marginBottom: 12, gap: 4 },
  stepHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepNum: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.accent, alignItems: "center", justifyContent: "center",
  },
  stepNumDone: { backgroundColor: colors.green, borderColor: colors.green },
  stepNumText: { color: colors.accent, fontSize: 14, fontWeight: "900" },
  stepTitle: { flex: 1, color: colors.text, fontSize: 20, fontWeight: "900" },
  stepHint: { color: colors.text2, fontSize: 14, lineHeight: 20 },
  count: { color: colors.accent, fontSize: 16, fontWeight: "900", fontVariant: ["tabular-nums"] },
  captains: { gap: 12, paddingVertical: 4, paddingRight: 8 },
  capItem: { width: 70, alignItems: "center", gap: 6 },
  capArt: {
    width: 62, height: 62, borderRadius: 31, overflow: "hidden", backgroundColor: colors.cardHi, borderWidth: 3, borderColor: colors.white, ...shadow,
  },
  capArtOn: { borderColor: colors.gold },
  capBadge: {
    position: "absolute", top: 40, right: 2, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: colors.white,
  },
  capBadgeText: { color: "#111", fontSize: 12, fontWeight: "900" },
  capName: { color: colors.text2, fontSize: 12, fontWeight: "700" },
  viceRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  viceText: { flex: 1, color: colors.text2, fontSize: 14 },
  strong: { fontWeight: "900", color: colors.text },
  link: { color: colors.accent, fontSize: 15, fontWeight: "800" },
  nameInput: {
    height: 54, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: 16, color: colors.text, fontSize: 18, fontWeight: "800",
  },
  chipsHead: {
    flexDirection: "row", alignItems: "center", gap: 12, marginTop: 26, marginBottom: 10, backgroundColor: colors.card,
    borderRadius: 18, padding: 14, ...shadow,
  },
  chipsTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  optional: { color: colors.text3, fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: { width: "48.5%", backgroundColor: colors.card, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, padding: 12, gap: 4 },
  chipActive: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  chipName: { color: colors.text, fontSize: 15, fontWeight: "900" },
  chipDesc: { color: colors.text2, fontSize: 12, lineHeight: 16 },
  chipState: { color: colors.accent, fontSize: 12, fontWeight: "800", marginTop: 2 },
  footerHint: { color: colors.text2, fontSize: 13, textAlign: "center", fontWeight: "600" },
  sheet: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 10 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  sheetTitle: { color: colors.text, fontSize: 24, fontWeight: "900" },
  done: { color: colors.accent, fontSize: 17, fontWeight: "800" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  progressTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.cardHi, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 5, backgroundColor: colors.green },
  progressText: { color: colors.text, fontSize: 15, fontWeight: "900", fontVariant: ["tabular-nums"] },
  sheetHint: { color: colors.text2, fontSize: 14, marginTop: 8, marginBottom: 4 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, marginBottom: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  sectionText: { color: colors.text, fontSize: 16, fontWeight: "900" },
  option: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 16, padding: 10,
    marginBottom: 8, borderWidth: 2, borderColor: "transparent", ...shadow,
  },
  optionOn: { borderColor: colors.green, backgroundColor: "#F3FDF6" },
  optionArt: { width: 44, aspectRatio: 785 / 1085, borderRadius: 7, backgroundColor: colors.cardHi },
  optionName: { color: colors.text, fontSize: 17, fontWeight: "900" },
  optionSub: { color: colors.text3, fontSize: 13 },
  news: { fontSize: 12, fontWeight: "700" },
  toggle: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: colors.accent, alignItems: "center", justifyContent: "center",
  },
  toggleOn: { backgroundColor: colors.green, borderColor: colors.green },
  toggleText: { color: colors.accent, fontSize: 20, fontWeight: "900", marginTop: -1 },
});
