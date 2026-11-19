import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { formatPence, RARITIES } from "@shared/player-packs";
import { PackArt } from "@/components/PackArt";
import { Button, ErrorText, Loading } from "@/components/ui";
import { useShop } from "@/lib/queries";
import { useShopPurchases } from "@/lib/shop";
import { colors, rarityColor, rarityLabel } from "@/lib/theme";
import type { RarityOdds } from "@/lib/types";

/** The odds, rarest first, leaving out rarities that can't come up. */
function Odds({ odds }: { odds: RarityOdds }) {
  return (
    <View style={styles.odds}>
      {[...RARITIES].reverse().filter((r) => odds[r] > 0).map((r) => (
        <View key={r} style={[styles.odd, { borderColor: rarityColor[r] }]}>
          <Text style={[styles.oddPct, { color: rarityColor[r] }]}>{odds[r]}%</Text>
          <Text style={styles.oddLabel}>{rarityLabel[r]}</Text>
        </View>
      ))}
    </View>
  );
}

/** One player's pack: what's in it, the odds, and Buy. */
export default function PlayerPackSheet() {
  const { name, slug } = useLocalSearchParams<{ name: string; slug: string }>();
  const shop = useShop(slug);
  const { price, canBuy, unavailable, buy } = useShopPurchases();
  const [busy, setBusy] = useState(false);
  const player = shop.data?.players.find((p) => p.name === name);
  const pack = shop.data?.pack;

  async function onBuy() {
    if (!player) return;
    setBusy(true);
    try {
      const result = await buy(slug, player.name);
      if (!result) return;
      if ("error" in result) {
        Alert.alert("Couldn't buy the pack", result.error);
      } else if ("packId" in result) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
        router.push({ pathname: "/shop/open/[id]", params: { id: result.packId } });
      } else {
        Alert.alert("Thanks for backing " + player.name, result.message);
        router.back();
      }
    } catch (err) {
      Alert.alert("Couldn't buy the pack", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (shop.isLoading) return <View style={styles.screen}><Loading /></View>;
  if (!player || !pack) return <View style={styles.screen}><ErrorText>{shop.error?.message ?? `There's no pack of ${name} right now.`}</ErrorText></View>;

  const others = pack.cardCount - 1;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.art}>
        <PackArt playerName={player.name} imageUrl={player.card.imageUrl} width={170} cardCount={pack.cardCount} />
      </View>
      <Text style={styles.title}>{player.name}&apos;s Pack</Text>
      <Text style={styles.sub}>{pack.cardCount} cards · at least 1 {player.name} card</Text>

      <View style={styles.support}>
        <Text style={styles.supportBig}>{formatPence(pack.playerSharePence, { short: true })} goes to {player.name}</Text>
        <Text style={styles.supportSmall}>
          {player.supporters > 0
            ? `${player.supporters.toLocaleString()} pack${player.supporters === 1 ? "" : "s"} bought so far. Every one backs ${player.name}.`
            : `From every ${player.name} pack. Be the first to back ${player.name}.`}
        </Text>
      </View>

      <Button title={canBuy ? `Buy for ${price}` : "Not available"} onPress={onBuy} loading={busy} disabled={!canBuy} />
      {unavailable ? <Text style={styles.note}>{unavailable}</Text> : null}

      <Text style={styles.section}>What&apos;s inside</Text>
      <View style={styles.box}>
        <Text style={styles.boxTitle}>Your {player.name} card</Text>
        <Text style={styles.boxSub}>One of {player.name}&apos;s {player.cards} card{player.cards === 1 ? "" : "s"}, revealed last.</Text>
        <Odds odds={player.odds} />
      </View>
      <View style={styles.box}>
        <Text style={styles.boxTitle}>{others} more cards</Text>
        <Text style={styles.boxSub}>From the whole {shop.data?.channel.name} squad, each with these odds.</Text>
        <Odds odds={pack.otherOdds} />
      </View>
      <Text style={styles.fine}>
        Cards you already have still go in your collection (they stack). Payment is through your Apple ID.
        Cards are just for fun: they can&apos;t be sold or exchanged for money.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 28, paddingBottom: 48, gap: 12 },
  art: { alignItems: "center", marginBottom: 6 },
  title: { color: colors.text, fontSize: 26, fontWeight: "900", textAlign: "center" },
  sub: { color: colors.text2, fontSize: 15, textAlign: "center", marginTop: -6 },
  support: {
    backgroundColor: "rgba(251,191,36,0.1)", borderColor: "rgba(251,191,36,0.4)", borderWidth: 1,
    borderRadius: 14, padding: 14, gap: 4, alignItems: "center",
  },
  supportBig: { color: colors.gold, fontSize: 17, fontWeight: "900" },
  supportSmall: { color: colors.text2, fontSize: 13, textAlign: "center" },
  note: { color: colors.text3, fontSize: 13, textAlign: "center" },
  section: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 10 },
  box: { backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 4 },
  boxTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  boxSub: { color: colors.text2, fontSize: 13 },
  odds: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  odd: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center", minWidth: 70 },
  oddPct: { fontSize: 16, fontWeight: "900" },
  oddLabel: { color: colors.text2, fontSize: 11, fontWeight: "600" },
  fine: { color: colors.text3, fontSize: 12, lineHeight: 17, marginTop: 6 },
});
