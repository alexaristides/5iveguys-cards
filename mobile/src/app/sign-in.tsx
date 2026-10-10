import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import * as AppleAuthentication from "expo-apple-authentication";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { AuthCancelled, useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { CHANNELS } from "@/lib/config";
import { imageUri } from "@/lib/images";
import { Button } from "@/components/ui";
import { colors, RARITY_ORDER, rarityColor } from "@/lib/theme";
import type { DbCard } from "@/lib/types";

/** Three of the rarest cards, fanned out, as the welcome art (public endpoint). */
function useHeroCards() {
  return useQuery({
    queryKey: ["hero-cards"],
    queryFn: async () => {
      const { cards } = await api<{ cards: DbCard[] }>(`/api/channels/${CHANNELS[0].slug}/cards`);
      return cards
        .filter((c) => c.position !== "Moment")
        .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity))
        .slice(0, 3);
    },
    staleTime: Infinity,
  });
}

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const { signInWithGoogle, signInWithApple } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);
  const { data: hero } = useHeroCards();

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
        {hero && hero.length === 3 ? (
          <View style={styles.fan}>
            {[hero[1], hero[0], hero[2]].map((c, i) => (
              <Image
                key={c.id}
                source={{ uri: imageUri(c.imageUrl) }}
                contentFit="cover"
                style={[
                  styles.fanCard,
                  { borderColor: rarityColor[c.rarity], zIndex: i === 1 ? 2 : 1 },
                  { transform: [{ translateX: (i - 1) * 78 }, { translateY: i === 1 ? -8 : 10 }, { rotate: `${(i - 1) * 12}deg` }] },
                ]}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.logo}>⚽</Text>
        )}
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
  fan: { height: 230, width: "100%", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  fanCard: {
    position: "absolute", width: 128, height: 179, borderRadius: 12, borderWidth: 2,
    backgroundColor: colors.card, shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  title: { color: colors.text, fontSize: 34, fontWeight: "900" },
  sub: { color: colors.text2, fontSize: 16, textAlign: "center", lineHeight: 22 },
  buttons: { gap: 12 },
  apple: { height: 48 },
  note: { color: colors.text3, fontSize: 12, textAlign: "center", marginTop: 4 },
});
