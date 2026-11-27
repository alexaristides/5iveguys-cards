import { ActionSheetIOS, Alert, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { LeaderHeader, LeaderRow } from "@/components/fantasy/LeaderRow";
import { Screen } from "@/components/Screen";
import { ErrorText, Loading } from "@/components/ui";
import { api } from "@/lib/api";
import { inviteMessage } from "@/lib/fantasy";
import { useFantasyLeaderboard, useFantasyLeague } from "@/lib/queries";
import { colors } from "@/lib/theme";
import type { FantasyLeagueRow } from "@/lib/types";

/** A league table (the overall league, or a private one). Tap a team for its latest points. */
export default function FantasyLeagueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return id === "overall" ? <Overall /> : <Private id={id} />;
}

function open(row: FantasyLeagueRow, lastGameweek: number | null) {
  if (lastGameweek) router.push({ pathname: "/fantasy/gameweek/[number]", params: { number: String(lastGameweek), teamId: row.id } });
  else router.push({ pathname: "/fantasy/history", params: { teamId: row.id } });
}

function Table({ rows, lastGameweek, me }: { rows: FantasyLeagueRow[]; lastGameweek: number | null; me?: FantasyLeagueRow | null }) {
  return (
    <>
      {me && !rows.some((t) => t.id === me.id) && (
        <View style={{ marginBottom: 12 }}><LeaderRow row={me} mine onPress={() => open(me, lastGameweek)} /></View>
      )}
      <LeaderHeader />
      <View style={{ gap: 6 }}>
        {rows.map((t) => <LeaderRow key={t.id} row={t} mine={t.mine || t.id === me?.id} onPress={() => open(t, lastGameweek)} />)}
      </View>
    </>
  );
}

function Overall() {
  const board = useFantasyLeaderboard(100);
  const data = board.data;
  return (
    <Screen title="Everyone">
      <Text style={styles.sub}>
        {data ? `${data.teamCount} team${data.teamCount === 1 ? "" : "s"}` : " "}
        {data?.lastGameweek ? ` · after gameweek ${data.lastGameweek}` : ""}
      </Text>
      {!data ? (board.error ? <ErrorText>{board.error.message}</ErrorText> : <Loading />) : (
        <>
          <Table rows={data.teams} lastGameweek={data.lastGameweek} me={data.me} />
          {data.teams.length === 0 && <Text style={styles.sub}>No teams yet — be the first.</Text>}
        </>
      )}
    </Screen>
  );
}

function Private({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const standings = useFantasyLeague(id);
  const data = standings.data;

  function menu() {
    if (!data) return;
    const options = ["Invite friends", "Leave league", "Cancel"];
    ActionSheetIOS.showActionSheetWithOptions(
      { title: data.league.name, message: `Code ${data.league.code}`, options, destructiveButtonIndex: 1, cancelButtonIndex: 2, userInterfaceStyle: "light" },
      (i) => {
        if (i === 0) Share.share({ message: inviteMessage(data.league) });
        if (i === 1) {
          Alert.alert("Leave this league?", (data.teamCount ?? data.teams.length) === 1 ? "You're the last one in it, so the league will be deleted." : "You can rejoin with the code.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Leave", style: "destructive", onPress: async () => {
                try {
                  await api(`/api/fantasy/leagues/${id}`, { method: "DELETE" });
                  queryClient.invalidateQueries({ queryKey: ["fantasy-leagues"] });
                  router.back();
                } catch (err) {
                  Alert.alert("Couldn't leave the league", (err as Error).message);
                }
              },
            },
          ]);
        }
      },
    );
  }

  return (
    <Screen
      title={data?.league.name ?? "League"}
      right={data?.league.isMember ? <Pressable onPress={menu} hitSlop={10} accessibilityLabel="League options"><Text style={styles.more}>•••</Text></Pressable> : null}
    >
      {!data ? (standings.error ? <ErrorText>{standings.error.message}</ErrorText> : <Loading />) : (
        <>
          <Pressable onPress={() => Share.share({ message: inviteMessage(data.league) })} style={({ pressed }) => [styles.invite, pressed && { opacity: 0.7 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inviteLabel}>League code</Text>
              <Text style={styles.code}>{data.league.code}</Text>
            </View>
            <Text style={styles.inviteAction}>Invite mates ›</Text>
          </Pressable>
          <Text style={styles.sub}>
            {data.teamCount ?? data.teams.length} team{(data.teamCount ?? data.teams.length) === 1 ? "" : "s"}{data.lastGameweek ? ` · after gameweek ${data.lastGameweek}` : ""}
          </Text>
          <Table rows={data.teams} lastGameweek={data.lastGameweek} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { color: colors.text2, fontSize: 14, marginBottom: 14 },
  more: { color: colors.accent, fontSize: 18, fontWeight: "900" },
  invite: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.accentSoft, borderRadius: 18, padding: 14, marginBottom: 12,
  },
  inviteLabel: { color: colors.text3, fontSize: 12, fontWeight: "700" },
  code: { color: colors.accent, fontSize: 26, fontWeight: "900", letterSpacing: 3 },
  inviteAction: { color: colors.accent, fontSize: 16, fontWeight: "900" },
});
