import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "@/lib/queries";
import { colors } from "@/lib/theme";

/** Top of each tab: the 5iveG badge, the tab's title and your account (Settings). */
export function AppHeader({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  const { data: account } = useAccount();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      <View style={styles.left}>
        <Image source={require("../../assets/5iveguys-badge.png")} style={styles.logo} accessibilityIgnoresInvertColors />
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
      </View>
      <Pressable onPress={() => router.push("/settings")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Account and settings">
        {account?.image ? (
          <Image source={{ uri: account.image }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{(account?.name ?? "?")[0]?.toUpperCase()}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 10, backgroundColor: colors.bg,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 34, height: 34, borderRadius: 9 },
  title: { color: colors.text, fontSize: 26, fontWeight: "900" },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  avatarFallback: { backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.accent, fontWeight: "800", fontSize: 15 },
});
