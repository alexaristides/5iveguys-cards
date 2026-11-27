import { ScrollView, StyleSheet, Text, View } from "react-native";
import { FANTASY_RULES } from "@shared/fantasy";
import { fantasyGuide } from "@shared/fantasy-guide";
import { AppHeader } from "@/components/AppHeader";
import { HowItWorks } from "@/components/fantasy/HowItWorks";
import { Panel, SectionTitle } from "@/components/ui";
import { useFantasy } from "@/lib/queries";
import { colors } from "@/lib/theme";

/** How to play: the four steps, then the details. Every number comes from the shared rules. */
export default function HowToPlayTab() {
  const season = useFantasy().data?.season;
  const guide = fantasyGuide(
    { budget: season?.budget ?? FANTASY_RULES.defaultBudget, secondHalfFrom: season?.secondHalfFrom ?? null },
    { autoLineup: true },
  );
  const chips = guide.sections.find((s) => s.title === "Chips");

  return (
    <View style={styles.screen}>
      <AppHeader title="How to play" />
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <Text style={styles.intro}>
          Fantasy football for our real Division 1 season, with Fantasy Premier League&apos;s rules made for 7-a-side.
        </Text>
        <HowItWorks title={null} />

        <SectionTitle>Scoring</SectionTitle>
        <Text style={styles.p}>Your players score from what they do in each real match.</Text>
        <Panel style={{ paddingVertical: 4 }}>
          {guide.scoring.map((s, i) => {
            const minus = s.points.startsWith("−") || s.points.startsWith("-");
            return (
              <View key={s.label} style={[styles.score, i === guide.scoring.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={styles.scoreLabel}>{s.label}</Text>
                <Text style={[styles.pts, { color: minus ? colors.danger : colors.green }]}>{s.points}</Text>
              </View>
            );
          })}
        </Panel>

        <SectionTitle>The details</SectionTitle>
        <View style={{ gap: 10 }}>
          {guide.sections.filter((s) => s !== chips).map((s) => (
            <Panel key={s.title} style={{ gap: 4 }}>
              <Text style={styles.h}>{s.title}</Text>
              <Text style={styles.p}>{s.body}</Text>
            </Panel>
          ))}
        </View>

        {chips && (
          <>
            <SectionTitle>Chips</SectionTitle>
            <Text style={styles.p}>Optional power-ups. {chips.body}</Text>
            <View style={{ gap: 8 }}>
              {guide.chips.map((c) => (
                <Panel key={c.id} style={styles.chip}>
                  <Text style={styles.chipEmoji}>{c.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.h}>{c.name}</Text>
                    <Text style={styles.p}>{c.description}</Text>
                  </View>
                </Panel>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingTop: 4, paddingBottom: 120, gap: 12 },
  intro: { color: colors.text2, fontSize: 16, lineHeight: 22, fontWeight: "500" },
  h: { color: colors.text, fontSize: 17, fontWeight: "900" },
  p: { color: colors.text2, fontSize: 15, lineHeight: 21 },
  score: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  scoreLabel: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "600" },
  pts: { fontSize: 15, fontWeight: "900", textAlign: "right", maxWidth: "50%" },
  chip: { flexDirection: "row", alignItems: "center", gap: 14 },
  chipEmoji: { fontSize: 28 },
});
