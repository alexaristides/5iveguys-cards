import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { PACKS, type Pack, type Rarity } from "@shared/cards";
import { AppHeader } from "@/components/AppHeader";
import { CardTile } from "@/components/CardTile";
import { Chip, Loading, SectionTitle } from "@/components/ui";
import { useChannelCards, useMe, useRatings, useRefreshOnFocus } from "@/lib/queries";
import { colors, RARITY_ORDER, rarityColor, rarityLabel } from "@/lib/theme";

const PACK_GRADIENT: Record<string, [string, string]> = {
  starter: ["#3f3f46", "#18181b"],
  team: ["#1d4ed8", "#4c1d95"],
  legend: ["#b45309", "#7e22ce"],
};

function oddsLine(pack: Pack) {
  return RARITY_ORDER.slice().reverse()
    .filter((r) => pack.odds[r] > 0)
    .map((r) => `${pack.odds[r]}% ${rarityLabel[r]}`)
    .join(" · ");
}

export default function CardsTab() {
  const { width } = useWindowDimensions();
  const me = useMe();
  const cards = useChannelCards();
  const ratings = useRatings();
  const [rarity, setRarity] = useState<Rarity | null>(null);
  const [sort, setSort] = useState<"rarity" | "rating">("rarity");

  useRefreshOnFocus(me.refetch);

  const ownedCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const uc of me.data?.cards ?? []) m.set(uc.cardId, (m.get(uc.cardId) ?? 0) + 1);
    return m;
  }, [me.data]);

  const shown = useMemo(() => {
    const list = (cards.data ?? []).filter((c) => !rarity || c.rarity === rarity);
    return list.sort((a, b) => {
      const owned = Number(ownedCount.has(b.id)) - Number(ownedCount.has(a.id));
      if (sort === "rating") {
        return (ratings.data?.get(b.id) ?? 0) - (ratings.data?.get(a.id) ?? 0) || owned;
      }
      return owned || RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.name.localeCompare(b.name);
    });
  }, [cards.data, rarity, sort, ownedCount, ratings.data]);

  const total = cards.data?.length ?? 0;
  const uniqueOwned = (cards.data ?? []).filter((c) => ownedCount.has(c.id)).length;
  const tileWidth = (width - 32 - 2 * 12) / 3;
  const points = me.data?.points ?? 0;

  return (
    <View style={styles.screen}>
      <AppHeader />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => { me.refetch(); cards.refetch(); ratings.refetch(); }} tintColor={colors.text2} />
        }
      >
        <SectionTitle>Open packs</SectionTitle>
        <View style={{ gap: 10 }}>
          {PACKS.map((pack) => {
            const affordable = points >= pack.cost;
            return (
              <Pressable
                key={pack.id}
                disabled={!affordable}
                onPress={() => router.push({ pathname: "/pack/[packId]", params: { packId: pack.id } })}
                style={({ pressed }) => [{ opacity: affordable ? (pressed ? 0.85 : 1) : 0.45 }]}
              >
                <LinearGradient colors={PACK_GRADIENT[pack.id] ?? PACK_GRADIENT.starter} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pack}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.packName}>{pack.name}</Text>
                    <Text style={styles.packDesc}>{pack.cardCount} cards · {oddsLine(pack)}</Text>
                  </View>
                  <View style={styles.cost}>
                    <Text style={styles.costText}>⚡ {pack.cost}</Text>
                  </View>
                </LinearGradient>
              </Pressable>
            );
          })}
        </View>

        <SectionTitle right={<Text style={styles.count}>{uniqueOwned}/{total}</Text>}>Collection</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="All" active={!rarity} onPress={() => setRarity(null)} />
          {RARITY_ORDER.map((r) => (
            <Chip key={r} label={rarityLabel[r]} active={rarity === r} color={rarityColor[r]} onPress={() => setRarity(rarity === r ? null : r)} />
          ))}
          <View style={styles.divider} />
          <Chip label="By rarity" active={sort === "rarity"} onPress={() => setSort("rarity")} />
          <Chip label="By rating" active={sort === "rating"} onPress={() => setSort("rating")} />
        </ScrollView>

        {cards.isLoading ? <Loading /> : (
          <View style={styles.grid}>
            {shown.map((c) => (
              <CardTile
                key={c.id}
                imageUrl={c.imageUrl}
                rarity={c.rarity}
                name={c.name}
                width={tileWidth}
                owned={ownedCount.has(c.id)}
                count={ownedCount.get(c.id)}
                overall={ratings.data?.get(c.id)}
                onPress={() => router.push({ pathname: "/card/[cardId]", params: { cardId: c.id } })}
              />
            ))}
          </View>
        )}
        <Text style={styles.footnote}>Tap any card to see its stats and rate the player.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  pack: { flexDirection: "row", alignItems: "center", borderRadius: 18, padding: 16, gap: 12 },
  packName: { color: "#fff", fontSize: 18, fontWeight: "900" },
  packDesc: { color: "rgba(255,255,255,0.75)", fontSize: 12 },
  cost: { backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  costText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  count: { color: colors.text2, fontWeight: "700" },
  chips: { gap: 8, paddingBottom: 14, alignItems: "center" },
  divider: { width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  footnote: { color: colors.text3, fontSize: 12, textAlign: "center", marginTop: 20 },
});
