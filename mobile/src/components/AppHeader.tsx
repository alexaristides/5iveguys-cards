import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { CHANNELS } from "@/lib/config";
import { useChannel } from "@/lib/channel";
import { useAccount, useMe } from "@/lib/queries";
import { colors } from "@/lib/theme";

/** Shared top bar for the three tabs: channel switch, points, account. */
export function AppHeader() {
  const insets = useSafeAreaInsets();
  const { slug, setSlug } = useChannel();
  const { data: me } = useMe();
  const { data: account } = useAccount();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      <View style={styles.switcher}>
        {CHANNELS.map((c) => {
          const active = c.slug === slug;
          return (
            <Pressable
              key={c.slug}
              onPress={() => { if (!active) { Haptics.selectionAsync(); setSlug(c.slug); } }}
              style={[styles.seg, active && styles.segActive]}
            >
              <Text style={[styles.segText, active && styles.segTextActive]}>{c.name}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.right}>
        <View style={styles.points}>
          <Text style={styles.pointsText}>⚡ {me ? me.points.toLocaleString() : "–"}</Text>
        </View>
        <Pressable onPress={() => router.push("/settings")} hitSlop={8}>
          {account?.image ? (
            <Image source={{ uri: account.image }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarText}>{(account?.name ?? "?")[0]?.toUpperCase()}</Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 10, backgroundColor: colors.bg,
  },
  switcher: { flexDirection: "row", backgroundColor: colors.card, borderRadius: 12, padding: 3 },
  seg: { paddingHorizontal: 12, height: 30, borderRadius: 9, justifyContent: "center" },
  segActive: { backgroundColor: colors.accent },
  segText: { color: colors.text2, fontSize: 13, fontWeight: "700" },
  segTextActive: { color: "#fff" },
  right: { flexDirection: "row", alignItems: "center", gap: 10 },
  points: {
    backgroundColor: "rgba(147,51,234,0.18)", borderColor: "rgba(168,85,247,0.4)", borderWidth: 1,
    borderRadius: 14, paddingHorizontal: 10, height: 30, justifyContent: "center",
  },
  pointsText: { color: "#e9d5ff", fontWeight: "800", fontSize: 14, fontVariant: ["tabular-nums"] },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarFallback: { backgroundColor: colors.cardHi, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.text, fontWeight: "700" },
});
