import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import type { MatchEvent, PlayerInvolvement } from "@shared/football";
import { imageUri } from "@/lib/images";
import { colors } from "@/lib/theme";

/** Post-match summary: overalls, goalscorers, man of the match, then actions. */
export function ResultPanel({
  events, userLabel, cpuLabel, userOverall, cpuOverall, nameOf, mvp, extra, children,
}: {
  events: MatchEvent[];
  userLabel: string;
  cpuLabel: string;
  userOverall?: number;
  cpuOverall?: number;
  nameOf: (cardId: string) => string;
  mvp?: Pick<PlayerInvolvement, "name" | "imageUrl" | "goals" | "assists"> | null;
  extra?: ReactNode;
  children?: ReactNode;
}) {
  const goals = events.filter((e) => e.type === "goal" && e.scorerCardId);
  const side = (team: "user" | "cpu") => goals.filter((g) => g.team === team);
  return (
    <View style={styles.wrap}>
      {userOverall !== undefined && cpuOverall !== undefined && (
        <View style={styles.box}>
          <View style={styles.row}>
            <View style={styles.col}><Text style={styles.big}>{Math.round(userOverall)}</Text><Text style={styles.lbl}>{userLabel} OVR</Text></View>
            <View style={styles.col}><Text style={styles.big}>{Math.round(cpuOverall)}</Text><Text style={styles.lbl}>{cpuLabel} OVR</Text></View>
          </View>
        </View>
      )}
      {goals.length > 0 && (
        <View style={styles.box}>
          <Text style={styles.head}>GOALS</Text>
          <View style={styles.row}>
            {(["user", "cpu"] as const).map((team) => (
              <View key={team} style={styles.col}>
                {side(team).map((g, i) => (
                  <Text key={i} style={[styles.goal, { color: team === "user" ? "#93c5fd" : "#fca5a5" }]}>
                    ⚽ {nameOf(g.scorerCardId!)} {g.minute}&apos;
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </View>
      )}
      {mvp && (
        <View style={[styles.box, styles.mvp]}>
          <Image source={{ uri: imageUri(mvp.imageUrl) }} style={styles.mvpImg} contentFit="cover" />
          <View>
            <Text style={styles.head}>MAN OF THE MATCH</Text>
            <Text style={styles.mvpName}>{mvp.name}</Text>
            <Text style={styles.lbl}>{mvp.goals} goal{mvp.goals === 1 ? "" : "s"} · {mvp.assists} assist{mvp.assists === 1 ? "" : "s"}</Text>
          </View>
        </View>
      )}
      {extra}
      <View style={{ gap: 10, marginTop: 4 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, gap: 10 },
  box: { backgroundColor: colors.card, borderRadius: 14, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  row: { flexDirection: "row" },
  col: { flex: 1, alignItems: "center", gap: 4 },
  big: { color: "#fff", fontSize: 22, fontWeight: "900" },
  lbl: { color: colors.text3, fontSize: 12 },
  head: { color: colors.text3, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginBottom: 6 },
  goal: { fontSize: 13, fontWeight: "700" },
  mvp: { flexDirection: "row", alignItems: "center", gap: 12 },
  mvpImg: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.gold },
  mvpName: { color: "#fff", fontSize: 17, fontWeight: "900" },
});
