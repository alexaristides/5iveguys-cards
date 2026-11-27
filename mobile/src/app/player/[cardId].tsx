import { useState } from "react";
import { Alert, InputAccessoryView, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { computeOverall, STAT_FIELDS, type StatKey, type StatsMap } from "@shared/card-rating";
import { Screen } from "@/components/Screen";
import { Button, ErrorText, Loading } from "@/components/ui";
import { api } from "@/lib/api";
import { imageUri } from "@/lib/images";
import { useFantasy, useSquadRatings, useVotes } from "@/lib/queries";
import { EVEN_RATING, overallColor, STATS } from "@/lib/ratings";
import { colors, shadow } from "@/lib/theme";

const CARD_RATIO = 785 / 1085;
// The number pad has no return key, so the stat boxes share a "Done" bar above the keyboard.
const KEYPAD_BAR = "stat-keypad";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const palette = { gold: colors.gold, green: colors.green, accent: colors.accent, muted: colors.text3 };

/**
 * One player: the fans' overall and their average on each stat, how they're doing in fantasy,
 * and your rating. Votes go to their squad card, the same pool as the website and 5IVE STREET.
 */
export default function PlayerScreen() {
  const { cardId } = useLocalSearchParams<{ cardId: string }>();
  const queryClient = useQueryClient();
  const squad = useSquadRatings();
  const votes = useVotes(cardId);
  const fantasy = useFantasy();
  const player = squad.data?.find((p) => p.cardId === cardId);
  const fantasyRow = player?.fantasyPlayerId ? fantasy.data?.players.find((p) => p.id === player.fantasyPlayerId) : undefined;

  const [rating, setRating] = useState(false);
  const [edits, setEdits] = useState<Partial<StatsMap>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!player || !votes.data) {
    const error = squad.error ?? votes.error ?? (squad.data && !player ? new Error("Player not found") : null);
    return <Screen title="Player">{error ? <ErrorText>{error.message}</ErrorText> : <Loading />}</Screen>;
  }

  const { averages, userVote, voteCount } = votes.data;
  const firstName = player.name.split(" ")[0];
  // Sliders start from your last rating, else the fans' average, else 50 across the board.
  const base = userVote ?? (voteCount ? averages : EVEN_RATING);
  const draft = { ...base, ...edits } as StatsMap;
  const setStat = (key: StatKey, v: number) => { setSaved(false); setEdits((d) => ({ ...d, [key]: v })); };
  const overall = player.overall;
  const myOverall = rating ? computeOverall(draft, player.position) : userVote ? computeOverall(userVote, player.position) : null;

  function startRating() {
    Haptics.selectionAsync();
    setSaved(false);
    setEdits({});
    setRating(true);
  }

  function cancel() {
    Keyboard.dismiss();
    setEdits({});
    setRating(false);
  }

  async function save() {
    Keyboard.dismiss();
    setSaving(true);
    try {
      const body = Object.fromEntries(STAT_FIELDS.map((f) => [f, Math.round(draft[f])]));
      await api(`/api/cards/${cardId}/votes`, { body });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Promise.all([votes.refetch(), queryClient.invalidateQueries({ queryKey: ["players"] })]);
      setEdits({});
      setRating(false);
      setSaved(true);
    } catch (err) {
      Alert.alert("Couldn't save your rating", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const footer = rating ? (
    <View style={styles.footerRow}>
      <Button title="Cancel" variant="secondary" onPress={cancel} style={{ flex: 1 }} />
      <Button title="Save rating" onPress={save} loading={saving} style={{ flex: 2 }} />
    </View>
  ) : (
    <Button title={userVote ? "Change your rating" : `Rate ${firstName}`} onPress={startRating} />
  );

  return (
    <Screen title={player.name} footer={footer}>
      <View style={styles.head}>
        <View>
          <Image source={{ uri: imageUri(player.imageUrl) }} style={styles.art} contentFit="cover" transition={150} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.name}>{player.name}</Text>
          {player.position ? <Text style={styles.position}>{player.position}</Text> : null}
          <View style={styles.ovrRow}>
            <View style={[styles.ovr, { backgroundColor: overallColor(overall, palette) }]}>
              <Text style={[styles.ovrNum, overall != null && overall >= 80 && { color: colors.text }]}>{overall ?? "–"}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ovrLabel}>FANS&apos; OVERALL</Text>
              <Text style={styles.ovrSub}>{voteCount ? `from ${plural(voteCount, "rating")}` : "Nobody has rated them yet"}</Text>
            </View>
          </View>
        </View>
      </View>

      {saved && (
        <View style={styles.saved}>
          <Text style={styles.savedText}>✓ Rating saved. Change it any time.</Text>
        </View>
      )}

      {fantasyRow && (
        <Pressable
          onPress={() => router.push({ pathname: "/fantasy/player/[id]", params: { id: fantasyRow.id } })}
          accessibilityRole="button"
          accessibilityLabel={`${player.name}'s fantasy stats`}
          style={({ pressed }) => [styles.fantasy, pressed && { opacity: 0.8 }]}
        >
          <FantasyStat value={fantasyRow.totalPoints} label="Points" />
          <FantasyStat value={fantasyRow.form} label="Form" />
          <FantasyStat value={fantasyRow.goals} label="Goals" />
          <FantasyStat value={`${fantasyRow.selectedBy}%`} label="In teams" />
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      )}

      <View style={styles.sectionRow}>
        <Text style={styles.section}>{rating ? "Your rating" : "Fan ratings"}</Text>
        {myOverall != null && (
          <Text style={styles.mine}>Your overall <Text style={{ color: colors.accent }}>{myOverall}</Text></Text>
        )}
      </View>
      {rating && <Text style={styles.help}>Drag each bar, or tap a number to type it. 0 is awful, 100 is world class.</Text>}

      <View style={styles.stats}>
        {STATS.map((s) => rating ? (
          <View key={s.key} style={styles.statRow}>
            <Text style={styles.statLabel} numberOfLines={1}>{s.label}</Text>
            <Slider
              style={{ flex: 1, height: 36 }}
              minimumValue={0}
              maximumValue={100}
              step={1}
              value={draft[s.key]}
              onSlidingStart={Keyboard.dismiss}
              onValueChange={(v) => setStat(s.key, v)}
              minimumTrackTintColor={s.color}
              maximumTrackTintColor={colors.cardHi}
              accessibilityLabel={s.label}
            />
            <StatInput label={s.label} value={draft[s.key]} onChange={(v) => setStat(s.key, v)} />
          </View>
        ) : (
          <View key={s.key} style={styles.statRow}>
            <Text style={styles.statLabel} numberOfLines={1}>{s.label}</Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${voteCount ? averages[s.key] : 0}%`, backgroundColor: s.color }]} />
              {userVote && <View style={[styles.marker, { left: `${userVote[s.key]}%` }]} />}
            </View>
            <Text style={styles.statValue}>{voteCount ? averages[s.key] : "–"}</Text>
          </View>
        ))}
      </View>
      {!rating && userVote && (
        <View style={styles.legend}>
          <View style={styles.legendMarker} />
          <Text style={styles.legendText}>Your rating</Text>
        </View>
      )}

      <InputAccessoryView nativeID={KEYPAD_BAR}>
        <View style={styles.keypadBar}>
          <Pressable onPress={Keyboard.dismiss} hitSlop={10} accessibilityRole="button">
            <Text style={styles.keypadDone}>Done</Text>
          </Pressable>
        </View>
      </InputAccessoryView>
    </Screen>
  );
}

function FantasyStat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.fStat}>
      <Text style={styles.fValue}>{value}</Text>
      <Text style={styles.fLabel}>{label}</Text>
    </View>
  );
}

/** The number beside each slider; tap it to type a value instead of dragging. */
function StatInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  // Local text while editing; null shows the live value. Focus clears the box (the value stays as
  // the placeholder) so typing replaces it: selectTextOnFocus is unreliable on iOS.
  const [text, setText] = useState<string | null>(null);
  return (
    <TextInput
      style={styles.input}
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
      accessibilityLabel={`${label} value`}
    />
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", gap: 16, alignItems: "center", marginTop: 4 },
  art: { width: 112, aspectRatio: CARD_RATIO, borderRadius: 12, backgroundColor: colors.cardHi, ...shadow },
  name: { color: colors.text, fontSize: 26, fontWeight: "900" },
  position: { color: colors.text3, fontSize: 14, fontWeight: "800" },
  ovrRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  ovr: {
    width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: colors.white, ...shadow,
  },
  ovrNum: { color: colors.white, fontSize: 21, fontWeight: "900", fontVariant: ["tabular-nums"] },
  ovrLabel: { color: colors.text2, fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  ovrSub: { color: colors.text3, fontSize: 13, fontWeight: "600" },
  saved: { marginTop: 14, backgroundColor: colors.greenSoft, borderRadius: 14, padding: 12 },
  savedText: { color: colors.green, fontSize: 14, fontWeight: "800" },
  fantasy: {
    flexDirection: "row", alignItems: "center", marginTop: 14, backgroundColor: colors.card, borderRadius: 18,
    paddingVertical: 12, paddingHorizontal: 8, ...shadow,
  },
  fStat: { flex: 1, alignItems: "center", gap: 2 },
  fValue: { color: colors.text, fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] },
  fLabel: { color: colors.text3, fontSize: 10, fontWeight: "800" },
  chevron: { color: colors.text3, fontSize: 22, fontWeight: "600", paddingHorizontal: 6 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 22, marginBottom: 6 },
  section: { color: colors.text, fontSize: 19, fontWeight: "900" },
  mine: { color: colors.text2, fontSize: 14, fontWeight: "800" },
  help: { color: colors.text3, fontSize: 13, fontWeight: "600", marginBottom: 6 },
  stats: { backgroundColor: colors.card, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, ...shadow },
  statRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 36 },
  statLabel: { width: 96, color: colors.text2, fontSize: 14, fontWeight: "700" },
  track: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.cardHi, justifyContent: "center" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 5 },
  marker: { position: "absolute", width: 3, height: 18, marginLeft: -1.5, borderRadius: 1.5, backgroundColor: colors.text },
  statValue: { width: 30, color: colors.text, fontSize: 15, fontWeight: "900", textAlign: "right", fontVariant: ["tabular-nums"] },
  legend: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, alignSelf: "flex-end" },
  legendMarker: { width: 3, height: 12, borderRadius: 1.5, backgroundColor: colors.text },
  legendText: { color: colors.text3, fontSize: 12, fontWeight: "700" },
  input: {
    width: 48, paddingVertical: 6, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.bg, color: colors.text, fontSize: 16, fontWeight: "900", textAlign: "center",
  },
  footerRow: { flexDirection: "row", gap: 10 },
  keypadBar: {
    flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: colors.cardHi, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  keypadDone: { color: colors.accent, fontSize: 16, fontWeight: "800" },
});
