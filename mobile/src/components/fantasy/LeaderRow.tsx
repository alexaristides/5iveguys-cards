import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/lib/theme";
import type { FantasyLeagueRow } from "@/lib/types";

/** Green up, red down or grey level, from the rank a gameweek ago. */
export function RankMove({ rank, previous }: { rank: number; previous: number | null }) {
  if (previous === null) return <View style={styles.moveSpacer} />;
  const up = rank < previous, down = rank > previous;
  return (
    <View style={[styles.move, { backgroundColor: up ? colors.green : down ? colors.danger : colors.cardHi }]}>
      <Text style={styles.moveText}>{up ? "▲" : down ? "▼" : "•"}</Text>
    </View>
  );
}

/** One team in a league table. */
export function LeaderRow({ row, mine, onPress }: { row: FantasyLeagueRow; mine?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, mine && styles.rowMine, pressed && { opacity: 0.7 }]}
    >
      <RankMove rank={row.rank} previous={row.previousRank} />
      <Text style={[styles.rank, row.rank <= 3 && { color: colors.gold }]}>{row.rank}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{row.name}</Text>
        {row.manager ? <Text style={styles.manager} numberOfLines={1}>{row.manager}</Text> : null}
      </View>
      <Text style={[styles.cell, styles.num]}>{row.lastPoints ?? "–"}</Text>
      <Text style={[styles.cell, styles.num, styles.total]}>{row.totalPoints}</Text>
    </Pressable>
  );
}

export function LeaderHeader() {
  return (
    <View style={styles.header}>
      <Text style={[styles.headCell, { width: 58 }]}>Rank</Text>
      <Text style={[styles.headCell, { flex: 1 }]}>Team</Text>
      <Text style={[styles.headCell, styles.num]}>GW</Text>
      <Text style={[styles.headCell, styles.num]}>Total</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10,
  },
  rowMine: { borderColor: colors.accent, backgroundColor: "#1f1530" },
  move: { width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  moveSpacer: { width: 16 },
  moveText: { color: "#fff", fontSize: 8, fontWeight: "900" },
  rank: { width: 26, color: colors.text2, fontSize: 15, fontWeight: "900" },
  name: { color: colors.text, fontSize: 15, fontWeight: "800" },
  manager: { color: colors.text3, fontSize: 12 },
  cell: { color: colors.text2, fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
  total: { color: colors.text, fontWeight: "900" },
  num: { width: 46, textAlign: "right" },
  header: { flexDirection: "row", paddingHorizontal: 12, marginBottom: 6 },
  headCell: { color: colors.text3, fontSize: 11, fontWeight: "800" },
});
