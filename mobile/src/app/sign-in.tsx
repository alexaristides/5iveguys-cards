import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthCancelled, useAuth } from "@/lib/auth";
import { Button } from "@/components/ui";
import { colors } from "@/lib/theme";

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const { signInWithGoogle, signInWithApple } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  async function run(kind: "google" | "apple") {
    setBusy(kind);
    try {
      await (kind === "google" ? signInWithGoogle() : signInWithApple());
    } catch (err) {
      if (!(err instanceof AuthCancelled)) Alert.alert("Sign-in failed", (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.hero}>
        <Text style={styles.logo}>⚽🃏</Text>
        <Text style={styles.title}>5iveG Cards</Text>
        <Text style={styles.sub}>
          Earn points by supporting the channel on YouTube, rip packs, rate the players and take your squad into battle.
        </Text>
      </View>

      <View style={styles.buttons}>
        {appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={14}
            style={styles.apple}
            onPress={() => !busy && run("apple")}
          />
        )}
        <Button
          title="Sign in with Google"
          onPress={() => run("google")}
          loading={busy === "google"}
          disabled={!!busy}
          variant="secondary"
        />
        <Text style={styles.note}>
          Sign in with Google to earn points for subscribing, liking and watching on YouTube.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, justifyContent: "space-between" },
  hero: { alignItems: "center", gap: 12 },
  logo: { fontSize: 56 },
  title: { color: colors.text, fontSize: 34, fontWeight: "900" },
  sub: { color: colors.text2, fontSize: 16, textAlign: "center", lineHeight: 22 },
  buttons: { gap: 12 },
  apple: { height: 48 },
  note: { color: colors.text3, fontSize: 12, textAlign: "center", marginTop: 4 },
});
