import { useState } from "react";
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { inviteMessage } from "@/lib/fantasy";
import { useFantasy } from "@/lib/queries";
import { colors } from "@/lib/theme";

type League = { id: string; name: string; code: string };

/** Join a private league with a code, or start one and share its code. */
export default function FantasyJoinScreen() {
  const params = useLocalSearchParams<{ code?: string; mode?: string }>();
  const queryClient = useQueryClient();
  const hasTeam = !!useFantasy().data?.team;
  const [mode, setMode] = useState<"join" | "create">(params.mode === "create" ? "create" : "join");
  const [code, setCode] = useState((params.code ?? "").toUpperCase());
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<League | null>(null);

  async function run(path: string, body: Record<string, string>) {
    setBusy(true);
    try {
      const { league } = await api<{ league: League }>(path, { body });
      queryClient.invalidateQueries({ queryKey: ["fantasy-leagues"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return league;
    } catch (err) {
      Alert.alert(mode === "join" ? "Couldn't join" : "Couldn't start the league", (err as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    const league = await run("/api/fantasy/leagues/join", { code: code.trim() });
    if (league) router.replace({ pathname: "/fantasy/league/[id]", params: { id: league.id } });
  }

  async function create() {
    const league = await run("/api/fantasy/leagues", { name: name.trim() });
    if (league) setCreated(league);
  }

  if (created) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.title}>League started 🎉</Text>
        <Text style={styles.p}>Send your mates the code. They tap Leagues → Join with code in the 5iveG app, or open the link.</Text>
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>{created.name}</Text>
          <Text style={styles.code}>{created.code}</Text>
        </View>
        <Button title="Invite friends" onPress={() => Share.share({ message: inviteMessage(created) })} />
        <Button title="See the table" variant="secondary" style={{ marginTop: 10 }}
          onPress={() => router.replace({ pathname: "/fantasy/league/[id]", params: { id: created.id } })} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Leagues</Text>
      <View style={styles.segments}>
        {(["join", "create"] as const).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[styles.segment, mode === m && styles.segmentActive]} accessibilityRole="tab" accessibilityState={{ selected: mode === m }}>
            <Text style={[styles.segmentText, mode === m && { color: colors.white }]}>{m === "join" ? "Join a league" : "Start a league"}</Text>
          </Pressable>
        ))}
      </View>

      {!hasTeam ? (
        <>
          <Text style={styles.p}>Pick your team first, then you can start or join leagues.</Text>
          <Button title="Pick your team" onPress={() => router.replace("/fantasy/edit")} />
        </>
      ) : mode === "join" ? (
        <>
          <Text style={styles.p}>Enter the 6-character code your friend shared.</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            placeholder="ABC123"
            placeholderTextColor={colors.text3}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            accessibilityLabel="League code"
            autoFocus
            onSubmitEditing={() => code.length === 6 && join()}
          />
          <Button title="Join league" onPress={join} loading={busy} disabled={code.length !== 6} />
        </>
      ) : (
        <>
          <Text style={styles.p}>Everyone in a league is ranked on their season points. You&apos;ll get a code to share.</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="League name"
            placeholderTextColor={colors.text3}
            maxLength={30}
            autoCapitalize="words"
            accessibilityLabel="League name"
            autoFocus
            onSubmitEditing={() => name.trim().length >= 2 && create()}
          />
          <Button title="Start league" onPress={create} loading={busy} disabled={name.trim().length < 2} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 28, paddingBottom: 48, gap: 12 },
  title: { color: colors.text, fontSize: 26, fontWeight: "900" },
  p: { color: colors.text2, fontSize: 15, lineHeight: 21 },
  segments: { flexDirection: "row", backgroundColor: colors.cardHi, borderRadius: 14, padding: 4 },
  segment: { flex: 1, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  segmentActive: { backgroundColor: colors.accent },
  segmentText: { color: colors.text2, fontSize: 15, fontWeight: "800" },
  input: {
    height: 56, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: 14, color: colors.text, fontSize: 17, fontWeight: "700",
  },
  codeInput: { fontSize: 24, letterSpacing: 6, textAlign: "center", fontWeight: "900" },
  codeBox: { backgroundColor: colors.accentSoft, borderRadius: 18, padding: 20, alignItems: "center", gap: 4 },
  codeLabel: { color: colors.text2, fontSize: 14, fontWeight: "700" },
  code: { color: colors.accent, fontSize: 38, fontWeight: "900", letterSpacing: 6 },
});
