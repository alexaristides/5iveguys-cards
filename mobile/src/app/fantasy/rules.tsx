import { ScrollView, StyleSheet, Text, View } from "react-native";
import { FANTASY_RULES } from "@shared/fantasy";
import { fantasyGuide } from "@shared/fantasy-guide";
import { useFantasy } from "@/lib/queries";
import { colors } from "@/lib/theme";

/** How Fantasy Div 1 works. Numbers come straight from the shared rules. */
export default function FantasyRules() {
  const season = useFantasy().data?.season;
  const guide = fantasyGuide({ budget: season?.budget ?? FANTASY_RULES.defaultBudget, secondHalfFrom: season?.secondHalfFrom ?? null });
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>How it works</Text>
      <Text style={styles.p}>Fantasy Premier League rules, made for 7-a-side.</Text>

      {guide.sections.map((s) => (
        <View key={s.title}>
          <Text style={styles.h}>{s.title}</Text>
          <Text style={styles.p}>{s.body}</Text>
          {s.title === "Chips" && guide.chips.map((c) => (
            <View key={c.id} style={styles.row}>
              <Text style={styles.rowLabel}>{c.emoji}  {c.name}</Text>
              <Text style={styles.rowDesc}>{c.description}</Text>
            </View>
          ))}
        </View>
      ))}

      <Text style={styles.h}>Scoring</Text>
      {guide.scoring.map((s) => (
        <View key={s.label} style={styles.score}>
          <Text style={[styles.rowLabel, { flex: 1 }]}>{s.label}</Text>
          <Text style={[styles.pts, s.points.startsWith("−") || s.points.startsWith("-") ? { color: colors.danger } : null]}>{s.points}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 28, paddingBottom: 48 },
  title: { color: colors.text, fontSize: 26, fontWeight: "900", marginBottom: 4 },
  h: { color: colors.text, fontSize: 17, fontWeight: "800", marginTop: 20, marginBottom: 6 },
  p: { color: colors.text2, fontSize: 15, lineHeight: 22 },
  row: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowLabel: { color: colors.text, fontSize: 15, fontWeight: "700" },
  rowDesc: { color: colors.text3, fontSize: 13, marginTop: 2 },
  score: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  pts: { color: colors.greenHi, fontSize: 14, fontWeight: "900", textAlign: "right", maxWidth: "55%" },
});
