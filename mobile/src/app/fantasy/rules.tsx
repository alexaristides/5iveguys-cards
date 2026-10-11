import { ScrollView, StyleSheet, Text, View } from "react-native";
import { CHIPS, FANTASY_POINTS, FANTASY_RULES, formatPrice } from "@shared/fantasy";
import { useFantasy } from "@/lib/queries";
import { colors } from "@/lib/theme";

const P = FANTASY_POINTS;
const SCORING: [string, number][] = [
  ["Playing", P.played], ["Goal", P.goal], ["Assist", P.assist], ["Hat-trick bonus", P.hatTrick],
  ["Clean sheet (GK & DEF)", P.cleanSheet], ["Penalty save", P.penaltySave], ["Man of the Match", P.motm],
  ["Yellow card", P.yellowCard], ["Red card", P.redCard], ["Own goal", P.ownGoal], ["Penalty miss", P.penaltyMiss],
];

/** How Fantasy Div 1 works. Numbers come straight from the shared rules. */
export default function FantasyRules() {
  const budget = useFantasy().data?.season?.budget ?? FANTASY_RULES.defaultBudget;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>How it works</Text>

      <Text style={styles.h}>Your team</Text>
      <Text style={styles.p}>
        Pick {FANTASY_RULES.squadSize} players from the 5ive Guys squad with a {formatPrice(budget)} budget:
        a starting {FANTASY_RULES.starters} (1 keeper, at least 2 defenders, 1 midfielder and 1 forward) and 2 subs.
        Your team locks at each gameweek&apos;s deadline (kickoff).
      </Text>

      <Text style={styles.h}>Captain</Text>
      <Text style={styles.p}>
        Your captain scores double. If they don&apos;t play, your vice-captain gets the armband instead.
      </Text>

      <Text style={styles.h}>Subs</Text>
      <Text style={styles.p}>
        If a starter doesn&apos;t play, your subs come on in bench order — as long as your line-up stays legal.
      </Text>

      <Text style={styles.h}>Transfers</Text>
      <Text style={styles.p}>
        Change your team as much as you like before your first deadline. After that you get 1 free transfer a week;
        unused ones roll over (up to {FANTASY_RULES.maxFreeTransfers}). Each extra transfer costs {FANTASY_RULES.transferCost} points.
        Players keep the price you paid for them.
      </Text>

      <Text style={styles.h}>Chips</Text>
      <Text style={styles.p}>Each chip can be played once a season, one per gameweek.</Text>
      {CHIPS.map((c) => (
        <View key={c.id} style={styles.row}>
          <Text style={styles.rowLabel}>{c.emoji}  {c.name}</Text>
          <Text style={styles.rowDesc}>{c.description}</Text>
        </View>
      ))}

      <Text style={styles.h}>Scoring</Text>
      {SCORING.map(([label, pts]) => (
        <View key={label} style={styles.score}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={[styles.pts, pts < 0 && { color: colors.danger }]}>{pts > 0 ? `+${pts}` : pts}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 28, paddingBottom: 48 },
  title: { color: colors.text, fontSize: 26, fontWeight: "900", marginBottom: 6 },
  h: { color: colors.text, fontSize: 17, fontWeight: "800", marginTop: 20, marginBottom: 6 },
  p: { color: colors.text2, fontSize: 15, lineHeight: 22 },
  row: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowLabel: { color: colors.text, fontSize: 15, fontWeight: "700" },
  rowDesc: { color: colors.text3, fontSize: 13, marginTop: 2 },
  score: {
    flexDirection: "row", justifyContent: "space-between", paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  pts: { color: colors.greenHi, fontSize: 15, fontWeight: "900" },
});
