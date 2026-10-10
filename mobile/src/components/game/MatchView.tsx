import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { FORMATIONS, type AssignedPlayer, type Formation, type MatchEvent } from "@shared/football";
import type { MatchFrame } from "@shared/match-engine";
import { sampleTimeline } from "@shared/match-playback";
import { Button } from "@/components/ui";
import { FORMATION_LIST } from "@/lib/game";
import { imageUri } from "@/lib/images";
import { colors } from "@/lib/theme";

// Native port of the website's components/football/MatchPitch.tsx. Token
// positions are driven by Animated values set every frame (no re-render per
// frame), mirroring the web version's direct DOM writes.

const FPS = 6.5; // motion frames per second, as on the web
const TOKEN = 34;

const EVENT_ICON: Record<string, string> = {
  goal: "⚽", save: "🧤", miss: "💨", tackle: "💪", clearance: "↗", kickoff: "🏁",
  halftime: "⏸", fulltime: "🔔", possession: "●", freekick: "🎯", yellowcard: "🟨", nearpost: "🔔", counter: "⚡",
  corner: "🚩", throwin: "🙌", goalkick: "🥅", redcard: "🟥", blunder: "🤡",
};

function statusFor(ev: MatchEvent): { label: string; team: "user" | "cpu" } {
  switch (ev.type) {
    case "goal": case "save": case "miss": case "nearpost": case "corner": case "freekick":
      return { team: ev.team, label: "attacking" };
    case "tackle": case "clearance": return { team: ev.team, label: "wins it back" };
    case "redcard": return { team: ev.team, label: "red card!" };
    case "blunder": return { team: ev.team, label: "blunder!" };
    case "yellowcard": return { team: ev.team, label: "free kick" };
    case "goalkick": return { team: ev.team, label: "goal kick" };
    case "throwin": return { team: ev.team, label: "throw-in" };
    case "kickoff": return { team: ev.team, label: "kick off" };
    default: return { team: ev.team, label: "in possession" };
  }
}

interface Popup { team: "user" | "cpu"; icon: string; title: string; full: boolean; durationMs: number }

function popupFor(ev: MatchEvent, cpuLabel: string): Popup | null {
  switch (ev.type) {
    case "goal": return { team: ev.team, icon: "⚽", title: ev.team === "user" ? "GOAL!" : `${cpuLabel} GOAL`, full: true, durationMs: 1600 };
    case "redcard": return { team: ev.team, icon: "🟥", title: "Red card!", full: false, durationMs: 1700 };
    case "yellowcard": return { team: ev.team, icon: "🟨", title: "Yellow card", full: false, durationMs: 1200 };
    case "freekick": return { team: ev.team, icon: "🎯", title: "Free kick", full: false, durationMs: 1100 };
    case "corner": return { team: ev.team, icon: "🚩", title: "Corner", full: false, durationMs: 1000 };
    case "blunder": return { team: ev.team, icon: "🤡", title: "Blunder!", full: false, durationMs: 1500 };
    default: return null;
  }
}

type Phase = "playing1" | "halftime-wait" | "playing2" | "done";

export interface MatchOutcome { outcome: "win" | "loss" | "draw"; label: string }

interface Props {
  userLineup: AssignedPlayer[];
  cpuLineup: AssignedPlayer[];
  firstHalfFrames: MatchFrame[];
  secondHalfFrames: MatchFrame[] | null;
  /** Play one continuous tape (Exhibition); halves/onHalftime are ignored. */
  soloFrames?: MatchFrame[] | null;
  soloDurationSec?: number;
  userLabel?: string;
  cpuLabel?: string;
  onHalftime?: () => void;
  onComplete: () => void;
  result?: MatchOutcome | null;
  resultPanel?: ReactNode;
}

interface TokenInfo { id: string; name: string; imageUrl: string; team: "user" | "cpu" }

export function MatchView({
  userLineup, cpuLineup, firstHalfFrames, secondHalfFrames, soloFrames = null, soloDurationSec,
  userLabel = "YOU", cpuLabel = "CPU", onHalftime, onComplete, result = null, resultPanel = null,
}: Props) {
  const solo = soloFrames != null;
  const { width, height } = useWindowDimensions();
  const W = width - 32;
  const H = Math.min(W * 1.3, height * 0.5);

  const [phase, setPhase] = useState<Phase>("playing1");
  const [possessorId, setPossessorId] = useState<string | null>(null);
  const [feed, setFeed] = useState<MatchEvent[]>([]);
  const [score, setScore] = useState({ user: 0, cpu: 0 });
  const [minute, setMinute] = useState(0);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [stats, setStats] = useState({ userShots: 0, cpuShots: 0, userPoss: 0, cpuPoss: 0 });
  const [status, setStatus] = useState<{ label: string; team: "user" | "cpu" } | null>(null);
  const [flash, setFlash] = useState<"user" | "cpu" | null>(null);

  const tokens = useMemo<TokenInfo[]>(() => [
    ...userLineup.map((p) => ({ id: p.card.id, name: p.card.name, imageUrl: p.card.imageUrl, team: "user" as const })),
    ...cpuLineup.map((p) => ({ id: p.card.id, name: p.card.name, imageUrl: p.card.imageUrl, team: "cpu" as const })),
  ], [userLineup, cpuLineup]);

  const toPx = (p: { x: number; y: number }) => ({ x: (p.x / 100) * W, y: (p.y / 100) * H });

  // One Animated.ValueXY per token, seeded at the kick-off positions.
  const anims = useMemo(() => {
    const f0 = (soloFrames && soloFrames[0]) || firstHalfFrames[0];
    const start = new Map(f0?.players.map((p) => [p.id, p]) ?? []);
    return new Map(tokens.map((t) => [t.id, new Animated.ValueXY(toPx(start.get(t.id) ?? { x: 50, y: 50 }))]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens]);
  const [ball] = useState(() => new Animated.ValueXY(toPx({ x: 50, y: 50 })));
  const [progress] = useState(() => new Animated.Value(0));

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function applyEvent(ev: MatchEvent) {
    setStatus(statusFor(ev));
    setFeed((prev) => [ev, ...prev].slice(0, 8));
    setScore({ user: ev.scoreUser, cpu: ev.scoreCpu });
    setStats((s) => {
      const next = { ...s };
      if (["goal", "save", "miss", "nearpost"].includes(ev.type)) { if (ev.team === "user") next.userShots++; else next.cpuShots++; }
      if (["possession", "counter", "tackle", "clearance"].includes(ev.type)) { if (ev.team === "user") next.userPoss++; else next.cpuPoss++; }
      return next;
    });
    const p = popupFor(ev, cpuLabel);
    if (p) { setPopup(p); later(() => setPopup(null), p.durationMs); }
    if (ev.type === "goal") {
      Haptics.notificationAsync(ev.team === "user" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
      setSpotlightId(ev.scorerCardId ?? null);
      later(() => setSpotlightId(null), 1600);
      setFlash(ev.team);
      later(() => setFlash(null), 1800);
    }
  }

  // The second half starts as soon as the parent supplies its frames.
  const activePhase: Phase =
    !solo && phase === "halftime-wait" && secondHalfFrames && secondHalfFrames.length > 0 ? "playing2" : phase;

  useEffect(() => {
    const phase = activePhase;
    if (solo ? phase !== "playing1" : phase !== "playing1" && phase !== "playing2") return;
    const frames = solo ? soloFrames ?? [] : phase === "playing1" ? firstHalfFrames : secondHalfFrames ?? [];
    if (frames.length === 0) return;
    const durationSec = solo ? soloDurationSec ?? frames.length / FPS : frames.length / FPS;
    const base = solo ? 0 : phase === "playing1" ? 0 : 0.5;
    const span = solo ? 1 : 0.5;
    let p = 0;
    let lastTs: number | null = null;
    let fired = -1;
    let raf = 0;

    const frame = (ts: number) => {
      if (lastTs === null) lastTs = ts;
      p = Math.min(1, p + (ts - lastTs) / (durationSec * 1000));
      lastTs = ts;
      const s = sampleTimeline(frames, p, 1);
      for (const pl of s.players) anims.get(pl.id)?.setValue(toPx(pl));
      ball.setValue(toPx(s.ball));
      progress.setValue(base + s.progress * span);
      for (let i = fired + 1; i <= s.frameIndex && i < frames.length; i++) {
        const ev = frames[i].event;
        if (ev) { applyEvent(ev); setMinute(ev.minute); setPossessorId(frames[i].possessorId); }
      }
      fired = Math.max(fired, s.frameIndex);
      if (p < 1) raf = requestAnimationFrame(frame);
      else if (!solo && phase === "playing1") { setPhase("halftime-wait"); onHalftime?.(); }
      else { setPhase("done"); onComplete(); }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePhase, firstHalfFrames, secondHalfFrames, soloFrames, soloDurationSec]);

  const totalPoss = stats.userPoss + stats.cpuPoss;
  const userPct = totalPoss > 0 ? Math.round((stats.userPoss / totalPoss) * 100) : 50;

  const headerBg = result
    ? result.outcome === "win" ? "#14532d" : result.outcome === "loss" ? "#7f1d1d" : colors.cardHi
    : flash === "user" ? "#1e3a8a" : flash === "cpu" ? "#7f1d1d" : colors.card;

  return (
    <View>
      <View style={[styles.header, { backgroundColor: headerBg }]}>
        <View style={styles.scoreRow}>
          <Text numberOfLines={1} style={[styles.team, { textAlign: "left" }]}>
            <Text style={{ color: "#60a5fa" }}>● </Text>{userLabel}
          </Text>
          <Text style={styles.score}>{score.user} – {score.cpu}</Text>
          <Text numberOfLines={1} style={[styles.team, { textAlign: "right" }]}>
            {cpuLabel}<Text style={{ color: "#f87171" }}> ●</Text>
          </Text>
        </View>
        {result ? (
          <Text style={styles.statusLine}>FULL TIME · <Text style={styles.resultLabel}>{result.label}</Text></Text>
        ) : (
          <Text style={styles.statusLine}>
            {minute}&apos;  ·  <Text style={{ color: status?.team === "cpu" ? "#fca5a5" : "#93c5fd", fontWeight: "800" }}>
              {status ? (status.team === "user" ? userLabel : cpuLabel) : userLabel}
            </Text> {status?.label ?? "kick off"}
          </Text>
        )}
        <View style={styles.possRow}>
          <Text style={[styles.possPct, { color: "#93c5fd" }]}>{userPct}%</Text>
          <View style={styles.possTrack}><View style={[styles.possFill, { width: `${userPct}%` }]} /></View>
          <Text style={[styles.possPct, { color: "#fca5a5", textAlign: "right" }]}>{100 - userPct}%</Text>
        </View>
      </View>

      <View style={[styles.pitch, { width: W, height: H }]}>
        <View style={[styles.endZone, { top: 0, backgroundColor: "rgba(239,68,68,0.18)" }]} />
        <View style={[styles.endZone, { bottom: 0, backgroundColor: "rgba(59,130,246,0.18)" }]} />
        <View style={styles.lines} />
        <View style={[styles.halfway, { top: H / 2 }]} />
        <View style={[styles.circle, { left: W / 2 - W * 0.11, top: H / 2 - W * 0.11, width: W * 0.22, height: W * 0.22, borderRadius: W * 0.11 }]} />
        <View style={[styles.box, { top: H * 0.04, left: W * 0.27, width: W * 0.46, height: H * 0.15, borderTopWidth: 0 }]} />
        <View style={[styles.box, { bottom: H * 0.04, left: W * 0.27, width: W * 0.46, height: H * 0.15, borderBottomWidth: 0 }]} />

        {tokens.map((t) => {
          const big = spotlightId === t.id;
          const size = big ? 50 : TOKEN;
          return (
            <Animated.View
              key={t.id}
              pointerEvents="none"
              style={[styles.tokenWrap, { zIndex: big ? 30 : 10, transform: anims.get(t.id)!.getTranslateTransform() }]}
            >
              <View style={{ marginLeft: -size / 2, marginTop: -size / 2, alignItems: "center" }}>
                <View
                  style={[
                    styles.token,
                    { width: size, height: size, borderRadius: size / 2, borderColor: t.team === "user" ? "#60a5fa" : "#ef4444" },
                    possessorId === t.id && styles.possessor,
                    big && styles.spotlight,
                  ]}
                >
                  <Image source={{ uri: imageUri(t.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: t.team === "user" ? "rgba(59,130,246,0.3)" : "rgba(220,38,38,0.35)" }]} />
                </View>
                <Text numberOfLines={1} style={styles.tokenName}>{t.name}</Text>
              </View>
            </Animated.View>
          );
        })}

        <Animated.View pointerEvents="none" style={[styles.ballWrap, { transform: ball.getTranslateTransform() }]}>
          <View style={styles.ball} />
        </Animated.View>

        {popup && (popup.full ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: popup.team === "user" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.25)" }]}>
            <View style={styles.goalBox}>
              <Text style={styles.goalText}>{popup.icon} {popup.title}</Text>
              <Text style={styles.goalScore}>{score.user} – {score.cpu}</Text>
            </View>
          </View>
        ) : (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
            <View style={styles.smallPopup}><Text style={styles.smallPopupText}>{popup.icon}  {popup.title.toUpperCase()}</Text></View>
          </View>
        ))}

        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: [0, W] }) }]} />
        </View>
      </View>

      {result ? resultPanel : (
        <View style={styles.feed}>
          {feed.length === 0 && <Text style={styles.waiting}>Waiting for kick off…</Text>}
          {feed.slice(0, 5).map((ev, i) => (
            <View
              key={`${ev.minute}-${i}-${feed.length}`}
              style={[styles.feedRow, i === 0 && styles.feedLatest, ev.type === "goal" && { borderColor: ev.team === "user" ? "#3b82f6" : "#ef4444" }]}
            >
              <Text style={styles.feedIcon}>{EVENT_ICON[ev.type] ?? "●"}</Text>
              <Text style={[styles.feedText, ev.type === "goal" && { color: "#fff", fontWeight: "700" }]}>
                <Text style={styles.feedMin}>{ev.minute}&apos; </Text>{ev.description}
              </Text>
            </View>
          ))}
          <Text style={styles.shots}>
            Shots  <Text style={{ color: "#60a5fa" }}>{stats.userShots}</Text> – <Text style={{ color: "#f87171" }}>{stats.cpuShots}</Text>
          </Text>
        </View>
      )}
    </View>
  );
}

/** Half-time overlay: pick a second-half formation. */
export function HalftimeSheet({
  visible, myScore, oppScore, formation, onSelect, onConfirm, waiting, countdown,
}: {
  visible: boolean;
  myScore: number;
  oppScore: number;
  formation: Formation;
  onSelect: (f: Formation) => void;
  onConfirm: () => void;
  waiting?: boolean;
  countdown?: number;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.htBackdrop}>
        <View style={styles.htCard}>
          <Text style={styles.htLabel}>HALF TIME</Text>
          <Text style={styles.htScore}>{myScore} – {oppScore}</Text>
          {waiting ? (
            <Text style={styles.htWaiting}>Waiting for your opponent…</Text>
          ) : (
            <>
              <Text style={styles.htSub}>Second-half formation</Text>
              <View style={styles.htGrid}>
                {FORMATION_LIST.map((f) => (
                  <Pressable
                    key={f}
                    onPress={() => { Haptics.selectionAsync(); onSelect(f); }}
                    style={[styles.htOption, f === formation && styles.htOptionActive]}
                  >
                    <Text style={styles.htOptionText}>{f}</Text>
                    <Text style={styles.htOptionDesc}>{FORMATIONS[f].desc}</Text>
                  </Pressable>
                ))}
              </View>
              <Button title="Start second half" onPress={onConfirm} color={colors.green} />
              {countdown !== undefined && <Text style={styles.htCountdown}>Auto-confirms in 0:{String(countdown).padStart(2, "0")}</Text>}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
  scoreRow: { flexDirection: "row", alignItems: "center" },
  team: { flex: 1, color: "#fff", fontSize: 13, fontWeight: "800" },
  score: { color: "#fff", fontSize: 28, fontWeight: "900", fontVariant: ["tabular-nums"], marginHorizontal: 12 },
  statusLine: { color: colors.text2, fontSize: 12, textAlign: "center", marginTop: 2 },
  resultLabel: { color: "#fff", fontWeight: "900", fontSize: 14 },
  possRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  possPct: { width: 34, fontSize: 11, fontWeight: "800" },
  possTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: "rgba(239,68,68,0.7)", overflow: "hidden" },
  possFill: { height: 5, backgroundColor: "#3b82f6" },
  pitch: { backgroundColor: "#1e6b2e", borderRadius: 14, overflow: "hidden" },
  endZone: { position: "absolute", left: 0, right: 0, height: "18%" },
  lines: { ...StyleSheet.absoluteFill, margin: "4%", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  halfway: { position: "absolute", left: "4%", right: "4%", height: 1, backgroundColor: "rgba(255,255,255,0.25)" },
  circle: { position: "absolute", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  box: { position: "absolute", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  tokenWrap: { position: "absolute", left: 0, top: 0 },
  token: { borderWidth: 3, overflow: "hidden", backgroundColor: "#111" },
  possessor: { shadowColor: "#fff", shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  spotlight: { borderColor: "#facc15", shadowColor: "#facc15", shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  tokenName: {
    color: "#fff", fontSize: 9, fontWeight: "700", maxWidth: 64, marginTop: 1,
    backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 3, borderRadius: 3, overflow: "hidden",
  },
  ballWrap: { position: "absolute", left: 0, top: 0, zIndex: 20 },
  ball: { width: 10, height: 10, borderRadius: 5, marginLeft: -5, marginTop: -5, backgroundColor: "#fff", shadowColor: "#fff", shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  center: { alignItems: "center", justifyContent: "center", zIndex: 40 },
  goalBox: { backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 16, paddingHorizontal: 18, paddingVertical: 10, alignItems: "center" },
  goalText: { color: "#fff", fontSize: 30, fontWeight: "900" },
  goalScore: { color: "rgba(255,255,255,0.7)", fontWeight: "800", marginTop: 2 },
  smallPopup: { backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 2, borderColor: "rgba(255,255,255,0.6)" },
  smallPopupText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  progressTrack: { position: "absolute", left: 0, right: 0, bottom: 0, height: 3, backgroundColor: "rgba(255,255,255,0.1)" },
  progressFill: { height: 3, backgroundColor: "rgba(255,255,255,0.45)" },
  feed: { marginTop: 10, gap: 6 },
  waiting: { color: colors.text3, fontStyle: "italic", fontSize: 13 },
  feedRow: { flexDirection: "row", gap: 8, padding: 8, borderRadius: 10, backgroundColor: "rgba(24,24,27,0.6)", borderWidth: 1, borderColor: "transparent" },
  feedLatest: { backgroundColor: colors.cardHi },
  feedIcon: { fontSize: 14 },
  feedText: { flex: 1, color: colors.text2, fontSize: 13, lineHeight: 18 },
  feedMin: { color: colors.text3, fontWeight: "700" },
  shots: { color: colors.text3, fontSize: 12, fontWeight: "700", textAlign: "center", marginTop: 4 },
  htBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center", padding: 24 },
  htCard: { width: "100%", backgroundColor: colors.card, borderRadius: 22, padding: 22, gap: 12, alignItems: "stretch" },
  htLabel: { color: colors.text2, fontSize: 11, fontWeight: "900", letterSpacing: 2, textAlign: "center" },
  htScore: { color: "#fff", fontSize: 44, fontWeight: "900", textAlign: "center" },
  htSub: { color: colors.text2, fontSize: 13, textAlign: "center" },
  htGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  htOption: { width: "48%", flexGrow: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.cardHi, alignItems: "center", borderWidth: 1, borderColor: "transparent" },
  htOptionActive: { backgroundColor: "#166534", borderColor: colors.greenHi },
  htOptionText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  htOptionDesc: { color: colors.text2, fontSize: 11 },
  htCountdown: { color: colors.text3, fontSize: 12, textAlign: "center" },
  htWaiting: { color: colors.text2, textAlign: "center", paddingVertical: 16 },
});
