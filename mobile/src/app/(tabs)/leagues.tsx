import { useCallback } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppHeader } from "@/components/AppHeader";
import { Button, ErrorText, Loading, Panel, SectionTitle } from "@/components/ui";
import { useFantasy, useFantasyLeagues } from "@/lib/queries";
import { colors, shadow } from "@/lib/theme";

const openLeague = (id: string) => router.push({ pathname: "/fantasy/league/[id]", params: { id } });
const openJoin = (mode: "join" | "create") => router.push({ pathname: "/fantasy/join", params: { mode } });

/** Leagues: the overall table, your private leagues, starting or joining one, and the season's stats. */
export default function LeaguesTab() {
  const fantasy = useFantasy();
  const team = fantasy.data?.team ?? null;
  const leagues = useFantasyLeagues(!!team);

  const { refetch } = fantasy;
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));
  const refresh = () => Promise.all([fantasy.refetch(), team && leagues.refetch()]);

  let body;
  if (!fantasy.data) {
    body = fantasy.error ? <ErrorText>{fantasy.error.message}</ErrorText> : <Loading />;
  } else if (!team) {
    body = (
      <Panel style={{ gap: 12 }}>
        <Text style={styles.title}>Pick your team first</Text>
        <Text style={styles.body}>Once you have a team you&apos;re in the overall league, and you can start or join leagues with your mates.</Text>
        {fantasy.data.nextGameweek !== null && <Button title="Pick my team" onPress={() => router.push("/fantasy/edit")} />}
      </Panel>
    );
  } else {
    body = (
      <>
        <Panel style={{ gap: 12 }}>
          <Text style={styles.title}>Play your mates 🏆</Text>
          <Text style={styles.body}>Start a league and send the code to your mates, or join theirs. Everyone&apos;s ranked on their season points.</Text>
          <View style={styles.buttons}>
            <Button title="Start a league" onPress={() => openJoin("create")} style={{ flex: 1 }} />
            <Button title="Join with code" variant="secondary" onPress={() => openJoin("join")} style={{ flex: 1 }} />
          </View>
        </Panel>

        <SectionTitle>Your leagues</SectionTitle>
        <View style={{ gap: 8 }}>
          <LeagueRow name="Everyone" detail={team.teamCount === 1 ? "Just you so far" : `All ${team.teamCount} teams`} rank={team.rank} emoji="🌍" onPress={() => openLeague("overall")} />
          {(leagues.data?.leagues ?? []).map((l) => (
            <LeagueRow key={l.id} name={l.name} detail={`${l.members} team${l.members === 1 ? "" : "s"} · code ${l.code}`} rank={l.rank} emoji="⚽" onPress={() => openLeague(l.id)} />
          ))}
          {leagues.isLoading && <Loading />}
          {leagues.data && leagues.data.leagues.length === 0 && (
            <Text style={styles.empty}>You&apos;re not in any private leagues yet.</Text>
          )}
        </View>
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <AppHeader title="Leagues" />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={fantasy.isRefetching} onRefresh={refresh} tintColor={colors.accent} />}
      >
        {body}
        {fantasy.data && (
          <Pressable
            onPress={() => router.push("/fantasy/stats")}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, styles.statsRow, pressed && { opacity: 0.7 }]}
          >
            <View style={styles.icon}><Text style={{ fontSize: 20 }}>📊</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>Season stats</Text>
              <Text style={styles.detail}>Most picked, transfers, top scorers</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function LeagueRow({ name, detail, rank, emoji, onPress }: { name: string; detail: string; rank: number; emoji: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${name}, you're ${rank}`} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={styles.icon}><Text style={{ fontSize: 20 }}>{emoji}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={styles.rank}>#{rank}</Text>
        <Text style={styles.rankLabel}>your rank</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingTop: 4, paddingBottom: 120, gap: 12 },
  title: { color: colors.text, fontSize: 22, fontWeight: "900" },
  body: { color: colors.text2, fontSize: 15, lineHeight: 21 },
  buttons: { flexDirection: "row", gap: 8 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 12, ...shadow,
  },
  statsRow: { marginTop: 8 },
  icon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  name: { color: colors.text, fontSize: 17, fontWeight: "900" },
  detail: { color: colors.text3, fontSize: 13, marginTop: 1 },
  rank: { color: colors.accent, fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] },
  rankLabel: { color: colors.text3, fontSize: 11, fontWeight: "700" },
  chevron: { color: colors.text3, fontSize: 22, fontWeight: "600", marginLeft: 2 },
  empty: { color: colors.text3, fontSize: 14, textAlign: "center", marginTop: 6 },
});
