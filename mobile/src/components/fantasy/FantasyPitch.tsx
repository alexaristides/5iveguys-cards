import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { PLAYER_STATUS, type FantasyPosition, type PlayerStatus } from "@shared/fantasy";
import { imageUri } from "@/lib/images";
import type { FantasyPlayer } from "@/lib/types";

export interface PitchSlot {
  key: string;
  /** Empty slots show their position. */
  position: FantasyPosition | null;
  player: Pick<FantasyPlayer, "id" | "name" | "position" | "imageUrl"> & { status?: PlayerStatus } | null;
  /** Under the name: a price, or points. */
  caption?: string;
  captionColor?: string;
  badge?: "C" | "V" | null;
  /** Greyed out, e.g. didn't play. */
  dim?: boolean;
  /** Highlighted, e.g. a new signing. */
  fresh?: boolean;
  onPress?: () => void;
}

const ROWS: FantasyPosition[] = ["FWD", "MID", "DEF", "GK"];
export const POSITION_COLOR: Record<FantasyPosition, string> = { GK: "#ca8a04", DEF: "#1d4ed8", MID: "#15803d", FWD: "#b91c1c" };

/** The 7 on a pitch, attack at the top. */
export function FantasyPitch({ slots }: { slots: PitchSlot[] }) {
  return (
    <View style={styles.pitch}>
      <View style={styles.lineBox} />
      <View style={styles.circle} />
      <View style={styles.box} />
      {ROWS.map((pos) => (
        <View key={pos} style={styles.row}>
          {slots.filter((s) => (s.player?.position ?? s.position) === pos).map((s) => <Token key={s.key} slot={s} />)}
        </View>
      ))}
    </View>
  );
}

function Token({ slot }: { slot: PitchSlot }) {
  const { player } = slot;
  const flag = player?.status && player.status !== "a" ? PLAYER_STATUS[player.status].color : null;
  return (
    <Pressable
      onPress={slot.onPress}
      disabled={!slot.onPress}
      accessibilityRole={slot.onPress ? "button" : undefined}
      accessibilityLabel={player ? `${player.name}${slot.badge === "C" ? ", captain" : slot.badge === "V" ? ", vice-captain" : ""}${slot.caption ? `, ${slot.caption}` : ""}` : `Empty ${slot.position ?? ""} slot`}
      style={({ pressed }) => [styles.token, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.art, slot.dim && { opacity: 0.4 }, !player && styles.artEmpty, slot.fresh && styles.artFresh]}>
        {player?.imageUrl ? (
          <Image source={{ uri: imageUri(player.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Text style={styles.plus}>{player ? player.name[0] : "+"}</Text>
        )}
        {slot.badge ? (
          <View style={[styles.badge, slot.badge === "C" ? styles.captain : styles.vice]}>
            <Text style={styles.badgeText}>{slot.badge}</Text>
          </View>
        ) : null}
        {flag ? <View style={[styles.flag, { backgroundColor: flag }]}><Text style={styles.flagText}>!</Text></View> : null}
      </View>
      <View style={[styles.name, { backgroundColor: player ? "rgba(0,0,0,0.78)" : POSITION_COLOR[slot.position ?? "MID"] }]}>
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

const ART_W = 52;

const styles = StyleSheet.create({
  pitch: {
    backgroundColor: "#1e6b2e", borderRadius: 16, overflow: "hidden", paddingVertical: 16, gap: 8, minHeight: 440,
    justifyContent: "space-around",
  },
  lineBox: { ...StyleSheet.absoluteFill, margin: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.22)", borderRadius: 4 },
  circle: {
    position: "absolute", alignSelf: "center", top: -26, width: 72, height: 72, borderRadius: 36,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.22)",
  },
  box: {
    position: "absolute", bottom: 10, left: "27%", right: "27%", height: "14%", borderWidth: 1, borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.2)",
  },
  row: { flexDirection: "row", justifyContent: "space-evenly", alignItems: "flex-start" },
  token: { width: 82, alignItems: "center" },
  art: {
    width: ART_W, height: ART_W * (1085 / 785), borderRadius: 7, overflow: "hidden", backgroundColor: "rgba(0,0,0,0.3)",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.65)", alignItems: "center", justifyContent: "center",
  },
  artEmpty: { borderStyle: "dashed" },
  artFresh: { borderColor: "#fbbf24", borderWidth: 2 },
  plus: { color: "#fff", fontSize: 24, fontWeight: "300" },
  badge: {
    position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#000",
  },
  captain: { backgroundColor: "#fbbf24" },
  vice: { backgroundColor: "#e5e7eb" },
  badgeText: { color: "#000", fontSize: 10, fontWeight: "900" },
  flag: {
    position: "absolute", top: 2, left: 2, width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#000",
  },
  flagText: { color: "#000", fontSize: 10, fontWeight: "900" },
  name: { marginTop: -6, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1, maxWidth: 82 },
  nameText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  caption: { marginTop: 2, backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 5, paddingHorizontal: 5 },
  captionText: { color: "#111", fontSize: 11, fontWeight: "900", fontVariant: ["tabular-nums"] },
});
