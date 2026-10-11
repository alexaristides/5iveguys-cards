import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/lib/theme";
import type { FantasyLeaderboardRow } from "@/lib/types";

/** One team in the fantasy standings. */
export function LeaderRow({ row, mine, onPress }: { row: FantasyLeaderboardRow; mine?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, mine && styles.rowMine, pressed && { opacity: 0.7 }]}>
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

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 12, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10,
  },
  rowMine: { borderColor: colors.accent, backgroundColor: "#1f1530" },
  rank: { width: 34, color: colors.text2, fontSize: 15, fontWeight: "900" },
  name: { color: colors.text, fontSize: 15, fontWeight: "800" },
  manager: { color: colors.text3, fontSize: 12 },
  cell: { color: colors.text2, fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
  total: { color: colors.text, fontWeight: "900" },
  num: { width: 48, textAlign: "right" },
});
