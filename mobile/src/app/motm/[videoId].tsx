import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { ErrorText, Loading } from "@/components/ui";
import { api } from "@/lib/api";
import { MOTM_CHANNEL } from "@/lib/config";
import { imageUri } from "@/lib/images";
import { timeAgo, videoThumb, watchOnYouTube } from "@/lib/motm";
import { useMotm } from "@/lib/queries";
import { colors, shadow } from "@/lib/theme";
import type { MotmCandidate, MotmResults } from "@/lib/types";

const CARD_RATIO = 785 / 1085;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Man of the Match for one video: who's leading, then search the players and tap one to vote.
 * One vote each; tapping someone else changes it.
 */
export default function MotmVoteScreen() {
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const queryClient = useQueryClient();
  const motm = useMotm(videoId);
  const [query, setQuery] = useState("");
  const [voting, setVoting] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const searchY = useRef(0);

  /** Bring the search box to the top so the matches show above the keyboard. */
  function startSearch() {
    setSearching(true);
    setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, searchY.current - 8), animated: true }), 80);
  }

  async function vote(player: MotmCandidate) {
    if (voting || player.id === motm.data?.myVote) return;
    Haptics.selectionAsync();
    setVoting(player.id);
    try {
      const res = await api<MotmResults>(`/api/channels/${MOTM_CHANNEL}/videos/${videoId}/motm`, { body: { playerId: player.id } });
      queryClient.setQueryData(["motm", videoId], res);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setQuery("");
      Keyboard.dismiss();
    } catch (err) {
      Alert.alert("Couldn't save your vote", (err as Error).message);
    } finally {
      setVoting(null);
    }
  }

  if (!motm.data) {
    return <Screen title="Man of the Match">{motm.error ? <ErrorText>{motm.error.message}</ErrorText> : <Loading />}</Screen>;
  }

  const { video, totalVotes, myVote, candidates } = motm.data;
  const leader = totalVotes > 0 ? candidates[0] : null;
  const tied = !!leader && candidates[1]?.votes === leader.votes;
  const mine = candidates.find((c) => c.id === myVote) ?? null;

  // Searching looks through every squad (crossover videos have guests); otherwise the team, plus
  // any guest who already has votes.
  const q = query.trim().toLowerCase();
  const rows = q
    ? candidates.filter((c) => c.name.toLowerCase().includes(q))
    : candidates.filter((c) => !c.isGuest || c.votes > 0);
  const rank = (c: MotmCandidate) => 1 + candidates.filter((o) => o.votes > c.votes).length;

  return (
    <Screen title="Man of the Match" scrollRef={scroll}>
      <Pressable
        onPress={() => watchOnYouTube(video.videoId)}
        accessibilityRole="button"
        accessibilityLabel="Watch on YouTube"
        style={({ pressed }) => [styles.video, pressed && { opacity: 0.9 }]}
      >
        <Image source={{ uri: videoThumb(video) }} style={styles.videoThumb} contentFit="cover" />
        <View style={styles.play}><View style={styles.playTriangle} /></View>
      </Pressable>
      <Text style={styles.videoTitle} numberOfLines={3}>{video.title ?? "Video"}</Text>
      <Text style={styles.videoSub}>
        {timeAgo(video.publishedAt)} ·{" "}
        <Text style={styles.link} onPress={() => watchOnYouTube(video.videoId)}>Watch on YouTube</Text>
      </Text>

      <View style={styles.leader}>
        {leader ? (
          <>
            <Image source={{ uri: imageUri(leader.imageUrl) }} style={styles.leaderCard} contentFit="cover" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.leaderLabel}>{tied ? "⭐ JOINT LEADER" : "⭐ LEADING THE VOTE"}</Text>
              <Text style={styles.leaderName} numberOfLines={1}>{leader.name}</Text>
              <Text style={styles.leaderSub}>{leader.percent}% · {plural(leader.votes, "vote")} of {totalVotes}</Text>
            </View>
          </>
        ) : (
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.leaderLabel}>⭐ NO VOTES YET</Text>
            <Text style={styles.leaderSub}>Be the first to pick the Man of the Match.</Text>
          </View>
        )}
      </View>

      <View style={[styles.myVote, mine && styles.myVoteDone]}>
        <Text style={[styles.myVoteText, mine && { color: colors.green }]}>
          {mine ? `✓ You voted for ${mine.name}. Tap someone else to change it.` : "Search for a player, then tap them to vote."}
        </Text>
      </View>

      <View style={styles.search} onLayout={(e) => { searchY.current = e.nativeEvent.layout.y; }}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search players"
          placeholderTextColor={colors.text3}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
          onFocus={startSearch}
          onBlur={() => setSearching(false)}
          accessibilityLabel="Search players"
        />
      </View>

      {/* While searching, leave room to scroll the box up to the top. */}
      <View style={{ gap: 8, minHeight: searching ? 560 : undefined }}>
        {rows.map((c) => {
          const isMine = c.id === myVote;
          const isLeader = !!leader && c.votes === leader.votes;
          return (
            <Pressable
              key={c.id}
              onPress={() => vote(c)}
              accessibilityRole="button"
              accessibilityLabel={isMine ? `${c.name}, your vote` : `Vote for ${c.name}`}
              style={({ pressed }) => [styles.row, isMine && styles.rowMine, pressed && { opacity: 0.75 }]}
            >
              <Text style={styles.rank}>{totalVotes && c.votes ? rank(c) : "–"}</Text>
              <Image source={{ uri: imageUri(c.imageUrl) }} style={styles.thumb} contentFit="cover" />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {[c.position, c.isGuest ? c.team : null].filter(Boolean).join(" · ") || " "}
                </Text>
                <View style={styles.bar}>
                  <View style={[styles.fill, { width: `${c.percent}%`, backgroundColor: isLeader ? colors.gold : colors.accent }]} />
                </View>
              </View>
              <View style={styles.right}>
                {voting === c.id ? (
                  <ActivityIndicator color={colors.accent} />
                ) : isMine ? (
                  <View style={styles.mineBadge}><Text style={styles.mineBadgeText} numberOfLines={1}>✓ Voted</Text></View>
                ) : (
                  <View style={styles.voteBtn}><Text style={styles.voteBtnText}>Vote</Text></View>
                )}
                <Text style={styles.count}>{c.percent}%</Text>
              </View>
            </Pressable>
          );
        })}
        {rows.length === 0 && <Text style={styles.empty}>No player called &quot;{query.trim()}&quot;.</Text>}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  video: { borderRadius: 20, overflow: "hidden", backgroundColor: colors.cardHi, ...shadow },
  videoThumb: { width: "100%", aspectRatio: 16 / 9 },
  play: {
    position: "absolute", alignSelf: "center", top: "50%", marginTop: -24, width: 68, height: 48, borderRadius: 14,
    backgroundColor: "#FF0033", alignItems: "center", justifyContent: "center",
  },
  playTriangle: {
    width: 0, height: 0, marginLeft: 4, borderTopWidth: 10, borderBottomWidth: 10, borderLeftWidth: 17,
    borderTopColor: "transparent", borderBottomColor: "transparent", borderLeftColor: colors.white,
  },
  videoTitle: { color: colors.text, fontSize: 19, fontWeight: "900", lineHeight: 24, marginTop: 12 },
  videoSub: { color: colors.text3, fontSize: 14, fontWeight: "600", marginTop: 4 },
  link: { color: colors.accent, fontWeight: "800" },
  leader: {
    flexDirection: "row", alignItems: "center", gap: 14, marginTop: 16, backgroundColor: colors.goldSoft, borderRadius: 18, padding: 14,
  },
  leaderCard: { width: 58, aspectRatio: CARD_RATIO, borderRadius: 8, borderWidth: 2, borderColor: colors.gold, backgroundColor: colors.cardHi },
  leaderLabel: { color: colors.goldText, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  leaderName: { color: colors.text, fontSize: 24, fontWeight: "900" },
  leaderSub: { color: colors.text2, fontSize: 14, fontWeight: "600" },
  myVote: { marginTop: 10, backgroundColor: colors.accentSoft, borderRadius: 14, padding: 12 },
  myVoteDone: { backgroundColor: colors.greenSoft },
  myVoteText: { color: colors.accent, fontSize: 14, fontWeight: "800", lineHeight: 19 },
  search: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, marginBottom: 10, height: 50, borderRadius: 16,
    backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, color: colors.text, fontSize: 17, fontWeight: "600", height: "100%" },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 16, padding: 10,
    borderWidth: 2, borderColor: "transparent", ...shadow,
  },
  rowMine: { borderColor: colors.green, backgroundColor: "#F3FDF6" },
  rank: { width: 18, textAlign: "center", color: colors.text3, fontSize: 14, fontWeight: "900" },
  thumb: { width: 40, aspectRatio: CARD_RATIO, borderRadius: 6, backgroundColor: colors.cardHi },
  name: { color: colors.text, fontSize: 17, fontWeight: "900" },
  sub: { color: colors.text3, fontSize: 12, fontWeight: "600" },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.cardHi, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  right: { width: 84, alignItems: "center", gap: 4 },
  voteBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 7 },
  voteBtnText: { color: colors.white, fontSize: 14, fontWeight: "900" },
  mineBadge: { backgroundColor: colors.green, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  mineBadgeText: { color: colors.white, fontSize: 13, fontWeight: "900" },
  count: { color: colors.text3, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
  empty: { color: colors.text3, fontSize: 14, textAlign: "center", marginTop: 8 },
});
