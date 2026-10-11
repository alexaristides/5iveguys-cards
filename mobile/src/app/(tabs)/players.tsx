import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { buildSquad } from "@shared/motm";
import { AppHeader } from "@/components/AppHeader";
import { CardTile } from "@/components/CardTile";
import { Chip, ErrorText, Loading, SectionTitle } from "@/components/ui";
import { useChannel } from "@/lib/channel";
import { useChannelCards, useRatings } from "@/lib/queries";
import { colors } from "@/lib/theme";

/** The channel's squad, one tile per player (their Home Kit card), to rate. */
export default function PlayersTab() {
  const { width } = useWindowDimensions();
  const { slug } = useChannel();
  const cards = useChannelCards();
  const ratings = useRatings();
  const [sort, setSort] = useState<"rating" | "name">("rating");

  const players = useMemo(() => {
    const all = cards.data ?? [];
    const byId = new Map(all.map((c) => [c.id, c]));
    const squad = buildSquad(all.map((c) => ({ ...c, channelId: c.channelId ?? slug })));
    return squad
      .map((p) => byId.get(p.id)!)
      .sort((a, b) =>
        sort === "rating"
          ? (ratings.data?.get(b.id) ?? 0) - (ratings.data?.get(a.id) ?? 0) || a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name),
      );
  }, [cards.data, ratings.data, sort, slug]);

  const tileWidth = (width - 32 - 2 * 12) / 3;

  let body;
  if (cards.isLoading) body = <Loading />;
  else if (!cards.data) body = <ErrorText>{cards.error?.message ?? "Couldn't load the players"}</ErrorText>;
  else body = (
    <View style={styles.grid}>
      {players.map((c) => (
        <CardTile
          key={c.id}
          imageUrl={c.imageUrl}
          rarity={c.rarity}
          name={c.name}
          width={tileWidth}
          overall={ratings.data?.get(c.id)}
          onPress={() => router.push({ pathname: "/card/[cardId]", params: { cardId: c.id } })}
        />
      ))}
    </View>
  );

  return (
    <View style={styles.screen}>
      <AppHeader />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => { cards.refetch(); ratings.refetch(); }} tintColor={colors.text2} />
        }
      >
        <SectionTitle right={<Text style={styles.count}>{players.length}</Text>}>Rate the players</SectionTitle>
        <View style={styles.chips}>
          <Chip label="Top rated" active={sort === "rating"} onPress={() => setSort("rating")} />
          <Chip label="A–Z" active={sort === "name"} onPress={() => setSort("name")} />
        </View>
        {body}
        <Text style={styles.footnote}>Tap a player to rate them. +10 pts the first time you rate each player.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  count: { color: colors.text2, fontWeight: "700" },
  chips: { flexDirection: "row", gap: 8, paddingBottom: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  footnote: { color: colors.text3, fontSize: 12, textAlign: "center", marginTop: 20 },
});
