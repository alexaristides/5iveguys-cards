import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CHIPS, formatPrice } from "@shared/fantasy";
import { RankMove } from "@/components/fantasy/LeaderRow";
import { GameScreen } from "@/components/game/GameScreen";
import { ErrorText, Loading, Panel } from "@/components/ui";
import { useFantasyHistory } from "@/lib/queries";
import { colors } from "@/lib/theme";

/** A team's season gameweek by gameweek: points, rank, transfers and chips. */
export default function FantasyHistoryScreen() {
  const { teamId } = useLocalSearchParams<{ teamId?: string }>();
  const history = useFantasyHistory(teamId);
  const data = history.data;

  return (
    <GameScreen title="History">
      {!data ? (history.error ? <ErrorText>{history.error.message}</ErrorText> : <Loading />) : (
        <>
          <Text style={styles.team}>{data.team.name}{data.team.manager ? ` · ${data.team.manager}` : ""}</Text>
          <Panel style={styles.summary}>
            <Summary label="Total points" value={String(data.team.totalPoints)} />
            <Summary label="Transfers" value={String(data.weeks.reduce((s, w) => s + w.transfersMade, 0))} />
            <Summary label="Hits" value={`−${data.weeks.reduce((s, w) => s + w.transferCost, 0)}`} />
          </Panel>

          <View style={styles.header}>
            <Text style={[styles.head, styles.gw]}>GW</Text>
            <Text style={[styles.head, styles.num]}>Pts</Text>
            <Text style={[styles.head, styles.num]}>Total</Text>
            <Text style={[styles.head, styles.rank]}>Rank</Text>
            <Text style={[styles.head, styles.tm]}>TM</Text>
            <Text style={[styles.head, { flex: 1, textAlign: "right" }]}>Value</Text>
          </View>
          <View style={{ gap: 6 }}>
            {[...data.weeks].reverse().map((w, i, all) => {
              const previous = all[i + 1]?.overallRank ?? null;
              const chip = w.chip ? CHIPS.find((c) => c.id === w.chip) : null;
              return (
                <Pressable
                  key={w.number}
                  onPress={() => router.push({ pathname: "/fantasy/gameweek/[number]", params: { number: String(w.number), ...(teamId ? { teamId } : {}) } })}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                >
                  <View style={styles.gw}>
                    <Text style={styles.cellStrong}>{w.number}</Text>
                    {chip ? <Text style={styles.chip}>{chip.emoji}</Text> : null}
                  </View>
                  <Text style={[styles.cellStrong, styles.num]}>{w.points ?? (w.status === "live" ? "Live" : "–")}</Text>
                  <Text style={[styles.cell, styles.num]}>{w.overallPoints ?? "–"}</Text>
                  <View style={[styles.rank, styles.rankCell]}>
                    {w.overallRank !== null && <RankMove rank={w.overallRank} previous={previous} />}
                    <Text style={styles.cell}>{w.overallRank ?? "–"}</Text>
                  </View>
                  <Text style={[styles.cell, styles.tm, w.transferCost ? { color: colors.danger } : null]}>
                    {w.transfersMade}{w.transferCost ? ` (−${w.transferCost})` : ""}
                  </Text>
                  <Text style={[styles.cell, { flex: 1, textAlign: "right" }]}>{formatPrice(w.value)}</Text>
                </Pressable>
              );
            })}
          </View>
          {data.weeks.length === 0 && <Text style={styles.empty}>No gameweeks played yet.</Text>}
          {data.weeks.some((w) => w.chip) && (
            <Text style={styles.empty}>
              Chips: {data.weeks.filter((w) => w.chip).map((w) => `${CHIPS.find((c) => c.id === w.chip)?.name} (GW${w.number})`).join(", ")}
            </Text>
          )}
        </>
      )}
    </GameScreen>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  team: { color: colors.text2, fontSize: 14, fontWeight: "600", marginBottom: 10 },
  summary: { flexDirection: "row", marginBottom: 16 },
  summaryValue: { color: colors.text, fontSize: 22, fontWeight: "900", fontVariant: ["tabular-nums"] },
  summaryLabel: { color: colors.text3, fontSize: 11, fontWeight: "600" },
  header: { flexDirection: "row", paddingHorizontal: 12, marginBottom: 6 },
  head: { color: colors.text3, fontSize: 11, fontWeight: "800" },
  row: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 12, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 11,
  },
  gw: { width: 44, flexDirection: "row", alignItems: "center", gap: 3 },
  num: { width: 42, textAlign: "right" },
  rank: { width: 70, paddingLeft: 10 },
  rankCell: { flexDirection: "row", alignItems: "center", gap: 5 },
  tm: { width: 58, textAlign: "right" },
  cell: { color: colors.text2, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  cellStrong: { color: colors.text, fontSize: 15, fontWeight: "900", fontVariant: ["tabular-nums"] },
  chip: { fontSize: 11 },
  empty: { color: colors.text3, fontSize: 13, textAlign: "center", marginTop: 14 },
});
