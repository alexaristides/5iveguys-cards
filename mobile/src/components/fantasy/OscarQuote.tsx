import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { quoteOfTheDay } from "@shared/oscar-quotes";
import { imageUri } from "@/lib/images";
import { colors, shadow } from "@/lib/theme";

/**
 * Oscar's quote of the day on My Team (same as the website's), like the old Fantasy 5ive home page.
 * Tap for another. `imageUrl` is Oscar's card.
 */
export function OscarQuote({ imageUrl }: { imageUrl: string | null }) {
  const [offset, setOffset] = useState(0);
  const [now] = useState(() => Date.now());
  return (
    <Pressable
      onPress={() => setOffset((o) => o + 1)}
      accessibilityRole="button"
      accessibilityHint="Shows another quote"
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.photo}>
        {imageUrl ? <Image source={{ uri: imageUri(imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>💬 OSCAR&apos;S QUOTE OF THE DAY</Text>
        <Text style={styles.quote}>“{quoteOfTheDay(now, offset)}”</Text>
        <Text style={styles.by}>— Oscar <Text style={styles.hint}>· tap for another</Text></Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "flex-start", gap: 14, backgroundColor: colors.card, borderRadius: 20, padding: 16, ...shadow },
  photo: { width: 48, aspectRatio: 785 / 1085, borderRadius: 8, overflow: "hidden", backgroundColor: colors.cardHi },
  label: { color: colors.text3, fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  quote: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600", fontStyle: "italic", marginTop: 6 },
  by: { color: colors.accent, fontSize: 14, fontWeight: "800", marginTop: 8 },
  hint: { color: colors.text3, fontWeight: "600" },
});
