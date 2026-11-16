import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useChannel } from "@/lib/channel";
import { useAccount, useMe, useWorlds } from "@/lib/queries";
import { colors } from "@/lib/theme";

/** Shared top bar for the tabs: the world you're in (or a title), points, account. */
export function AppHeader({ title }: { title?: string } = {}) {
  const insets = useSafeAreaInsets();
  const { slug, name } = useChannel();
  const { data: me } = useMe();
  const { data: account } = useAccount();
  const { data: worlds } = useWorlds();
  const crest = worlds?.get(slug)?.thumbnailUrl;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      {title ? <Text style={styles.title}>{title}</Text> : (
        <Pressable
          onPress={() => { Haptics.selectionAsync(); router.push("/worlds"); }}
          hitSlop={8}
          style={({ pressed }) => [styles.world, pressed && { opacity: 0.7 }]}
        >
          {crest ? <Image source={{ uri: crest }} style={styles.crest} /> : <View style={[styles.crest, styles.avatarFallback]} />}
          <Text style={styles.worldName}>{name}</Text>
          <Text style={styles.chevron}>▾</Text>
        </Pressable>
      )}
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
  title: { color: colors.text, fontSize: 20, fontWeight: "900" },
  world: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card,
    borderRadius: 18, paddingLeft: 4, paddingRight: 12, height: 36,
  },
  crest: { width: 28, height: 28, borderRadius: 14 },
  worldName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  chevron: { color: colors.text2, fontSize: 12 },
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
