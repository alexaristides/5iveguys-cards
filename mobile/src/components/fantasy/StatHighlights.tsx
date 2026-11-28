import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { formatStat, statHighlights, type FantasyStats } from "@shared/fantasy-stats";
import { SectionTitle } from "@/components/ui";
import { imageUri } from "@/lib/images";
import { colors, shadow } from "@/lib/theme";

const openPlayer = (id: string) => router.push({ pathname: "/fantasy/player/[id]", params: { id } });

/**
 * My Team's "Season stats": the leaders on the main boards (most picked, points, goals, transfers in),
 * each opening the player's card, and "See all" for the full stats screen. Nothing until someone leads.
 */
export function StatHighlights({ stats }: { stats: FantasyStats | undefined }) {
  const highlights = stats ? statHighlights(stats.players) : [];
  if (!highlights.length) return null;
  return (
    <>
      <SectionTitle
        right={(
          <Pressable onPress={() => router.push("/fantasy/stats")} hitSlop={8} accessibilityRole="button">
            <Text style={styles.all}>See all</Text>
          </Pressable>
        )}
      >
        Season stats
      </SectionTitle>
      <View style={styles.grid}>
        {highlights.map(({ board, player, value, tied }) => (
          <Pressable
            key={board.id}
            onPress={() => openPlayer(player.id)}
            accessibilityRole="button"
            accessibilityLabel={`${board.title}: ${player.name}, ${formatStat(board, value)}`}
            style={({ pressed }) => [styles.tile, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.label} numberOfLines={2}>{board.emoji} {board.title.toUpperCase()}</Text>
            <View style={styles.leader}>
              <View style={styles.photo}>
                {player.imageUrl ? <Image source={{ uri: imageUri(player.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{player.name}</Text>
                <Text style={styles.value}>{formatStat(board, value)}</Text>
                {tied > 0 && <Text style={styles.tied}>& {tied} more</Text>}
              </View>
            </View>
          </Pressable>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  all: { color: colors.accent, fontSize: 16, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "48.5%", flexGrow: 1, backgroundColor: colors.card, borderRadius: 18, padding: 12, gap: 8, ...shadow },
  label: { color: colors.text3, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  leader: { flexDirection: "row", alignItems: "center", gap: 10 },
  photo: { width: 40, aspectRatio: 785 / 1085, borderRadius: 6, overflow: "hidden", backgroundColor: colors.cardHi },
  name: { color: colors.text, fontSize: 16, fontWeight: "900" },
  value: { color: colors.accent, fontSize: 20, fontWeight: "900", fontVariant: ["tabular-nums"] },
  tied: { color: colors.text3, fontSize: 12, fontWeight: "600" },
});
