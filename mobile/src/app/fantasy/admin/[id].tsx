import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import {
  awardBonus, EMPTY_STATS, gameweekStatus, playerPoints, POSITIONS, type FantasyPosition, type PlayerStats,
} from "@shared/fantasy";
import { POSITION_COLOR } from "@/components/fantasy/FantasyPitch";
import { GameScreen } from "@/components/game/GameScreen";
import { Button, ErrorText, Loading, Panel } from "@/components/ui";
import { adminApi, useAdminSecret, useFantasyAdmin, type AdminGameweek, type AdminPlayer } from "@/lib/fantasy-admin";
import { colors } from "@/lib/theme";

type Count = "goals" | "assists" | "goalsConceded" | "saves" | "defensiveContributions" | "yellowCards" | "ownGoals" | "penaltySaves" | "penaltyMisses";
const COUNTS: { key: Count; label: string; only?: FantasyPosition[] }[] = [
  { key: "goals", label: "Goals" },
  { key: "assists", label: "Assists" },
  { key: "goalsConceded", label: "Conceded" },
  { key: "saves", label: "Saves", only: ["GK"] },
  { key: "defensiveContributions", label: "Def. actions", only: ["DEF", "MID", "FWD"] },
  { key: "yellowCards", label: "Yellow" },
  { key: "ownGoals", label: "Own goals" },
  { key: "penaltySaves", label: "Pens saved", only: ["GK"] },
  { key: "penaltyMisses", label: "Pens missed" },
];

/** Enter one gameweek's score and every player's stats, then save or finalise. */
export default function FantasyAdminGameweekScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { secret } = useAdminSecret();
  const admin = useFantasyAdmin(secret);
  const gw = admin.data?.gameweeks.find((g) => g.id === id);
  if (!admin.data || !gw || !secret) {
    return <GameScreen title="Stats">{admin.error ? <ErrorText>{admin.error.message}</ErrorText> : <Loading />}</GameScreen>;
  }
  return <Editor key={gw.id} gw={gw} players={admin.data.players} secret={secret} />;
}

function Editor({ gw, players, secret }: { gw: AdminGameweek; players: AdminPlayer[]; secret: string }) {
  const queryClient = useQueryClient();
  const status = gameweekStatus(gw);
  const sorted = useMemo(
    () => [...players].sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) || a.name.localeCompare(b.name)),
    [players],
  );
  const [goalsFor, setGoalsFor] = useState(gw.goalsFor ?? 0);
  const [goalsAgainst, setGoalsAgainst] = useState(gw.goalsAgainst ?? 0);
  const [rows, setRows] = useState<Record<string, PlayerStats>>(() => {
    const saved = new Map(gw.stats.map((s) => [s.playerId, s]));
    return Object.fromEntries(players.map((p) => [p.id, { ...EMPTY_STATS, ...saved.get(p.id) }]));
  });
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const set = (id: string, patch: Partial<PlayerStats>) => { setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } })); setTouched(true); };
  const bonus = awardBonus(players.map((p) => ({ id: p.id, position: p.position, stats: rows[p.id] })));
  const played = players.filter((p) => rows[p.id].played).length;

  function togglePlayed(p: AdminPlayer, on: boolean) {
    Haptics.selectionAsync();
    // In 7-a-side most players play most of the match, so start there with the team's goals against.
    set(p.id, on ? { ...EMPTY_STATS, played: true, playedMost: true, goalsConceded: goalsAgainst } : { ...EMPTY_STATS });
    setOpen(on ? p.id : null);
  }

  function changeAgainst(next: number) {
    const value = Math.max(0, next);
    // Players still on the old team total follow the new one.
    setRows((r) => Object.fromEntries(Object.entries(r).map(([id, s]) =>
      [id, s.played && s.goalsConceded === goalsAgainst ? { ...s, goalsConceded: value } : s])));
    setGoalsAgainst(value);
    setTouched(true);
  }

  async function save(finalise: boolean) {
    setBusy(true);
    try {
      await adminApi(secret, {
        action: "saveGameweek", id: gw.id, number: gw.number, name: gw.name ?? "", deadline: gw.deadline, goalsFor, goalsAgainst,
      });
      await adminApi(secret, { action: "saveStats", gameweekId: gw.id, stats: players.map((p) => ({ playerId: p.id, ...rows[p.id] })) });
      if (finalise && !gw.finalizedAt) await adminApi(secret, { action: "finalize", gameweekId: gw.id });
      await queryClient.invalidateQueries({ queryKey: ["fantasy-admin"] });
      ["fantasy", "fantasy-gameweek", "fantasy-leaderboard", "fantasy-leagues", "fantasy-history"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTouched(false);
      if (finalise) {
        Alert.alert(`Gameweek ${gw.number} scored`, "Every team's points, bonus, prices and ranks are updated.");
        router.back();
      }
    } catch (err) {
      Alert.alert("Couldn't save", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function confirmFinalise() {
    Alert.alert(
      `Finalise gameweek ${gw.number}?`,
      `${played} player${played === 1 ? "" : "s"} played, ${goalsFor}–${goalsAgainst}. This scores every team, awards bonus points and moves prices. You can still fix stats afterwards.`,
      [{ text: "Cancel", style: "cancel" }, { text: "Finalise", onPress: () => save(true) }],
    );
  }

  function back() {
    if (!touched) return router.back();
    Alert.alert("Discard changes?", "These stats haven't been saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  }

  return (
    <GameScreen
      title={`GW${gw.number} stats`}
      onBack={back}
      footer={
        <View style={styles.footer}>
          <Button title="Save" variant="secondary" onPress={() => save(false)} loading={busy} disabled={!touched} style={{ flex: 1 }} />
          {gw.finalizedAt ? (
            <Button title="Save & re-score" onPress={() => save(false)} loading={busy} disabled={!touched} style={{ flex: 1.4 }} />
          ) : (
            <Button title="Save & finalise" onPress={confirmFinalise} loading={busy} disabled={status === "upcoming"} style={{ flex: 1.4 }} />
          )}
        </View>
      }
    >
      <Text style={styles.title}>{gw.name ?? `Gameweek ${gw.number}`}</Text>
      <Text style={styles.muted}>
        {status === "upcoming" ? "The deadline hasn't passed yet — you can enter stats, but finalise after the match."
          : gw.finalizedAt ? "Already scored. Saving re-scores every team (prices don't move again)."
            : "Fans see live points as you save. Finalise when the stats are complete."}
      </Text>

      <Panel style={styles.score}>
        <ScoreSide label="5ive Guys" value={goalsFor} onChange={(v) => { setGoalsFor(Math.max(0, v)); setTouched(true); }} />
        <Text style={styles.dash}>–</Text>
        <ScoreSide label={gw.name?.replace(/^vs\.?\s*/i, "") || "Opponent"} value={goalsAgainst} onChange={changeAgainst} />
      </Panel>

      <Text style={styles.section}>Players · {played} played</Text>
      <Text style={styles.hint}>Switch on everyone who played, then tap a player to add goals, assists, cards and the rest. Bonus (3-2-1) is worked out for you.</Text>
      <View style={{ gap: 8 }}>
        {sorted.map((p) => {
          const s = { ...rows[p.id], bonus: bonus.get(p.id) ?? 0 };
          const expanded = open === p.id && s.played;
          return (
            <View key={p.id} style={[styles.player, !s.played && { opacity: 0.6 }]}>
              <Pressable onPress={() => s.played && setOpen(expanded ? null : p.id)} style={styles.playerHead} accessibilityLabel={`${p.name}, ${s.played ? `${playerPoints(s, p.position)} points` : "didn't play"}`}>
                <View style={[styles.pos, { backgroundColor: POSITION_COLOR[p.position] }]}><Text style={styles.posText}>{p.position}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{p.name}</Text>
                  {s.played && <Text style={styles.summary} numberOfLines={1}>{summary(s)}</Text>}
                </View>
                {s.played && <Text style={styles.points}>{playerPoints(s, p.position)}</Text>}
                <Switch value={s.played} onValueChange={(on) => togglePlayed(p, on)} trackColor={{ true: colors.green }} accessibilityLabel={`${p.name} played`} />
              </Pressable>
              {expanded && (
                <View style={styles.details}>
                  <View style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>Played most of the match</Text>
                    <Switch value={s.playedMost} onValueChange={(v) => set(p.id, { playedMost: v })} trackColor={{ true: colors.green }} />
                  </View>
                  <View style={styles.grid}>
                    {COUNTS.filter((c) => !c.only || c.only.includes(p.position)).map((c) => (
                      <Stepper key={c.key} label={c.label} value={s[c.key]} onChange={(v) => set(p.id, { [c.key]: Math.max(0, v) })} />
                    ))}
                  </View>
                  <View style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>Red card</Text>
                    <Switch value={s.redCard} onValueChange={(v) => set(p.id, { redCard: v })} trackColor={{ true: colors.danger }} />
                  </View>
                  {s.bonus ? <Text style={styles.bonus}>+{s.bonus} bonus</Text> : null}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </GameScreen>
  );
}

function summary(s: PlayerStats) {
  const bits = [
    s.goals && `${s.goals}G`, s.assists && `${s.assists}A`, `${s.goalsConceded} conceded`, s.saves && `${s.saves} saves`,
    s.yellowCards && "YC", s.redCard && "RC", s.ownGoals && "OG", s.bonus && `+${s.bonus} bonus`, !s.playedMost && "sub",
  ];
  return bits.filter(Boolean).join(" · ");
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepLabel}>{label}</Text>
      <View style={styles.stepRow}>
        <Pressable onPress={() => { Haptics.selectionAsync(); onChange(value - 1); }} hitSlop={6} style={styles.stepBtn} accessibilityLabel={`Less ${label}`}><Text style={styles.stepBtnText}>−</Text></Pressable>
        <Text style={styles.stepValue}>{value}</Text>
        <Pressable onPress={() => { Haptics.selectionAsync(); onChange(value + 1); }} hitSlop={6} style={styles.stepBtn} accessibilityLabel={`More ${label}`}><Text style={styles.stepBtnText}>+</Text></Pressable>
      </View>
    </View>
  );
}

function ScoreSide({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 6 }}>
      <Text style={styles.scoreLabel} numberOfLines={1}>{label}</Text>
      <View style={styles.stepRow}>
        <Pressable onPress={() => onChange(value - 1)} hitSlop={6} style={styles.stepBtn} accessibilityLabel={`${label} one less goal`}><Text style={styles.stepBtnText}>−</Text></Pressable>
        <Text style={styles.scoreValue}>{value}</Text>
        <Pressable onPress={() => onChange(value + 1)} hitSlop={6} style={styles.stepBtn} accessibilityLabel={`${label} one more goal`}><Text style={styles.stepBtnText}>+</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 22, fontWeight: "900" },
  muted: { color: colors.text2, fontSize: 13, lineHeight: 18, marginTop: 4 },
  score: { flexDirection: "row", alignItems: "center", marginTop: 14 },
  scoreLabel: { color: colors.text2, fontSize: 13, fontWeight: "700", maxWidth: 140 },
  scoreValue: { color: colors.text, fontSize: 34, fontWeight: "900", minWidth: 44, textAlign: "center", fontVariant: ["tabular-nums"] },
  dash: { color: colors.text3, fontSize: 28, fontWeight: "900", marginTop: 20 },
  section: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 22 },
  hint: { color: colors.text3, fontSize: 12, marginTop: 2, marginBottom: 10, lineHeight: 17 },
  player: { backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  playerHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  pos: { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, width: 38, alignItems: "center" },
  posText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  name: { color: colors.text, fontSize: 16, fontWeight: "800" },
  summary: { color: colors.text3, fontSize: 12 },
  points: { color: colors.gold, fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"], marginRight: 4 },
  details: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, padding: 12, gap: 10 },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  toggleLabel: { color: colors.text2, fontSize: 14, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stepper: { width: "31.5%", backgroundColor: colors.cardHi, borderRadius: 10, paddingVertical: 6, alignItems: "center", gap: 2 },
  stepLabel: { color: colors.text3, fontSize: 11, fontWeight: "700" },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  stepBtnText: { color: colors.text, fontSize: 18, fontWeight: "700", lineHeight: 20 },
  stepValue: { color: colors.text, fontSize: 17, fontWeight: "900", minWidth: 22, textAlign: "center", fontVariant: ["tabular-nums"] },
  bonus: { color: colors.gold, fontSize: 13, fontWeight: "800" },
  footer: { flexDirection: "row", gap: 8 },
});
