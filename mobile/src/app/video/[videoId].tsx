import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import YoutubePlayer from "react-native-youtube-iframe";
import { useQueryClient } from "@tanstack/react-query";
import { POINTS_CONFIG } from "@shared/cards";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { useChannel } from "@/lib/channel";
import { colors } from "@/lib/theme";

const REPORT_EVERY_S = 60; // the server credits whole minutes per report

/** In-app player. Watch time only counts while the video plays with the app in the foreground. */
export default function VideoSheet() {
  const { videoId, title } = useLocalSearchParams<{ videoId: string; title?: string }>();
  const { slug } = useChannel();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const [playing, setPlaying] = useState(false);
  const [earned, setEarned] = useState(0);
  const [cappedOut, setCappedOut] = useState(false);
  const pending = useRef(0);
  const playingRef = useRef(false);
  const activeRef = useRef(AppState.currentState === "active");

  const report = useCallback(async (seconds: number) => {
    if (seconds < 1) return;
    try {
      const res = await api<{ pointsEarned: number; cappedOut: boolean }>(
        `/api/channels/${slug}/videos/${videoId}/watch-time`,
        { body: { seconds: Math.min(120, Math.round(seconds)) } },
      );
      if (res.pointsEarned > 0) {
        setEarned((e) => e + res.pointsEarned);
        queryClient.invalidateQueries({ queryKey: ["me", slug] });
      }
      if (res.cappedOut) setCappedOut(true);
    } catch { /* best effort */ }
  }, [slug, videoId, queryClient]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { activeRef.current = s === "active"; });
    const iv = setInterval(() => {
      if (!playingRef.current || !activeRef.current) return;
      pending.current += 1;
      if (pending.current >= REPORT_EVERY_S) {
        report(pending.current);
        pending.current = 0;
      }
    }, 1000);
    return () => {
      sub.remove();
      clearInterval(iv);
      report(pending.current); // flush the partial minute (counts toward watch time)
      queryClient.invalidateQueries({ queryKey: ["videos", slug] });
    };
  }, [report, queryClient, slug]);

  const onChangeState = useCallback((state: string) => {
    const isPlaying = state === "playing";
    playingRef.current = isPlaying;
    setPlaying(isPlaying);
  }, []);

  return (
    <View style={styles.wrap}>
      <View style={styles.player}>
        <YoutubePlayer height={(width - 32) * 9 / 16} width={width - 32} videoId={videoId} onChangeState={onChangeState} />
      </View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={styles.status}>
        <View style={[styles.dot, { backgroundColor: playing ? colors.greenHi : colors.text3 }]} />
        <Text style={styles.statusText}>
          {cappedOut
            ? "Max watch points reached for this video"
            : playing
              ? `Earning +${POINTS_CONFIG.watchMinute} pts per minute`
              : "Press play to start earning"}
        </Text>
      </View>
      {earned > 0 && <Text style={styles.earned}>+{earned} points earned</Text>}
      <Button
        title="👍  Like on YouTube"
        variant="secondary"
        onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${videoId}`)}
        style={{ marginTop: 8 }}
      />
      <Button
        title="🏆  Vote MOTM"
        onPress={() => router.push({ pathname: "/motm/[videoId]", params: { videoId } })}
      />
      <Text style={styles.hint}>Likes count after you tap Sync YouTube.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 16, paddingTop: 24, gap: 12 },
  player: { borderRadius: 14, overflow: "hidden", backgroundColor: "#000" },
  title: { color: colors.text, fontSize: 17, fontWeight: "700", lineHeight: 22 },
  status: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: colors.text2, fontSize: 14 },
  earned: { color: colors.gold, fontSize: 16, fontWeight: "900" },
  hint: { color: colors.text3, fontSize: 12, textAlign: "center" },
});
