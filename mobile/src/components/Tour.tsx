import { useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, {
  interpolate, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, Extrapolation, type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { imageUri } from "@/lib/images";
import { colors, shadow } from "@/lib/theme";

/** The squad's Home Kit photos for the pictures (public endpoint, so it works before sign-in). */
function useSquadPhotos() {
  return useQuery({
    queryKey: ["tour-squad"],
    queryFn: async () => {
      const { cards } = await api<{ cards: { name: string; kit: string | null; imageUrl: string }[] }>("/api/channels/5iveguysfc/cards");
      return cards.filter((c) => c.kit === "Home Kit").map((c) => ({ name: c.name, imageUrl: c.imageUrl }));
    },
    staleTime: Infinity,
  });
}

type Photo = { name: string; imageUrl: string };

function Face({ photo, size, ring }: { photo?: Photo; size: number; ring?: string }) {
  return (
    <View style={[styles.face, { width: size, height: size, borderRadius: size / 2, borderColor: ring ?? colors.white }]}>
      {photo ? <Image source={{ uri: imageUri(photo.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" /> : null}
    </View>
  );
}

function Welcome() {
  return (
    <View style={{ alignItems: "center", gap: 18 }}>
      <Image source={require("../../assets/5iveguys-badge.png")} style={styles.icon} />
      <View style={styles.pill}><Text style={styles.pillText}>⚽ Fantasy Div 1</Text></View>
    </View>
  );
}

/** Seven faces on a little pitch, attack at the top. */
function PickSeven({ photos }: { photos: Photo[] }) {
  const rows = [[0], [1, 2], [3, 4, 5], [6]];
  return (
    <View style={styles.miniPitch}>
      <View style={styles.miniLines} />
      {rows.map((row, r) => (
        <View key={r} style={styles.miniRow}>
          {row.map((i) => <Face key={i} photo={photos[i]} size={58} />)}
        </View>
      ))}
    </View>
  );
}

function Points({ photo }: { photo?: Photo }) {
  const chips = [
    { label: "Goal", pts: "+4", style: { top: 8, left: -6 } },
    { label: "Assist", pts: "+3", style: { top: 70, right: -24 } },
    { label: "Clean sheet", pts: "+5", style: { top: 150, left: -40 } },
  ];
  return (
    <View style={{ width: 200, height: 260, alignItems: "center", justifyContent: "center" }}>
      <View>
        <Face photo={photo} size={150} ring={colors.gold} />
        <View style={styles.captain}><Text style={styles.captainText}>C</Text></View>
      </View>
      <View style={styles.double}><Text style={styles.doubleText}>Captain = ×2</Text></View>
      {chips.map((c) => (
        <View key={c.label} style={[styles.ptsChip, c.style]}>
          <Text style={styles.ptsChipPts}>{c.pts}</Text>
          <Text style={styles.ptsChipLabel}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** A video card with the vote on it. */
function Motm({ photo }: { photo?: Photo }) {
  return (
    <View style={styles.motmCard}>
      <View style={styles.motmThumb}>
        <View style={styles.motmPlay}><View style={styles.motmTriangle} /></View>
      </View>
      <View style={styles.motmRow}>
        <Face photo={photo} size={52} ring={colors.gold} />
        <View style={{ flex: 1 }}>
          <Text style={styles.motmLabel}>⭐ MAN OF THE MATCH</Text>
          <Text style={styles.motmName}>{photo?.name ?? "Your pick"}</Text>
        </View>
        <View style={styles.motmVote}><Text style={styles.motmVoteText}>✓ Voted</Text></View>
      </View>
    </View>
  );
}

function League() {
  const rows = [
    { rank: 1, name: "Sunday Legends", pts: 312, me: false },
    { rank: 2, name: "You", pts: 298, me: true },
    { rank: 3, name: "Big Sam's XI", pts: 271, me: false },
  ];
  return (
    <View style={styles.table}>
      {rows.map((r) => (
        <View key={r.rank} style={[styles.tableRow, r.me && styles.tableRowMe]}>
          <Text style={[styles.tableRank, r.rank === 1 && { color: colors.goldText }]}>{r.rank}</Text>
          <Text style={styles.tableName}>{r.name}</Text>
          <Text style={styles.tablePts}>{r.pts}</Text>
        </View>
      ))}
    </View>
  );
}

interface PageSpec {
  key: string;
  title: string;
  body: string;
  art: ReactNode;
}

function Page({ page, index, scrollX, width }: { page: PageSpec; index: number; scrollX: SharedValue<number>; width: number }) {
  const range = [(index - 1) * width, index * width, (index + 1) * width];
  const art = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, range, [0, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(scrollX.value, range, [width * 0.35, 0, -width * 0.35], Extrapolation.CLAMP) },
      { scale: interpolate(scrollX.value, range, [0.85, 1, 0.85], Extrapolation.CLAMP) },
    ],
  }));
  const text = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, range, [0, 1, 0], Extrapolation.CLAMP),
  }));
  return (
    <View style={[styles.page, { width }]}>
      <Animated.View style={[styles.art, art]}>{page.art}</Animated.View>
      <Animated.View style={[styles.copy, text]}>
        <Text style={styles.title}>{page.title}</Text>
        <Text style={styles.body}>{page.body}</Text>
      </Animated.View>
    </View>
  );
}

/** The app in five swipeable pages. Shown once on first launch; replay it from Settings. */
export function Tour({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const photos = useSquadPhotos().data ?? [];
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const finishing = useRef(false);

  const pages: PageSpec[] = [
    {
      key: "welcome",
      title: "Fantasy football for the 5ive Guys",
      body: "Play along with our real Division 1 season. It's free.",
      art: <Welcome />,
    },
    {
      key: "pick",
      title: "Pick any 7 players",
      body: "Choose 7 of the 5ive Guys. No prices, no budget: just the players you rate.",
      art: <PickSeven photos={photos} />,
    },
    {
      key: "points",
      title: "Score from real matches",
      body: "Goals, assists and clean sheets in our real games score you points. Your captain scores double.",
      art: <Points photo={photos[0]} />,
    },
    {
      key: "motm",
      title: "Vote Man of the Match",
      body: "After every video, pick the player of the match and see who the fans chose.",
      art: <Motm photo={photos[3]} />,
    },
    {
      key: "league",
      title: "Beat your mates",
      body: "Start a league, share the code, and see who finishes top.",
      art: <League />,
    },
  ];
  const last = index === pages.length - 1;

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });
  // The page under the dots and the button follows the scroll, however it got there (swipe or Next).
  useAnimatedReaction(
    () => Math.round(scrollX.value / width),
    (page, previous) => {
      if (page !== previous) scheduleOnRN(setIndex, page);
    },
    [width],
  );

  function finish() {
    if (finishing.current) return;
    finishing.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onDone();
  }

  function next() {
    if (last) return finish();
    Haptics.selectionAsync();
    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      <LinearGradient colors={[colors.accentSoft, colors.bg]} style={StyleSheet.absoluteFill} end={{ x: 0.5, y: 0.6 }} />
      <View style={styles.top}>
        {!last ? (
          <Pressable onPress={finish} hitSlop={12} accessibilityRole="button"><Text style={styles.skip}>Skip</Text></Pressable>
        ) : null}
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {pages.map((p, i) => <Page key={p.key} page={p} index={i} scrollX={scrollX} width={width} />)}
      </Animated.ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {pages.map((p, i) => <View key={p.key} style={[styles.dot, i === index && styles.dotOn]} />)}
        </View>
        <Button title={last ? "Let's play" : "Next"} onPress={next} style={{ alignSelf: "stretch" }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { height: 44, alignItems: "flex-end", justifyContent: "center", paddingHorizontal: 20 },
  skip: { color: colors.text2, fontSize: 16, fontWeight: "700" },
  page: { flex: 1, paddingHorizontal: 28, justifyContent: "center" },
  art: { height: 320, alignItems: "center", justifyContent: "center" },
  copy: { gap: 10, marginTop: 24 },
  title: { color: colors.text, fontSize: 30, fontWeight: "900", textAlign: "center" },
  body: { color: colors.text2, fontSize: 17, lineHeight: 24, textAlign: "center" },
  footer: { paddingHorizontal: 24, gap: 20, alignItems: "center" },
  dots: { flexDirection: "row", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { width: 22, backgroundColor: colors.accent },
  icon: { width: 170, height: 170, borderRadius: 40, ...shadow, shadowOpacity: 0.3 },
  pill: { backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, ...shadow },
  pillText: { color: colors.text, fontWeight: "900", fontSize: 15 },
  face: { overflow: "hidden", backgroundColor: colors.accentSoft, borderWidth: 3, ...shadow },
  miniPitch: {
    width: 260, height: 310, borderRadius: 24, backgroundColor: colors.pitch, paddingVertical: 18, justifyContent: "space-around",
    overflow: "hidden", ...shadow, shadowOpacity: 0.2,
  },
  miniLines: { ...StyleSheet.absoluteFill, margin: 10, borderWidth: 2, borderColor: "rgba(255,255,255,0.45)", borderRadius: 8 },
  miniRow: { flexDirection: "row", justifyContent: "space-evenly" },
  captain: {
    position: "absolute", top: 4, right: 4, width: 38, height: 38, borderRadius: 19, backgroundColor: colors.gold,
    alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.white,
  },
  captainText: { color: "#111", fontSize: 18, fontWeight: "900" },
  double: { marginTop: 14, backgroundColor: colors.goldSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  doubleText: { color: colors.goldText, fontSize: 15, fontWeight: "900" },
  ptsChip: {
    position: "absolute", backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6,
    flexDirection: "row", alignItems: "center", gap: 6, ...shadow, shadowOpacity: 0.15,
  },
  ptsChipPts: { color: colors.green, fontSize: 16, fontWeight: "900" },
  ptsChipLabel: { color: colors.text, fontSize: 13, fontWeight: "800" },
  motmCard: { width: 290, backgroundColor: colors.card, borderRadius: 22, overflow: "hidden", ...shadow, shadowOpacity: 0.15 },
  motmThumb: { height: 150, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  motmPlay: { width: 64, height: 46, borderRadius: 14, backgroundColor: "#FF0033", alignItems: "center", justifyContent: "center" },
  motmTriangle: {
    width: 0, height: 0, marginLeft: 4, borderTopWidth: 10, borderBottomWidth: 10, borderLeftWidth: 17,
    borderTopColor: "transparent", borderBottomColor: "transparent", borderLeftColor: colors.white,
  },
  motmRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  motmLabel: { color: colors.goldText, fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  motmName: { color: colors.text, fontSize: 20, fontWeight: "900" },
  motmVote: { backgroundColor: colors.green, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  motmVoteText: { color: colors.white, fontSize: 13, fontWeight: "900" },
  table: { width: 290, gap: 10 },
  tableRow: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 16,
    paddingVertical: 14, borderWidth: 2, borderColor: "transparent", ...shadow,
  },
  tableRowMe: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  tableRank: { width: 18, color: colors.text2, fontSize: 18, fontWeight: "900" },
  tableName: { flex: 1, color: colors.text, fontSize: 17, fontWeight: "900" },
  tablePts: { color: colors.accent, fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] },
});
