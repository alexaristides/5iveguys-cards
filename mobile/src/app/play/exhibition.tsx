import { useEffect, useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import type { StatsMap } from "@shared/card-rating";
import {
  buildSlots, calcTeamStats, slotsToLineup, type FootballCard, type Formation, type LineupSlot,
} from "@shared/football";
import { EXHIBITION_POOL, simulateExhibition, type ExhibitionResult } from "@shared/exhibition";
import { topPlayers, type ExhibitionStats, type MatchPlayerEntry } from "@shared/exhibition-stats";
import { GameScreen } from "@/components/game/GameScreen";
import { MatchView } from "@/components/game/MatchView";
import { ResultPanel } from "@/components/game/ResultPanel";
import { SquadBuilder } from "@/components/game/SquadBuilder";
import { Button, Loading } from "@/components/ui";
import { api } from "@/lib/api";
import { CHANNELS } from "@/lib/config";
import { readExhibitionStats, recordExhibitionMatch } from "@/lib/exhibitionStore";
import { autofill, randomSeed } from "@/lib/game";
import { imageUri } from "@/lib/images";
import { colors } from "@/lib/theme";

type Phase = "setup" | "playing" | "result";
type Side = "A" | "B";

interface ApiPlayer {
  id: string; name: string; kit: string | null; rarity: FootballCard["rarity"]; imageUrl: string;
  attribute: string | null; position: string | null; channelSlug: string; stats: StatsMap | null;
}

interface Team { formation: Formation; slots: LineupSlot[] }

const APP_CHANNELS = new Set<string>(CHANNELS.map((c) => c.slug));

export default function Exhibition() {
  const players = useQuery({
    queryKey: ["exhibition-players"],
    queryFn: async () => {
      try {
        const { players } = await api<{ players: ApiPlayer[] }>("/api/exhibition/players");
        const pool: FootballCard[] = players
          .filter((p) => APP_CHANNELS.has(p.channelSlug))
          .map((p) => ({
            id: p.id, name: p.name, rarity: p.rarity, imageUrl: p.imageUrl, kit: p.kit,
            attribute: (p.attribute ?? "Skill") as FootballCard["attribute"],
            stats: p.stats ?? undefined, ratingPosition: p.position ?? undefined,
          }));
        return pool.length >= 7 ? pool : EXHIBITION_POOL;
      } catch {
        return EXHIBITION_POOL;
      }
    },
    staleTime: 5 * 60_000,
  });
  const pool = players.data ?? [];

  const [phase, setPhase] = useState<Phase>("setup");
  const [editing, setEditing] = useState<Side>("A");
  const [teams, setTeams] = useState<Record<Side, Team>>({
    A: { formation: "2-2-2", slots: buildSlots("2-2-2") },
    B: { formation: "2-2-2", slots: buildSlots("2-2-2") },
  });
  const [result, setResult] = useState<ExhibitionResult | null>(null);
  const [stats, setStats] = useState<ExhibitionStats | null>(null);

  useEffect(() => { readExhibitionStats().then(setStats); }, []);

  const info = (t: Team) => {
    const a = slotsToLineup(t.slots);
    return { filled: a.length, overall: a.length ? Math.round(calcTeamStats(a).overall) : 0 };
  };
  const ready = info(teams.A).filled === 7 && info(teams.B).filled === 7;

  async function run() {
    const a = slotsToLineup(teams.A.slots);
    const b = slotsToLineup(teams.B.slots);
    if (a.length < 7 || b.length < 7) return;
    const res = simulateExhibition(a, b, teams.A.formation, teams.B.formation, randomSeed());
    const entries: MatchPlayerEntry[] = res.ratings.map((r) => ({
      id: r.cardId.replace(/^[AB]:/, ""), name: r.name, imageUrl: r.imageUrl, rarity: r.rarity,
      won: (r.side === "A" && res.winner === "A") || (r.side === "B" && res.winner === "B"),
      goals: r.goals,
    }));
    setResult(res);
    setPhase("playing");
    setStats(await recordExhibitionMatch(entries));
  }

  if (players.isLoading) return <GameScreen title="Exhibition"><Loading /></GameScreen>;

  if (phase === "playing" && result) {
    return (
      <GameScreen title="Exhibition" hideBack>
        <MatchView
          key={`${result.frames.length}-${result.aScore}-${result.bScore}`}
          userLineup={result.aLineup}
          cpuLineup={result.bLineup}
          userLabel="Team A"
          cpuLabel="Team B"
          firstHalfFrames={[]}
          secondHalfFrames={null}
          soloFrames={result.frames}
          soloDurationSec={result.durationSec}
          onComplete={() => setPhase("result")}
        />
        <Button title="Skip to result ⏭" variant="secondary" onPress={() => setPhase("result")} style={{ marginTop: 12 }} />
      </GameScreen>
    );
  }

  if (phase === "result" && result) {
    const nameOf = (id: string) => result.ratings.find((r) => r.cardId === id)?.name ?? "Unknown";
    const motm = result.ratings.find((r) => r.cardId === result.motmCardId);
    const label = result.winner === "A" ? "Team A win" : result.winner === "B" ? "Team B win" : "Draw";
    return (
      <GameScreen title="Exhibition">
        <View style={styles.scoreBox}>
          <Text style={styles.final}>FULL TIME</Text>
          <Text style={styles.score}>{result.aScore} – {result.bScore}</Text>
          <Text style={styles.final}>{label}</Text>
        </View>
        <ResultPanel
          events={result.events}
          userLabel="Team A" cpuLabel="Team B"
          userOverall={result.aOverall} cpuOverall={result.bOverall}
          nameOf={nameOf}
          mvp={motm ? { name: motm.name, imageUrl: motm.imageUrl, goals: motm.goals, assists: motm.assists } : null}
          extra={
            <>
              <View style={styles.box}>
                <Text style={styles.head}>PLAYER RATINGS</Text>
                {[...result.ratings].sort((x, y) => y.rating - x.rating).map((r) => (
                  <View key={r.cardId} style={styles.ratingRow}>
                    <View style={[styles.sideDot, { backgroundColor: r.side === "A" ? colors.user : colors.cpu }]} />
                    <Text style={styles.ratingName} numberOfLines={1}>{r.name} <Text style={styles.dim}>{r.position}</Text></Text>
                    <Text style={styles.dim}>{r.goals ? `⚽${r.goals} ` : ""}{r.saves ? `🧤${r.saves}` : ""}</Text>
                    <Text style={styles.rating}>{r.rating.toFixed(1)}</Text>
                  </View>
                ))}
              </View>
              {stats && stats.gamesPlayed > 0 && (
                <View style={styles.box}>
                  <Text style={styles.head}>HALL OF FAME · {stats.gamesPlayed} GAMES</Text>
                  {topPlayers(stats, "goals", 3).map((p) => (
                    <View key={p.id} style={styles.ratingRow}>
                      <Image source={{ uri: imageUri(p.imageUrl) }} style={styles.hofImg} />
                      <Text style={styles.ratingName} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.dim}>{p.goals} goals · {p.wins} wins</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          }
        >
          <Button title="Rematch" onPress={run} color={colors.green} />
          <Button title="Edit teams" variant="secondary" onPress={() => setPhase("setup")} />
          <Button
            title="Share result"
            variant="secondary"
            onPress={() => Share.share({ message: `Exhibition result: Team A ${result.aScore}–${result.bScore} Team B on 5iveG Cards ⚽🃏` })}
          />
        </ResultPanel>
      </GameScreen>
    );
  }

  const team = teams[editing];
  return (
    <GameScreen
      title="Exhibition"
      footer={<Button title={ready ? "Kick off ⚽" : "Fill both teams"} onPress={run} disabled={!ready} color={colors.green} />}
    >
      <View style={styles.toggle}>
        {(["A", "B"] as Side[]).map((side) => {
          const i = info(teams[side]);
          const active = editing === side;
          const tint = side === "A" ? colors.user : colors.cpu;
          return (
            <Pressable key={side} onPress={() => setEditing(side)} style={[styles.teamBtn, active && { borderColor: tint, backgroundColor: `${tint}22` }]}>
              <Text style={[styles.teamName, { color: tint }]}>{side === "A" ? "TEAM A · HOME" : "TEAM B · AWAY"}</Text>
              <Text style={styles.teamMeta}>{i.filled}/7 · OVR {i.overall || "–"}</Text>
            </Pressable>
          );
        })}
      </View>
      <SquadBuilder
        key={editing}
        pool={pool}
        formation={team.formation}
        slots={team.slots}
        accent={editing === "A" ? colors.user : colors.cpu}
        onChange={(formation, slots) => setTeams((t) => ({ ...t, [editing]: { formation, slots } }))}
      />
      <Button
        title="Random teams 🎲"
        variant="secondary"
        style={{ marginTop: 14 }}
        onPress={() => {
          const shuffled = [...pool].sort(() => Math.random() - 0.5);
          setTeams({
            A: { formation: teams.A.formation, slots: autofill(shuffled.slice(0, Math.ceil(shuffled.length / 2)), teams.A.formation) },
            B: { formation: teams.B.formation, slots: autofill(shuffled.slice(Math.ceil(shuffled.length / 2)), teams.B.formation) },
          });
        }}
      />
      <Text style={styles.hint}>Any player can play for either side. Ratings come from the fans&apos; votes.</Text>
    </GameScreen>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: "row", gap: 10, marginBottom: 14 },
  teamBtn: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 10 },
  teamName: { fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  teamMeta: { color: colors.text, fontSize: 14, fontWeight: "800", marginTop: 2 },
  hint: { color: colors.text3, fontSize: 12, textAlign: "center", marginTop: 12 },
  scoreBox: { alignItems: "center", backgroundColor: colors.card, borderRadius: 16, padding: 16 },
  final: { color: colors.text2, fontSize: 12, fontWeight: "900", letterSpacing: 1.5 },
  score: { color: "#fff", fontSize: 44, fontWeight: "900" },
  box: { backgroundColor: colors.card, borderRadius: 14, padding: 12, gap: 8 },
  head: { color: colors.text3, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sideDot: { width: 8, height: 8, borderRadius: 4 },
  ratingName: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "700" },
  dim: { color: colors.text3, fontSize: 12, fontWeight: "600" },
  rating: { color: colors.gold, fontSize: 15, fontWeight: "900", width: 36, textAlign: "right" },
  hofImg: { width: 26, height: 26, borderRadius: 13 },
});
