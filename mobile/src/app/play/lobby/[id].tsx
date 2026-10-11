import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Share, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
import { useQueryClient } from "@tanstack/react-query";
import {
  assignPositions,
  type AssignedPlayer, type Formation, type LineupSlot, type MatchSimulation,
} from "@shared/football";
import { simulateFirstHalf, simulateSecondHalf, type HalfResult, type MatchFrame } from "@shared/match-engine";
import { mirrorTape } from "@shared/match-playback";
import { GameScreen } from "@/components/game/GameScreen";
import { HalftimeSheet, MatchView } from "@/components/game/MatchView";
import { ResultPanel } from "@/components/game/ResultPanel";
import { SquadBuilder } from "@/components/game/SquadBuilder";
import { Button, ErrorText, Loading, Panel } from "@/components/ui";
import { useLobby } from "@/hooks/useLobby";
import { api } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { autofill, serializeSlots, toFootballCards } from "@/lib/game";
import { useAccount, useCollection } from "@/lib/queries";
import { colors } from "@/lib/theme";

export default function LobbyRoom() {
  const { id: lobbyId } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data: account } = useAccount();
  const userId = account?.id;
  const { lobby, phase, role, opponentSquadLocked, halftimeData, joinLobby, setPhase } = useLobby(lobbyId, userId);

  const collection = useCollection();
  const pool = useMemo(() => toFootballCards(collection.data ?? []), [collection.data]);
  const [formation, setFormation] = useState<Formation>("2-2-2");
  // null until the player edits: start from an auto-picked best squad.
  const [pickedSlots, setSlots] = useState<LineupSlot[] | null>(null);
  const slots = useMemo(() => pickedSlots ?? autofill(pool, formation), [pickedSlots, pool, formation]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [played, setPlayed] = useState(false); // this device watched the match live

  // Once both squads are locked the whole match is deterministic from the
  // shared seed (the lobby id). Key on the immutable core so a lobby refetch
  // (e.g. at full time) never rebuilds the tapes mid-playback.
  const sim = lobby?.matchResult?.simulation ?? null;
  const simKey = sim
    ? JSON.stringify([sim.creatorFormation, sim.opponentFormation, sim.creatorLineup, sim.opponentLineup])
    : null;
  const core = useMemo(() => {
    if (!simKey) return null;
    const [cf, of, cl, ol] = JSON.parse(simKey) as [Formation, Formation, AssignedPlayer[], AssignedPlayer[]];
    return { creatorFormation: cf, opponentFormation: of, creatorLineup: cl, opponentLineup: ol };
  }, [simKey]);
  const creatorLineup = core?.creatorLineup ?? [];
  const opponentLineup = core?.opponentLineup ?? [];
  const firstHalf = useMemo<HalfResult | null>(() => core && simulateFirstHalf({
    userLineup: core.creatorLineup, cpuLineup: core.opponentLineup,
    userFormation: core.creatorFormation, cpuFormation: core.opponentFormation, seed: lobbyId,
  }), [core, lobbyId]);
  const secondHalf = useMemo(() => {
    if (!halftimeData || !firstHalf || !core) return null;
    const { creatorFormation2, opponentFormation2 } = halftimeData;
    return simulateSecondHalf({
      userLineup: assignPositions(core.creatorLineup.map((p) => p.card), creatorFormation2),
      cpuLineup: assignPositions(core.opponentLineup.map((p) => p.card), opponentFormation2),
      userFormation: creatorFormation2,
      cpuFormation: opponentFormation2,
      seed: lobbyId,
      halftimeScore: firstHalf.endScore,
      involvements: new Map(firstHalf.involvements),
      firstHalfEvents: firstHalf.events,
    });
  }, [halftimeData, firstHalf, core, lobbyId]);
  const secondHalfFrames: MatchFrame[] | null = secondHalf?.frames ?? null;
  const summary: MatchSimulation | null = secondHalf?.summary ?? sim?.summary ?? null;

  // Half time: pick a formation; auto-confirms after 30s so nobody can stall the match.
  const myFirstFormation = core ? (role === "creator" ? core.creatorFormation : core.opponentFormation) : "2-2-2";
  const [htPick, setHtPick] = useState<Formation | null>(null);
  const htFormation = htPick ?? myFirstFormation;
  const [htDeadline, setHtDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [htSubmitted, setHtSubmitted] = useState(false);
  const htSubmittedRef = useRef(false);
  const htFormationRef = useRef<Formation>("2-2-2");
  const showHalftime = htDeadline !== null && !secondHalf;
  const htCountdown = htDeadline ? Math.max(0, Math.ceil((htDeadline - now) / 1000)) : 30;

  useEffect(() => {
    if (!showHalftime || htSubmitted) return;
    const iv = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(iv);
  }, [showHalftime, htSubmitted]);

  // Both squads locked: 3-2-1, then kick off.
  useEffect(() => {
    if (phase !== "countdown" || !core) return;
    let n = 3;
    const iv = setInterval(() => {
      n -= 1;
      if (n <= 0) { clearInterval(iv); setPlayed(true); setPhase("match"); }
      else setCountdown(n);
    }, 1000);
    return () => clearInterval(iv);
  }, [phase, core, setPhase]);

  const submitHalftime = useCallback(async (f: Formation) => {
    if (htSubmittedRef.current) return;
    htSubmittedRef.current = true;
    setHtSubmitted(true);
    await api(`/api/lobbies/${lobbyId}/halftime`, { body: { formation: f } }).catch(() => {});
  }, [lobbyId]);

  function onHalftime() {
    htFormationRef.current = htFormation;
    setNow(Date.now());
    setHtDeadline(Date.now() + 30_000);
    setTimeout(() => submitHalftime(htFormationRef.current), 30_000); // AFK guard, as on the web
  }

  async function onComplete() {
    if (role === "creator") await api(`/api/lobbies/${lobbyId}/result`, { body: {} }).catch(() => {});
    setPhase("result");
    queryClient.invalidateQueries({ queryKey: ["record", "pvp"] });
  }

  async function lockSquad() {
    setSubmitting(true);
    setError(null);
    try {
      await api(`/api/lobbies/${lobbyId}/squad`, { body: { formation, slots: serializeSlots(slots) } });
      setPhase("squad-locked");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function join() {
    try { await joinLobby(); } catch (err) { Alert.alert("Couldn't join", (err as Error).message); }
  }

  const inviteUrl = `${API_URL}/lobby/${lobbyId}`;
  const me = role === "creator" ? lobby?.creator : lobby?.opponent;
  const opp = role === "creator" ? lobby?.opponent : lobby?.creator;
  const myName = me?.teamName ?? me?.name ?? "You";
  const oppName = opp?.teamName ?? opp?.name ?? "Opponent";

  if (!userId || phase === "loading") return <GameScreen title="PvP"><Loading /></GameScreen>;
  if (phase === "error") {
    return (
      <GameScreen title="PvP">
        <Text style={styles.center}>Match not found. It may have expired.</Text>
        <Button title="Back to PvP" variant="secondary" onPress={() => router.back()} />
      </GameScreen>
    );
  }

  // ── Match (stays mounted through full time) ──────────────────────────────
  if ((phase === "match" || (phase === "result" && played)) && firstHalf) {
    const isCreator = role === "creator";
    const myOutcome = !summary ? "draw" : isCreator ? summary.result
      : summary.result === "win" ? "loss" : summary.result === "loss" ? "win" : "draw";
    const result = phase === "result" && summary
      ? { outcome: myOutcome, label: myOutcome === "win" ? "Victory!" : myOutcome === "loss" ? "Defeat" : "Draw" } as const
      : null;
    const all = [...creatorLineup, ...opponentLineup];
    const myScore = summary ? (isCreator ? summary.userScore : summary.cpuScore) : 0;
    const oppScore = summary ? (isCreator ? summary.cpuScore : summary.userScore) : 0;
    return (
      <GameScreen title={`${myName} vs ${oppName}`} hideBack={phase === "match"}>
        <MatchView
          userLineup={isCreator ? creatorLineup : opponentLineup}
          cpuLineup={isCreator ? opponentLineup : creatorLineup}
          firstHalfFrames={isCreator ? firstHalf.frames : mirrorTape(firstHalf.frames)}
          secondHalfFrames={secondHalfFrames ? (isCreator ? secondHalfFrames : mirrorTape(secondHalfFrames)) : null}
          userLabel={myName}
          cpuLabel={oppName}
          onHalftime={onHalftime}
          onComplete={onComplete}
          result={result}
          resultPanel={summary && (
            <ResultPanel
              events={isCreator ? summary.events : summary.events.map((e) => ({ ...e, team: e.team === "user" ? "cpu" : "user" }))}
              userLabel={myName} cpuLabel={oppName}
              nameOf={(id) => all.find((p) => p.card.id === id)?.card.name ?? "Unknown"}
            >
              <Button title="Back to PvP" onPress={() => router.replace("/play/pvp")} color={colors.user} />
              <Button
                title="Share result"
                variant="secondary"
                onPress={() => Share.share({
                  message: myScore > oppScore ? `I just beat ${oppName} ${myScore}–${oppScore} in a PvP match on 5iveG Cards ⚽🃏`
                    : myScore < oppScore ? `I just lost to ${oppName} ${oppScore}–${myScore} in a PvP match on 5iveG Cards ⚽🃏`
                    : `I just drew ${myScore}–${oppScore} with ${oppName} in a PvP match on 5iveG Cards ⚽🃏`,
                })}
              />
            </ResultPanel>
          )}
        />
        <HalftimeSheet
          visible={showHalftime}
          myScore={isCreator ? firstHalf.endScore.user : firstHalf.endScore.cpu}
          oppScore={isCreator ? firstHalf.endScore.cpu : firstHalf.endScore.user}
          formation={htFormation}
          onSelect={(f) => { setHtPick(f); htFormationRef.current = f; }}
          onConfirm={() => submitHalftime(htFormation)}
          waiting={htSubmitted}
          countdown={htCountdown}
        />
      </GameScreen>
    );
  }

  // ── Finished lobby opened later ──────────────────────────────────────────
  if (phase === "result") {
    return (
      <GameScreen title="PvP result">
        <Panel style={{ alignItems: "center", gap: 6 }}>
          <Text style={styles.big}>{lobby?.matchResult?.scoreline ?? "Finished"}</Text>
          <Text style={styles.sub}>
            {lobby?.matchResult?.winnerId == null ? "Draw" : lobby.matchResult.winnerId === userId ? "You won" : `${oppName} won`}
          </Text>
        </Panel>
        <Button title="Back to PvP" variant="secondary" onPress={() => router.replace("/play/pvp")} style={{ marginTop: 16 }} />
      </GameScreen>
    );
  }

  if (phase === "countdown") {
    return (
      <GameScreen title="PvP" hideBack>
        <Text style={styles.vs}>{myName}  vs  {oppName}</Text>
        <Text style={styles.countdown}>{countdown}</Text>
      </GameScreen>
    );
  }

  // ── Waiting for an opponent (creator) ────────────────────────────────────
  if (phase === "waiting") {
    return (
      <GameScreen title="PvP">
        <Panel style={{ alignItems: "center", gap: 10 }}>
          <Text style={styles.sub}>Share this code with a friend</Text>
          <Text selectable style={styles.code}>{lobbyId}</Text>
          <Button
            title="Invite a friend"
            color={colors.user}
            style={{ alignSelf: "stretch" }}
            onPress={() => Share.share({ message: `Play me on 5iveG Cards! Match code: ${lobbyId}\n${inviteUrl}` })}
          />
          <Button title="Copy code" variant="secondary" style={{ alignSelf: "stretch" }} onPress={() => Clipboard.setStringAsync(lobbyId)} />
          <Text style={styles.waiting}>Waiting for an opponent… (expires in 10 minutes)</Text>
        </Panel>
      </GameScreen>
    );
  }

  // ── Someone else's open lobby ────────────────────────────────────────────
  if (phase === "preview") {
    return (
      <GameScreen title="PvP">
        <Panel style={{ alignItems: "center", gap: 12 }}>
          {lobby?.creator.image ? <Image source={{ uri: lobby.creator.image }} style={styles.avatar} /> : null}
          <Text style={styles.big}>{lobby?.creator.teamName ?? lobby?.creator.name ?? "A player"}</Text>
          <Text style={styles.sub}>wants a 1v1 match</Text>
          {lobby?.status === "WAITING"
            ? <Button title="Accept challenge" onPress={join} color={colors.user} style={{ alignSelf: "stretch" }} />
            : <Text style={styles.sub}>This match is already full.</Text>}
        </Panel>
      </GameScreen>
    );
  }

  // ── Squad pick / locked ──────────────────────────────────────────────────
  const locked = phase === "squad-locked";
  const ready = slots.filter((s) => s.card).length === 7;
  return (
    <GameScreen
      title={`vs ${oppName}`}
      footer={locked ? (
        <Text style={styles.waiting}>✓ Squad locked. {opponentSquadLocked ? "Starting…" : `Waiting for ${oppName}…`}</Text>
      ) : (
        <Button title={ready ? "Lock in squad 🔒" : "Fill all 7 slots"} onPress={lockSquad} disabled={!ready} loading={submitting} color={colors.user} />
      )}
    >
      {opponentSquadLocked && !locked && <Text style={styles.oppReady}>{oppName} has locked in their squad!</Text>}
      {collection.isLoading ? <Loading /> : pool.length < 7 ? (
        <Text style={styles.center}>You need at least 7 player cards to play. Open some packs first!</Text>
      ) : (
        <View pointerEvents={locked ? "none" : "auto"} style={locked ? { opacity: 0.5 } : undefined}>
          <SquadBuilder pool={pool} formation={formation} slots={slots} accent={colors.user} onChange={(f, s) => { setFormation(f); setSlots(s); }} />
        </View>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </GameScreen>
  );
}

const styles = StyleSheet.create({
  center: { color: colors.text2, fontSize: 16, textAlign: "center", marginVertical: 40, lineHeight: 22 },
  sub: { color: colors.text2, fontSize: 14, textAlign: "center" },
  big: { color: colors.text, fontSize: 24, fontWeight: "900", textAlign: "center" },
  code: { color: colors.text, fontSize: 34, fontWeight: "900", letterSpacing: 2, fontVariant: ["tabular-nums"] },
  waiting: { color: colors.text2, fontSize: 14, textAlign: "center", paddingVertical: 12 },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  vs: { color: colors.text2, fontSize: 18, fontWeight: "800", textAlign: "center", marginTop: 80 },
  countdown: { color: "#fff", fontSize: 120, fontWeight: "900", textAlign: "center", marginTop: 20 },
  oppReady: { color: colors.greenHi, fontWeight: "800", textAlign: "center", marginBottom: 10 },
});
