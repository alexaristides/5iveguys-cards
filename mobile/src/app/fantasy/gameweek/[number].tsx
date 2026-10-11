import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { CHIPS } from "@shared/fantasy";
import { FantasyPitch, type PitchSlot } from "@/components/fantasy/FantasyPitch";
import { GameScreen } from "@/components/game/GameScreen";
import { ErrorText, Loading, Panel } from "@/components/ui";
import { lineupFromIds } from "@/lib/fantasy";
import { useFantasy, useFantasyGameweek } from "@/lib/queries";
import { colors } from "@/lib/theme";

/** A team's points for one gameweek: who scored what, captaincy, auto-subs and chips. */
export default function FantasyGameweekScreen() {
  const { number, teamId } = useLocalSearchParams<{ number: string; teamId?: string }>();
  const result = useFantasyGameweek(Number(number), teamId);
  const fantasy = useFantasy();
  const players = useMemo(() => new Map((fantasy.data?.players ?? []).map((p) => [p.id, p])), [fantasy.data]);

  const data = result.data;
  if (!data || !fantasy.data) {
    return (
      <GameScreen title={`Gameweek ${number}`}>
        {result.error ? <ErrorText>{result.error.message}</ErrorText> : <Loading />}
      </GameScreen>
    );
  }

  const { gameweek, team, entry, score, lines } = data;
  const live = gameweek.status === "live";
  const scored = new Map((score?.players ?? []).map((p) => [p.playerId, p]));
  const lineup = entry ? lineupFromIds(entry.picks.map((p) => p.playerId), players) : null;
  const chip = entry?.chip ? CHIPS.find((c) => c.id === entry.chip) : null;

  const toSlot = (id: string | null, key: string): PitchSlot => {
    const p = players.get(id ?? "") ?? null;
    const s = id ? scored.get(id) : undefined;
    const counted = !!s && s.multiplier > 0;
    return {
      key, position: p?.position ?? null, player: p,
      caption: s ? `${s.subbedIn ? "↑ " : ""}${counted ? s.points * s.multiplier : s.points}` : undefined,
      captionColor: counted ? undefined : colors.text3,
      badge: id === score?.captainId ? "C" : null,
      dim: !counted,
    };
  };

  const rows = (entry?.picks ?? []).map((pick) => {
    const p = players.get(pick.playerId);
    const s = scored.get(pick.playerId);
    return { id: pick.playerId, name: p?.name ?? "Unknown", s, lines: lines[pick.playerId] ?? [] };
  });

  return (
    <GameScreen title={`Gameweek ${gameweek.number}`}>
      <Text style={styles.team}>{team.name}{teamId && team.manager ? ` · ${team.manager}` : ""}</Text>

      <Panel style={styles.hero}>
        <View style={{ alignItems: "center", flex: 1 }}>
          <Text style={styles.total}>{score?.total ?? "–"}</Text>
          <Text style={styles.heroLabel}>{live ? "LIVE POINTS" : "POINTS"}</Text>
        </View>
        {data.average !== null && (
          <View style={styles.side}>
            <Text style={styles.sideValue}>{data.average}</Text>
            <Text style={styles.sideLabel}>Average</Text>
            <Text style={[styles.sideValue, { marginTop: 8 }]}>{data.highest}</Text>
            <Text style={styles.sideLabel}>Highest</Text>
          </View>
        )}
      </Panel>
      {live && <Text style={styles.note}>Points update as match stats come in.</Text>}
      {(chip || entry?.transferCost) ? (
        <Text style={styles.note}>
          {[chip ? `${chip.emoji} ${chip.name} played` : null, entry?.transferCost ? `-${entry.transferCost} pts for transfers` : null]
            .filter(Boolean).join("  ·  ")}
        </Text>
      ) : null}

      {lineup ? (
        <View style={{ marginTop: 12 }}>
          <FantasyPitch
            starters={lineup.starters.map((id, i) => toSlot(id, `s${i}`))}
            bench={lineup.bench.map((id, i) => toSlot(id, `b${i}`))}
          />
        </View>
      ) : (
        <Text style={styles.note}>No team for this gameweek.</Text>
      )}

      {score && score.autoSubs.length > 0 && (
        <Text style={styles.note}>
          Auto-subs: {score.autoSubs.map((s) => `${players.get(s.in)?.name} on for ${players.get(s.out)?.name}`).join(", ")}
        </Text>
      )}

      {rows.length > 0 && <Text style={styles.section}>Breakdown</Text>}
      <View style={{ gap: 8 }}>
        {rows.map((r) => (
          <Panel key={r.id} style={{ paddingVertical: 12 }}>
            <View style={styles.rowHead}>
              <Text style={styles.rowName}>
                {r.name}
                {r.id === score?.captainId ? (r.s?.multiplier === 3 ? "  ·  Triple captain" : "  ·  Captain") : ""}
              </Text>
              <Text style={[styles.rowPoints, !r.s?.multiplier && { color: colors.text3 }]}>
                {r.s ? r.s.points * Math.max(1, r.s.multiplier) : 0}
              </Text>
            </View>
            {r.lines.length ? r.lines.map((l) => (
              <View key={l.label} style={styles.line}>
                <Text style={styles.lineLabel}>{l.label}</Text>
                <Text style={[styles.lineLabel, { color: l.points < 0 ? colors.danger : colors.text2 }]}>{l.points > 0 ? `+${l.points}` : l.points}</Text>
              </View>
            )) : <Text style={styles.lineLabel}>{live ? "No stats yet" : "Didn't play"}</Text>}
            {r.s && r.s.multiplier === 0 && r.lines.length > 0 && <Text style={styles.benchNote}>On the bench — didn&apos;t count</Text>}
          </Panel>
        ))}
      </View>
    </GameScreen>
  );
}

const styles = StyleSheet.create({
  team: { color: colors.text2, fontSize: 14, fontWeight: "600", marginBottom: 10 },
  hero: { flexDirection: "row", alignItems: "center", paddingVertical: 18 },
  total: { color: colors.text, fontSize: 56, fontWeight: "900", fontVariant: ["tabular-nums"] },
  heroLabel: { color: colors.gold, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  side: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border, paddingLeft: 18, paddingRight: 6, alignItems: "center" },
  sideValue: { color: colors.text, fontSize: 20, fontWeight: "900" },
  sideLabel: { color: colors.text3, fontSize: 11, fontWeight: "600" },
  note: { color: colors.text2, fontSize: 13, textAlign: "center", marginTop: 10 },
  section: { color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 24, marginBottom: 10 },
  rowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  rowName: { color: colors.text, fontSize: 16, fontWeight: "800", flexShrink: 1 },
  rowPoints: { color: colors.text, fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] },
  line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  lineLabel: { color: colors.text3, fontSize: 13 },
  benchNote: { color: colors.text3, fontSize: 12, fontStyle: "italic", marginTop: 4 },
});
