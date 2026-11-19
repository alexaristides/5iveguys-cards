import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn, FadeInDown, ZoomIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import { useQueryClient } from "@tanstack/react-query";
import { CardTile } from "@/components/CardTile";
import { PackArt } from "@/components/PackArt";
import { Button, Chip, ErrorText, Loading } from "@/components/ui";
import { api } from "@/lib/api";
import { CHANNELS } from "@/lib/config";
import { useMyPacks, useShop } from "@/lib/queries";
import { colors, rarityColor, rarityLabel } from "@/lib/theme";
import type { OpenedCard, OpenPackResult } from "@/lib/types";

type Phase = "idle" | "shaking" | "revealing" | "done";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function revealHaptic(card: OpenedCard) {
  if (card.guaranteed || card.rarity === "legendary") return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  if (card.rarity === "epic") return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  return Haptics.impactAsync(card.isNew ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
}

/** For a paid pack without a player (its order went missing): pick whose pack it is. */
function ChoosePlayer({ onPick }: { onPick: (slug: string, name: string) => void }) {
  const { width } = useWindowDimensions();
  const [slug, setSlug] = useState<string>(CHANNELS[0].slug);
  const shop = useShop(slug);
  const tile = (width - 32 - 2 * 12) / 3;
  return (
    <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 24 }}>
      <Text style={styles.chooseTitle}>Whose pack is it?</Text>
      <Text style={styles.chooseSub}>Pick a player: you get at least one of their cards, and they get their share.</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {CHANNELS.map((c) => <Chip key={c.slug} label={c.name} active={slug === c.slug} onPress={() => setSlug(c.slug)} />)}
      </View>
      {shop.isLoading ? <Loading /> : (
        <View style={styles.grid}>
          {(shop.data?.players ?? []).map((p) => (
            <CardTile key={p.name} imageUrl={p.card.imageUrl} rarity={p.card.rarity} name={p.name} width={tile} onPress={() => onPick(slug, p.name)} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

export default function OpenPlayerPack() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const packs = useMyPacks();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>("idle");
  const [choice, setChoice] = useState<{ slug: string; name: string } | null>(null);
  const [result, setResult] = useState<OpenPackResult | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pack = [...(packs.data?.unopened ?? []), ...(packs.data?.opened ?? [])].find((p) => p.id === id);
  const playerName = result?.playerName ?? pack?.playerName ?? choice?.name ?? null;
  const nextPack = packs.data?.unopened.find((p) => p.id !== id);

  const shake = useSharedValue(0);
  const scale = useSharedValue(1);
  const packStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${shake.value}deg` }, { scale: scale.value }] }));

  useEffect(() => {
    scale.set(withRepeat(withSequence(withTiming(1.03, { duration: 900 }), withTiming(1, { duration: 900 })), -1));
  }, [scale]);

  async function rip() {
    if (phase !== "idle") return;
    setError(null);
    setPhase("shaking");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    shake.set(withRepeat(withSequence(withTiming(-6, { duration: 50 }), withTiming(6, { duration: 50 })), -1, true));
    try {
      const body = choice ? { channelSlug: choice.slug, playerName: choice.name } : {};
      const [res] = await Promise.all([api<OpenPackResult>(`/api/shop/packs/${id}/open`, { body }), wait(800)]);
      shake.set(withSpring(0));
      setResult(res);
      setPhase("revealing");
      queryClient.invalidateQueries({ queryKey: ["player-packs"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["collection"] });
      for (let i = 0; i < res.cards.length; i++) {
        await wait(res.cards[i].guaranteed ? 1000 : 450);
        revealHaptic(res.cards[i]);
        setRevealed(i + 1);
      }
      setPhase("done");
    } catch (err) {
      shake.set(withSpring(0));
      setError((err as Error).message);
      setPhase("idle");
    }
  }

  // The four squad cards share a row; the player's card gets the stage below them.
  const smallWidth = Math.min(90, (width - 32 - 3 * 10) / 4);
  const bigWidth = Math.min(150, width * 0.38);
  const needsPlayer = !!pack && !pack.playerName && !choice && !result;
  const busy = phase === "shaking" || phase === "revealing";

  let stage;
  if (packs.isLoading && !result) stage = <Loading />;
  else if (needsPlayer) stage = <ChoosePlayer onPick={(slug, name) => setChoice({ slug, name })} />;
  else if (phase === "idle" || phase === "shaking") {
    stage = (
      <Pressable onPress={rip} disabled={phase !== "idle"} style={{ alignItems: "center" }}>
        <Animated.View style={packStyle}>
          <PackArt playerName={playerName} imageUrl={pack?.card?.imageUrl} width={210} />
        </Animated.View>
        <Text style={styles.tapHint}>{phase === "idle" ? "Tap to rip it open" : "Opening…"}</Text>
      </Pressable>
    );
  } else if (result) {
    stage = (
      <View style={styles.cards}>
        {result.cards.slice(0, revealed).map((card, i) => (
          <Animated.View
            key={`${card.id}-${i}`}
            entering={card.guaranteed ? ZoomIn.springify().damping(12) : FadeInDown.springify().damping(14)}
            style={[styles.cardSlot, card.guaranteed && styles.guaranteedSlot]}
          >
            {card.guaranteed && <Text style={styles.yourCard}>YOUR {playerName?.toUpperCase()} CARD</Text>}
            <CardTile imageUrl={card.imageUrl} rarity={card.rarity} width={card.guaranteed ? bigWidth : smallWidth} />
            <View style={[styles.tag, card.isNew ? styles.tagNew : styles.tagDupe]}>
              <Text style={styles.tagText}>{card.isNew ? "NEW" : "DUPLICATE"}</Text>
            </View>
            <Text style={[styles.cardName, { color: rarityColor[card.rarity], maxWidth: card.guaranteed ? bigWidth + 40 : smallWidth }]} numberOfLines={1}>
              {card.name}
            </Text>
            <Text style={styles.cardRarity}>{rarityLabel[card.rarity]}</Text>
          </Animated.View>
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.top}>
        {!busy ? (
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
        ) : <View />}
        {playerName ? <Text style={styles.heading}>{playerName}&apos;s Pack</Text> : <View />}
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.stage}>
        {stage}
        {error && <ErrorText>{error}</ErrorText>}
      </View>

      {phase === "done" && result && (
        <Animated.View entering={FadeIn.delay(200)} style={styles.actions}>
          <Text style={styles.summary}>
            {result.cards.filter((c) => c.isNew).length} new for your collection. Thanks for backing {playerName}!
          </Text>
          {nextPack && (
            <Button title="Open your next pack" onPress={() => router.replace({ pathname: "/shop/open/[id]", params: { id: nextPack.id } })} />
          )}
          <Button title="Done" variant={nextPack ? "secondary" : "primary"} onPress={() => router.back()} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", height: 40 },
  close: { color: colors.text2, fontSize: 22, fontWeight: "600", width: 22 },
  heading: { color: colors.text, fontSize: 17, fontWeight: "800" },
  stage: { flex: 1, justifyContent: "center" },
  tapHint: { color: colors.text2, textAlign: "center", marginTop: 18, fontSize: 15 },
  cards: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 10, rowGap: 18 },
  cardSlot: { alignItems: "center" },
  guaranteedSlot: { width: "100%", marginTop: 4 },
  yourCard: { color: colors.gold, fontSize: 12, fontWeight: "900", letterSpacing: 1.5, marginBottom: 6 },
  tag: { marginTop: 6, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  tagNew: { backgroundColor: colors.green },
  tagDupe: { backgroundColor: colors.cardHi },
  tagText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  cardName: { fontSize: 12, fontWeight: "800", marginTop: 4 },
  cardRarity: { color: colors.text3, fontSize: 11 },
  actions: { gap: 10 },
  summary: { color: colors.text2, textAlign: "center", fontSize: 14 },
  chooseTitle: { color: colors.text, fontSize: 24, fontWeight: "900" },
  chooseSub: { color: colors.text2, fontSize: 14, lineHeight: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
});
