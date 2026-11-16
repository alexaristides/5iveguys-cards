import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { AppHeader } from "@/components/AppHeader";
import { StreetBanner } from "@/components/StreetBanner";
import { SectionTitle } from "@/components/ui";
import { FEATURES } from "@/lib/config";
import { readExhibitionStats } from "@/lib/exhibitionStore";
import { useFootballRecord, usePvpRecord, useRefreshOnFocus } from "@/lib/queries";
import { colors } from "@/lib/theme";
import type { Record3 } from "@/lib/types";

const fmt = (r?: Record3) => (r ? `${r.wins}W · ${r.draws}D · ${r.losses}L` : " ");

export default function GameTab() {
  const cpu = useFootballRecord();
  const pvp = usePvpRecord();
  const [exhibitionGames, setExhibitionGames] = useState(0);

  useRefreshOnFocus(cpu.refetch);
  useRefreshOnFocus(pvp.refetch);
  useFocusEffect(useCallback(() => {
    readExhibitionStats().then((s) => setExhibitionGames(s.gamesPlayed));
  }, []));

  return (
    <View style={styles.screen}>
      <AppHeader title="Game" />
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <SectionTitle>Play</SectionTitle>
        {FEATURES.street && <StreetBanner hero />}
        <Mode
          emoji="🤖" title="vs CPU" sub="Build a 7-a-side squad from your cards and take on the computer."
          record={fmt(cpu.data)} gradient={["#15803d", "#14532d"]} onPress={() => router.push("/play/cpu")}
        />
        <Mode
          emoji="⚔️" title="PvP · 1v1 live" sub="Challenge a friend. You both pick squads and watch the same match."
          record={fmt(pvp.data)} gradient={["#1d4ed8", "#312e81"]} onPress={() => router.push("/play/pvp")}
        />
        <Mode
          emoji="🏟️" title="Exhibition" sub="Pick both teams from every player. Fan ratings decide who wins."
          record={exhibitionGames ? `${exhibitionGames} played` : " "} gradient={["#b45309", "#7c2d12"]}
          onPress={() => router.push("/play/exhibition")}
        />
      </ScrollView>
    </View>
  );
}

function Mode({
  emoji, title, sub, record, gradient, onPress,
}: { emoji: string; title: string; sub: string; record: string; gradient: [string, string]; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ marginBottom: 12, opacity: pressed ? 0.85 : 1 }]}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mode}>
        <Text style={styles.emoji}>{emoji}</Text>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>{sub}</Text>
          <Text style={styles.record}>{record}</Text>
        </View>
        <Text style={styles.chev}>›</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  mode: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 20, padding: 18 },
  emoji: { fontSize: 38 },
  title: { color: "#fff", fontSize: 20, fontWeight: "900" },
  sub: { color: "rgba(255,255,255,0.8)", fontSize: 13, lineHeight: 18 },
  record: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "800", marginTop: 2 },
  chev: { color: "rgba(255,255,255,0.7)", fontSize: 34, fontWeight: "300" },
});
