import { useEffect, useMemo, useRef, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  assignPositions, buildSlots, calcTeamStats, pickCpuLineup, slotsToLineup,
  type AssignedPlayer, type Formation, type LineupSlot, type MatchSimulation,
} from "@shared/football";
import {
  pickCpuSecondHalfFormation, simulateFirstHalf, simulateSecondHalf, type HalfResult, type MatchFrame,
} from "@shared/match-engine";
import { GameScreen } from "@/components/game/GameScreen";
import { HalftimeSheet, MatchView } from "@/components/game/MatchView";
import { ResultPanel } from "@/components/game/ResultPanel";
import { SquadBuilder } from "@/components/game/SquadBuilder";
import { Button, Chip, Loading } from "@/components/ui";
import { api } from "@/lib/api";
import { autofill, randomSeed, restoreSlots, serializeSlots, toFootballCards, type SavedSlot } from "@/lib/game";
import { useCollection } from "@/lib/queries";
import { colors } from "@/lib/theme";

type Phase = "setup" | "playing" | "result";
type Difficulty = "easy" | "even" | "hard";

export default function VsCpu() {
  const queryClient = useQueryClient();
  const collection = useCollection();
  const pool = useMemo(() => toFootballCards(collection.data ?? []), [collection.data]);

  const [phase, setPhase] = useState<Phase>("setup");
  const [formation, setFormation] = useState<Formation>("2-2-2");
  const [slots, setSlots] = useState<LineupSlot[]>(() => buildSlots("2-2-2"));
  const [difficulty, setDifficulty] = useState<Difficulty>("even");
  const [userLineup, setUserLineup] = useState<AssignedPlayer[]>([]);
  const [cpuLineup, setCpuLineup] = useState<AssignedPlayer[]>([]);
  const [firstHalf, setFirstHalf] = useState<HalfResult | null>(null);
  const [secondHalfFrames, setSecondHalfFrames] = useState<MatchFrame[] | null>(null);
  const [summary, setSummary] = useState<MatchSimulation | null>(null);
  const [showHalftime, setShowHalftime] = useState(false);
  const [htFormation, setHtFormation] = useState<Formation>("2-2-2");
  const [matchKey, setMatchKey] = useState(0);
  const loaded = useRef(false);
  const match = useRef({ seed: "", cpuFormation: "2-2-2" as Formation });
  const summaryRef = useRef<MatchSimulation | null>(null);

  // Load the saved squad once the collection is in (fall back to an auto-picked one).
  useEffect(() => {
    if (loaded.current || !collection.data) return;
    loaded.current = true;
    api<{ team: { formation: Formation; slots: SavedSlot[] } | null }>("/api/football/team")
      .then(({ team }) => {
        if (team) { setFormation(team.formation); setSlots(restoreSlots(team.formation, team.slots, pool)); }
        else { setSlots(autofill(pool, "2-2-2")); }
      })
      .catch(() => setSlots(autofill(pool, "2-2-2")));
  }, [collection.data, pool]);

  function kickOff() {
    const assigned = slotsToLineup(slots);
    if (assigned.length < 7) return;
    const offset = difficulty === "easy" ? -7 : difficulty === "hard" ? 7 : 0;
    const cpu = pickCpuLineup(calcTeamStats(assigned).overall + offset);
    const seed = randomSeed();
    match.current = { seed, cpuFormation: cpu.formation };
    setUserLineup(assigned);
    setCpuLineup(cpu.lineup);
    setFirstHalf(simulateFirstHalf({
      userLineup: assigned, cpuLineup: cpu.lineup, userFormation: formation, cpuFormation: cpu.formation, seed,
    }));
    setSecondHalfFrames(null);
    setSummary(null);
    summaryRef.current = null;
    setHtFormation(formation);
    setMatchKey((k) => k + 1);
    setPhase("playing");
    api("/api/football/team", { method: "PUT", body: { formation, slots: serializeSlots(slots) } }).catch(() => {});
  }

  function startSecondHalf() {
    const h1 = firstHalf!;
    const cpuFm2 = pickCpuSecondHalfFormation(match.current.cpuFormation, h1.endScore.cpu, h1.endScore.user, match.current.seed);
    const { frames, summary: s } = simulateSecondHalf({
      userLineup: assignPositions(userLineup.map((p) => p.card), htFormation),
      cpuLineup: assignPositions(cpuLineup.map((p) => p.card), cpuFm2),
      userFormation: htFormation,
      cpuFormation: cpuFm2,
      seed: match.current.seed,
      halftimeScore: h1.endScore,
      involvements: new Map(h1.involvements),
      firstHalfEvents: h1.events,
    });
    summaryRef.current = s;
    setSummary(s);
    setSecondHalfFrames(frames);
    setShowHalftime(false);
  }

  async function finish() {
    setPhase("result");
    const summary = summaryRef.current;
    if (!summary) return;
    await api("/api/football", {
      body: {
        userCardIds: userLineup.map((p) => p.card.id),
        cpuCardIds: cpuLineup.map((p) => p.card.id),
        formation,
        userScore: summary.userScore,
        cpuScore: summary.cpuScore,
        result: summary.result,
      },
    }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["record", "cpu"] });
  }

  const nameOf = (id: string) =>
    [...userLineup, ...cpuLineup].find((p) => p.card.id === id)?.card.name ?? "Unknown";

  if (collection.isLoading) return <GameScreen title="vs CPU"><Loading /></GameScreen>;

  if (pool.length < 7) {
    return (
      <GameScreen title="vs CPU">
        <Text style={styles.empty}>You need at least 7 player cards to field a team. Open some packs first!</Text>
      </GameScreen>
    );
  }

  if (phase !== "setup" && firstHalf) {
    const outcome = phase === "result" && summary
      ? { outcome: summary.result, label: summary.result === "win" ? "Victory!" : summary.result === "loss" ? "Defeat" : "Draw" }
      : null;
    return (
      <GameScreen title="vs CPU" hideBack={phase === "playing"}>
        <MatchView
          key={matchKey}
          userLineup={userLineup}
          cpuLineup={cpuLineup}
          firstHalfFrames={firstHalf.frames}
          secondHalfFrames={secondHalfFrames}
          onHalftime={() => setShowHalftime(true)}
          onComplete={finish}
          result={outcome}
          resultPanel={summary && (
            <ResultPanel
              events={summary.events}
              userLabel="You" cpuLabel="CPU"
              userOverall={summary.userOverall} cpuOverall={summary.cpuOverall}
              nameOf={nameOf} mvp={summary.mvp}
            >
              <Button title="Play again" onPress={kickOff} color={colors.green} />
              <Button title="Edit squad" variant="secondary" onPress={() => setPhase("setup")} />
              <Button
                title="Share result"
                variant="secondary"
                onPress={() => {
                  const { result, userScore, cpuScore, userOverall } = summary;
                  const what = result === "win" ? `beat the CPU ${userScore}–${cpuScore}`
                    : result === "draw" ? `drew with the CPU ${userScore}–${cpuScore}`
                    : `lost to the CPU ${cpuScore}–${userScore}`;
                  Share.share({ message: `I just ${what} with a ${Math.round(userOverall)} OVR squad on 5iveG Cards ⚽🃏` });
                }}
              />
            </ResultPanel>
          )}
        />
        <HalftimeSheet
          visible={showHalftime}
          myScore={firstHalf.endScore.user}
          oppScore={firstHalf.endScore.cpu}
          formation={htFormation}
          onSelect={setHtFormation}
          onConfirm={startSecondHalf}
        />
      </GameScreen>
    );
  }

  const ready = slots.filter((s) => s.card).length === 7;
  return (
    <GameScreen
      title="vs CPU"
      footer={<Button title={ready ? "Kick off ⚽" : "Fill all 7 slots"} onPress={kickOff} disabled={!ready} color={colors.green} />}
    >
      <SquadBuilder pool={pool} formation={formation} slots={slots} onChange={(f, s) => { setFormation(f); setSlots(s); }} />
      <Text style={styles.label}>CPU strength</Text>
      <View style={styles.row}>
        {(["easy", "even", "hard"] as Difficulty[]).map((d) => (
          <Chip key={d} label={d === "even" ? "Even" : d === "easy" ? "Easy" : "Hard"} active={difficulty === d} color={colors.green} onPress={() => setDifficulty(d)} />
        ))}
      </View>
    </GameScreen>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.text2, fontSize: 16, textAlign: "center", marginTop: 60, lineHeight: 22 },
  label: { color: colors.text2, fontSize: 13, fontWeight: "700", marginTop: 18, marginBottom: 8 },
  row: { flexDirection: "row", gap: 8 },
});
