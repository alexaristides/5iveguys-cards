import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { GameScreen } from "@/components/game/GameScreen";
import { Button, Panel, SectionTitle } from "@/components/ui";
import { api } from "@/lib/api";
import { usePvpRecord } from "@/lib/queries";
import { colors } from "@/lib/theme";

interface OpenLobby {
  id: string;
  createdAt: string;
  creator: { id: string; name: string | null; image: string | null };
}

export default function Pvp() {
  const record = usePvpRecord();
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState("");
  const lobbies = useQuery({
    queryKey: ["lobbies"],
    queryFn: () => api<{ lobbies: OpenLobby[] }>("/api/lobbies").then((r) => r.lobbies),
    refetchInterval: 5000,
  });

  async function create() {
    setCreating(true);
    try {
      const { lobbyId } = await api<{ lobbyId: string }>("/api/lobbies", { method: "POST" });
      router.replace({ pathname: "/play/lobby/[id]", params: { id: lobbyId } });
    } catch (err) {
      Alert.alert("Couldn't create a match", (err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const open = (id: string) => router.push({ pathname: "/play/lobby/[id]", params: { id } });
  const r = record.data;

  return (
    <GameScreen title="PvP · 1v1">
      <Panel style={{ gap: 12 }}>
        <Text style={styles.title}>Challenge a friend</Text>
        <Text style={styles.sub}>
          Create a match and send the code. You both lock in a squad, then watch the same match live, with a formation change at half time.
        </Text>
        <Button title="Create match" onPress={create} loading={creating} color={colors.user} />
        {r && <Text style={styles.record}>Your record: {r.wins}W · {r.draws}D · {r.losses}L</Text>}
      </Panel>

      <SectionTitle>Have a code?</SectionTitle>
      <View style={styles.codeRow}>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="Match code"
          placeholderTextColor={colors.text3}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          returnKeyType="go"
          onSubmitEditing={() => code.trim() && open(code.trim())}
        />
        <Button title="Join" onPress={() => open(code.trim())} disabled={!code.trim()} style={{ height: 46 }} />
      </View>

      <SectionTitle>Open matches</SectionTitle>
      {(lobbies.data ?? []).length === 0 ? (
        <Text style={styles.sub}>No open matches right now. Create one!</Text>
      ) : (
        <View style={{ gap: 10 }}>
          {lobbies.data!.map((l) => (
            <Pressable key={l.id} onPress={() => open(l.id)} style={({ pressed }) => [styles.lobby, pressed && { opacity: 0.8 }]}>
              {l.creator.image ? <Image source={{ uri: l.creator.image }} style={styles.avatar} /> : <View style={styles.avatar} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.lobbyName}>{l.creator.name ?? "A player"}</Text>
                <Text style={styles.sub}>is looking for a match</Text>
              </View>
              <Text style={styles.joinText}>Join ›</Text>
            </Pressable>
          ))}
        </View>
      )}
    </GameScreen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 20, fontWeight: "900" },
  sub: { color: colors.text2, fontSize: 14, lineHeight: 20 },
  record: { color: colors.text3, fontSize: 13, fontWeight: "700", textAlign: "center" },
  codeRow: { flexDirection: "row", gap: 10 },
  input: {
    flex: 1, height: 46, borderRadius: 14, backgroundColor: colors.card, color: colors.text,
    paddingHorizontal: 14, fontSize: 16, borderWidth: 1, borderColor: colors.border,
  },
  lobby: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cardHi },
  lobbyName: { color: colors.text, fontSize: 16, fontWeight: "800" },
  joinText: { color: colors.accentHi, fontWeight: "800", fontSize: 15 },
});
