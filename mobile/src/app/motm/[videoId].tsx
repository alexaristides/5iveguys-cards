import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { ErrorText, Loading, Panel } from "@/components/ui";
import { api } from "@/lib/api";
import { useChannel } from "@/lib/channel";
import { imageUri } from "@/lib/images";
import { useMotm } from "@/lib/queries";
import { colors } from "@/lib/theme";
import type { MotmCandidate, MotmResults } from "@/lib/types";

const CARD_RATIO = 785 / 1085; // card art width / height

/** Man of the Match for one video: live standings, tap a player to vote or change your vote. */
export default function MotmSheet() {
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const { slug } = useChannel();
  const queryClient = useQueryClient();
  const motm = useMotm(videoId);
  const [voting, setVoting] = useState<string | null>(null);
  const [showGuests, setShowGuests] = useState(false);

  async function vote(player: MotmCandidate) {
    if (voting || player.id === motm.data?.myVote) return;
    Haptics.selectionAsync();
    setVoting(player.id);
    try {
      const res = await api<MotmResults>(`/api/channels/${slug}/videos/${videoId}/motm`, { body: { playerId: player.id } });
      queryClient.setQueryData(["motm", slug, videoId], res);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert("Couldn't save your vote", (err as Error).message);
    } finally {
      setVoting(null);
    }
  }

  if (motm.isPending) return <View style={styles.screen}><Loading /></View>;
  if (!motm.data) return <View style={styles.screen}><ErrorText>{motm.error?.message ?? "Couldn't load the vote"}</ErrorText></View>;

  const { video, totalVotes, myVote, candidates } = motm.data;
  const leader = totalVotes > 0 ? candidates[0] : null;
  const tied = !!leader && candidates[1]?.votes === leader.votes;
  const mine = candidates.find((c) => c.id === myVote);

  // The other channel's squad (for crossover videos) stays tucked away until someone votes for them.
  const hiddenGuests = candidates.filter((c) => c.isGuest && c.votes === 0);
  const rows = showGuests ? candidates : candidates.filter((c) => !hiddenGuests.includes(c));
  const guestTeams = [...new Set(hiddenGuests.map((c) => c.team))];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={motm.isRefetching} onRefresh={motm.refetch} tintColor={colors.text2} />}
    >
      <Text style={styles.kicker}>🏆  MAN OF THE MATCH</Text>
      {video.title ? <Text style={styles.title} numberOfLines={2}>{video.title}</Text> : null}

      <Panel style={styles.hero}>
        {leader ? (
          <>
            <Image source={{ uri: imageUri(leader.imageUrl) }} style={styles.heroCard} contentFit="cover" />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.heroLabel}>{tied ? "JOINT LEADER" : "LEADING THE VOTE"}</Text>
              <Text style={styles.heroName} numberOfLines={1}>{leader.name}</Text>
              <Text style={styles.heroSub}>{leader.percent}% · {plural(leader.votes, "vote")}</Text>
            </View>
          </>
        ) : (
          <Text style={styles.empty}>No votes yet. Pick the player of the match to get it started.</Text>
        )}
      </Panel>

      <View style={styles.stats}>
        <Stat value={String(totalVotes)} label={totalVotes === 1 ? "Vote" : "Votes"} />
        <Stat value={String(candidates.filter((c) => c.votes > 0).length)} label="Players voted for" />
        <Stat value={mine?.name ?? "—"} label="Your vote" highlight={!!mine} />
      </View>

      <Text style={styles.prompt}>
        {mine ? "Changed your mind? Tap another player." : "Tap a player to vote."}
      </Text>

      <View style={styles.list}>
        {rows.map((c) => (
          <Row
            key={c.id}
            player={c}
            rank={totalVotes ? (c.votes ? String(1 + candidates.filter((o) => o.votes > c.votes).length) : "–") : null}
            isLeader={!!leader && c.votes === leader.votes}
            isMine={c.id === myVote}
            saving={voting === c.id}
            onPress={() => vote(c)}
          />
        ))}
      </View>

      {hiddenGuests.length > 0 && (
        <Pressable onPress={() => setShowGuests((s) => !s)} style={styles.guestToggle} hitSlop={8}>
          <Text style={styles.guestToggleText}>
            {showGuests
              ? "Hide guest players"
              : `Show ${guestTeams.length === 1 ? guestTeams[0] : "guest"} players (${hiddenGuests.length})`}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function Row({
  player, rank, isLeader, isMine, saving, onPress,
}: { player: MotmCandidate; rank: string | null; isLeader: boolean; isMine: boolean; saving: boolean; onPress: () => void }) {
  const sub = [player.position, player.isGuest ? player.team : null].filter(Boolean).join(" · ");
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, isMine && styles.rowMine, pressed && { opacity: 0.7 }]}
    >
      {rank !== null && <Text style={styles.rank}>{rank}</Text>}
      <Image source={{ uri: imageUri(player.imageUrl) }} style={styles.thumb} contentFit="cover" />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.nameLine}>
          <Text style={styles.name} numberOfLines={1}>{player.name}</Text>
          {isMine && <Text style={styles.badge}>✓ YOUR VOTE</Text>}
        </View>
        {sub ? <Text style={styles.sub} numberOfLines={1}>{sub}</Text> : null}
        <View style={styles.bar}>
          <View
            style={[styles.fill, { width: `${player.percent}%`, backgroundColor: isLeader ? colors.gold : colors.accentHi }]}
          />
        </View>
      </View>
      <View style={styles.count}>
        {saving ? (
          <ActivityIndicator color={colors.text2} />
        ) : (
          <>
            <Text style={styles.votes}>{player.votes}</Text>
            <Text style={styles.percent}>{player.percent}%</Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

function Stat({ value, label, highlight }: { value: string; label: string; highlight?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text
        style={[styles.statValue, highlight && { color: colors.accentHi }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingTop: 28, paddingBottom: 48, gap: 12 },
  kicker: { color: colors.gold, fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  title: { color: colors.text, fontSize: 17, fontWeight: "700", lineHeight: 22 },
  hero: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 4 },
  heroCard: { width: 84, aspectRatio: CARD_RATIO, borderRadius: 8, borderWidth: 2, borderColor: colors.gold },
  heroLabel: { color: colors.gold, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  heroName: { color: colors.text, fontSize: 26, fontWeight: "900" },
  heroSub: { color: colors.text2, fontSize: 15, fontWeight: "600" },
  empty: { color: colors.text2, fontSize: 15, lineHeight: 21, flex: 1, paddingVertical: 8 },
  stats: { flexDirection: "row", gap: 8 },
  stat: {
    flex: 1, backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border, paddingVertical: 12, paddingHorizontal: 8, alignItems: "center", gap: 2,
  },
  statValue: { color: colors.text, fontSize: 18, fontWeight: "900" },
  statLabel: { color: colors.text3, fontSize: 11, fontWeight: "600", textAlign: "center" },
  prompt: { color: colors.text2, fontSize: 14, marginTop: 8 },
  list: { gap: 8 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, paddingVertical: 8, paddingHorizontal: 10,
  },
  rowMine: { borderColor: colors.accent, backgroundColor: "#1f1530" },
  rank: { color: colors.text3, fontSize: 13, fontWeight: "800", width: 18, textAlign: "center" },
  thumb: { width: 38, aspectRatio: CARD_RATIO, borderRadius: 5, backgroundColor: colors.cardHi },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { color: colors.text, fontSize: 16, fontWeight: "700", flexShrink: 1 },
  badge: { color: colors.accentHi, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  sub: { color: colors.text3, fontSize: 12 },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.cardHi, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  count: { width: 44, alignItems: "flex-end" },
  votes: { color: colors.text, fontSize: 16, fontWeight: "900" },
  percent: { color: colors.text3, fontSize: 12, fontWeight: "600" },
  guestToggle: { alignSelf: "center", paddingVertical: 10 },
  guestToggleText: { color: colors.accentHi, fontSize: 14, fontWeight: "700" },
});
