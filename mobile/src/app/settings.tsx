import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { useAuth } from "@/lib/auth";
import { useAccount } from "@/lib/queries";
import { PRIVACY_URL, SUPPORT_URL, TERMS_URL } from "@/lib/config";
import { colors, shadow } from "@/lib/theme";

export default function Settings() {
  const { signOut, deleteAccount } = useAuth();
  const { data: account } = useAccount();

  function confirmDelete() {
    Alert.alert(
      "Delete account?",
      "This permanently deletes your account and your fantasy team, and takes you out of every league. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteAccount().catch((e) => Alert.alert("Couldn't delete account", (e as Error).message)),
        },
      ],
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.profile}>
        {account?.image ? <Image source={{ uri: account.image }} style={styles.avatar} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{account?.name ?? "Signed in"}</Text>
          {account?.email ? <Text style={styles.email}>{account.email}</Text> : null}
        </View>
      </View>

      <View style={styles.group}>
        <Row label="Show the intro again" onPress={() => { router.back(); router.push("/tour"); }} />
        <Row label="Help & Support" onPress={() => Linking.openURL(SUPPORT_URL)} />
        <Row label="Privacy Policy" onPress={() => Linking.openURL(PRIVACY_URL)} />
        <Row label="Terms of Service" onPress={() => Linking.openURL(TERMS_URL)} />
        <Row label="Sign out" last onPress={() => { router.back(); signOut(); }} />
      </View>

      <View style={styles.group}>
        <Row label="Delete account" danger last onPress={confirmDelete} />
      </View>
    </View>
  );
}

function Row({ label, onPress, danger, last }: { label: string; onPress: () => void; danger?: boolean; last?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, last && { borderBottomWidth: 0 }, pressed && { backgroundColor: colors.cardHi }]}
    >
      <Text style={[styles.rowText, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: 28, gap: 18 },
  profile: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  name: { color: colors.text, fontSize: 20, fontWeight: "900" },
  email: { color: colors.text2, fontSize: 14, marginTop: 2 },
  group: { backgroundColor: colors.card, borderRadius: 18, overflow: "hidden", ...shadow },
  row: { paddingHorizontal: 16, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowText: { color: colors.text, fontSize: 16, fontWeight: "700" },
});
