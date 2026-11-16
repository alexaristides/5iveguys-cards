import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CHIPS } from "@shared/fantasy";
import { FantasyPitch, type PitchSlot } from "@/components/fantasy/FantasyPitch";
import { GameScreen } from "@/components/game/GameScreen";
import { ErrorText, Loading, Panel } from "@/components/ui";
import { lineupFromIds, slotPositions } from "@/lib/fantasy";
import { useFantasy, useFantasyGameweek } from "@/lib/queries";
import { colors } from "@/lib/theme";

/** A team's points for one gameweek: who scored what, the captain and chips. */
export default function FantasyGameweekScreen() {
  const { number, teamId } = useLocalSearchParams<{ number: string; teamId?: string }>();
  const n = Number(number);
  const result = useFantasyGameweek(n, teamId);
  const fantasy = useFantasy();
  const players = useMemo(() => new Map((fantasy.data?.players ?? []).map((p) => [p.id, p])), [fantasy.data]);
  const started = (fantasy.data?.gameweeks ?? []).filter((g) => g.status !== "upcoming").map((g) => g.number);
  const go = (to: number) => router.setParams({ number: String(to) });
  const prev = started.filter((g) => g < n).at(-1);
  const next = started.find((g) => g > n);

  const nav = (
    <View style={styles.nav}>
      <Pressable disabled={prev === undefined} onPress={() => prev !== undefined && go(prev)} hitSlop={10} accessibilityLabel="Previous gameweek">
        <Text style={[styles.navArrow, prev === undefined && { opacity: 0.25 }]}>‹ GW{prev ?? ""}</Text>
      </Pressable>
      <Text style={styles.navTitle}>Gameweek {n}</Text>
      <Pressable disabled={next === undefined} onPress={() => next !== undefined && go(next)} hitSlop={10} accessibilityLabel="Next gameweek">
        <Text style={[styles.navArrow, next === undefined && { opacity: 0.25 }]}>GW{next ?? ""} ›</Text>
      </Pressable>
    </View>
  );

  const data = result.data?.gameweek.number === n ? result.data : null;
  if (!data || !fantasy.data) {
    return (
      <GameScreen title="Points">
        {nav}
        {result.error ? <ErrorText>{result.error.message}</ErrorText> : <Loading />}
      </GameScreen>
    );
  }

  const { gameweek, team, entry, score, lines } = data;
  const live = gameweek.status === "live";
  const scored = new Map((score?.players ?? []).map((p) => [p.playerId, p]));
  const lineup = entry ? lineupFromIds(entry.picks.map((p) => p.playerId), players) : null;
  const chip = entry?.chip ? CHIPS.find((c) => c.id === entry.chip) : null;
  const doubled = entry?.chip === "double_points" ? 2 : 1;
  const result90 = gameweek.goalsFor !== null && gameweek.goalsAgainst !== null
    ? `5ive Guys ${gameweek.goalsFor}–${gameweek.goalsAgainst}${gameweek.name ? ` ${gameweek.name}` : ""}`
    : gameweek.name;

  const slots: PitchSlot[] = lineup
    ? slotPositions(lineup.formation).map((position, i) => {
        const id = lineup.slots[i];
        const p = players.get(id ?? "") ?? null;
        const s = id ? scored.get(id) : undefined;
        return {
          key: `s${i}`, position, player: p,
          caption: s ? String(s.points * Math.max(1, s.multiplier) * doubled) : "0",
          badge: id === score?.captainId ? "C" : null,
          dim: !s || s.multiplier === 0,
          onPress: p ? () => router.push({ pathname: "/fantasy/player/[id]", params: { id: p.id } }) : undefined,
        };
      })
    : [];

  return (
    <GameScreen title="Points">
      {nav}
      <Text style={styles.team}>{team.name}{teamId && team.manager ? ` · ${team.manager}` : ""}</Text>
      {result90 ? <Text style={styles.result}>{result90}</Text> : null}

      <Panel style={styles.hero}>
        <View style={{ alignItems: "center", flex: 1 }}>
          <Text style={styles.total}>{score?.total ?? "–"}</Text>
          <Text style={styles.heroLabel}>{live ? "LIVE POINTS" : "FINAL POINTS"}</Text>
        </View>
        <View style={styles.side}>
          <Side label="Average" value={data.average} />
          <Side label="Highest" value={data.highest} />
          <Side label="GW rank" value={data.gameweekRank} />
        </View>
      </Panel>
      {live && <Text style={styles.note}>Points update as the match stats come in. Bonus points are provisional until the gameweek is final.</Text>}
      {(chip || entry?.transferCost) ? (
        <Text style={styles.note}>
          {[chip ? `${chip.emoji} ${chip.name} played` : null, entry?.transferCost ? `−${entry.transferCost} pts for transfers` : null]
            .filter(Boolean).join("  ·  ")}
        </Text>
      ) : null}

      {lineup ? (
        <View style={{ marginTop: 12 }}><FantasyPitch slots={slots} /></View>
      ) : (
        <Text style={styles.note}>No team for this gameweek.</Text>
      )}

      {lineup && <Text style={styles.section}>Breakdown</Text>}
      <View style={{ gap: 8 }}>
        {lineup?.slots.map((id) => {
          if (!id) return null;
          const s = scored.get(id);
          const rows = lines[id] ?? [];
          const multiplier = s?.multiplier ?? 0;
          return (
            <Panel key={id} style={{ paddingVertical: 12 }}>
              <View style={styles.rowHead}>
                <Text style={styles.rowName}>
                  {players.get(id)?.name ?? "Unknown"}
                  {id === score?.captainId ? (multiplier === 3 ? "  ·  Triple captain" : "  ·  Captain") : ""}
                </Text>
                <Text style={[styles.rowPoints, !multiplier && { color: colors.text3 }]}>
                  {s ? s.points * Math.max(1, multiplier) * doubled : 0}
                </Text>
              </View>
              {rows.length ? rows.map((l) => (
                <View key={l.label} style={styles.line}>
                  <Text style={styles.lineLabel}>{l.label}</Text>
                  <Text style={[styles.lineLabel, { color: l.points < 0 ? colors.danger : colors.text2 }]}>{l.points > 0 ? `+${l.points}` : l.points}</Text>
                </View>
              )) : <Text style={styles.lineLabel}>{live ? "No stats yet" : "Didn't play"}</Text>}
              {multiplier > 1 || doubled > 1 ? (
                <Text style={styles.multiplier}>
                  ×{multiplier > 1 ? multiplier : 1}{doubled > 1 ? " ×2 Double Points" : ""}
                </Text>
              ) : null}
            </Panel>
          );
        })}
      </View>
    </GameScreen>
  );
}

function Side({ label, value }: { label: string; value: number | null }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={styles.sideValue}>{value ?? "–"}</Text>
      <Text style={styles.sideLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  navArrow: { color: colors.accentHi, fontSize: 15, fontWeight: "800", minWidth: 64 },
  navTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
  team: { color: colors.text2, fontSize: 14, fontWeight: "600", textAlign: "center" },
  result: { color: colors.text3, fontSize: 13, textAlign: "center", marginTop: 2, marginBottom: 10 },
  hero: { flexDirection: "row", alignItems: "center", paddingVertical: 18, marginTop: 6 },
  total: { color: colors.text, fontSize: 56, fontWeight: "900", fontVariant: ["tabular-nums"] },
  heroLabel: { color: colors.gold, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  side: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border, paddingLeft: 18, paddingRight: 6, gap: 8 },
  sideValue: { color: colors.text, fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] },
  sideLabel: { color: colors.text3, fontSize: 11, fontWeight: "600" },
  note: { color: colors.text2, fontSize: 13, textAlign: "center", marginTop: 10, lineHeight: 18 },
  section: { color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 24, marginBottom: 10 },
  rowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  rowName: { color: colors.text, fontSize: 16, fontWeight: "800", flexShrink: 1 },
  rowPoints: { color: colors.text, fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] },
  line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  lineLabel: { color: colors.text3, fontSize: 13 },
  multiplier: { color: colors.gold, fontSize: 12, fontWeight: "800", marginTop: 4 },
});
