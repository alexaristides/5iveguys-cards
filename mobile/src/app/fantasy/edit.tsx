import { useMemo, useState } from "react";
import { ActionSheetIOS, Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import {
  CHIPS, entryError, formatPrice, POSITION_LABEL, priceSquad, squadCost, transferCostFor, transfersBetween,
  type Chip, type FantasyPosition, type SquadPlayer,
} from "@shared/fantasy";
import { FantasyPitch, POSITION_COLOR, type PitchSlot } from "@/components/fantasy/FantasyPitch";
import { GameScreen } from "@/components/game/GameScreen";
import { Button, Chip as ChipButton, ErrorText, Loading } from "@/components/ui";
import { api } from "@/lib/api";
import {
  autoComplete, changeFormation, EMPTY_LINEUP, formatCountdown, formatDeadline, FORMATIONS, formationLabel, inLineup, lineupFromIds,
  lineupIds, placePlayer, removePlayer, slotPositions, swapWithBench, type Lineup, type Slot,
} from "@/lib/fantasy";
import { imageUri } from "@/lib/images";
import { useFantasy } from "@/lib/queries";
import { colors } from "@/lib/theme";
import type { FantasyOverview, FantasyPlayer } from "@/lib/types";

/** Pick your team for the next gameweek: squad, formation, captain, subs, transfers and chips. */
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

  const [lineup, setLineup] = useState<Lineup>(() =>
    draft ? lineupFromIds(draft.picks.map((p) => p.playerId), players) : EMPTY_LINEUP);
  const [captain, setCaptain] = useState<string | null>(draft?.captainId ?? null);
  const [vice, setVice] = useState<string | null>(draft?.viceCaptainId ?? null);
  const [chip, setChip] = useState<Chip | null>(draft?.chip ?? null);
  const [name, setName] = useState("");
  const [picking, setPicking] = useState<Slot | null>(null);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const [openedAt] = useState(() => Date.now());

  const change = (next: Lineup) => { setLineup(next); setTouched(true); };

  // Captain and vice default to the priciest starters until chosen.
  const starters = lineup.starters.filter((id): id is string => !!id);
  const byPrice = [...starters].sort((a, b) => (players.get(b)?.price ?? 0) - (players.get(a)?.price ?? 0));
  const captainId = captain && starters.includes(captain) ? captain : byPrice[0] ?? null;
  const viceId = vice && starters.includes(vice) && vice !== captainId ? vice : byPrice.find((id) => id !== captainId) ?? null;

  const chosen = [...inLineup(lineup)];
  const ids = lineupIds(lineup);
  const cost = squadCost(priceSquad(chosen, squad, baseline));
  const bank = season.budget - cost;
  const made = transfersBetween(chosen, baseline);
  const free = team?.freeTransfers ?? null;
  const transferCost = transferCostFor(made, free, chip);
  const error = ids
    ? entryError({ playerIds: ids, captainId: captainId ?? "", viceCaptainId: viceId ?? "", chip }, squad,
        { budget: season.budget, baseline, usedChips: team?.usedChips ?? [] })
    : `Pick ${9 - chosen.length} more player${9 - chosen.length === 1 ? "" : "s"}.`;

  const salePrice = (id: string | null) => (id ? (baseline?.find((p) => p.playerId === id)?.price ?? players.get(id)?.price ?? 0) : 0);
  const slotPlayer = (s: Slot) => (s.kind === "starter" ? lineup.starters[s.index] : lineup.bench[s.index]);
  const slotPosition = (s: Slot): FantasyPosition | null => (s.kind === "starter" ? slotPositions(lineup.formation)[s.index] : null);

  function onSlot(slot: Slot) {
    const id = slotPlayer(slot);
    if (!id) { setPicking(slot); return; }
    const p = players.get(id)!;
    const actions: { label: string; run: () => void; destructive?: boolean }[] = [];
    if (slot.kind === "starter") {
      if (id !== captainId) actions.push({ label: "Make captain", run: () => { setCaptain(id); if (vice === id) setVice(captainId); setTouched(true); } });
      if (id !== viceId) actions.push({ label: "Make vice-captain", run: () => { setVice(id); if (captain === id) setCaptain(viceId); setTouched(true); } });
      lineup.bench.forEach((sub, b) => {
        const swapped = sub ? swapWithBench(lineup, slot.index, b, players) : null;
        if (swapped) actions.push({ label: `Swap with ${players.get(sub!)!.name}`, run: () => change(swapped) });
      });
    } else if (lineup.bench[1 - slot.index]) {
      actions.push({ label: "Swap sub order", run: () => change({ ...lineup, bench: [lineup.bench[1], lineup.bench[0]] }) });
    }
    actions.push({ label: "Replace…", run: () => setPicking(slot) });
    actions.push({ label: "Remove", destructive: true, run: () => change(removePlayer(lineup, id)) });

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: `${p.name} · ${POSITION_LABEL[p.position]} · ${formatPrice(p.price)}`,
        message: `${p.totalPoints} pts this season · picked by ${p.selectedBy}%`,
        options: [...actions.map((a) => a.label), "Cancel"],
        destructiveButtonIndex: actions.findIndex((a) => a.destructive),
        cancelButtonIndex: actions.length,
        userInterfaceStyle: "dark",
      },
      (i) => { if (i < actions.length) { Haptics.selectionAsync(); actions[i].run(); } },
    );
  }

  function pick(id: string) {
    if (!picking) return;
    Haptics.selectionAsync();
    change(placePlayer(lineup, picking, id));
    setPicking(null);
  }

  function autoFill() {
    Haptics.selectionAsync();
    change(autoComplete(lineup, data.players, season.budget, (id) => salePrice(id)));
  }

  function toggleChip(c: Chip) {
    Haptics.selectionAsync();
    setChip((cur) => (cur === c ? null : c));
    setTouched(true);
  }

  async function save() {
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      Alert.alert("Couldn't save your team", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function back() {
    if (!touched) return router.back();
    Alert.alert("Discard changes?", "Your team hasn't been saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  }

  const needsName = !team && name.trim().length < 2;
  const starterSlots: PitchSlot[] = slotPositions(lineup.formation).map((position, i) => {
    const p = players.get(lineup.starters[i] ?? "") ?? null;
    return {
      key: `s${i}`, position, player: p,
      caption: p ? formatPrice(salePrice(p.id)) : undefined,
      badge: p && p.id === captainId ? "C" : p && p.id === viceId ? "V" : null,
      onPress: () => onSlot({ kind: "starter", index: i }),
    };
  });
  const benchSlots: PitchSlot[] = lineup.bench.map((id, i) => {
    const p = players.get(id ?? "") ?? null;
    return { key: `b${i}`, position: null, player: p, caption: p ? formatPrice(salePrice(p.id)) : undefined, onPress: () => onSlot({ kind: "bench", index: i }) };
  });

  return (
    <GameScreen
      title={team ? team.name : "Pick your team"}
      onBack={back}
      footer={
        <View style={{ gap: 8 }}>
          {(error || needsName) && touched ? <Text style={styles.footerError}>{needsName && !error ? "Give your team a name." : error}</Text> : null}
          <Button
            title={team ? (made > 0 && baseline ? `Confirm ${made} transfer${made === 1 ? "" : "s"}` : "Save team") : "Create team"}
            onPress={save}
            loading={saving}
            disabled={!!error || needsName || (!touched && !!draft?.saved)}
          />
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
        />
      )}

      <View style={styles.stats}>
        <Stat label="Bank" value={formatPrice(bank)} bad={bank < 0} />
        <Stat label="Free transfers" value={free === null ? "∞" : String(free)} />
        <Stat
          label={baseline ? `${made} transfer${made === 1 ? "" : "s"}` : "Transfers"}
          value={transferCost ? `-${transferCost} pts` : "Free"}
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
        {chosen.length < 9 && <ChipButton label="Auto-fill ✨" active={false} onPress={autoFill} />}
      </View>

      <FantasyPitch starters={starterSlots} bench={benchSlots} />
      <Text style={styles.hint}>Tap a player to make them captain, swap them with a sub or replace them.</Text>

      <Text style={styles.section}>Chips</Text>
      <View style={styles.chips}>
        {CHIPS.map((c) => {
          const used = team?.usedChips.includes(c.id) ?? false;
          const blocked = used || (c.id === "wildcard" && !baseline);
          const active = chip === c.id;
          return (
            <Pressable
              key={c.id}
              disabled={blocked}
              onPress={() => toggleChip(c.id)}
              style={[styles.chip, active && styles.chipActive, blocked && { opacity: 0.4 }]}
            >
              <Text style={styles.chipName}>{c.emoji} {c.name}</Text>
              <Text style={[styles.chipState, active && { color: colors.gold }]}>
                {used ? "Used" : active ? "Active this week" : c.id === "wildcard" && !baseline ? "After gameweek 1" : "Tap to play"}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {chip ? <Text style={styles.hint}>{CHIPS.find((c) => c.id === chip)!.description} You can cancel it until the deadline.</Text> : null}

      <PlayerPicker
        slot={picking}
        position={picking ? slotPosition(picking) : null}
        players={data.players}
        taken={inLineup(lineup)}
        budgetLeft={picking ? bank + salePrice(slotPlayer(picking)) : bank}
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

type Sort = "price" | "points" | "selected";

function PlayerPicker({
  slot, position, players, taken, budgetLeft, onPick, onClose,
}: {
  slot: Slot | null; position: FantasyPosition | null; players: FantasyPlayer[]; taken: Set<string>;
  budgetLeft: number; onPick: (id: string) => void; onClose: () => void;
}) {
  const [sort, setSort] = useState<Sort>("price");
  const options = players
    .filter((p) => p.isActive && !taken.has(p.id) && (!position || p.position === position))
    .sort((a, b) =>
      // Players you can afford first, then by the chosen order.
      Number(b.price <= budgetLeft) - Number(a.price <= budgetLeft) ||
      (sort === "points" ? b.totalPoints - a.totalPoints : sort === "selected" ? b.selectedBy - a.selectedBy : b.price - a.price));

  return (
    <Modal visible={!!slot} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>{position ? `Pick a ${POSITION_LABEL[position].toLowerCase()}` : "Pick a sub"}</Text>
          <Pressable onPress={onClose} hitSlop={10}><Text style={styles.done}>Cancel</Text></Pressable>
        </View>
        <Text style={styles.muted}>You can spend up to {formatPrice(budgetLeft)}.</Text>
        <View style={[styles.formRow, { marginVertical: 12 }]}>
          <ChipButton label="Price" active={sort === "price"} onPress={() => setSort("price")} />
          <ChipButton label="Points" active={sort === "points"} onPress={() => setSort("points")} />
          <ChipButton label="Most picked" active={sort === "selected"} onPress={() => setSort("selected")} />
        </View>
        <FlatList
          data={options}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ gap: 8, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={styles.muted}>Everyone in that position is already in your team.</Text>}
          renderItem={({ item: p }) => {
            const affordable = p.price <= budgetLeft;
            return (
              <Pressable
                onPress={() => onPick(p.id)}
                disabled={!affordable}
                style={({ pressed }) => [styles.option, !affordable && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}
              >
                <Image source={{ uri: imageUri(p.imageUrl) }} style={styles.optionArt} contentFit="cover" />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.optionName}>{p.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={[styles.posPill, { backgroundColor: POSITION_COLOR[p.position] }]}>
                      <Text style={styles.posPillText}>{p.position}</Text>
                    </View>
                    <Text style={styles.optionSub}>{p.totalPoints} pts · picked by {p.selectedBy}%</Text>
                  </View>
                </View>
                <Text style={[styles.optionPrice, !affordable && { color: colors.danger }]}>{formatPrice(p.price)}</Text>
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
  hint: { color: colors.text3, fontSize: 12, textAlign: "center", marginTop: 10 },
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
  optionPrice: { color: colors.text, fontSize: 16, fontWeight: "900", fontVariant: ["tabular-nums"] },
  posPill: { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  posPillText: { color: "#fff", fontSize: 10, fontWeight: "900" },
});
