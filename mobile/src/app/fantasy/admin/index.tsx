import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { gameweekStatus, formatDeadline } from "@shared/fantasy";
import { GameScreen } from "@/components/game/GameScreen";
import { Button, ErrorText, Loading, Panel } from "@/components/ui";
import { adminApi, useAdminSecret, useFantasyAdmin, type AdminData } from "@/lib/fantasy-admin";
import { colors } from "@/lib/theme";

const STATUS_COLOR = { upcoming: colors.user, live: colors.gold, finished: colors.greenHi };

/** Fantasy admin on the phone: pick a gameweek to enter its score and stats. Unlocked with the admin secret. */
export default function FantasyAdminScreen() {
  const { secret, save } = useAdminSecret();
  const queryClient = useQueryClient();
  const admin = useFantasyAdmin(secret);

  if (secret === undefined) return <GameScreen title="Fantasy admin"><Loading /></GameScreen>;
  if (!secret || admin.error) {
    return (
      <GameScreen title="Fantasy admin">
        <Unlock
          failed={!!admin.error}
          onUnlock={async (s) => {
            try {
              await adminApi<AdminData>(s);
            } catch {
              Alert.alert("Wrong admin secret", "Use the same secret as the website's admin page.");
              return;
            }
            await save(s);
            queryClient.removeQueries({ queryKey: ["fantasy-admin"] });
          }}
        />
      </GameScreen>
    );
  }

  const data = admin.data;
  return (
    <GameScreen
      title="Fantasy admin"
      right={<Pressable onPress={() => Alert.alert("Lock admin?", "You'll need the admin secret again on this phone.", [
        { text: "Cancel", style: "cancel" },
        { text: "Lock", style: "destructive", onPress: () => { save(null); queryClient.removeQueries({ queryKey: ["fantasy-admin"] }); } },
      ])} hitSlop={10}><Text style={styles.lock}>Lock</Text></Pressable>}
    >
      {!data ? <Loading /> : !data.season ? (
        <Text style={styles.muted}>No season yet. Create one on the website&apos;s admin page (/admin/fantasy).</Text>
      ) : (
        <>
          <Text style={styles.season}>{data.season.name}</Text>
          <Text style={styles.muted}>
            After each match, open its gameweek, enter the score and who did what, then finalise to score every team.
            Seasons, gameweeks and prices are managed on the website&apos;s admin page.
          </Text>
          <View style={{ gap: 8, marginTop: 14 }}>
            {[...data.gameweeks].reverse().map((g) => {
              const status = gameweekStatus(g);
              return (
                <Pressable
                  key={g.id}
                  onPress={() => router.push({ pathname: "/fantasy/admin/[id]", params: { id: g.id } })}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.rowTitle}>GW{g.number}{g.name ? ` · ${g.name}` : ""}</Text>
                    <Text style={styles.rowSub}>
                      {g.goalsFor !== null && g.goalsAgainst !== null ? `${g.goalsFor}–${g.goalsAgainst} · ` : ""}
                      {status === "upcoming" ? `Deadline ${formatDeadline(g.deadline)}` : `${g.entries} teams · ${g.stats.filter((s) => s.played).length} played`}
                    </Text>
                  </View>
                  <Text style={[styles.status, { color: STATUS_COLOR[status] }]}>{status === "finished" ? "Scored" : status === "live" ? "Needs stats" : "Upcoming"}</Text>
                </Pressable>
              );
            })}
            {data.gameweeks.length === 0 && <Text style={styles.muted}>No gameweeks yet — add them on the website.</Text>}
          </View>
        </>
      )}
    </GameScreen>
  );
}

function Unlock({ failed, onUnlock }: { failed: boolean; onUnlock: (secret: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Panel style={{ gap: 12 }}>
      <Text style={styles.season}>Admins only</Text>
      <Text style={styles.muted}>Enter the admin secret (the same one the website&apos;s admin page uses). It&apos;s kept on this phone.</Text>
      {failed && <ErrorText>That secret didn&apos;t work any more — enter it again.</ErrorText>}
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={setValue}
        placeholder="Admin secret"
        placeholderTextColor={colors.text3}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Admin secret"
      />
      <Button title="Unlock" loading={busy} disabled={!value} onPress={async () => { setBusy(true); await onUnlock(value.trim()); setBusy(false); }} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  season: { color: colors.text, fontSize: 22, fontWeight: "900", marginBottom: 6 },
  muted: { color: colors.text2, fontSize: 14, lineHeight: 20 },
  lock: { color: colors.accentHi, fontSize: 16, fontWeight: "600" },
  input: {
    height: 48, borderRadius: 14, backgroundColor: colors.cardHi, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, color: colors.text, fontSize: 17,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 14,
  },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  rowSub: { color: colors.text3, fontSize: 13 },
  status: { fontSize: 13, fontWeight: "800" },
});
