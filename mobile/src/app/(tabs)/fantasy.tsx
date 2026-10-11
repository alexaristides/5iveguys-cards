import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { CHIPS, formatPrice } from "@shared/fantasy";
import { AppHeader } from "@/components/AppHeader";
import { FantasyPitch, type PitchSlot } from "@/components/fantasy/FantasyPitch";
import { LeaderRow } from "@/components/fantasy/LeaderRow";
import { Button, ErrorText, Loading, Panel, SectionTitle } from "@/components/ui";
import { formatCountdown, formatDeadline, lineupFromIds } from "@/lib/fantasy";
import { useFantasy, useFantasyLeaderboard } from "@/lib/queries";
import { colors } from "@/lib/theme";

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(iv);
  }, [intervalMs]);
  return now;
}

/** Fantasy Div 1: your team, the next deadline, last week's points and the standings. */
export default function FantasyTab() {
  const fantasy = useFantasy();
  const board = useFantasyLeaderboard(5);
  const now = useNow(30_000);
  // Native tabs mount up front, so refetch on every visit: deadlines, transfers and points move.
  const { refetch: refetchFantasy } = fantasy;
  const { refetch: refetchBoard } = board;
  useFocusEffect(useCallback(() => { refetchFantasy(); refetchBoard(); }, [refetchFantasy, refetchBoard]));

  const data = fantasy.data;
  const players = useMemo(() => new Map((data?.players ?? []).map((p) => [p.id, p])), [data?.players]);
  const refresh = () => Promise.all([fantasy.refetch(), board.refetch()]);

  let body;
  if (!data) {
    body = fantasy.error ? <ErrorText>{fantasy.error.message}</ErrorText> : <Loading />;
  } else if (!data.season) {
    body = (
      <Panel style={{ gap: 10 }}>
        <Text style={styles.heroTitle}>Kicking off soon ⚽</Text>
        <Text style={styles.body}>
          When the 5ive Guys start their Division 1 season you&apos;ll pick a team of the real players and score points from every match.
        </Text>
        <Button title="How it works" variant="secondary" onPress={() => router.push("/fantasy/rules")} />
      </Panel>
    );
  } else {
    const team = data.team;
    const next = data.gameweeks.find((g) => g.number === data.nextGameweek);
    const live = data.gameweeks.find((g) => g.status === "live");
    const draft = team?.draft;
    const lineup = draft ? lineupFromIds(draft.picks.map((p) => p.playerId), players) : null;
    const chip = draft?.chip ? CHIPS.find((c) => c.id === draft.chip) : null;

    const toSlot = (id: string | null, key: string): PitchSlot => {
      const p = players.get(id ?? "") ?? null;
      return {
        key, position: p?.position ?? null, player: p,
        caption: p ? (p.lastPoints !== null ? `${p.lastPoints} pts` : formatPrice(p.price)) : undefined,
        badge: id === draft?.captainId ? "C" : id === draft?.viceCaptainId ? "V" : null,
        onPress: next ? () => router.push("/fantasy/edit") : undefined,
      };
    };

    body = (
      <>
        {team ? (
          <Panel style={{ gap: 12 }}>
            <View>
              <Text style={styles.teamName}>{team.name}</Text>
              <Text style={styles.season}>{data.season.name}</Text>
            </View>
            <View style={styles.stats}>
              <Stat value={String(team.totalPoints)} label="Total points" />
              <Stat value={`#${team.rank}`} label={`of ${team.teamCount}`} />
              <Stat value={team.lastGameweek ? String(team.lastGameweek.points) : "–"} label={team.lastGameweek ? `GW${team.lastGameweek.number}` : "Last GW"} />
            </View>
          </Panel>
        ) : (
          <Panel style={{ gap: 10 }}>
            <Text style={styles.heroTitle}>Play along this season</Text>
            <Text style={styles.body}>
              Pick 9 of the 5ive Guys with {formatPrice(data.season.budget)}. Captain, subs, transfers and chips —
              points come from their real Division 1 matches.
            </Text>
          </Panel>
        )}

        {next ? (
          <Panel style={styles.deadline}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.deadlineTitle}>Gameweek {next.number}{next.name ? ` · ${next.name}` : ""}</Text>
              <Text style={styles.deadlineSub}>Deadline {formatDeadline(next.deadline)}</Text>
              {team && (
                <Text style={styles.deadlineSub}>
                  {team.freeTransfers === null ? "Unlimited changes" : `${team.freeTransfers} free transfer${team.freeTransfers === 1 ? "" : "s"}`}
                  {chip ? ` · ${chip.name} active` : ""}
                  {draft && !draft.saved ? " · same team as last week" : ""}
                </Text>
              )}
            </View>
            <View style={styles.countdown}>
              <Text style={styles.countdownText}>{formatCountdown(new Date(next.deadline).getTime() - now)}</Text>
            </View>
          </Panel>
        ) : (
          <Text style={styles.muted}>No gameweek is open for picks right now — check back soon.</Text>
        )}

        {next && (
          <Button title={team ? "Pick team & transfers" : "Pick your team"} onPress={() => router.push("/fantasy/edit")} />
        )}

        {live && team && (
          <LinkRow label={`Gameweek ${live.number} is live`} detail="Live points" onPress={() => router.push({ pathname: "/fantasy/gameweek/[number]", params: { number: String(live.number) } })} />
        )}
        {team?.lastGameweek && (
          <LinkRow
            label={`Gameweek ${team.lastGameweek.number}`}
            detail={`${team.lastGameweek.points} pts`}
            onPress={() => router.push({ pathname: "/fantasy/gameweek/[number]", params: { number: String(team.lastGameweek!.number) } })}
          />
        )}

        {lineup && (
          <>
            <SectionTitle>Your team</SectionTitle>
            <FantasyPitch
              starters={lineup.starters.map((id, i) => toSlot(id, `s${i}`))}
              bench={lineup.bench.map((id, i) => toSlot(id, `b${i}`))}
            />
          </>
        )}

        <SectionTitle right={<Pressable onPress={() => router.push("/fantasy/leaderboard")} hitSlop={8}><Text style={styles.link}>See all</Text></Pressable>}>
          Leaderboard
        </SectionTitle>
        {board.data && board.data.teams.length > 0 ? (
          <View style={{ gap: 6 }}>
            {board.data.teams.map((t) => <LeaderRow key={t.id} row={t} mine={t.id === board.data!.me?.id} />)}
            {board.data.me && !board.data.teams.some((t) => t.id === board.data!.me!.id) && <LeaderRow row={board.data.me} mine />}
          </View>
        ) : (
          <Text style={styles.muted}>No teams yet — be the first.</Text>
        )}

        <Button title="How it works" variant="secondary" onPress={() => router.push("/fantasy/rules")} style={{ marginTop: 20 }} />
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <AppHeader title="Fantasy Div 1" />
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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LinkRow({ label, detail, onPress }: { label: string; detail: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}>
      <Text style={styles.linkLabel}>{label}</Text>
      <Text style={styles.linkDetail}>{detail}  ›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 120, gap: 12 },
  heroTitle: { color: colors.text, fontSize: 26, fontWeight: "900" },
  body: { color: colors.text2, fontSize: 15, lineHeight: 21 },
  muted: { color: colors.text3, fontSize: 14, textAlign: "center" },
  teamName: { color: colors.text, fontSize: 22, fontWeight: "900" },
  season: { color: colors.text3, fontSize: 13, marginTop: 2 },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, backgroundColor: colors.cardHi, borderRadius: 12, paddingVertical: 10, alignItems: "center", gap: 2 },
  statValue: { color: colors.text, fontSize: 22, fontWeight: "900", fontVariant: ["tabular-nums"] },
  statLabel: { color: colors.text3, fontSize: 11, fontWeight: "600" },
  deadline: { flexDirection: "row", alignItems: "center", gap: 12 },
  deadlineTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  deadlineSub: { color: colors.text2, fontSize: 13 },
  countdown: { backgroundColor: "rgba(251,191,36,0.15)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  countdownText: { color: colors.gold, fontSize: 15, fontWeight: "900", fontVariant: ["tabular-nums"] },
  linkRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.card,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 14,
  },
  linkLabel: { color: colors.text, fontSize: 16, fontWeight: "700" },
  linkDetail: { color: colors.accentHi, fontSize: 15, fontWeight: "800" },
  link: { color: colors.accentHi, fontSize: 15, fontWeight: "700" },
});
