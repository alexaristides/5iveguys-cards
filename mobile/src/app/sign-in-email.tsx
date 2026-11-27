import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";

type Step = "email" | "code" | "name";

/**
 * Sign in with a 6-digit code sent by email (lib/email-sign-in.ts on the website): the address, the
 * code, then a name if it's a new profile. Signing in closes the sheet (the stack swaps to the tabs).
 */
export default function SignInEmailScreen() {
  const { signInWithToken } = useAuth();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const go = (next: Step) => {
    setError(null);
    setNotice(null);
    setStep(next);
  };

  async function sendCode() {
    if (busy || !email.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api("/api/sign-in/email", { body: { email: email.trim() } });
      setCode("");
      if (step === "code") setNotice("We sent a new code.");
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { token } = await api<{ token: string }>("/api/mobile/auth/email", {
        body: { email: email.trim(), code, ...(step === "name" ? { name } : {}) },
      });
      await signInWithToken(token);
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.data.needsName && step === "code") return go("name");
      setError((err as Error).message);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{step === "name" ? "Welcome!" : "Sign in with email"}</Text>

      {step === "email" && (
        <>
          <Text style={styles.p}>We&apos;ll email you a 6-digit code to sign in.</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.text3}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            accessibilityLabel="Email address"
            autoFocus
            onSubmitEditing={sendCode}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Button title="Send code" onPress={sendCode} loading={busy} disabled={!email.trim()} />
        </>
      )}

      {step === "code" && (
        <>
          <Text style={styles.p}>
            Enter the code we sent to <Text style={styles.strong}>{email.trim()}</Text>.
          </Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            placeholderTextColor={colors.text3}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            accessibilityLabel="6-digit code"
            autoFocus
            onSubmitEditing={() => code.length === 6 && verify()}
          />
          {error ? <Text style={styles.error}>{error}</Text> : notice && <Text style={styles.notice}>{notice}</Text>}
          <Button title="Sign in" onPress={verify} loading={busy} disabled={code.length !== 6} />
          <View style={styles.links}>
            <TextButton title="Send a new code" onPress={sendCode} disabled={busy} accent />
            <TextButton title="Change email" onPress={() => go("email")} />
          </View>
        </>
      )}

      {step === "name" && (
        <>
          <Text style={styles.p}>You&apos;re new here. What should we call you? Your name shows in leagues.</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.text3}
            textContentType="name"
            autoComplete="name"
            autoCapitalize="words"
            maxLength={40}
            returnKeyType="go"
            accessibilityLabel="Your name"
            autoFocus
            onSubmitEditing={() => name.trim() && verify()}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Button title="Start playing" onPress={verify} loading={busy} disabled={!name.trim()} />
          <TextButton title="Use a different email" onPress={() => go("email")} />
        </>
      )}
    </ScrollView>
  );
}

function TextButton({ title, onPress, disabled, accent }: { title: string; onPress: () => void; disabled?: boolean; accent?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={({ pressed }) => [styles.textButton, (pressed || disabled) && { opacity: 0.5 }]}>
      <Text style={[styles.textButtonText, accent && { color: colors.accent }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 28, paddingBottom: 48, gap: 12 },
  title: { color: colors.text, fontSize: 26, fontWeight: "900" },
  p: { color: colors.text2, fontSize: 15, lineHeight: 21 },
  strong: { color: colors.text, fontWeight: "800" },
  input: {
    height: 56, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: 14, color: colors.text, fontSize: 17, fontWeight: "700",
  },
  codeInput: { fontSize: 28, letterSpacing: 8, textAlign: "center", fontWeight: "900" },
  error: { color: colors.danger, fontSize: 15, fontWeight: "600", textAlign: "center" },
  notice: { color: colors.green, fontSize: 15, fontWeight: "600", textAlign: "center" },
  links: { flexDirection: "row" },
  textButton: { flex: 1, height: 40, alignItems: "center", justifyContent: "center" },
  textButtonText: { color: colors.text2, fontSize: 15, fontWeight: "700" },
});
