import { useCallback } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { AppHeader } from "@/components/AppHeader";
import { Button, ErrorText, Loading, SectionTitle } from "@/components/ui";
import { timeAgo, videoThumb } from "@/lib/motm";
import { useVideos } from "@/lib/queries";
import { colors, shadow } from "@/lib/theme";
import type { Video } from "@/lib/types";

const openVote = (v: Video) => router.push({ pathname: "/motm/[videoId]", params: { videoId: v.videoId } });

/** Man of the Match: the 5ive Guys' videos, newest first. Pick one to vote for its best player. */
export default function MotmTab() {
  const videos = useVideos();
  const list = videos.data?.pages.flatMap((p) => p.videos) ?? [];
  const [latest, ...rest] = list;

  // Native tabs mount up front: look for new videos whenever the tab comes back.
  const { refetch } = videos;
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  let body;
  if (!videos.data) {
    body = videos.error ? <ErrorText>{videos.error.message}</ErrorText> : <Loading />;
  } else if (!latest) {
    body = <Text style={styles.muted}>No videos yet. Check back after the next match.</Text>;
  } else {
    body = (
      <>
        <Pressable
          onPress={() => openVote(latest)}
          accessibilityRole="button"
          accessibilityLabel={`Vote Man of the Match for ${latest.title ?? "the latest video"}`}
          style={({ pressed }) => [styles.featured, pressed && { opacity: 0.9 }]}
        >
          <Image source={{ uri: videoThumb(latest) }} style={styles.featuredThumb} contentFit="cover" />
          <View style={styles.latestTag}><Text style={styles.latestTagText}>LATEST</Text></View>
          <View style={styles.featuredBody}>
            <Text style={styles.featuredTitle} numberOfLines={2}>{latest.title ?? "New video"}</Text>
            <Text style={styles.sub}>{timeAgo(latest.publishedAt)}</Text>
            <View style={styles.voteCta}><Text style={styles.voteCtaText}>⭐  Vote Man of the Match</Text></View>
          </View>
        </Pressable>

        {rest.length > 0 && <SectionTitle>Earlier videos</SectionTitle>}
        <View style={{ gap: 10 }}>
          {rest.map((v) => (
            <Pressable
              key={v.videoId}
              onPress={() => openVote(v)}
              accessibilityRole="button"
              accessibilityLabel={`Vote Man of the Match for ${v.title ?? "this video"}`}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
            >
              <Image source={{ uri: videoThumb(v, "mq") }} style={styles.thumb} contentFit="cover" />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.rowTitle} numberOfLines={2}>{v.title ?? "Video"}</Text>
                <Text style={styles.sub}>{timeAgo(v.publishedAt)}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
        {videos.hasNextPage && (
          <Button
            title="Show older videos"
            variant="secondary"
            loading={videos.isFetchingNextPage}
            onPress={() => videos.fetchNextPage()}
            style={{ marginTop: 6 }}
          />
        )}
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <AppHeader title="Man of the Match" />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={videos.isRefetching && !videos.isFetchingNextPage} onRefresh={refetch} tintColor={colors.accent} />}
      >
        <Text style={styles.intro}>Who was the best player? Pick a video and vote for your Man of the Match.</Text>
        {body}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingTop: 4, paddingBottom: 120, gap: 12 },
  intro: { color: colors.text2, fontSize: 16, lineHeight: 22, fontWeight: "500" },
  muted: { color: colors.text2, fontSize: 15, textAlign: "center", marginTop: 24 },
  featured: { backgroundColor: colors.card, borderRadius: 22, overflow: "hidden", ...shadow },
  featuredThumb: { width: "100%", aspectRatio: 16 / 9, backgroundColor: colors.cardHi },
  latestTag: { position: "absolute", top: 12, left: 12, backgroundColor: colors.danger, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  latestTagText: { color: colors.white, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  featuredBody: { padding: 16, gap: 6 },
  featuredTitle: { color: colors.text, fontSize: 19, fontWeight: "900", lineHeight: 24 },
  voteCta: { marginTop: 6, height: 50, borderRadius: 14, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  voteCtaText: { color: colors.white, fontSize: 17, fontWeight: "900" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 18, padding: 10, ...shadow },
  thumb: { width: 124, aspectRatio: 16 / 9, borderRadius: 10, backgroundColor: colors.cardHi },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "800", lineHeight: 20 },
  sub: { color: colors.text3, fontSize: 13, fontWeight: "600" },
  chevron: { color: colors.text3, fontSize: 22, fontWeight: "600" },
});
