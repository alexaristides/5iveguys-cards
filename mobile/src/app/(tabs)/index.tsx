import { useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { Button, Panel, SectionTitle } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { AuthCancelled, useAuth } from "@/lib/auth";
import { useChannel } from "@/lib/channel";
import { useAccount, useMe, useRefreshOnFocus, useVideos } from "@/lib/queries";
import { colors } from "@/lib/theme";

const DAY_MS = 24 * 60 * 60 * 1000;

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(iv);
  }, [intervalMs]);
  return now;
}

export default function YouTubeTab() {
  const { slug, name } = useChannel();
  const queryClient = useQueryClient();
  const { connectYouTube } = useAuth();
  const me = useMe();
  const account = useAccount();
  const videos = useVideos();
  const [syncing, setSyncing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const now = useNow(1000);

  useRefreshOnFocus(me.refetch);

  const refreshAll = () => Promise.all([me.refetch(), account.refetch(), videos.refetch()]);

  async function connect() {
    try {
      await connectYouTube();
      await account.refetch();
      sync();
    } catch (err) {
      if (!(err instanceof AuthCancelled)) Alert.alert("Couldn't connect YouTube", (err as Error).message);
    }
  }

  async function sync() {
    setSyncing(true);
    try {
      const res = await api<{ pointsEarned: number; isSubscribed: boolean; likedCount: number }>(
        "/api/youtube/sync",
        { body: { channelSlug: slug } },
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        res.pointsEarned > 0 ? `+${res.pointsEarned} points!` : "All synced",
        res.pointsEarned > 0
          ? `Thanks for supporting ${name}.`
          : "Nothing new yet. Check back soon.",
      );
      queryClient.invalidateQueries({ queryKey: ["me", slug] });
    } catch (err) {
      if (err instanceof ApiError && (err.status === 403 || err.data.error === "No YouTube access token")) {
        Alert.alert("Connect YouTube", "Allow access to your YouTube account so we can see your likes and subscription.", [
          { text: "Not now", style: "cancel" },
          { text: "Connect", onPress: connect },
        ]);
      } else {
        Alert.alert("Sync failed", (err as Error).message);
      }
    } finally {
      setSyncing(false);
    }
  }

  async function claimDaily() {
    setClaiming(true);
    try {
      const res = await api<{ claimed: boolean; pointsEarned?: number }>(
        `/api/channels/${slug}/daily-reward`, { method: "POST" },
      );
      if (res.claimed) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await me.refetch();
    } catch (err) {
      Alert.alert("Couldn't claim", (err as Error).message);
    } finally {
      setClaiming(false);
    }
  }

  const hasYouTube = account.data?.hasYoutubeScope ?? false;
  const lastSynced = me.data?.youtubeSync?.lastSynced;
  const nextDaily = me.data?.lastDailyReward ? new Date(me.data.lastDailyReward).getTime() + DAY_MS : 0;
  const dailyReady = !!me.data && nextDaily <= now;
  const msLeft = Math.max(0, nextDaily - now);
  const countdown = `${Math.floor(msLeft / 3_600_000)}h ${String(Math.floor((msLeft % 3_600_000) / 60_000)).padStart(2, "0")}m ${String(Math.floor((msLeft % 60_000) / 1000)).padStart(2, "0")}s`;

  return (
    <View style={styles.screen}>
      <AppHeader />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={false} onRefresh={refreshAll} tintColor={colors.text2} />}
      >
        <Panel style={styles.syncPanel}>
          <Text style={styles.syncTitle}>Fan points</Text>
          <Text style={styles.syncSub}>
            You get points for being a fan of {name}.{" "}
            {hasYouTube
              ? lastSynced ? `Last synced ${timeAgo(lastSynced)}.` : "Sync to collect them."
              : "Connect YouTube to collect them."}
          </Text>
          {hasYouTube ? (
            <Button title="Sync YouTube" onPress={sync} loading={syncing} color={colors.youtube} />
          ) : (
            <Button title="Connect YouTube" onPress={connect} color={colors.youtube} />
          )}
        </Panel>

        <Panel style={styles.dailyPanel}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>🎁 Daily reward</Text>
            <Text style={styles.rowSub}>{dailyReady ? "+50 points ready to claim" : `Next in ${countdown}`}</Text>
          </View>
          <Button title="Claim" onPress={claimDaily} disabled={!dailyReady} loading={claiming} style={{ height: 40 }} />
        </Panel>

        <SectionTitle>Latest videos</SectionTitle>
        <View style={{ gap: 12 }}>
          {(videos.data ?? []).map((v) => (
            <Pressable
              key={v.videoId}
              onPress={() => router.push({ pathname: "/video/[videoId]", params: { videoId: v.videoId, title: v.title } })}
              style={({ pressed }) => [styles.video, pressed && { opacity: 0.8 }]}
            >
              <Image
                source={{ uri: v.thumbnailUrl ?? `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg` }}
                style={styles.thumb}
                contentFit="cover"
              />
              <View style={{ flex: 1, gap: 4 }}>
                <Text numberOfLines={2} style={styles.videoTitle}>{v.title}</Text>
                <Text style={styles.rowSub}>
                  {timeAgo(v.publishedAt)}{v.watchedByMe ? "  ·  ✓ watched" : ""}
                </Text>
              </View>
            </Pressable>
          ))}
          {videos.data?.length === 0 && <Text style={styles.rowSub}>No videos yet.</Text>}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  syncPanel: { gap: 12, borderColor: "rgba(255,0,51,0.35)" },
  syncTitle: { color: colors.text, fontSize: 22, fontWeight: "900" },
  syncSub: { color: colors.text2, fontSize: 14 },
  dailyPanel: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  rowSub: { color: colors.text3, fontSize: 13, marginTop: 2 },
  video: { flexDirection: "row", gap: 12, alignItems: "center" },
  thumb: { width: 132, height: 74, borderRadius: 10, backgroundColor: colors.card },
  videoTitle: { color: colors.text, fontSize: 14, fontWeight: "600", lineHeight: 19 },
});
