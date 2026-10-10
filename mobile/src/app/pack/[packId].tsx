import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import { useQueryClient } from "@tanstack/react-query";
import { PACKS, type Rarity } from "@shared/cards";
import { CardTile } from "@/components/CardTile";
import { Button, ErrorText } from "@/components/ui";
import { api } from "@/lib/api";
import { useChannel } from "@/lib/channel";
import { useMe } from "@/lib/queries";
import { colors, rarityColor, rarityLabel } from "@/lib/theme";
import type { PackCardResult, PackOpenResult } from "@/lib/types";

type Phase = "idle" | "shaking" | "revealing" | "done";

const REVEAL_DELAY: Record<Rarity, number> = { common: 400, rare: 400, epic: 500, legendary: 800 };

function revealHaptic(card: PackCardResult) {
  if (card.isDuplicate) return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  if (card.rarity === "legendary") return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  if (card.rarity === "epic") return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function PackOpening() {
  const { packId } = useLocalSearchParams<{ packId: string }>();
  const pack = PACKS.find((p) => p.id === packId) ?? PACKS[0];
  const { slug } = useChannel();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<PackOpenResult | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const shake = useSharedValue(0);
  const scale = useSharedValue(1);
  const packStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${shake.value}deg` }, { scale: scale.value }],
  }));

  useEffect(() => {
    // gentle idle "breathing" to invite a tap
    scale.set(withRepeat(withSequence(withTiming(1.03, { duration: 900 }), withTiming(1, { duration: 900 })), -1));
  }, [scale]);

  async function rip() {
    if (phase !== "idle") return;
    setError(null);
    setPhase("shaking");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    shake.set(withRepeat(withSequence(withTiming(-6, { duration: 50 }), withTiming(6, { duration: 50 })), -1, true));
    try {
      const [res] = await Promise.all([
        api<PackOpenResult>("/api/packs/open", { body: { packId: pack.id, channelSlug: slug } }),
        wait(700),
      ]);
      shake.set(withSpring(0));
      setResult(res);
      setPhase("revealing");
      queryClient.setQueryData(["me", slug], (old: typeof me) => (old ? { ...old, points: res.remainingPoints } : old));
      for (let i = 0; i < res.cards.length; i++) {
        await wait(REVEAL_DELAY[res.cards[i].rarity]);
        revealHaptic(res.cards[i]);
        setRevealed(i + 1);
      }
      setPhase("done");
      queryClient.invalidateQueries({ queryKey: ["me", slug] });
      queryClient.invalidateQueries({ queryKey: ["collection"] });
    } catch (err) {
      shake.set(withSpring(0));
      setError((err as Error).message);
      setPhase("idle");
    }
  }

  function again() {
    setResult(null);
    setRevealed(0);
    setPhase("idle");
  }

  const cardCount = result?.cards.length ?? pack.cardCount;
  const perRow = cardCount > 3 ? 3 : cardCount;
  const tileWidth = Math.min(150, (width - 32 - (perRow - 1) * 12) / perRow);
  const canAffordAgain = (me?.points ?? 0) >= pack.cost;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.top}>
        {phase !== "shaking" && phase !== "revealing" ? (
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
        ) : <View />}
        <Text style={styles.points}>⚡ {me?.points.toLocaleString() ?? "–"}</Text>
      </View>

      <View style={styles.stage}>
        {(phase === "idle" || phase === "shaking") && (
          <Pressable onPress={rip} disabled={phase !== "idle"}>
            <Animated.View style={packStyle}>
              <LinearGradient colors={["#7e22ce", "#3b0764"]} style={styles.pack}>
                <Text style={styles.packBall}>⚽</Text>
                <Text style={styles.packName}>{pack.name}</Text>
                <Text style={styles.packSub}>{pack.cardCount} cards</Text>
                <View style={styles.packCost}><Text style={styles.packCostText}>⚡ {pack.cost}</Text></View>
              </LinearGradient>
            </Animated.View>
            <Text style={styles.tapHint}>{phase === "idle" ? "Tap to rip it open" : "Opening…"}</Text>
          </Pressable>
        )}

        {result && phase !== "idle" && phase !== "shaking" && (
          <View style={styles.cards}>
            {result.cards.slice(0, revealed).map((card, i) => (
              <Animated.View key={`${card.id}-${i}`} entering={FadeInDown.springify().damping(14)} style={{ alignItems: "center" }}>
                <View style={card.isDuplicate ? { opacity: 0.45 } : undefined}>
                  <CardTile imageUrl={card.image} rarity={card.rarity} width={tileWidth} />
                </View>
                {card.isDuplicate ? (
                  <View style={styles.dupe}>
                    <Text style={styles.dupeTitle}>ALREADY OWNED</Text>
                    <Text style={styles.dupePts}>+{card.refundPoints} pts</Text>
                  </View>
                ) : null}
                <Text style={[styles.cardName, { color: rarityColor[card.rarity] }]} numberOfLines={1}>
                  {card.name}
                </Text>
                <Text style={styles.cardRarity}>{rarityLabel[card.rarity]}</Text>
              </Animated.View>
            ))}
          </View>
        )}
        {error && <ErrorText>{error}</ErrorText>}
      </View>

      {phase === "done" && result && (
        <Animated.View entering={FadeIn.delay(200)} style={styles.actions}>
          {result.duplicateCount > 0 && (
            <Text style={styles.summary}>
              {result.duplicateCount} duplicate{result.duplicateCount === 1 ? "" : "s"}: +{result.totalRefund} pts refunded
            </Text>
          )}
          <Button title={`Open another (⚡ ${pack.cost})`} onPress={again} disabled={!canAffordAgain} />
          <Button title="Done" variant="secondary" onPress={() => router.back()} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", height: 40 },
  close: { color: colors.text2, fontSize: 22, fontWeight: "600" },
  points: { color: "#e9d5ff", fontWeight: "800", fontSize: 16 },
  stage: { flex: 1, alignItems: "center", justifyContent: "center" },
  pack: {
    width: 200, height: 280, borderRadius: 22, alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 2, borderColor: "rgba(168,85,247,0.6)",
  },
  packBall: { fontSize: 56 },
  packName: { color: "#fff", fontSize: 20, fontWeight: "900" },
  packSub: { color: "#d8b4fe", fontSize: 14 },
  packCost: { marginTop: 8, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 },
  packCostText: { color: "#fff", fontWeight: "800" },
  tapHint: { color: colors.text2, textAlign: "center", marginTop: 18, fontSize: 15 },
  cards: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12 },
  cardName: { fontSize: 13, fontWeight: "800", marginTop: 6, maxWidth: 140 },
  cardRarity: { color: colors.text3, fontSize: 11 },
  dupe: { position: "absolute", top: "35%", alignItems: "center", backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 10, padding: 6 },
  dupeTitle: { color: colors.text2, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  dupePts: { color: colors.gold, fontSize: 15, fontWeight: "900" },
  actions: { gap: 10 },
  summary: { color: colors.text2, textAlign: "center", fontSize: 14 },
});
