import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useChannel } from "@/lib/channel";
import { CHANNELS, type ChannelSlug } from "@/lib/config";
import { useWorldPoints, useWorlds } from "@/lib/queries";
import { colors } from "@/lib/theme";

/**
 * The two worlds (5ive Guys, Other Guys) as big cards to enter. Shown in place of
 * the tabs until the user has entered one, and from the world button in the header.
 */
export function WorldChooser({ onClose }: { onClose?: () => void }) {
  const insets = useSafeAreaInsets();
  const { slug, chosen, setSlug } = useChannel();
  const { data: worlds } = useWorlds();
  const points = useWorldPoints();

  function enter(next: ChannelSlug) {
    Haptics.selectionAsync();
    setSlug(next);
    onClose?.();
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.title}>Choose your world</Text>
          <Text style={styles.sub}>You get points for being a fan.</Text>
        </View>
        {onClose && (
          <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.cards}>
        {CHANNELS.map((c, i) => {
          const world = worlds?.get(c.slug);
          const mine = points[i]?.data;
          const here = chosen && c.slug === slug;
          return (
            <Pressable
              key={c.slug}
              onPress={() => enter(c.slug)}
              style={({ pressed }) => [styles.cardWrap, { opacity: pressed ? 0.85 : 1 }]}
            >
              <LinearGradient
                colors={["#3b0764", colors.card]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.card, here && styles.cardHere]}
              >
                {world?.thumbnailUrl ? (
                  <Image source={{ uri: world.thumbnailUrl }} style={styles.ghost} contentFit="cover" />
                ) : null}

                <View style={styles.crestRow}>
                  {world?.thumbnailUrl ? (
                    <Image source={{ uri: world.thumbnailUrl }} style={styles.crest} contentFit="cover" />
                  ) : (
                    <View style={[styles.crest, styles.crestFallback]}>
                      <Text style={styles.crestLetter}>{c.name[0]}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                    <Text style={styles.fans}>
                      {world ? `${world._count.userStats.toLocaleString()} fans` : " "}
                    </Text>
                  </View>
                </View>

                <View style={styles.foot}>
                  <View style={styles.points}>
                    <Text style={styles.pointsText}>⚡ {mine ? mine.points.toLocaleString() : "–"}</Text>
                  </View>
                  <Text style={styles.enter}>{here ? "You're here" : "Enter ›"}</Text>
                </View>
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 20, paddingHorizontal: 4 },
  title: { color: colors.text, fontSize: 30, fontWeight: "900" },
  sub: { color: colors.text2, fontSize: 15 },
  close: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cardHi,
    alignItems: "center", justifyContent: "center",
  },
  closeText: { color: colors.text2, fontSize: 15, fontWeight: "700" },
  cards: { flex: 1, gap: 16 },
  cardWrap: { flex: 1, maxHeight: 280 },
  card: {
    flex: 1, borderRadius: 24, padding: 20, justifyContent: "space-between", overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(168,85,247,0.3)",
  },
  cardHere: { borderColor: colors.accentHi, borderWidth: 2 },
  ghost: { position: "absolute", right: -50, top: -50, width: 220, height: 220, borderRadius: 110, opacity: 0.12 },
  crestRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  crest: { width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: "rgba(168,85,247,0.5)" },
  crestFallback: { backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  crestLetter: { color: "#fff", fontSize: 34, fontWeight: "900" },
  name: { color: colors.text, fontSize: 28, fontWeight: "900" },
  fans: { color: colors.text2, fontSize: 13 },
  foot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  points: {
    backgroundColor: "rgba(147,51,234,0.18)", borderColor: "rgba(168,85,247,0.4)", borderWidth: 1,
    borderRadius: 14, paddingHorizontal: 12, height: 32, justifyContent: "center",
  },
  pointsText: { color: "#e9d5ff", fontWeight: "800", fontSize: 15, fontVariant: ["tabular-nums"] },
  enter: { color: "#e9d5ff", fontSize: 17, fontWeight: "800" },
});
