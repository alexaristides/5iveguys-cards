import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as AppleAuthentication from "expo-apple-authentication";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { STEPS } from "@/components/fantasy/HowItWorks";
import { api } from "@/lib/api";
import { AuthCancelled, useAuth } from "@/lib/auth";
import { colors, shadow } from "@/lib/theme";

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const { signInWithGoogle, signInWithApple } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);
  // Email shows once the website has it set up (RESEND_API_KEY + EMAIL_FROM), so it never shows broken.
  const emailOn = useQuery({
    queryKey: ["sign-in-options"],
    queryFn: () => api<{ email: boolean }>("/api/sign-in/options"),
    staleTime: Infinity,
  }).data?.email;

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
    <View style={[styles.wrap, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 20 }]}>
      <LinearGradient colors={[colors.accentSoft, colors.bg]} style={StyleSheet.absoluteFill} end={{ x: 0.5, y: 0.5 }} />
      <View style={styles.hero}>
        <Image source={require("../../assets/5iveguys-badge.png")} style={styles.logo} />
        <Text style={styles.title}>5iveG Fantasy</Text>
        <Text style={styles.sub}>Fantasy football for our real Division 1 season.</Text>
      </View>

      <View style={styles.steps}>
        {STEPS.map((s) => (
          <View key={s.title} style={styles.step}>
            <Text style={styles.stepEmoji}>{s.emoji}</Text>
            <Text style={styles.stepText}><Text style={styles.stepTitle}>{s.title}.</Text> {s.body}</Text>
          </View>
        ))}
      </View>

      <View style={styles.buttons}>
        {appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={16}
            style={styles.apple}
            onPress={() => !busy && run("apple")}
          />
        )}
        <Pressable
          onPress={() => run("google")}
          disabled={!!busy}
          accessibilityRole="button"
          style={({ pressed }) => [styles.google, (pressed || !!busy) && { opacity: 0.7 }]}
        >
          {busy === "google" ? <ActivityIndicator color={colors.text} /> : <Text style={styles.googleText}><Text style={styles.g}>G</Text>  Continue with Google</Text>}
        </Pressable>
        {emailOn && (
          <Pressable
            onPress={() => router.push("/sign-in-email")}
            disabled={!!busy}
            accessibilityRole="button"
            style={({ pressed }) => [styles.google, (pressed || !!busy) && { opacity: 0.7 }]}
          >
            <Text style={styles.googleText}>✉️  Continue with email</Text>
          </Pressable>
        )}
        <Text style={styles.note}>Free to play. We only use your name and email.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, justifyContent: "space-between" },
  hero: { alignItems: "center", gap: 10 },
  logo: { width: 108, height: 108, borderRadius: 26, marginBottom: 6, ...shadow, shadowOpacity: 0.3 },
  title: { color: colors.text, fontSize: 34, fontWeight: "900" },
  sub: { color: colors.text2, fontSize: 17, textAlign: "center", lineHeight: 23, fontWeight: "500" },
  steps: { backgroundColor: colors.card, borderRadius: 22, padding: 16, gap: 12, ...shadow },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepEmoji: { fontSize: 22, width: 30, textAlign: "center" },
  stepText: { flex: 1, color: colors.text2, fontSize: 15, lineHeight: 20 },
  stepTitle: { color: colors.text, fontWeight: "900" },
  buttons: { gap: 12 },
  apple: { height: 54 },
  google: {
    height: 54, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  googleText: { color: colors.text, fontSize: 18, fontWeight: "700" },
  g: { color: "#4285F4", fontWeight: "900" },
  note: { color: colors.text3, fontSize: 13, textAlign: "center", marginTop: 2 },
});
