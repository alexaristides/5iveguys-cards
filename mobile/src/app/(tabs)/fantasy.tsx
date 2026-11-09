import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { CHIPS, FANTASY_RULES, formatPrice } from "@shared/fantasy";
import { AppHeader } from "@/components/AppHeader";
import { FantasyPitch, type PitchSlot } from "@/components/fantasy/FantasyPitch";
import { RankMove } from "@/components/fantasy/LeaderRow";
import { Button, ErrorText, Loading, Panel, SectionTitle } from "@/components/ui";
import { formatCountdown, formatDeadline, lineupFromIds, slotPositions } from "@/lib/fantasy";
import { useFantasy, useFantasyGameweek, useFantasyLeagues } from "@/lib/queries";
import { colors } from "@/lib/theme";
import type { FantasyOverview } from "@/lib/types";

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(iv);
  }, [intervalMs]);
  return now;
}

const openGameweek = (number: number) => router.push({ pathname: "/fantasy/gameweek/[number]", params: { number: String(number) } });

/** Fantasy Div 1: this gameweek's points, your rank, the next deadline, your 7 and your leagues. */
export default function FantasyTab() {
  const fantasy = useFantasy();
  const data = fantasy.data;
  const hasTeam = !!data?.team;
  const current = hasTeam ? data!.currentGameweek : null;
  const gameweek = useFantasyGameweek(current);
  const leagues = useFantasyLeagues(hasTeam);
  const now = useNow(30_000);

  // Native tabs mount up front, so refetch on every visit: deadlines, transfers and points move.
  const { refetch: refetchFantasy } = fantasy;
  useFocusEffect(useCallback(() => { refetchFantasy(); }, [refetchFantasy]));
  const refresh = () => Promise.all([fantasy.refetch(), hasTeam && gameweek.refetch(), hasTeam && leagues.refetch()]);

  let body;
  if (!data) {
    body = fantasy.error ? <ErrorText>{fantasy.error.message}</ErrorText> : <Loading />;
  } else if (!data.season) {
    body = (
      <Panel style={{ gap: 10 }}>
        <Text style={styles.heroTitle}>Kicking off soon ⚽</Text>
        <Text style={styles.body}>
          When the 5ive Guys&apos; Division 1 season starts you&apos;ll pick 7 of the real players and score points from every match.
        </Text>
        <Button title="How it works" variant="secondary" onPress={() => router.push("/fantasy/rules")} />
      </Panel>
    );
  } else {
    body = <Home data={data} now={now} gameweek={gameweek.data ?? null} leagues={leagues.data?.leagues ?? null} />;
  }

  return (
    <View style={styles.screen}>
      <AppHeader title="Fantasy" />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={fantasy.isRefetching} onRefresh={refresh} tintColor={colors.text2} />}
      >
        {body}
      </ScrollView>
    </View>
  );
}

function Home({ data, now, gameweek, leagues }: {
  data: FantasyOverview; now: number;
  gameweek: ReturnType<typeof useFantasyGameweek>["data"] | null;
  leagues: { id: string; name: string; members: number; rank: number }[] | null;
}) {
  const season = data.season!;
  const team = data.team;
  const players = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players]);
  const next = data.gameweeks.find((g) => g.number === data.nextGameweek);
  const draft = team?.draft;
  const chip = draft?.chip ? CHIPS.find((c) => c.id === draft.chip) : null;

  if (!team) {
    return (
      <>
        <Panel style={{ gap: 10 }}>
          <Text style={styles.heroTitle}>Play Fantasy Div 1</Text>
          <Text style={styles.body}>
            Pick {FANTASY_RULES.squadSize} of the 5ive Guys with {formatPrice(season.budget)}. Captain, transfers, price changes and chips,
            just like Fantasy Premier League — and the points come from their real Division 1 matches.
          </Text>
        </Panel>
        {next ? (
          <>
            <Deadline gameweek={next} now={now} />
            <Button title="Pick your team" onPress={() => router.push("/fantasy/edit")} />
          </>
        ) : (
          <Text style={styles.muted}>No gameweek is open for picks right now — check back soon.</Text>
        )}
        <Button title="How it works" variant="secondary" onPress={() => router.push("/fantasy/rules")} />
      </>
    );
  }

  const lineup = draft ? lineupFromIds(draft.picks.map((p) => p.playerId), players) : null;
  const slots: PitchSlot[] = lineup
    ? slotPositions(lineup.formation).map((position, i) => {
        const p = players.get(lineup.slots[i] ?? "") ?? null;
        return {
          key: `s${i}`, position, player: p,
          caption: p ? (p.lastPoints !== null ? `${p.lastPoints} pts` : formatPrice(p.price)) : undefined,
          badge: p?.id === draft?.captainId ? "C" : p?.id === draft?.viceCaptainId ? "V" : null,
          onPress: p ? () => router.push({ pathname: "/fantasy/player/[id]", params: { id: p.id } }) : undefined,
        };
      })
    : [];
  const live = gameweek?.gameweek.status === "live";

  return (
    <>
      <Text style={styles.teamName}>{team.name}</Text>

      {gameweek?.entry ? (
        <Pressable onPress={() => openGameweek(gameweek.gameweek.number)} accessibilityRole="button">
          <Panel style={styles.points}>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={styles.pointsLabel}>
                GAMEWEEK {gameweek.gameweek.number}{live ? " · LIVE" : ""}
              </Text>
              <Text style={styles.pointsValue}>{gameweek.score?.total ?? 0}</Text>
              <Text style={styles.pointsLink}>Points ›</Text>
            </View>
            <View style={styles.pointsSide}>
              <Mini label="Average" value={gameweek.average ?? "–"} />
              <Mini label="Highest" value={gameweek.highest ?? "–"} />
              <Mini label="GW rank" value={gameweek.gameweekRank ?? "–"} />
            </View>
          </Panel>
        </Pressable>
      ) : null}

      <View style={styles.statsRow}>
        <Stat label="Total points" value={String(team.totalPoints)} />
        <View style={styles.stat}>
          <View style={styles.rankRow}>
            <RankMove rank={team.rank} previous={team.previousRank} />
            <Text style={styles.statValue}>{team.rank}</Text>
          </View>
          <Text style={styles.statLabel}>of {team.teamCount} overall</Text>
        </View>
        <Stat label="Team value" value={team.value !== null ? formatPrice(team.value) : "–"} />
      </View>

      {next ? (
        <>
          <Deadline
            gameweek={next}
            now={now}
            detail={[
              team.freeTransfers === null ? "Unlimited transfers" : `${team.freeTransfers} free transfer${team.freeTransfers === 1 ? "" : "s"}`,
              draft ? `${formatPrice(draft.bank)} in the bank` : null,
              chip ? `${chip.name} on` : null,
            ].filter(Boolean).join(" · ")}
          />
          <Button title="Transfers & captain" onPress={() => router.push("/fantasy/edit")} />
        </>
      ) : (
        <Text style={styles.muted}>No gameweek is open for transfers right now — check back soon.</Text>
      )}

      {lineup && (
        <>
          <SectionTitle>{next ? `Your team for gameweek ${next.number}` : "Your team"}</SectionTitle>
          <FantasyPitch slots={slots} />
        </>
      )}

      <SectionTitle right={<Pressable onPress={() => router.push("/fantasy/join")} hitSlop={8}><Text style={styles.link}>Create / join</Text></Pressable>}>
        Leagues
      </SectionTitle>
      <View style={{ gap: 6 }}>
        <LeagueRow name="Overall" detail={`${team.teamCount} teams`} rank={team.rank} onPress={() => router.push({ pathname: "/fantasy/league/[id]", params: { id: "overall" } })} />
        {(leagues ?? []).map((l) => (
          <LeagueRow key={l.id} name={l.name} detail={`${l.members} team${l.members === 1 ? "" : "s"}`} rank={l.rank}
            onPress={() => router.push({ pathname: "/fantasy/league/[id]", params: { id: l.id } })} />
        ))}
        {leagues && leagues.length === 0 && (
          <Pressable onPress={() => router.push("/fantasy/join")} style={({ pressed }) => [styles.emptyLeague, pressed && { opacity: 0.7 }]}>
            <Text style={styles.emptyLeagueText}>Start a league for your mates, or join one with a code ›</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.links}>
        <Button title="Points history" variant="secondary" onPress={() => router.push("/fantasy/history")} style={{ flex: 1 }} />
        <Button title="How it works" variant="secondary" onPress={() => router.push("/fantasy/rules")} style={{ flex: 1 }} />
      </View>
    </>
  );
}

function Deadline({ gameweek, now, detail }: { gameweek: { number: number; name: string | null; deadline: string }; now: number; detail?: string }) {
  return (
    <Panel style={styles.deadline}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.deadlineTitle}>Gameweek {gameweek.number}{gameweek.name ? ` · ${gameweek.name}` : ""}</Text>
        <Text style={styles.deadlineSub}>Deadline {formatDeadline(gameweek.deadline)}</Text>
        {detail ? <Text style={styles.deadlineSub}>{detail}</Text> : null}
      </View>
      <View style={styles.countdown}>
        <Text style={styles.countdownText}>{formatCountdown(new Date(gameweek.deadline).getTime() - now)}</Text>
      </View>
    </Panel>
  );
}

function LeagueRow({ name, detail, rank, onPress }: { name: string; detail: string; rank: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.leagueRow, pressed && { opacity: 0.7 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.leagueName} numberOfLines={1}>{name}</Text>
        <Text style={styles.leagueDetail}>{detail}</Text>
      </View>
      <Text style={styles.leagueRank}>#{rank}  ›</Text>
    </Pressable>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Mini({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={styles.miniValue}>{value}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 120, gap: 12 },
  heroTitle: { color: colors.text, fontSize: 26, fontWeight: "900" },
  body: { color: colors.text2, fontSize: 15, lineHeight: 21 },
  muted: { color: colors.text3, fontSize: 14, textAlign: "center" },
  teamName: { color: colors.text, fontSize: 24, fontWeight: "900" },
  points: { flexDirection: "row", alignItems: "center", paddingVertical: 16, backgroundColor: "#1f1530", borderColor: colors.accent },
  pointsLabel: { color: colors.gold, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  pointsValue: { color: colors.text, fontSize: 56, fontWeight: "900", fontVariant: ["tabular-nums"], lineHeight: 64 },
  pointsLink: { color: colors.accentHi, fontSize: 13, fontWeight: "800" },
  pointsSide: { gap: 10, paddingLeft: 16, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border, paddingRight: 8 },
  miniValue: { color: colors.text, fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] },
  miniLabel: { color: colors.text3, fontSize: 11, fontWeight: "600" },
  statsRow: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: 14, paddingVertical: 10, alignItems: "center", gap: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statValue: { color: colors.text, fontSize: 20, fontWeight: "900", fontVariant: ["tabular-nums"] },
  statLabel: { color: colors.text3, fontSize: 11, fontWeight: "600" },
  deadline: { flexDirection: "row", alignItems: "center", gap: 12 },
  deadlineTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  deadlineSub: { color: colors.text2, fontSize: 13 },
  countdown: { backgroundColor: "rgba(251,191,36,0.15)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  countdownText: { color: colors.gold, fontSize: 15, fontWeight: "900", fontVariant: ["tabular-nums"] },
  leagueRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12,
  },
  leagueName: { color: colors.text, fontSize: 16, fontWeight: "800" },
  leagueDetail: { color: colors.text3, fontSize: 12 },
  leagueRank: { color: colors.accentHi, fontSize: 16, fontWeight: "900", fontVariant: ["tabular-nums"] },
  emptyLeague: { borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, padding: 14 },
  emptyLeagueText: { color: colors.text2, fontSize: 14, textAlign: "center" },
  links: { flexDirection: "row", gap: 8, marginTop: 12 },
  link: { color: colors.accentHi, fontSize: 15, fontWeight: "700" },
});
