import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { formatPrice, PLAYER_STATUS, POSITION_LABEL } from "@shared/fantasy";
import { POSITION_COLOR } from "@/components/fantasy/FantasyPitch";
import { ErrorText, Loading } from "@/components/ui";
import { imageUri } from "@/lib/images";
import { useFantasy, useFantasyPlayer } from "@/lib/queries";
import { colors } from "@/lib/theme";

/** A player's fantasy card: availability, price, form, ownership and points by gameweek. */
export default function FantasyPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useFantasyPlayer(id);
  const fantasy = useFantasy();
  const row = useMemo(() => fantasy.data?.players.find((p) => p.id === id), [fantasy.data, id]);
  const data = detail.data;

  if (!data) {
    return <View style={styles.screen}>{detail.error ? <ErrorText>{detail.error.message}</ErrorText> : <Loading />}</View>;
  }
  const { player, gameweeks } = data;
  const status = PLAYER_STATUS[player.status];
  const seasonChange = gameweeks.reduce((s, g) => s + g.priceChange, 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <Image source={{ uri: imageUri(player.imageUrl) }} style={styles.art} contentFit="cover" />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.name}>{player.name}</Text>
          <View style={[styles.pos, { backgroundColor: POSITION_COLOR[player.position] }]}>
            <Text style={styles.posText}>{POSITION_LABEL[player.position]}</Text>
          </View>
          <Text style={styles.price}>{formatPrice(player.price)}</Text>
          {seasonChange ? (
            <Text style={[styles.change, { color: seasonChange > 0 ? colors.greenHi : colors.danger }]}>
              {seasonChange > 0 ? "▲" : "▼"} {formatPrice(Math.abs(seasonChange))} this season
            </Text>
          ) : null}
        </View>
      </View>

      {(player.status !== "a" || !player.isActive) && (
        <View style={[styles.news, { borderColor: player.isActive ? status.color : colors.text3 }]}>
          <Text style={[styles.newsTitle, { color: player.isActive ? status.color : colors.text2 }]}>
            {player.isActive ? status.label : "Left the squad"}
          </Text>
          {player.news ? <Text style={styles.newsText}>{player.news}</Text> : null}
        </View>
      )}

      {row && (
        <View style={styles.grid}>
          <Stat label="Points" value={row.totalPoints} />
          <Stat label="Form" value={row.form} />
          <Stat label="Selected" value={`${row.selectedBy}%`} />
          <Stat label="Played" value={row.appearances} />
          <Stat label="Goals" value={row.goals} />
          <Stat label="Assists" value={row.assists} />
          <Stat label="Clean sheets" value={row.cleanSheets} />
          <Stat label="Bonus" value={row.bonus} />
        </View>
      )}

      <Text style={styles.section}>Gameweeks</Text>
      {gameweeks.length === 0 ? <Text style={styles.muted}>No matches played yet.</Text> : (
        <View style={styles.table}>
          <View style={styles.tr}>
            <Text style={[styles.th, { width: 40 }]}>GW</Text>
            <Text style={[styles.th, { flex: 1 }]}>Match</Text>
            <Text style={[styles.th, styles.c]}>G</Text>
            <Text style={[styles.th, styles.c]}>A</Text>
            <Text style={[styles.th, styles.c]}>BP</Text>
            <Text style={[styles.th, styles.c]}>Pts</Text>
          </View>
          {[...gameweeks].reverse().map((g) => (
            <View key={g.number} style={styles.tr}>
              <Text style={[styles.td, { width: 40 }]}>{g.number}</Text>
              <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>
                {[g.result, g.name].filter(Boolean).join(" ") || "–"}{g.played ? "" : " · didn't play"}
              </Text>
              <Text style={[styles.td, styles.c]}>{g.goals}</Text>
              <Text style={[styles.td, styles.c]}>{g.assists}</Text>
              <Text style={[styles.td, styles.c]}>{g.bonus}</Text>
              <Text style={[styles.td, styles.c, styles.pts]}>{g.points}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 28, paddingBottom: 48 },
  head: { flexDirection: "row", gap: 16, alignItems: "center" },
  art: { width: 96, aspectRatio: 785 / 1085, borderRadius: 10, backgroundColor: colors.cardHi },
  name: { color: colors.text, fontSize: 26, fontWeight: "900" },
  pos: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  posText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  price: { color: colors.text, fontSize: 22, fontWeight: "900", fontVariant: ["tabular-nums"] },
  change: { fontSize: 12, fontWeight: "800" },
  news: { marginTop: 16, borderWidth: 1, borderRadius: 12, padding: 12, gap: 2 },
  newsTitle: { fontSize: 14, fontWeight: "900" },
  newsText: { color: colors.text2, fontSize: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  stat: { width: "23.5%", backgroundColor: colors.card, borderRadius: 12, paddingVertical: 10, alignItems: "center", gap: 2 },
  statValue: { color: colors.text, fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] },
  statLabel: { color: colors.text3, fontSize: 10, fontWeight: "700" },
  section: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 22, marginBottom: 8 },
  muted: { color: colors.text3, fontSize: 14 },
  table: { backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  tr: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  th: { color: colors.text3, fontSize: 11, fontWeight: "800" },
  td: { color: colors.text2, fontSize: 14, fontVariant: ["tabular-nums"] },
  c: { width: 34, textAlign: "right" },
  pts: { color: colors.text, fontWeight: "900" },
});
