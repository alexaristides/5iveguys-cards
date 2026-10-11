import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import type { FantasyPosition } from "@shared/fantasy";
import { imageUri } from "@/lib/images";
import { colors } from "@/lib/theme";
import type { FantasyPlayer } from "@/lib/types";

export interface PitchSlot {
  key: string;
  /** Empty starting slots show their position; empty subs accept anyone. */
  position: FantasyPosition | null;
  player: FantasyPlayer | null;
  /** Under the name: a price, or points. */
  caption?: string;
  captionColor?: string;
  badge?: "C" | "V" | null;
  /** Greyed out, e.g. didn't play or was subbed off. */
  dim?: boolean;
  onPress?: () => void;
}

const ROWS: FantasyPosition[] = ["FWD", "MID", "DEF", "GK"];
export const POSITION_COLOR: Record<FantasyPosition, string> = { GK: "#ca8a04", DEF: "#1d4ed8", MID: "#15803d", FWD: "#b91c1c" };

/** The starting 7 on a pitch (attack at the top) with the 2 subs underneath. */
export function FantasyPitch({ starters, bench }: { starters: PitchSlot[]; bench: PitchSlot[] }) {
  return (
    <View>
      <View style={styles.pitch}>
        <View style={styles.lineBox} />
        <View style={styles.halfway} />
        <View style={styles.circle} />
        <View style={styles.box} />
        {ROWS.map((pos) => (
          <View key={pos} style={styles.row}>
            {starters.filter((s) => (s.player?.position ?? s.position) === pos).map((s) => <Token key={s.key} slot={s} />)}
          </View>
        ))}
      </View>
      <View style={styles.bench}>
        {bench.map((s, i) => (
          <View key={s.key} style={styles.benchSlot}>
            <Text style={styles.benchLabel}>SUB {i + 1}</Text>
            <Token slot={s} />
          </View>
        ))}
      </View>
    </View>
  );
}

function Token({ slot }: { slot: PitchSlot }) {
  const { player } = slot;
  return (
    <Pressable onPress={slot.onPress} disabled={!slot.onPress} style={({ pressed }) => [styles.token, pressed && { opacity: 0.7 }]}>
      <View style={[styles.art, slot.dim && { opacity: 0.4 }, !player && styles.artEmpty]}>
        {player?.imageUrl ? (
          <Image source={{ uri: imageUri(player.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Text style={styles.plus}>+</Text>
        )}
        {slot.badge ? (
          <View style={[styles.badge, slot.badge === "C" ? styles.captain : styles.vice]}>
            <Text style={styles.badgeText}>{slot.badge}</Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.name, { backgroundColor: player ? "rgba(0,0,0,0.75)" : POSITION_COLOR[slot.position ?? "MID"] }]}>
        <Text numberOfLines={1} style={styles.nameText}>{player?.name ?? slot.position ?? "Any"}</Text>
      </View>
      {slot.caption ? (
        <View style={styles.caption}>
          <Text style={[styles.captionText, slot.captionColor ? { color: slot.captionColor } : null]}>{slot.caption}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const ART_W = 46;

const styles = StyleSheet.create({
  pitch: {
    backgroundColor: "#1e6b2e", borderRadius: 16, overflow: "hidden", paddingVertical: 14, gap: 6, minHeight: 420,
    justifyContent: "space-around",
  },
  lineBox: { ...StyleSheet.absoluteFill, margin: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.22)", borderRadius: 4 },
  halfway: { position: "absolute", left: 10, right: 10, top: 10, height: 1, backgroundColor: "rgba(255,255,255,0.22)" },
  circle: {
    position: "absolute", alignSelf: "center", top: -26, width: 72, height: 72, borderRadius: 36,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.22)",
  },
  box: {
    position: "absolute", bottom: 10, left: "27%", right: "27%", height: "14%", borderWidth: 1, borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.2)",
  },
  row: { flexDirection: "row", justifyContent: "space-evenly", alignItems: "flex-start" },
  token: { width: 74, alignItems: "center" },
  art: {
    width: ART_W, height: ART_W * (1085 / 785), borderRadius: 7, overflow: "hidden", backgroundColor: "rgba(0,0,0,0.3)",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.65)", alignItems: "center", justifyContent: "center",
  },
  artEmpty: { borderStyle: "dashed" },
  plus: { color: "#fff", fontSize: 24, fontWeight: "300" },
  badge: {
    position: "absolute", top: 2, right: 2, width: 17, height: 17, borderRadius: 9, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#000",
  },
  captain: { backgroundColor: "#fbbf24" },
  vice: { backgroundColor: "#e5e7eb" },
  badgeText: { color: "#000", fontSize: 10, fontWeight: "900" },
  name: { marginTop: -6, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1, maxWidth: 74 },
  nameText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  caption: { marginTop: 2, backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 5, paddingHorizontal: 5 },
  captionText: { color: "#111", fontSize: 11, fontWeight: "900", fontVariant: ["tabular-nums"] },
  bench: {
    flexDirection: "row", justifyContent: "center", gap: 28, marginTop: 10, paddingVertical: 10,
    backgroundColor: colors.card, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  benchSlot: { alignItems: "center", gap: 4 },
  benchLabel: { color: colors.text3, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
});
