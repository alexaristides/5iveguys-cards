import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { imageUri } from "@/lib/images";
import { colors } from "@/lib/theme";

/** A sealed player pack: the player's card in a foil wrapper with their name across it. */
export function PackArt({ playerName, imageUrl, width = 200, cardCount = 5 }: {
  playerName: string | null;
  imageUrl?: string | null;
  width?: number;
  cardCount?: number;
}) {
  const height = width * 1.45;
  const small = width < 120;
  return (
    <LinearGradient
      colors={["#a855f7", "#4c1d95", "#1e1b4b"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.pack, { width, height, borderRadius: width * 0.1 }]}
    >
      {/* the crimped foil edges */}
      <View style={[styles.crimp, { top: 0, height: height * 0.05 }]} />
      <View style={[styles.crimp, { bottom: 0, height: height * 0.05 }]} />
      <LinearGradient
        colors={["rgba(255,255,255,0.28)", "rgba(255,255,255,0)", "rgba(255,255,255,0.12)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.6 }}
        style={StyleSheet.absoluteFill}
      />

      <Text style={[styles.brand, { fontSize: Math.max(7, width * 0.06) }]} numberOfLines={1} adjustsFontSizeToFit>
        {small ? "PLAYER PACK" : "5IVEG · PLAYER PACK"}
      </Text>
      <View style={[styles.window, { width: width * 0.56, height: width * 0.56 * 1.4, borderRadius: width * 0.05 }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUri(imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" />
        ) : (
          <Text style={{ fontSize: width * 0.22 }}>⚽</Text>
        )}
      </View>
      <Text style={[styles.name, { fontSize: Math.max(11, width * 0.12) }]} numberOfLines={1} adjustsFontSizeToFit>
        {(playerName ?? "Mystery").toUpperCase()}
      </Text>
      {!small && (
        <Text style={[styles.sub, { fontSize: width * 0.055 }]} numberOfLines={1} adjustsFontSizeToFit>
          {cardCount} CARDS · 1 GUARANTEED
        </Text>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  pack: {
    alignItems: "center", justifyContent: "center", gap: 6, overflow: "hidden",
    borderWidth: 1.5, borderColor: "rgba(216,180,254,0.7)",
  },
  crimp: { position: "absolute", left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.25)" },
  brand: { color: "#e9d5ff", fontWeight: "900", letterSpacing: 1.5, maxWidth: "90%" },
  window: {
    overflow: "hidden", backgroundColor: colors.card, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: colors.gold,
  },
  name: { color: "#fff", fontWeight: "900", letterSpacing: 1, maxWidth: "88%" },
  sub: { color: "#d8b4fe", fontWeight: "800", letterSpacing: 0.5, maxWidth: "90%", textAlign: "center" },
});
