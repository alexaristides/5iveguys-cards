import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { PLAYER_STATUS, type FantasyPosition, type PlayerStatus } from "@shared/fantasy";
import { imageUri } from "@/lib/images";
import { colors } from "@/lib/theme";
import type { FantasyPlayer } from "@/lib/types";

export interface PitchSlot {
  key: string;
  /** The row this slot sits in (anyone can fill it). */
  position: FantasyPosition | null;
  player: Pick<FantasyPlayer, "id" | "name" | "position" | "imageUrl"> & { status?: PlayerStatus } | null;
  /** Under the name, e.g. points. */
  caption?: string;
  badge?: "C" | "V" | null;
  /** Greyed out, e.g. didn't play. */
  dim?: boolean;
  /** Highlighted, e.g. a new signing. */
  fresh?: boolean;
  /** What an empty slot says. */
  emptyLabel?: string;
  onPress?: () => void;
}

const ROWS: FantasyPosition[] = ["FWD", "MID", "DEF", "GK"];
const STRIPES = 8;

/** The 7 on a bright pitch, attack at the top. */
export function FantasyPitch({ slots }: { slots: PitchSlot[] }) {
  return (
    <View style={styles.pitch}>
      {Array.from({ length: STRIPES }, (_, i) => (
        <View key={i} style={[styles.stripe, { top: `${(i * 100) / STRIPES}%`, opacity: i % 2 ? 1 : 0 }]} />
      ))}
      <View style={styles.lineBox} />
      <View style={styles.circle} />
      <View style={styles.box} />
      {ROWS.map((pos) => (
        <View key={pos} style={styles.row}>
          {slots.filter((s) => (s.position ?? s.player?.position) === pos).map((s) => <Token key={s.key} slot={s} />)}
        </View>
      ))}
    </View>
  );
}

function Token({ slot }: { slot: PitchSlot }) {
  const { player } = slot;
  const flag = player?.status && player.status !== "a" ? PLAYER_STATUS[player.status].color : null;
  const role = slot.badge === "C" ? ", captain" : slot.badge === "V" ? ", vice-captain" : "";
  return (
    <Pressable
      onPress={slot.onPress}
      disabled={!slot.onPress}
      accessibilityRole={slot.onPress ? "button" : undefined}
      accessibilityLabel={player ? `${player.name}${role}${slot.caption ? `, ${slot.caption}` : ""}` : slot.emptyLabel ?? "Empty"}
      style={({ pressed }) => [styles.token, pressed && { transform: [{ scale: 0.96 }] }]}
    >
      <View style={[styles.art, slot.dim && { opacity: 0.45 }, !player && styles.artEmpty, slot.fresh && styles.artFresh]}>
        {player?.imageUrl ? (
          <Image source={{ uri: imageUri(player.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Text style={styles.plus}>{player ? player.name[0] : "+"}</Text>
        )}
        {flag ? <View style={[styles.flag, { backgroundColor: flag }]}><Text style={styles.flagText}>!</Text></View> : null}
      </View>
      {slot.badge ? (
        <View style={[styles.badge, slot.badge === "C" ? styles.captain : styles.vice]}>
          <Text style={styles.badgeText}>{slot.badge}</Text>
        </View>
      ) : null}
      <View style={[styles.name, !player && styles.nameEmpty]}>
        <Text numberOfLines={1} style={[styles.nameText, !player && { color: colors.white }]}>{player?.name ?? slot.emptyLabel ?? "Add"}</Text>
      </View>
      {slot.caption ? (
        <View style={styles.caption}>
          <Text style={styles.captionText}>{slot.caption}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const ART_W = 54;

const styles = StyleSheet.create({
  pitch: {
    backgroundColor: colors.pitch, borderRadius: 22, overflow: "hidden", paddingVertical: 18, gap: 8, minHeight: 450,
    justifyContent: "space-around",
  },
  stripe: { position: "absolute", left: 0, right: 0, height: `${100 / STRIPES}%`, backgroundColor: colors.pitchStripe },
  lineBox: { ...StyleSheet.absoluteFill, margin: 10, borderWidth: 2, borderColor: "rgba(255,255,255,0.45)", borderRadius: 6 },
  circle: {
    position: "absolute", alignSelf: "center", top: -30, width: 80, height: 80, borderRadius: 40,
    borderWidth: 2, borderColor: "rgba(255,255,255,0.45)",
  },
  box: {
    position: "absolute", bottom: 10, left: "27%", right: "27%", height: "14%", borderWidth: 2, borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.45)",
  },
  row: { flexDirection: "row", justifyContent: "space-evenly", alignItems: "flex-start" },
  token: { width: 84, alignItems: "center" },
  art: {
    width: ART_W, height: ART_W * (1085 / 785), borderRadius: 9, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 2, borderColor: colors.white, alignItems: "center", justifyContent: "center",
  },
  artEmpty: { borderStyle: "dashed", backgroundColor: "rgba(255,255,255,0.12)" },
  artFresh: { borderColor: colors.gold, borderWidth: 3 },
  plus: { color: colors.white, fontSize: 30, fontWeight: "300" },
  badge: {
    position: "absolute", top: -6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: colors.white,
  },
  captain: { backgroundColor: colors.gold },
  vice: { backgroundColor: "#E5E7EB" },
  badgeText: { color: "#111", fontSize: 12, fontWeight: "900" },
  flag: {
    position: "absolute", top: 3, left: 3, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: colors.white,
  },
  flagText: { color: colors.white, fontSize: 11, fontWeight: "900" },
  name: {
    marginTop: -8, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2, maxWidth: 84, backgroundColor: colors.white,
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
  nameEmpty: { backgroundColor: "rgba(0,0,0,0.28)" },
  nameText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  caption: { marginTop: 3, backgroundColor: colors.accent, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 1 },
  captionText: { color: colors.white, fontSize: 12, fontWeight: "900", fontVariant: ["tabular-nums"] },
});
