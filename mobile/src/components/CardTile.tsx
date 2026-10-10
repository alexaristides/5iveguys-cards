import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import type { Rarity } from "@shared/cards";
import { imageUri } from "@/lib/images";
import { colors, rarityColor } from "@/lib/theme";

/** Card art with a rarity border. Cards are 5:7 portrait artwork. */
export function CardTile({
  imageUrl, rarity, name, width, owned = true, count, overall, onPress,
}: {
  imageUrl: string;
  rarity: Rarity;
  name?: string;
  width: number;
  owned?: boolean;
  count?: number;
  overall?: number;
  onPress?: () => void;
}) {
  const height = width * 1.4;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [{ width, opacity: pressed ? 0.85 : 1 }]}>
      <View
        style={[
          styles.frame,
          { width, height, borderColor: owned ? rarityColor[rarity] : colors.border },
          owned && (rarity === "epic" || rarity === "legendary") && {
            shadowColor: rarityColor[rarity], shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
          },
        ]}
      >
        <Image
          source={{ uri: imageUri(imageUrl) }}
          style={[StyleSheet.absoluteFill, !owned && { opacity: 0.18 }]}
          contentFit="cover"
          transition={150}
          cachePolicy="disk"
        />
        {!owned && <Text style={styles.lock}>🔒</Text>}
        {owned && count !== undefined && count > 1 && (
          <View style={styles.badge}><Text style={styles.badgeText}>×{count}</Text></View>
        )}
        {overall !== undefined && overall > 0 && (
          <View style={[styles.ovr, { borderColor: rarityColor[rarity] }]}>
            <Text style={styles.ovrText}>{overall}</Text>
          </View>
        )}
      </View>
      {name !== undefined && (
        <Text numberOfLines={1} style={[styles.name, !owned && { color: colors.text3 }]}>{name}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 10, borderWidth: 2, overflow: "hidden", backgroundColor: colors.card,
    alignItems: "center", justifyContent: "center",
  },
  lock: { fontSize: 22 },
  badge: {
    position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  ovr: {
    position: "absolute", top: 4, left: 4, minWidth: 24, height: 20, borderRadius: 6, borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", paddingHorizontal: 3,
  },
  ovrText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  name: { color: colors.text, fontSize: 12, fontWeight: "600", marginTop: 4, textAlign: "center" },
});
