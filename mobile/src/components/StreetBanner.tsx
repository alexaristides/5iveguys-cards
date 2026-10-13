import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { readStreetRecord } from "@/lib/streetStore";
import type { Record3 } from "@/lib/types";

/** Entry point for 5IVE STREET, the 3D 3v3 game. */
export function StreetBanner() {
  const [record, setRecord] = useState<Record3 | null>(null);
  useFocusEffect(useCallback(() => { readStreetRecord().then(setRecord); }, []));
  const played = record ? record.wins + record.draws + record.losses : 0;

  return (
    <Pressable
      onPress={() => router.push("/play/street")}
      style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.85 : 1 }]}
    >
      <LinearGradient colors={["#a326d6", "#3b0a5c"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.kicker}>NEW · 3D</Text>
          <Text style={styles.title}>5IVE STREET</Text>
          <Text style={styles.sub}>3v3 street football with the squad. Pick your three and take on the CPU.</Text>
          {played > 0 && record && (
            <Text style={styles.record}>{record.wins}W · {record.draws}D · {record.losses}L</Text>
          )}
        </View>
        <View style={styles.play}><Text style={styles.playText}>Play</Text></View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  card: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 20, padding: 18 },
  kicker: { color: "#f0abfc", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: "#fff", fontSize: 24, fontWeight: "900", fontStyle: "italic", letterSpacing: 0.5 },
  sub: { color: "rgba(255,255,255,0.82)", fontSize: 13, lineHeight: 18 },
  record: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "800", marginTop: 2 },
  play: { backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  playText: { color: "#6b21a8", fontWeight: "900", fontSize: 15 },
});
