import { useMemo, useState } from "react";
import { Alert, InputAccessoryView, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useQueryClient } from "@tanstack/react-query";
import { computeOverall, STAT_FIELDS, type StatKey, type StatsMap } from "@shared/card-rating";
import { Button, Loading } from "@/components/ui";
import { api } from "@/lib/api";
import { useChannel } from "@/lib/channel";
import { imageUri } from "@/lib/images";
import { useChannelCards, useMe, useVotes } from "@/lib/queries";
import { colors, rarityColor, rarityLabel } from "@/lib/theme";

const STATS: { key: StatKey; label: string; abbrev: string; color: string }[] = [
  { key: "attack", label: "Attack", abbrev: "ATK", color: "#ef4444" },
  { key: "defense", label: "Defense", abbrev: "DEF", color: "#3b82f6" },
  { key: "speed", label: "Speed", abbrev: "SPD", color: "#facc15" },
  { key: "strength", label: "Strength", abbrev: "STR", color: "#22c55e" },
  { key: "skillMoves", label: "Skill Moves", abbrev: "SKL", color: "#a855f7" },
  { key: "iq", label: "IQ", abbrev: "IQ", color: "#06b6d4" },
  { key: "aura", label: "Aura", abbrev: "AUR", color: "#f97316" },
  { key: "goalkeeping", label: "Goalkeeping", abbrev: "GKP", color: "#f59e0b" },
  { key: "agility", label: "Agility", abbrev: "AGI", color: "#14b8a6" },
  { key: "celebration", label: "Celebration", abbrev: "CLB", color: "#ec4899" },
  { key: "clutch", label: "Clutch", abbrev: "CLT", color: "#f43f5e" },
];

const DEFAULT_VOTE = Object.fromEntries(STAT_FIELDS.map((f) => [f, 50])) as StatsMap;

// The number pad has no return key, so every stat box shares a "Done" bar above the keyboard.
const KEYPAD_BAR = "stat-keypad";

/** The number beside each slider; tap it to type a value instead of dragging. */
function StatInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // Local text while editing; null shows the live value. Focus clears the box (the current
  // value stays as the placeholder) so typing replaces it — selectTextOnFocus is unreliable on iOS.
  const [text, setText] = useState<string | null>(null);
  return (
    <TextInput
      style={styles.sliderVal}
      value={text ?? String(Math.round(value))}
      placeholder={String(Math.round(value))}
      placeholderTextColor={colors.text3}
      onFocus={() => setText("")}
      onChangeText={(t) => {
        const digits = t.replace(/\D/g, "");
        if (!digits) return setText("");
        const n = Math.min(100, Number(digits));
        setText(String(n));
        onChange(n);
      }}
      onBlur={() => setText(null)}
      keyboardType="number-pad"
      maxLength={3}
      autoComplete="off"
      contextMenuHidden
      inputAccessoryViewID={KEYPAD_BAR}
    />
  );
}

export default function CardSheet() {
  const { cardId } = useLocalSearchParams<{ cardId: string }>();
  const { slug } = useChannel();
  const queryClient = useQueryClient();
  const { data: cards } = useChannelCards();
  const { data: me } = useMe();
  const votes = useVotes(cardId);
  const card = cards?.find((c) => c.id === cardId);
  const owned = me?.cards.filter((c) => c.cardId === cardId).length ?? 0;

  const [voting, setVoting] = useState(false);
  const [edits, setEdits] = useState<Partial<StatsMap>>({});
  const [submitting, setSubmitting] = useState(false);

  // Sliders start from your previous vote, else the fan average, else 50.
  const base = votes.data?.userVote ?? (votes.data?.voteCount ? votes.data.averages : DEFAULT_VOTE);
  const draft = { ...base, ...edits } as StatsMap;

  // Flip to the card back, if it has one.
  const flip = useSharedValue(0);
  const front = useAnimatedStyle(() => ({
    transform: [{ perspective: 800 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }],
    backfaceVisibility: "hidden",
  }));
  const back = useAnimatedStyle(() => ({
    transform: [{ perspective: 800 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }],
    backfaceVisibility: "hidden",
  }));

  const overall = useMemo(() => {
    if (!votes.data || votes.data.voteCount === 0) return null;
    return computeOverall(votes.data.averages, votes.data.position ?? card?.position);
  }, [votes.data, card?.position]);

  async function submit() {
    setSubmitting(true);
    try {
      const body = Object.fromEntries(STAT_FIELDS.map((f) => [f, Math.round(draft[f])]));
      const res = await api<{ pointsEarned: number }>(`/api/cards/${cardId}/votes`, { body });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setVoting(false);
      setEdits({});
      await votes.refetch();
      queryClient.invalidateQueries({ queryKey: ["ratings", slug] });
      if (res.pointsEarned > 0) {
        queryClient.invalidateQueries({ queryKey: ["me", slug] });
        Alert.alert(`+${res.pointsEarned} points`, "Thanks for rating your first time on this player!");
      }
    } catch (err) {
      Alert.alert("Couldn't save your rating", (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!card) return <View style={styles.screen}><Loading /></View>;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
    >
      <Pressable
        disabled={!card.backImageUrl}
        onPress={() => { Haptics.selectionAsync(); flip.set(withTiming(flip.get() > 0.5 ? 0 : 1, { duration: 450 })); }}
        style={styles.cardWrap}
      >
        <Animated.View style={[styles.cardFace, { borderColor: rarityColor[card.rarity] }, front]}>
          <Image source={{ uri: imageUri(card.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
        </Animated.View>
        {card.backImageUrl ? (
          <Animated.View style={[styles.cardFace, styles.cardBack, { borderColor: rarityColor[card.rarity] }, back]}>
            <Image source={{ uri: imageUri(card.backImageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
          </Animated.View>
        ) : null}
        {overall !== null && (
          <View style={[styles.ovr, { borderColor: rarityColor[card.rarity] }]}>
            <Text style={styles.ovrNum}>{overall}</Text>
            <Text style={styles.ovrLbl}>OVR</Text>
          </View>
        )}
      </Pressable>
      {card.backImageUrl ? <Text style={styles.hint}>Tap the card to flip it</Text> : null}

      <Text style={styles.name}>{card.name}</Text>
      <Text style={[styles.meta, { color: rarityColor[card.rarity] }]}>
        {rarityLabel[card.rarity]}{card.position ? ` · ${card.position}` : ""}{card.kit ? ` · ${card.kit}` : ""}
      </Text>
      <Text style={styles.owned}>{owned > 0 ? `In your collection${owned > 1 ? ` ×${owned}` : ""}` : "Not collected yet. Rip a pack!"}</Text>

      <View style={styles.statsHead}>
        <Text style={styles.section}>Fan ratings</Text>
        <Text style={styles.votes}>{votes.data ? `${votes.data.voteCount} vote${votes.data.voteCount === 1 ? "" : "s"}` : ""}</Text>
      </View>
      {votes.isLoading ? <Loading /> : (
        <View style={styles.grid}>
          {STATS.map((s) => {
            const v = votes.data?.voteCount ? votes.data.averages[s.key] : 0;
            return (
              <View key={s.key} style={styles.stat}>
                <Text style={[styles.statAbbrev, { color: s.color }]}>{s.abbrev}</Text>
                <View style={styles.barTrack}><View style={[styles.bar, { width: `${v}%`, backgroundColor: s.color }]} /></View>
                <Text style={styles.statVal}>{votes.data?.voteCount ? v : "–"}</Text>
              </View>
            );
          })}
        </View>
      )}

      {!voting ? (
        <Button
          title={votes.data?.userVote ? "Update your rating" : "Rate this player  ·  +10 pts"}
          onPress={() => setVoting(true)}
          style={{ marginTop: 20 }}
        />
      ) : (
        <View style={styles.votePanel}>
          <Text style={styles.section}>Your rating</Text>
          {STATS.map((s) => (
            <View key={s.key} style={styles.sliderRow}>
              <Text style={styles.sliderLabel}>{s.label}</Text>
              <Slider
                style={{ flex: 1 }}
                minimumValue={0}
                maximumValue={100}
                step={1}
                value={draft[s.key]}
                onSlidingStart={Keyboard.dismiss}
                onValueChange={(v) => setEdits((d) => ({ ...d, [s.key]: v }))}
                minimumTrackTintColor={s.color}
                maximumTrackTintColor={colors.cardHi}
              />
              <StatInput value={draft[s.key]} onChange={(v) => setEdits((d) => ({ ...d, [s.key]: v }))} />
            </View>
          ))}
          <InputAccessoryView nativeID={KEYPAD_BAR}>
            <View style={styles.keypadBar}>
              <Pressable onPress={Keyboard.dismiss} hitSlop={10}>
                <Text style={styles.keypadDone}>Done</Text>
              </Pressable>
            </View>
          </InputAccessoryView>
          <Button title="Submit rating" onPress={submit} loading={submitting} style={{ marginTop: 8 }} />
          <Button title="Cancel" variant="secondary" onPress={() => { setEdits({}); setVoting(false); }} />
        </View>
      )}
    </ScrollView>
  );
}

const CARD_W = 220;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 28, paddingBottom: 48, alignItems: "stretch" },
  cardWrap: { alignSelf: "center", width: CARD_W, height: CARD_W * 1.4 },
  cardFace: { ...StyleSheet.absoluteFill, borderRadius: 16, borderWidth: 3, overflow: "hidden", backgroundColor: colors.card },
  cardBack: {},
  ovr: {
    position: "absolute", top: -10, left: -10, width: 56, height: 56, borderRadius: 28, borderWidth: 2,
    backgroundColor: "#0a0a0a", alignItems: "center", justifyContent: "center",
  },
  ovrNum: { color: "#fff", fontSize: 20, fontWeight: "900", lineHeight: 22 },
  ovrLbl: { color: colors.text2, fontSize: 9, fontWeight: "800" },
  hint: { color: colors.text3, fontSize: 12, textAlign: "center", marginTop: 8 },
  name: { color: colors.text, fontSize: 26, fontWeight: "900", textAlign: "center", marginTop: 16 },
  meta: { fontSize: 14, fontWeight: "700", textAlign: "center", marginTop: 4 },
  owned: { color: colors.text2, fontSize: 13, textAlign: "center", marginTop: 6 },
  statsHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 24, marginBottom: 10 },
  section: { color: colors.text, fontSize: 18, fontWeight: "800" },
  votes: { color: colors.text3, fontSize: 13 },
  grid: { gap: 8 },
  stat: { flexDirection: "row", alignItems: "center", gap: 10 },
  statAbbrev: { width: 34, fontSize: 12, fontWeight: "900" },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.card, overflow: "hidden" },
  bar: { height: 8, borderRadius: 4 },
  statVal: { width: 28, color: colors.text, fontSize: 13, fontWeight: "800", textAlign: "right" },
  votePanel: { marginTop: 24, gap: 6 },
  sliderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sliderLabel: { width: 92, color: colors.text2, fontSize: 13, fontWeight: "600" },
  sliderVal: {
    width: 44, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.card, color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "center",
  },
  keypadBar: {
    flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: colors.cardHi, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  keypadDone: { color: colors.accentHi, fontSize: 16, fontWeight: "700" },
});
