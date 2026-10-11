import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { LeaderRow } from "@/components/fantasy/LeaderRow";
import { GameScreen } from "@/components/game/GameScreen";
import { ErrorText, Loading } from "@/components/ui";
import { useFantasyLeaderboard } from "@/lib/queries";
import { colors } from "@/lib/theme";
import type { FantasyLeaderboardRow } from "@/lib/types";

/** Season standings. Tap a team to see its latest gameweek. */
export default function FantasyLeaderboardScreen() {
  const board = useFantasyLeaderboard(100);
  const data = board.data;
  const open = (row: FantasyLeaderboardRow) => {
    if (data?.lastGameweek) router.push({ pathname: "/fantasy/gameweek/[number]", params: { number: String(data.lastGameweek), teamId: row.id } });
  };

  return (
    <GameScreen title="Leaderboard">
      <Text style={styles.sub}>
        {data ? `${data.teamCount} team${data.teamCount === 1 ? "" : "s"}` : " "}
        {data?.lastGameweek ? ` · after gameweek ${data.lastGameweek}` : ""}
      </Text>
      {!data ? (board.error ? <ErrorText>{board.error.message}</ErrorText> : <Loading />) : (
        <>
          {data.me && !data.teams.some((t) => t.id === data.me!.id) && (
            <View style={{ marginBottom: 12 }}><LeaderRow row={data.me} mine onPress={() => open(data.me!)} /></View>
          )}
          <View style={styles.header}>
            <Text style={[styles.headCell, { width: 34 }]}>#</Text>
            <Text style={[styles.headCell, { flex: 1 }]}>Team</Text>
            <Text style={[styles.headCell, styles.num]}>GW</Text>
            <Text style={[styles.headCell, styles.num]}>Total</Text>
          </View>
          <View style={{ gap: 6 }}>
            {data.teams.map((t) => <LeaderRow key={t.id} row={t} mine={t.id === data.me?.id} onPress={() => open(t)} />)}
          </View>
          {data.teams.length === 0 && <Text style={styles.sub}>No teams yet — be the first.</Text>}
        </>
      )}
    </GameScreen>
  );
}

const styles = StyleSheet.create({
  sub: { color: colors.text2, fontSize: 14, marginBottom: 16 },
  header: { flexDirection: "row", paddingHorizontal: 12, marginBottom: 6 },
  headCell: { color: colors.text3, fontSize: 11, fontWeight: "800" },
  num: { width: 48, textAlign: "right" },
});
