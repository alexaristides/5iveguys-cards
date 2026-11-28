import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { CHIPS, FANTASY_RULES } from "@shared/fantasy";
import type { FantasyStats } from "@shared/fantasy-stats";
import { AppHeader } from "@/components/AppHeader";
import { FantasyPitch, type PitchSlot } from "@/components/fantasy/FantasyPitch";
import { HowItWorks } from "@/components/fantasy/HowItWorks";
import { OscarQuote } from "@/components/fantasy/OscarQuote";
import { RankMove } from "@/components/fantasy/LeaderRow";
import { StatHighlights } from "@/components/fantasy/StatHighlights";
import { ErrorText, Loading, Panel, SectionTitle } from "@/components/ui";
import { formatCountdown, formatDeadline, lineupFromPicks, slotPositions } from "@/lib/fantasy";
import { useFantasy, useFantasyGameweek, useFantasyStats } from "@/lib/queries";
import { colors, HERO_GRADIENT, shadow } from "@/lib/theme";
import type { FantasyGameweek, FantasyGameweekResult, FantasyOverview } from "@/lib/types";

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(iv);
  }, [intervalMs]);
  return now;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const openGameweek = (number: number) => router.push({ pathname: "/fantasy/gameweek/[number]", params: { number: String(number) } });
const openPlayer = (id: string) => router.push({ pathname: "/fantasy/player/[id]", params: { id } });
/** Oscar's card, for his quote of the day. */
const oscarImage = (data: FantasyOverview) => data.players.find((p) => p.name === "Oscar")?.imageUrl ?? null;

/** My Team: what to do next, this gameweek's points, Oscar's quote of the day, your 7 on the pitch and the season's stat leaders. */
export default function MyTeamTab() {
  const fantasy = useFantasy();
  const data = fantasy.data;
  const current = data?.team ? data.currentGameweek : null;
  const gameweek = useFantasyGameweek(current);
  const stats = useFantasyStats();
  const now = useNow(30_000);

  // Native tabs mount up front, so refetch on every visit: deadlines, transfers and points move.
  const { refetch } = fantasy;
  const refetchStats = stats.refetch;
  useFocusEffect(useCallback(() => { refetch(); refetchStats(); }, [refetch, refetchStats]));
  const refresh = () => Promise.all([fantasy.refetch(), stats.refetch(), current !== null && gameweek.refetch()]);

  let body;
  if (!data) {
    body = fantasy.error ? <ErrorText>{fantasy.error.message}</ErrorText> : <Loading />;
  } else if (!data.season) {
    body = (
      <>
        <Hero eyebrow="COMING SOON" title="Kicking off soon ⚽">
          When our season starts you&apos;ll pick 7 of our real players and score points from every match.
        </Hero>
        <HowItWorks />
      </>
    );
  } else if (!data.team) {
    body = <Welcome data={data} now={now} stats={stats.data} />;
  } else {
    body = <Home data={data} now={now} gameweek={gameweek.data?.gameweek.number === current ? gameweek.data : null} stats={stats.data} />;
  }

  return (
    <View style={styles.screen}>
      <AppHeader title="My Team" />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={fantasy.isRefetching} onRefresh={refresh} tintColor={colors.accent} />}
      >
        {body}
      </ScrollView>
    </View>
  );
}

/** No team yet: what the game is and one big button. */
function Welcome({ data, now, stats }: { data: FantasyOverview; now: number; stats: FantasyStats | undefined }) {
  const next = data.gameweeks.find((g) => g.number === data.nextGameweek);
  return (
    <>
      <Hero
        eyebrow={next ? `GAMEWEEK ${next.number}` : "FANTASY DIV 1"}
        title="Pick your team"
        action={next ? { label: "Pick my team", onPress: () => router.push("/fantasy/edit") } : undefined}
        footer={next ? <DeadlineLine gameweek={next} now={now} /> : undefined}
      >
        Choose any {FANTASY_RULES.squadSize} of the 5ive Guys and score points from our real Division 1 matches. It&apos;s free and takes a minute.
      </Hero>
      {!next && <Text style={styles.muted}>No gameweek is open for picks right now. Check back soon.</Text>}
      <OscarQuote imageUrl={oscarImage(data)} />
      <StatHighlights stats={stats} />
      <HowItWorks />
    </>
  );
}

function Home({ data, now, gameweek, stats }: {
  data: FantasyOverview; now: number; gameweek: FantasyGameweekResult | null; stats: FantasyStats | undefined;
}) {
  const team = data.team!;
  const players = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players]);
  const next = data.gameweeks.find((g) => g.number === data.nextGameweek);
  const draft = team.draft;
  const chip = draft?.chip ? CHIPS.find((c) => c.id === draft.chip) : null;
  const live = gameweek?.gameweek.status === "live";

  const lineup = draft ? lineupFromPicks(draft.picks, players) : null;
  const slots: PitchSlot[] = lineup
    ? slotPositions(lineup.formation).map((position, i) => {
        const p = players.get(lineup.slots[i] ?? "") ?? null;
        return {
          key: `s${i}`, position, player: p,
          caption: p && p.lastPoints !== null ? `${p.lastPoints} pts` : undefined,
          badge: p?.id === draft?.captainId ? "C" : p?.id === draft?.viceCaptainId ? "V" : null,
          onPress: p ? () => openPlayer(p.id) : undefined,
        };
      })
    : [];

  const nextCard = next ? (
    <Hero
      eyebrow={`GAMEWEEK ${next.number}${next.name ? ` · ${next.name.toUpperCase()}` : ""}`}
      title={draft ? "Your team is in ✓" : "Pick your team"}
      action={{ label: "Change my team", onPress: () => router.push("/fantasy/edit") }}
      footer={<DeadlineLine gameweek={next} now={now} />}
    >
      {[
        "Change players, formation or captain before the deadline.",
        team.freeTransfers === null ? "Changes are free until then." : `You have ${plural(team.freeTransfers, "free player change")}.`,
        chip ? `${chip.emoji} ${chip.name} is on.` : null,
      ].filter(Boolean).join(" ")}
    </Hero>
  ) : (
    <Panel><Text style={styles.muted}>No gameweek is open for changes right now. Check back soon.</Text></Panel>
  );

  const pointsCard = gameweek?.entry ? (
    <Pressable onPress={() => openGameweek(gameweek.gameweek.number)} accessibilityRole="button" accessibilityLabel={`Gameweek ${gameweek.gameweek.number} points`}>
      {({ pressed }) => (
        <Panel style={[styles.points, pressed && { opacity: 0.8 }]}>
          <View style={{ flex: 1 }}>
            <View style={styles.pointsHead}>
              <Text style={styles.pointsLabel}>GAMEWEEK {gameweek.gameweek.number} POINTS</Text>
              {live && <View style={styles.live}><Text style={styles.liveText}>LIVE</Text></View>}
            </View>
            <Text style={styles.pointsValue}>{gameweek.score?.total ?? 0}</Text>
            <Text style={styles.pointsLink}>See who scored ›</Text>
          </View>
          <View style={styles.pointsSide}>
            <Mini label="Average" value={gameweek.average ?? "–"} />
            <Mini label="Highest" value={gameweek.highest ?? "–"} />
          </View>
        </Panel>
      )}
    </Pressable>
  ) : null;

  return (
    <>
      <View style={styles.teamRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.teamName} numberOfLines={1}>{team.name}</Text>
          <Text style={styles.teamSub}>{plural(team.totalPoints, "point")} this season</Text>
        </View>
        <Pressable
          onPress={() => router.navigate("/leagues")}
          style={({ pressed }) => [styles.rank, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={`Ranked ${team.rank} of ${team.teamCount}`}
        >
          <View style={styles.rankRow}>
            <RankMove rank={team.rank} previous={team.previousRank} />
            <Text style={styles.rankValue}>#{team.rank}</Text>
          </View>
          <Text style={styles.rankLabel}>of {team.teamCount}</Text>
        </Pressable>
      </View>

      {live ? <>{pointsCard}{nextCard}</> : <>{nextCard}{pointsCard}</>}

      <OscarQuote imageUrl={oscarImage(data)} />

      {lineup && (
        <>
          <SectionTitle
            right={next ? (
              <Pressable onPress={() => router.push("/fantasy/edit")} hitSlop={8} accessibilityRole="button">
                <Text style={styles.edit}>Edit team</Text>
              </Pressable>
            ) : null}
          >
            {next ? `Your team for gameweek ${next.number}` : "Your team"}
          </SectionTitle>
          <Text style={styles.hint}>
            C = captain (double points), V = vice-captain. Tap a player for their stats{next ? ", or Edit team to change players, formation or captain" : ""}.
          </Text>
          <FantasyPitch slots={slots} />
        </>
      )}

      <StatHighlights stats={stats} />

      <Pressable onPress={() => router.push("/fantasy/history")} style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]} accessibilityRole="button">
        <Text style={styles.linkRowText}>📈  Your points, week by week</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </>
  );
}

/** The bright purple-to-pink card at the top: what's happening and the one thing to do. */
function Hero({ eyebrow, title, children, action, footer }: {
  eyebrow: string; title: string; children: ReactNode;
  action?: { label: string; onPress: () => void }; footer?: ReactNode;
}) {
  return (
    <LinearGradient colors={HERO_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <Text style={styles.heroEyebrow}>{eyebrow}</Text>
      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroBody}>{children}</Text>
      {footer}
      {action && (
        <Pressable onPress={action.onPress} accessibilityRole="button" style={({ pressed }) => [styles.heroButton, pressed && { opacity: 0.85 }]}>
          <Text style={styles.heroButtonText}>{action.label}</Text>
        </Pressable>
      )}
    </LinearGradient>
  );
}

function DeadlineLine({ gameweek, now }: { gameweek: FantasyGameweek; now: number }) {
  return (
    <View style={styles.deadline}>
      <Text style={styles.deadlineText}>⏰  Deadline {formatDeadline(gameweek.deadline)}</Text>
      <View style={styles.countdown}>
        <Text style={styles.countdownText}>{formatCountdown(new Date(gameweek.deadline).getTime() - now)}</Text>
      </View>
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
  content: { padding: 16, paddingTop: 4, paddingBottom: 120, gap: 14 },
  muted: { color: colors.text2, fontSize: 15, textAlign: "center", lineHeight: 21 },
  hero: { borderRadius: 24, padding: 20, gap: 8, ...shadow, shadowOpacity: 0.25, shadowColor: "#7C3AED" },
  heroEyebrow: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  heroTitle: { color: colors.white, fontSize: 30, fontWeight: "900" },
  heroBody: { color: "rgba(255,255,255,0.95)", fontSize: 16, lineHeight: 22, fontWeight: "500" },
  heroButton: {
    marginTop: 8, height: 54, borderRadius: 16, backgroundColor: colors.white, alignItems: "center", justifyContent: "center",
  },
  heroButtonText: { color: colors.accent, fontSize: 18, fontWeight: "900" },
  deadline: {
    flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6, backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9,
  },
  deadlineText: { flex: 1, color: colors.white, fontSize: 14, fontWeight: "700" },
  countdown: { backgroundColor: colors.white, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  countdownText: { color: colors.pink, fontSize: 14, fontWeight: "900", fontVariant: ["tabular-nums"] },
  teamRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  teamName: { color: colors.text, fontSize: 24, fontWeight: "900" },
  teamSub: { color: colors.text2, fontSize: 15, fontWeight: "600", marginTop: 2 },
  rank: { backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, alignItems: "center", ...shadow },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rankValue: { color: colors.text, fontSize: 20, fontWeight: "900", fontVariant: ["tabular-nums"] },
  rankLabel: { color: colors.text3, fontSize: 12, fontWeight: "700" },
  points: { flexDirection: "row", alignItems: "center" },
  pointsHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  pointsLabel: { color: colors.text3, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  live: { backgroundColor: colors.danger, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  liveText: { color: colors.white, fontSize: 11, fontWeight: "900" },
  pointsValue: { color: colors.accent, fontSize: 56, fontWeight: "900", fontVariant: ["tabular-nums"], lineHeight: 62 },
  pointsLink: { color: colors.accent, fontSize: 14, fontWeight: "800" },
  pointsSide: { gap: 12, paddingLeft: 16, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border, paddingRight: 4 },
  miniValue: { color: colors.text, fontSize: 20, fontWeight: "900", fontVariant: ["tabular-nums"] },
  miniLabel: { color: colors.text3, fontSize: 12, fontWeight: "600" },
  hint: { color: colors.text2, fontSize: 13, marginTop: -6 },
  edit: { color: colors.accent, fontSize: 16, fontWeight: "800" },
  linkRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 18, padding: 16, ...shadow,
  },
  linkRowText: { flex: 1, color: colors.text, fontSize: 16, fontWeight: "800" },
  chevron: { color: colors.text3, fontSize: 22, fontWeight: "600" },
});
