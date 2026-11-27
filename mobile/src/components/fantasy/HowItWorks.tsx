import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { FANTASY_RULES } from "@shared/fantasy";
import { Panel, SectionTitle } from "@/components/ui";
import { colors } from "@/lib/theme";

export const STEPS = [
  { emoji: "👕", title: `Pick ${FANTASY_RULES.squadSize} players`, body: "Any of the 5ive Guys. No prices, no budget." },
  { emoji: "⭐", title: "Choose a captain", body: "Your captain scores double points." },
  { emoji: "⚽", title: "Score points", body: "Goals, assists, clean sheets and more, from our real matches." },
  { emoji: "🏆", title: "Beat your mates", body: "Start a league and share the code." },
];

/** The whole game in four steps. `title` adds a heading (with a link to the rules unless `hideLink`). */
export function HowItWorks({ title = "How it works", hideLink }: { title?: string | null; hideLink?: boolean }) {
  return (
    <>
      {title !== null && (
        <SectionTitle
          right={hideLink ? null : (
            <Pressable onPress={() => router.navigate("/rules")} hitSlop={8} accessibilityRole="link">
              <Text style={styles.link}>All the rules</Text>
            </Pressable>
          )}
        >
          {title}
        </SectionTitle>
      )}
      <Panel style={{ gap: 14 }}>
        {STEPS.map((s, i) => (
          <View key={s.title} style={styles.row}>
            <View style={styles.icon}><Text style={styles.emoji}>{s.emoji}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{i + 1}. {s.title}</Text>
              <Text style={styles.body}>{s.body}</Text>
            </View>
          </View>
        ))}
      </Panel>
    </>
  );
}

const styles = StyleSheet.create({
  link: { color: colors.accent, fontSize: 15, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  icon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  emoji: { fontSize: 22 },
  title: { color: colors.text, fontSize: 16, fontWeight: "900" },
  body: { color: colors.text2, fontSize: 14, lineHeight: 19, marginTop: 1 },
});
