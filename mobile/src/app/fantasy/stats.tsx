import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { CHIPS } from "@shared/fantasy";
import { LAST_SEASON, type LastSeason } from "@shared/fantasy-last-season";
import { formatStat, STAT_GROUPS, statBoards, type BoardRow, type FantasyStats, type StatBoard } from "@shared/fantasy-stats";
import { Screen } from "@/components/Screen";
import { ErrorText, Loading, Panel, SectionTitle } from "@/components/ui";
import { imageUri } from "@/lib/images";
import { useFantasyStats } from "@/lib/queries";
import { colors, HERO_GRADIENT, POSITION_COLOR, shadow } from "@/lib/theme";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const openPlayer = (id: string) => router.push({ pathname: "/fantasy/player/[id]", params: { id } });

/**
 * The season's stats (same lists as the website's /fantasy/stats): who's most picked, transferred in
 * and out and captained, the leaders on points, goals and the rest, the best gameweek scores, and last season.
 */
export default function FantasyStatsScreen() {
  const stats = useFantasyStats();
  return (
    <Screen title="Stats">
      {!stats.data ? (stats.error ? <ErrorText>{stats.error.message}</ErrorText> : <Loading />) : <Stats data={stats.data} />}
      {LAST_SEASON && <LastSeasonSection season={LAST_SEASON} />}
    </Screen>
  );
}

function Stats({ data }: { data: FantasyStats }) {
  if (!data.season) return <Text style={styles.muted}>Fantasy isn&apos;t open yet. Stats appear once the season starts.</Text>;

  const boards = statBoards(data.players);
  const chipsPlayed = Object.values(data.chips).reduce((n, c) => n + (c ?? 0), 0);
  const chipList = CHIPS.filter((c) => data.chips[c.id]).map((c) => `${c.emoji} ${c.name} ${data.chips[c.id]}`);

  return (
    <View style={styles.stack}>
      <Text style={styles.season}>
        {data.season.name} · {data.scoredThrough ? `up to gameweek ${data.scoredThrough}` : "no gameweeks scored yet"}
      </Text>
      <Panel style={styles.summary}>
        <Summary label="Teams" value={data.teamCount} />
        <Summary label="Transfers" value={data.transfers} />
        <Summary label="Chips played" value={chipsPlayed} />
      </Panel>
      {chipList.length > 0 && <Text style={styles.chips}>{chipList.join("  ·  ")}</Text>}

      {boards.length === 0 && (
        <Text style={styles.muted}>The lists fill up once fans pick their teams and the first gameweek is scored.</Text>
      )}
      {STAT_GROUPS.map((group) => {
        const mine = boards.filter((b) => b.board.group === group.id);
        const bestWeeks = group.id === "points" && data.bestWeeks.length > 0;
        if (!mine.length && !bestWeeks) return null;
        return (
          <View key={group.id} style={styles.stack}>
            <SectionTitle>{group.title}</SectionTitle>
            {mine.map(({ board, rows }) => <Board key={board.id} board={board} rows={rows} />)}
            {bestWeeks && <BestWeeks weeks={data.bestWeeks} />}
          </View>
        );
      })}
    </View>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function BoardHead({ emoji, title, detail }: { emoji: string; title: string; detail: string }) {
  return (
    <View style={styles.head}>
      <View style={styles.icon}><Text style={{ fontSize: 19 }}>{emoji}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
    </View>
  );
}

function Rank({ rank }: { rank: number }) {
  return <Text style={[styles.rank, rank <= 3 && { color: colors.goldText }]}>{rank}</Text>;
}

/** One board: its top five, each opening the player's card. */
function Board({ board, rows }: { board: StatBoard; rows: BoardRow[] }) {
  return (
    <View style={styles.card}>
      <BoardHead emoji={board.emoji} title={board.title} detail={board.detail} />
      {rows.map(({ player, value, rank }, i) => (
        <Pressable
          key={player.id}
          onPress={() => openPlayer(player.id)}
          accessibilityRole="button"
          accessibilityLabel={`${rank}. ${player.name}, ${formatStat(board, value)}`}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
        >
          <Rank rank={rank} />
          <View style={styles.photo}>
            {player.imageUrl ? <Image source={{ uri: imageUri(player.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
          </View>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{player.name}</Text>
            <View style={[styles.pos, { backgroundColor: POSITION_COLOR[player.position] }]}>
              <Text style={styles.posText}>{player.position}</Text>
            </View>
          </View>
          <Text style={[styles.value, i === 0 && { color: colors.accent }]}>{formatStat(board, value)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** The highest single-gameweek scores by any team. */
function BestWeeks({ weeks }: { weeks: FantasyStats["bestWeeks"] }) {
  return (
    <View style={styles.card}>
      <BoardHead emoji="🔥" title="Best gameweeks" detail="Highest team scores in a single gameweek" />
      {weeks.map((w, i) => (
        <View key={`${w.team}-${w.gameweek}`} style={styles.row}>
          <Rank rank={1 + weeks.findIndex((o) => o.points === w.points)} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{w.team}</Text>
            <Text style={styles.sub} numberOfLines={1}>{[w.manager, `Gameweek ${w.gameweek}`].filter(Boolean).join(" · ")}</Text>
          </View>
          <Text style={[styles.value, i === 0 && { color: colors.accent }]}>{w.points}</Text>
        </View>
      ))}
    </View>
  );
}

/** The old Fantasy 5ive game: its final table and the players' tallies (lib/fantasy-last-season.ts). */
function LastSeasonSection({ season }: { season: LastSeason }) {
  const [winner, ...rest] = season.table;
  return (
    <View style={[styles.stack, { marginTop: 14 }]}>
      <SectionTitle>Last season</SectionTitle>
      <Text style={styles.season}>Fantasy 5ive {season.season}</Text>
      {winner && (
        <LinearGradient colors={HERO_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.champion}>
          <Text style={styles.championEyebrow}>🏆 CHAMPIONS</Text>
          <Text style={styles.championTeam}>{winner.team}</Text>
          <Text style={styles.championSub}>{[winner.manager, plural(winner.points, "point")].filter(Boolean).join(" · ")}</Text>
        </LinearGradient>
      )}
      {rest.length > 0 && (
        <View style={styles.card}>
          <BoardHead emoji="📋" title="Final table" detail="Season points" />
          {rest.map((t) => (
            <View key={t.team} style={styles.row}>
              <Rank rank={1 + season.table.filter((o) => o.points > t.points).length} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{t.team}</Text>
                {t.manager ? <Text style={styles.sub} numberOfLines={1}>{t.manager}</Text> : null}
              </View>
              <Text style={styles.value}>{t.points}</Text>
            </View>
          ))}
        </View>
      )}
      {season.boards.map((b) => (
        <View key={b.title} style={styles.card}>
          <BoardHead emoji={b.emoji} title={b.title} detail={b.detail} />
          {b.rows.map((r, i) => (
            <View key={r.name} style={styles.row}>
              <Rank rank={1 + b.rows.findIndex((o) => o.value === r.value)} />
              <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>{r.name}</Text>
              <Text style={[styles.value, i === 0 && { color: colors.accent }]}>{r.value}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  muted: { color: colors.text2, fontSize: 15, textAlign: "center", lineHeight: 21, paddingVertical: 16 },
  season: { color: colors.text2, fontSize: 14, fontWeight: "600" },
  summary: { flexDirection: "row" },
  summaryValue: { color: colors.text, fontSize: 22, fontWeight: "900", fontVariant: ["tabular-nums"] },
  summaryLabel: { color: colors.text3, fontSize: 11, fontWeight: "600" },
  chips: { color: colors.text3, fontSize: 13, textAlign: "center", marginTop: -6 },
  card: { backgroundColor: colors.card, borderRadius: 20, overflow: "hidden", ...shadow },
  head: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontSize: 17, fontWeight: "900" },
  detail: { color: colors.text3, fontSize: 13 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8, minHeight: 50,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  rank: { width: 20, color: colors.text2, fontSize: 15, fontWeight: "900", fontVariant: ["tabular-nums"] },
  photo: { width: 32, aspectRatio: 785 / 1085, borderRadius: 5, overflow: "hidden", backgroundColor: colors.cardHi },
  nameRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flexShrink: 1, color: colors.text, fontSize: 15, fontWeight: "800" },
  sub: { color: colors.text3, fontSize: 12 },
  pos: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  posText: { color: colors.white, fontSize: 10, fontWeight: "900" },
  value: { color: colors.text, fontSize: 17, fontWeight: "900", fontVariant: ["tabular-nums"] },
  champion: { borderRadius: 24, padding: 20, gap: 4, ...shadow, shadowOpacity: 0.25, shadowColor: colors.accent },
  championEyebrow: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  championTeam: { color: colors.white, fontSize: 28, fontWeight: "900" },
  championSub: { color: "rgba(255,255,255,0.95)", fontSize: 16, fontWeight: "600" },
});
