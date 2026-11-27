import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { AppHeader } from "@/components/AppHeader";
import { Chip, ErrorText, Loading } from "@/components/ui";
import { imageUri } from "@/lib/images";
import { useSquadRatings } from "@/lib/queries";
import { overallColor } from "@/lib/ratings";
import { colors, shadow } from "@/lib/theme";
import type { SquadRating } from "@/lib/types";

const CARD_RATIO = 785 / 1085;
const GAP = 10;
type Sort = "top" | "name" | "todo";

const openPlayer = (p: SquadRating) => router.push({ pathname: "/player/[cardId]", params: { cardId: p.cardId } });

/** Players: the 5ive Guys' squad with the fans' overall for each. Tap one to see their ratings and rate them. */
export default function PlayersTab() {
  const { width } = useWindowDimensions();
  const players = useSquadRatings();
  const [sort, setSort] = useState<Sort>("top");

  // Native tabs mount up front: pick up new ratings whenever the tab comes back.
  const { refetch } = players;
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const all = useMemo(() => players.data ?? [], [players.data]);
  const ratedCount = all.filter((p) => p.rated).length;
  const rows = useMemo(() => {
    if (sort === "name") return [...all].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "todo") return all.filter((p) => !p.rated);
    return all; // the API sends them best rated first
  }, [all, sort]);

  const tileWidth = Math.floor((width - 32 - GAP * 2) / 3);

  let body;
  if (!players.data) {
    body = players.error ? <ErrorText>{players.error.message}</ErrorText> : <Loading />;
  } else {
    body = (
      <>
        <View style={styles.progress}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.progressText}>
              {ratedCount === all.length ? "✓ You've rated the whole squad" : `You've rated ${ratedCount} of ${all.length}`}
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${all.length ? (ratedCount / all.length) * 100 : 0}%` }]} />
            </View>
          </View>
        </View>

        <View style={styles.chips}>
          <Chip label="Top rated" active={sort === "top"} onPress={() => setSort("top")} />
          <Chip label="A–Z" active={sort === "name"} onPress={() => setSort("name")} />
          <Chip label={`To rate (${all.length - ratedCount})`} active={sort === "todo"} onPress={() => setSort("todo")} />
        </View>

        {rows.length === 0 ? (
          <Text style={styles.muted}>Nobody left to rate. You can change a rating any time.</Text>
        ) : (
          <View style={styles.grid}>
            {rows.map((p) => <PlayerTile key={p.cardId} player={p} width={tileWidth} />)}
          </View>
        )}
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <AppHeader title="Players" />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={players.isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
      >
        <Text style={styles.intro}>Rate the 5ive Guys. The fans&apos; ratings make each player&apos;s overall.</Text>
        {body}
      </ScrollView>
    </View>
  );
}

function PlayerTile({ player: p, width }: { player: SquadRating; width: number }) {
  const ovrColor = overallColor(p.overall, { gold: colors.gold, green: colors.green, accent: colors.accent, muted: colors.text3 });
  return (
    <Pressable
      onPress={() => openPlayer(p)}
      accessibilityRole="button"
      accessibilityLabel={`${p.name}${p.overall != null ? `, rated ${p.overall}` : ", not rated yet"}${p.rated ? ", you've rated them" : ""}`}
      style={({ pressed }) => [styles.tile, { width }, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
    >
      <View>
        <Image source={{ uri: imageUri(p.imageUrl) }} style={styles.art} contentFit="cover" transition={150} />
        <View style={[styles.ovr, { backgroundColor: ovrColor }]}>
          <Text style={[styles.ovrNum, ovrColor === colors.gold && { color: colors.text }]}>{p.overall ?? "–"}</Text>
        </View>
        {p.rated && <View style={styles.done}><Text style={styles.doneText}>✓</Text></View>}
      </View>
      <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
      <Text style={styles.sub} numberOfLines={1}>{p.position ?? " "}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingTop: 4, paddingBottom: 120, gap: 12 },
  intro: { color: colors.text2, fontSize: 16, lineHeight: 22, fontWeight: "500" },
  muted: { color: colors.text2, fontSize: 15, textAlign: "center", marginTop: 24 },
  progress: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 18, padding: 14, ...shadow },
  progressText: { color: colors.text, fontSize: 15, fontWeight: "800" },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.cardHi, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.green },
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  tile: { backgroundColor: colors.card, borderRadius: 16, padding: 6, paddingBottom: 8, ...shadow },
  art: { width: "100%", aspectRatio: CARD_RATIO, borderRadius: 10, backgroundColor: colors.cardHi },
  ovr: {
    position: "absolute", top: 5, left: 5, minWidth: 30, height: 30, borderRadius: 15, paddingHorizontal: 5,
    alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.white,
  },
  ovrNum: { color: colors.white, fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] },
  done: {
    position: "absolute", top: 5, right: 5, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.green,
    alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.white,
  },
  doneText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  name: { color: colors.text, fontSize: 14, fontWeight: "900", marginTop: 6, textAlign: "center" },
  sub: { color: colors.text3, fontSize: 11, fontWeight: "700", textAlign: "center" },
});
