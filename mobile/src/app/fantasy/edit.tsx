import { useMemo, useState } from "react";
import { ActionSheetIOS, Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import {
  buySquad, CHIP_IDS, CHIPS, entryError, FANTASY_RULES, formatPrice, PLAYER_STATUS, POSITION_LABEL, seasonHalf,
  transferCostFor, transfersBetween, type Chip, type FantasyPosition, type SquadPlayer,
} from "@shared/fantasy";
import { FantasyPitch, POSITION_COLOR, type PitchSlot } from "@/components/fantasy/FantasyPitch";
import { GameScreen } from "@/components/game/GameScreen";
import { Button, Chip as ChipButton, ErrorText, Loading } from "@/components/ui";
import { api } from "@/lib/api";
import {
  autoComplete, changeFormation, EMPTY_LINEUP, formatCountdown, formatDeadline, FORMATIONS, formationLabel, inLineup,
  lineupFromIds, lineupIds, placePlayer, removePlayer, slotPositions, type Lineup,
} from "@/lib/fantasy";
import { imageUri } from "@/lib/images";
import { useFantasy } from "@/lib/queries";
import { colors } from "@/lib/theme";
import type { FantasyOverview, FantasyPlayer } from "@/lib/types";

/** Pick your 7 for the next gameweek: transfers, formation, captain and chips. */
export default function FantasyEditScreen() {
  const fantasy = useFantasy();
  if (!fantasy.data) {
    return <GameScreen title="Your team">{fantasy.error ? <ErrorText>{fantasy.error.message}</ErrorText> : <Loading />}</GameScreen>;
  }
  if (!fantasy.data.season || fantasy.data.nextGameweek === null) {
    return <GameScreen title="Your team"><Text style={styles.muted}>There&apos;s no gameweek open for picks right now.</Text></GameScreen>;
  }
  return <Editor data={fantasy.data} />;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

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

  const [start] = useState<Lineup>(() => (draft ? lineupFromIds(draft.picks.map((p) => p.playerId), players) : EMPTY_LINEUP));
  const [lineup, setLineup] = useState<Lineup>(start);
  const [captain, setCaptain] = useState<string | null>(draft?.captainId ?? null);
  const [vice, setVice] = useState<string | null>(draft?.viceCaptainId ?? null);
  const [chip, setChip] = useState<Chip | null>(draft?.chip ?? null);
  const [name, setName] = useState("");
  const [picking, setPicking] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const [openedAt] = useState(() => Date.now());

  const change = (next: Lineup) => { setLineup(next); setTouched(true); };

  // Captain and vice default to the priciest players until chosen.
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
  const error = ids
    ? entryError({ playerIds: ids, captainId: captainId ?? "", viceCaptainId: viceId ?? "", chip }, squad, { ...opts, availableChips: available })
    : `Pick ${plural(missing, "more player")}.`;
  const needsName = !team && name.trim().length < 2;

  const before = new Set(baseline?.picks.map((p) => p.playerId) ?? []);
  const transfersOut = baseline ? baseline.picks.map((p) => p.playerId).filter((id) => !chosen.includes(id)) : [];
  const transfersIn = baseline ? chosen.filter((id) => !before.has(id)) : [];
  /** Money to spend on a slot: the bank with that slot's player sold. */
  const moneyFor = (index: number) => {
    const current = lineup.slots[index];
    return current ? buySquad(chosen.filter((id) => id !== current), squad, opts).bank : bank;
  };

  function onSlot(index: number) {
    const id = lineup.slots[index];
    if (!id) { setPicking(index); return; }
    const p = players.get(id)!;
    const actions: { label: string; run: () => void; destructive?: boolean }[] = [];
    if (id !== captainId) actions.push({ label: "Make captain", run: () => { setCaptain(id); if (viceId === id) setVice(captainId); setTouched(true); } });
    if (id !== viceId) actions.push({ label: "Make vice-captain", run: () => { setVice(id); if (captainId === id) setCaptain(viceId); setTouched(true); } });
    actions.push({ label: baseline && before.has(id) ? "Transfer out…" : "Replace…", run: () => setPicking(index) });
    actions.push({ label: "Player details", run: () => router.push({ pathname: "/fantasy/player/[id]", params: { id } }) });
    actions.push({ label: "Remove", destructive: true, run: () => change(removePlayer(lineup, id)) });

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: `${p.name} · ${POSITION_LABEL[p.position]} · ${formatPrice(p.price)}`,
        message: p.status !== "a"
          ? `${PLAYER_STATUS[p.status].label}${p.news ? ` — ${p.news}` : ""}`
          : `${p.totalPoints} pts · form ${p.form} · picked by ${p.selectedBy}%`,
        options: [...actions.map((a) => a.label), "Cancel"],
        destructiveButtonIndex: actions.findIndex((a) => a.destructive),
        cancelButtonIndex: actions.length,
        userInterfaceStyle: "dark",
      },
      (i) => { if (i < actions.length) { Haptics.selectionAsync(); actions[i].run(); } },
    );
  }

  function pick(id: string) {
    if (picking === null) return;
    Haptics.selectionAsync();
    change(placePlayer(lineup, picking, id));
    setPicking(null);
  }

  function toggleChip(c: Chip) {
    Haptics.selectionAsync();
    setChip((cur) => (cur === c ? null : c));
    setTouched(true);
  }

  function reset() {
    Haptics.selectionAsync();
    setLineup(start);
    setCaptain(draft?.captainId ?? null);
    setVice(draft?.viceCaptainId ?? null);
    setChip(draft?.chip ?? null);
    setTouched(false);
  }

  async function submit() {
    if (!ids || error) return;
    setSaving(true);
    try {
      const res = await api<FantasyOverview>("/api/fantasy/team", {
        body: {
          gameweek: gameweek.number, playerIds: ids, captainId, viceCaptainId: viceId, chip,
          ...(team ? {} : { name: name.trim() }),
        },
      });
      queryClient.setQueryData(["fantasy"], res);
      queryClient.invalidateQueries({ queryKey: ["fantasy-leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["fantasy-leagues"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      Alert.alert("Couldn't save your team", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function save() {
    if (!transfersIn.length) return submit();
    const names = (list: string[]) => list.map((id) => players.get(id)?.name ?? "?").join(", ");
    Alert.alert(
      `Confirm ${plural(transfersIn.length, "transfer")}?`,
      `Out: ${names(transfersOut)}\nIn: ${names(transfersIn)}\n\n${transferCost ? `This costs ${transferCost} points.` : "No points deducted."}`,
      [{ text: "Cancel", style: "cancel" }, { text: "Confirm", onPress: submit }],
    );
  }

  function back() {
    if (!touched) return router.back();
    Alert.alert("Discard changes?", "Your team hasn't been saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  }

  const slots: PitchSlot[] = slotPositions(lineup.formation).map((position, i) => {
    const p = players.get(lineup.slots[i] ?? "") ?? null;
    return {
      key: `s${i}`, position, player: p,
      caption: p ? formatPrice(p.price) : undefined,
      badge: p && p.id === captainId ? "C" : p && p.id === viceId ? "V" : null,
      fresh: !!p && !!baseline && !before.has(p.id),
      onPress: () => onSlot(i),
    };
  });

  const buttonTitle = !team ? "Create team"
    : transfersIn.length ? `Confirm ${plural(transfersIn.length, "transfer")}${transferCost ? ` (−${transferCost} pts)` : ""}`
      : "Save team";

  return (
    <GameScreen
      title={team ? team.name : "Pick your team"}
      onBack={back}
      right={touched ? <Pressable onPress={reset} hitSlop={10}><Text style={styles.reset}>Reset</Text></Pressable> : null}
      footer={
        <View style={{ gap: 8 }}>
          {(error || needsName) && touched ? <Text style={styles.footerError}>{error ?? "Give your team a name."}</Text> : null}
          <Button title={buttonTitle} onPress={save} loading={saving} disabled={!!error || needsName || (!touched && !!draft?.saved)} />
        </View>
      }
    >
      <Text style={styles.deadline}>
        Gameweek {gameweek.number}{gameweek.name ? ` · ${gameweek.name}` : ""} · deadline {formatDeadline(gameweek.deadline)}
        {" "}({formatCountdown(new Date(gameweek.deadline).getTime() - openedAt)})
      </Text>

      {!team && (
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={(t) => { setName(t); setTouched(true); }}
          placeholder="Team name"
          placeholderTextColor={colors.text3}
          maxLength={30}
          autoCapitalize="words"
          returnKeyType="done"
          accessibilityLabel="Team name"
        />
      )}

      <View style={styles.stats}>
        <Stat label="Money left" value={formatPrice(bank)} bad={bank < 0} />
        <Stat label="Free transfers" value={free === null ? "∞" : String(free)} />
        <Stat
          label={baseline ? plural(made, "transfer") : "Transfers"}
          value={transferCost ? `−${transferCost} pts` : "Free"}
          bad={transferCost > 0}
        />
      </View>

      <View style={styles.formRow}>
        {FORMATIONS.map((f) => (
          <ChipButton
            key={formationLabel(f)}
            label={formationLabel(f)}
            active={formationLabel(f) === formationLabel(lineup.formation)}
            onPress={() => { Haptics.selectionAsync(); change(changeFormation(lineup, f, players)); }}
          />
        ))}
        {missing > 0 && (
          <ChipButton label="Auto-fill ✨" active={false} onPress={() => { Haptics.selectionAsync(); change(autoComplete(lineup, data.players, bank)); }} />
        )}
      </View>

      <FantasyPitch slots={slots} />
      <Text style={styles.hint}>
        {chosen.length ? "Tap a player to make them captain, transfer them out or see their stats." : "Tap a shirt to pick a player, or auto-fill."}
      </Text>

      <Text style={styles.section}>Chips</Text>
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
              style={[styles.chip, active && styles.chipActive, blocked && { opacity: 0.4 }]}
            >
              <Text style={styles.chipName}>{c.emoji} {c.name}</Text>
              <Text style={[styles.chipState, active && { color: colors.gold }]}>
                {active ? "Playing this gameweek" : needsTeam ? "After your first deadline" : playedAt ? `Played in GW${playedAt.gameweek}` : "Available"}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {chip ? (
        <Text style={styles.hint}>
          {CHIPS.find((c) => c.id === chip)!.description} You can cancel it until the deadline.
        </Text>
      ) : (
        <Text style={styles.hint}>One chip a gameweek.{season.secondHalfFrom ? ` Chips come back from gameweek ${season.secondHalfFrom}.` : ""}</Text>
      )}

      <PlayerPicker
        visible={picking !== null}
        position={picking !== null ? slotPositions(lineup.formation)[picking] : null}
        players={data.players}
        taken={inLineup(lineup)}
        money={picking !== null ? moneyFor(picking) : bank}
        onPick={pick}
        onClose={() => setPicking(null)}
      />
    </GameScreen>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, bad && { color: colors.danger }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

type Sort = "price" | "points" | "form" | "selected";
const SORTS: { id: Sort; label: string }[] = [
  { id: "price", label: "Price" }, { id: "points", label: "Points" }, { id: "form", label: "Form" }, { id: "selected", label: "Most picked" },
];

function PlayerPicker({
  visible, position, players, taken, money, onPick, onClose,
}: {
  visible: boolean; position: FantasyPosition | null; players: FantasyPlayer[]; taken: Set<string>;
  money: number; onPick: (id: string) => void; onClose: () => void;
}) {
  const [sort, setSort] = useState<Sort>("price");
  const value = (p: FantasyPlayer) => (sort === "points" ? p.totalPoints : sort === "form" ? p.form : sort === "selected" ? p.selectedBy : p.price);
  const options = players
    .filter((p) => p.isActive && !taken.has(p.id) && (!position || p.position === position))
    // Players you can afford first, then by the chosen order.
    .sort((a, b) => Number(b.price <= money) - Number(a.price <= money) || value(b) - value(a));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>{position ? `Pick a ${POSITION_LABEL[position].toLowerCase()}` : "Pick a player"}</Text>
          <Pressable onPress={onClose} hitSlop={10}><Text style={styles.done}>Cancel</Text></Pressable>
        </View>
        <Text style={styles.muted}>You can spend up to {formatPrice(Math.max(0, money))}.</Text>
        <View style={[styles.formRow, { marginVertical: 12 }]}>
          {SORTS.map((s) => <ChipButton key={s.id} label={s.label} active={sort === s.id} onPress={() => setSort(s.id)} />)}
        </View>
        <FlatList
          data={options}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ gap: 8, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={styles.muted}>Everyone in that position is already in your team.</Text>}
          renderItem={({ item: p }) => {
            const affordable = p.price <= money;
            const flagged = p.status !== "a";
            return (
              <Pressable
                onPress={() => onPick(p.id)}
                disabled={!affordable}
                accessibilityLabel={`${p.name}, ${formatPrice(p.price)}${affordable ? "" : ", too expensive"}`}
                style={({ pressed }) => [styles.option, !affordable && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}
              >
                <Image source={{ uri: imageUri(p.imageUrl) }} style={styles.optionArt} contentFit="cover" />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.optionName}>{p.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={[styles.posPill, { backgroundColor: POSITION_COLOR[p.position] }]}>
                      <Text style={styles.posPillText}>{p.position}</Text>
                    </View>
                    <Text style={styles.optionSub}>{p.totalPoints} pts · form {p.form} · {p.selectedBy}%</Text>
                  </View>
                  {flagged ? (
                    <Text style={[styles.news, { color: PLAYER_STATUS[p.status].color }]} numberOfLines={2}>
                      {PLAYER_STATUS[p.status].label}{p.news ? ` — ${p.news}` : ""}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.optionPrice, !affordable && { color: colors.danger }]}>{formatPrice(p.price)}</Text>
                  {p.priceChange ? (
                    <Text style={[styles.priceMove, { color: p.priceChange > 0 ? colors.greenHi : colors.danger }]}>
                      {p.priceChange > 0 ? "▲" : "▼"} {(Math.abs(p.priceChange) / 10).toFixed(1)}
                    </Text>
                  ) : null}
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
  muted: { color: colors.text2, fontSize: 14, lineHeight: 20 },
  deadline: { color: colors.text2, fontSize: 13, marginBottom: 12 },
  reset: { color: colors.accentHi, fontSize: 16, fontWeight: "600" },
  nameInput: {
    height: 48, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, color: colors.text, fontSize: 17, fontWeight: "700", marginBottom: 12,
  },
  stats: { flexDirection: "row", gap: 8, marginBottom: 12 },
  stat: {
    flex: 1, backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    paddingVertical: 10, alignItems: "center", gap: 2,
  },
  statValue: { color: colors.text, fontSize: 17, fontWeight: "900", fontVariant: ["tabular-nums"] },
  statLabel: { color: colors.text3, fontSize: 11, fontWeight: "600" },
  formRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  hint: { color: colors.text3, fontSize: 12, textAlign: "center", marginTop: 10, lineHeight: 17 },
  section: { color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 24, marginBottom: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    width: "48.5%", backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 3,
  },
  chipActive: { borderColor: colors.gold, backgroundColor: "#2a2010" },
  chipName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  chipState: { color: colors.text3, fontSize: 12, fontWeight: "600" },
  footerError: { color: colors.danger, fontSize: 13, textAlign: "center" },
  sheet: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8, marginTop: 6 },
  sheetTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
  done: { color: colors.accentHi, fontSize: 16, fontWeight: "700" },
  option: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 10,
  },
  optionArt: { width: 40, aspectRatio: 785 / 1085, borderRadius: 5, backgroundColor: colors.cardHi },
  optionName: { color: colors.text, fontSize: 16, fontWeight: "800" },
  optionSub: { color: colors.text3, fontSize: 12 },
  news: { fontSize: 12, fontWeight: "600" },
  optionPrice: { color: colors.text, fontSize: 16, fontWeight: "900", fontVariant: ["tabular-nums"] },
  priceMove: { fontSize: 11, fontWeight: "800" },
  posPill: { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  posPillText: { color: "#fff", fontSize: 10, fontWeight: "900" },
});
