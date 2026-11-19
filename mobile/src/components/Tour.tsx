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
import { isSquadCard } from "@shared/motm";
import { formatPence, PLAYER_PACK } from "@shared/player-packs";
import { Button } from "@/components/ui";
import { PackArt } from "@/components/PackArt";
import { api } from "@/lib/api";
import { CHANNELS, FEATURES } from "@/lib/config";
import { imageUri } from "@/lib/images";
import { colors, rarityColor } from "@/lib/theme";
import type { DbCard } from "@/lib/types";

/** A couple of real cards for the pictures (public endpoint, so it works before sign-in). */
function useTourCards() {
  return useQuery({
    queryKey: ["tour-cards"],
    queryFn: async () => {
      const { cards } = await api<{ cards: DbCard[] }>(`/api/channels/${CHANNELS[0].slug}/cards`);
      const kits = cards.filter((c) => c.kit === "Home Kit");
      const special = cards.find((c) => c.rarity === "rare" && c.position !== "Moment") ?? kits[0];
      return { rate: special ?? null, pack: kits.find((c) => c.name === "Ryan") ?? kits[0] ?? null, kits: kits.filter(isSquadCard) };
    },
    staleTime: Infinity,
  });
}

function Welcome() {
  return (
    <View style={{ alignItems: "center", gap: 18 }}>
      <View style={styles.iconGlow}>
        <Image source={require("../../assets/icon.png")} style={styles.icon} />
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {CHANNELS.map((c) => <View key={c.slug} style={styles.pill}><Text style={styles.pillText}>{c.name}</Text></View>)}
      </View>
    </View>
  );
}

function Videos() {
  return (
    <LinearGradient colors={["#27272a", "#09090b"]} style={styles.thumb}>
      <View style={styles.play}><View style={styles.playTriangle} /></View>
      <View style={[styles.badge, { left: 12, bottom: 12 }]}><Text style={styles.badgeText}>⭐ Man of the Match</Text></View>
      <View style={[styles.badge, { right: 12, top: 12, backgroundColor: "rgba(147,51,234,0.9)" }]}><Text style={styles.badgeText}>⚡ Points</Text></View>
    </LinearGradient>
  );
}

const BARS = [
  { label: "PACE", value: 84, color: "#facc15" },
  { label: "SKILL", value: 91, color: "#a855f7" },
  { label: "AURA", value: 88, color: "#f97316" },
  { label: "CLUTCH", value: 79, color: "#f43f5e" },
];

function Ratings({ card }: { card: DbCard | null }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
      <View style={[styles.rateCard, { borderColor: card ? rarityColor[card.rarity] : colors.border }]}>
        {card && <Image source={{ uri: imageUri(card.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />}
        <View style={styles.ovr}><Text style={styles.ovrNum}>87</Text><Text style={styles.ovrLbl}>OVR</Text></View>
      </View>
      <View style={{ gap: 10, width: 130 }}>
        {BARS.map((b) => (
          <View key={b.label} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[styles.barLabel, { color: b.color }]}>{b.label}</Text>
              <Text style={styles.barValue}>{b.value}</Text>
            </View>
            <View style={styles.barTrack}><View style={[styles.bar, { width: `${b.value}%`, backgroundColor: b.color }]} /></View>
          </View>
        ))}
      </View>
    </View>
  );
}

function BackAPlayer({ card }: { card: DbCard | null }) {
  return (
    <View style={{ alignItems: "center" }}>
      <PackArt playerName={card?.name ?? "Ryan"} imageUrl={card?.imageUrl} width={150} />
      <View style={styles.share}>
        <Text style={styles.shareText}>{formatPence(PLAYER_PACK.playerSharePence, { short: true })} to {card?.name ?? "the player"}</Text>
      </View>
    </View>
  );
}

function Play() {
  return (
    <View style={{ flexDirection: "row", gap: 14 }}>
      {FEATURES.fantasy && (
        <LinearGradient colors={["#065f46", "#022c22"]} style={styles.playTile}>
          <Text style={styles.playEmoji}>🏆</Text>
          <Text style={styles.playName}>Fantasy{"\n"}Div 1</Text>
        </LinearGradient>
      )}
      {FEATURES.street && (
        <LinearGradient colors={["#7c2d12", "#1c1917"]} style={styles.playTile}>
          <Text style={styles.playEmoji}>⚽</Text>
          <Text style={styles.playName}>5IVE{"\n"}STREET</Text>
        </LinearGradient>
      )}
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

/** What the app does, in a few swipeable pages. Shown once on first launch; replay it from Settings. */
export function Tour({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { data: cards } = useTourCards();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const finishing = useRef(false);

  const pages: PageSpec[] = [
    {
      key: "welcome",
      title: "Welcome to 5iveG",
      body: "The fan app for 5ive Guys and Other Guys. Here's what you can do.",
      art: <Welcome />,
    },
    {
      key: "videos",
      title: "Never miss a video",
      body: "Watch the latest videos, vote for Man of the Match and get points just for being a fan.",
      art: <Videos />,
    },
    {
      key: "ratings",
      title: "Rate the players",
      body: "Score every player on pace, skill, aura and more. The fans' ratings decide their stats in the game.",
      art: <Ratings card={cards?.rate ?? null} />,
    },
    ...(FEATURES.shop ? [{
      key: "packs",
      title: "Back your favourite player",
      body: `Buy a player's pack: ${PLAYER_PACK.cardCount} cards with at least one of them, and ${formatPence(PLAYER_PACK.playerSharePence, { short: true })} goes straight to that player.`,
      art: <BackAPlayer card={cards?.pack ?? null} />,
    }] : []),
    ...(FEATURES.fantasy || FEATURES.street ? [{
      key: "play",
      title: FEATURES.fantasy && FEATURES.street ? "Pick your team, then play" : FEATURES.fantasy ? "Play Fantasy Div 1" : "Play 5IVE STREET",
      body: [
        FEATURES.fantasy && "Pick 7 for Fantasy Div 1, score points from their real matches and take on your mates.",
        FEATURES.street && "Then play them in 5IVE STREET, 3v3 street football.",
      ].filter(Boolean).join(" "),
      art: <Play />,
    }] : []),
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
      <LinearGradient colors={["#2e1065", colors.bg]} style={StyleSheet.absoluteFill} end={{ x: 0.5, y: 0.6 }} />
      <View style={styles.top}>
        {!last ? (
          <Pressable onPress={finish} hitSlop={12}><Text style={styles.skip}>Skip</Text></Pressable>
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
        <Button title={last ? "Get started" : "Next"} onPress={next} style={{ alignSelf: "stretch" }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { height: 44, alignItems: "flex-end", justifyContent: "center", paddingHorizontal: 20 },
  skip: { color: colors.text2, fontSize: 16, fontWeight: "700" },
  page: { flex: 1, paddingHorizontal: 28, justifyContent: "center" },
  art: { height: 300, alignItems: "center", justifyContent: "center" },
  copy: { gap: 10, marginTop: 28 },
  title: { color: colors.text, fontSize: 30, fontWeight: "900", textAlign: "center" },
  body: { color: colors.text2, fontSize: 17, lineHeight: 24, textAlign: "center" },
  footer: { paddingHorizontal: 24, gap: 20, alignItems: "center" },
  dots: { flexDirection: "row", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.cardHi },
  dotOn: { width: 22, backgroundColor: colors.accentHi },
  iconGlow: {
    borderRadius: 40, shadowColor: colors.accentHi, shadowOpacity: 0.7, shadowRadius: 30, shadowOffset: { width: 0, height: 0 },
  },
  icon: { width: 150, height: 150, borderRadius: 34 },
  pill: { backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  pillText: { color: colors.text, fontWeight: "700", fontSize: 13 },
  thumb: { width: 280, height: 158, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  play: { width: 64, height: 46, borderRadius: 14, backgroundColor: colors.youtube, alignItems: "center", justifyContent: "center" },
  playTriangle: {
    width: 0, height: 0, marginLeft: 4, borderTopWidth: 10, borderBottomWidth: 10, borderLeftWidth: 17,
    borderTopColor: "transparent", borderBottomColor: "transparent", borderLeftColor: "#fff",
  },
  badge: { position: "absolute", backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  rateCard: { width: 120, height: 168, borderRadius: 12, borderWidth: 2, overflow: "hidden", backgroundColor: colors.card },
  ovr: {
    position: "absolute", top: 6, left: 6, backgroundColor: "rgba(0,0,0,0.8)", borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2, alignItems: "center",
  },
  ovrNum: { color: "#fff", fontSize: 18, fontWeight: "900" },
  ovrLbl: { color: colors.text2, fontSize: 8, fontWeight: "800" },
  barLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  barValue: { color: colors.text, fontSize: 11, fontWeight: "800" },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: colors.cardHi, overflow: "hidden" },
  bar: { height: 6, borderRadius: 3 },
  share: { marginTop: -14, backgroundColor: colors.gold, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  shareText: { color: "#000", fontWeight: "900", fontSize: 14 },
  playTile: { width: 130, height: 170, borderRadius: 20, padding: 16, justifyContent: "space-between", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  playEmoji: { fontSize: 44 },
  playName: { color: "#fff", fontSize: 20, fontWeight: "900", lineHeight: 22 },
});
