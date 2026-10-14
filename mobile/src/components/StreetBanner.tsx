import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { readStreetRecord } from "@/lib/streetStore";
import type { Record3 } from "@/lib/types";

const play = () => router.push("/play/street");

/**
 * Entry point for 5IVE STREET, the 3D 3v3 game. `hero` is the big tile with a
 * full-width Play button (Game tab); the compact one sits above the squad.
 */
export function StreetBanner({ hero = false }: { hero?: boolean }) {
  const [record, setRecord] = useState<Record3 | null>(null);
  useFocusEffect(useCallback(() => { readStreetRecord().then(setRecord); }, []));
  const played = record ? record.wins + record.draws + record.losses : 0;
  const recordLine = played > 0 && record ? `${record.wins}W · ${record.draws}D · ${record.losses}L` : null;

  if (hero) {
    return (
      <LinearGradient colors={["#a326d6", "#3b0a5c"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Text style={styles.kicker}>NEW · 3D · 3V3</Text>
        <Text style={styles.heroTitle}>5IVE STREET</Text>
        <Text style={styles.sub}>
          Street football in a cage with the squad in 3D. Pick your three, play it off the walls and nutmeg the CPU.
        </Text>
        {recordLine && <Text style={styles.record}>Your record: {recordLine}</Text>}
        <Pressable
          onPress={play}
          accessibilityRole="button"
          accessibilityLabel="Play 5IVE STREET"
          style={({ pressed }) => [styles.heroButton, { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
        >
          <Text style={styles.heroButtonText}>▶  Play 5IVE STREET</Text>
        </Pressable>
      </LinearGradient>
    );
  }

  return (
    <Pressable onPress={play} style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.85 : 1 }]}>
      <LinearGradient colors={["#a326d6", "#3b0a5c"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.kicker}>NEW · 3D</Text>
          <Text style={styles.title}>5IVE STREET</Text>
          <Text style={styles.sub}>3v3 street football with the squad. Pick your three and take on the CPU.</Text>
          {recordLine && <Text style={styles.record}>{recordLine}</Text>}
        </View>
        <View style={styles.pill}><Text style={styles.pillText}>Play</Text></View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  card: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 20, padding: 18 },
  hero: { borderRadius: 22, padding: 20, gap: 6, marginBottom: 16 },
  kicker: { color: "#f0abfc", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: "#fff", fontSize: 24, fontWeight: "900", fontStyle: "italic", letterSpacing: 0.5 },
  heroTitle: { color: "#fff", fontSize: 32, fontWeight: "900", fontStyle: "italic", letterSpacing: 0.5 },
  sub: { color: "rgba(255,255,255,0.82)", fontSize: 13, lineHeight: 18 },
  record: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "800", marginTop: 2 },
  pill: { backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  pillText: { color: "#6b21a8", fontWeight: "900", fontSize: 15 },
  heroButton: { marginTop: 10, backgroundColor: "#fff", borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  heroButtonText: { color: "#6b21a8", fontWeight: "900", fontSize: 17, letterSpacing: 0.3 },
});
