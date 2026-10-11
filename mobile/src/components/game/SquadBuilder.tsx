import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import {
  adaptSlots, calcTeamStats, FORMATIONS, getPlayerRating, slotsToLineup,
  type FootballCard, type Formation, type LineupSlot, type Position,
} from "@shared/football";
import { Chip } from "@/components/ui";
import { autofill, FORMATION_LIST } from "@/lib/game";
import { imageUri } from "@/lib/images";
import { colors, rarityColor } from "@/lib/theme";

// Where each slot sits on the selector pitch (% of width / height), as on the web.
const SLOT_COORDS: Record<Formation, Record<Position, [number, number][]>> = {
  "2-2-2": { GK: [[50, 84]], DEF: [[25, 64], [75, 64]], MID: [[25, 42], [75, 42]], ATT: [[33, 18], [67, 18]] },
  "3-2-1": { GK: [[50, 84]], DEF: [[16, 64], [50, 64], [84, 64]], MID: [[33, 42], [67, 42]], ATT: [[50, 18]] },
  "1-3-2": { GK: [[50, 84]], DEF: [[50, 64]], MID: [[16, 42], [50, 42], [84, 42]], ATT: [[33, 18], [67, 18]] },
  "2-3-1": { GK: [[50, 84]], DEF: [[28, 64], [72, 64]], MID: [[16, 42], [50, 42], [84, 42]], ATT: [[50, 18]] },
};

const POS_COLOR: Record<Position, string> = { GK: "#ca8a04", DEF: "#1d4ed8", MID: "#15803d", ATT: "#b91c1c" };
const POS_NAME: Record<Position, string> = { GK: "goalkeeper", DEF: "defender", MID: "midfielder", ATT: "attacker" };

export function SquadBuilder({
  pool, formation, slots, onChange, accent = colors.green,
}: {
  pool: FootballCard[];
  formation: Formation;
  slots: LineupSlot[];
  onChange: (formation: Formation, slots: LineupSlot[]) => void;
  accent?: string;
}) {
  const { width } = useWindowDimensions();
  const [picking, setPicking] = useState<number | null>(null);
  const pitchW = width - 32;
  const pitchH = pitchW * 1.05;

  const stats = useMemo(() => {
    const assigned = slotsToLineup(slots);
    return assigned.length > 0 ? calcTeamStats(assigned) : null;
  }, [slots]);
  const filled = slots.filter((s) => s.card).length;

  function pick(card: FootballCard | null) {
    if (picking === null) return;
    Haptics.selectionAsync();
    onChange(formation, slots.map((s, i) => (i === picking ? { ...s, card } : s)));
    setPicking(null);
  }

  const slotForPicker = picking !== null ? slots[picking] : null;
  const taken = new Set(slots.filter((s, i) => s.card && i !== picking).map((s) => s.card!.id));
  const options = slotForPicker
    ? pool
        .filter((c) => !taken.has(c.id))
        .map((c) => ({ card: c, rating: getPlayerRating(c, slotForPicker.position) }))
        .sort((a, b) => b.rating - a.rating)
    : [];

  return (
    <View>
      <View style={styles.formRow}>
        {FORMATION_LIST.map((f) => (
          <Chip
            key={f}
            label={f}
            active={f === formation}
            color={accent}
            onPress={() => onChange(f, adaptSlots(slots, f))}
          />
        ))}
        <Chip label="Auto ✨" active={false} onPress={() => { Haptics.selectionAsync(); onChange(formation, autofill(pool, formation)); }} />
      </View>
      <Text style={styles.formDesc}>{FORMATIONS[formation].desc}</Text>

      <View style={[styles.pitch, { width: pitchW, height: pitchH }]}>
        <View style={styles.lineBox} />
        <View style={styles.halfway} />
        <View style={[styles.circle, { left: pitchW / 2 - 36, top: -36 }]} />
        <View style={[styles.box, { left: pitchW * 0.27, width: pitchW * 0.46 }]} />
        {slots.map((slot, i) => {
          const [x, y] = SLOT_COORDS[formation][slot.position][slot.posIndex] ?? [50, 50];
          const rating = slot.card ? getPlayerRating(slot.card, slot.position) : null;
          return (
            <Pressable
              key={`${slot.position}-${slot.posIndex}`}
              onPress={() => setPicking(i)}
              style={[styles.slot, { left: (x / 100) * pitchW - 30, top: (y / 100) * pitchH - 34 }]}
            >
              <View style={[styles.token, { borderColor: slot.card ? rarityColor[slot.card.rarity] : "rgba(255,255,255,0.5)" }]}>
                {slot.card ? (
                  <Image source={{ uri: imageUri(slot.card.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <Text style={styles.plus}>+</Text>
                )}
              </View>
              <View style={[styles.posTag, { backgroundColor: POS_COLOR[slot.position] }]}>
                <Text style={styles.posText}>{slot.card ? `${slot.position} ${rating}` : slot.position}</Text>
              </View>
              {slot.card && <Text numberOfLines={1} style={styles.slotName}>{slot.card.name}</Text>}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.statsRow}>
        <Stat label="OVR" value={stats?.overall} big />
        <Stat label="ATT" value={stats?.attack} color="#f87171" />
        <Stat label="MID" value={stats?.midfield} color="#4ade80" />
        <Stat label="DEF" value={stats?.defense} color="#60a5fa" />
        <Stat label="GK" value={stats?.goalkeeping} color="#facc15" />
        <Text style={[styles.filled, filled === 7 && { color: colors.greenHi }]}>{filled}/7</Text>
      </View>

      <Modal visible={picking !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicking(null)}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Choose your {slotForPicker ? POS_NAME[slotForPicker.position] : "player"}</Text>
            <Pressable onPress={() => setPicking(null)} hitSlop={10}><Text style={styles.done}>Done</Text></Pressable>
          </View>
          {slotForPicker?.card && (
            <Pressable onPress={() => pick(null)} style={styles.remove}><Text style={styles.removeText}>Remove {slotForPicker.card.name}</Text></Pressable>
          )}
          <FlatList
            data={options}
            keyExtractor={(o) => o.card.id}
            numColumns={4}
            columnWrapperStyle={{ gap: 10 }}
            contentContainerStyle={{ gap: 12, paddingBottom: 40 }}
            ListEmptyComponent={<Text style={styles.empty}>No more cards. Open packs to grow your squad!</Text>}
            renderItem={({ item }) => {
              const w = (width - 32 - 30) / 4;
              return (
                <Pressable onPress={() => pick(item.card)} style={{ width: w }}>
                  <View style={[styles.pickCard, { width: w, height: w * 1.4, borderColor: rarityColor[item.card.rarity] }]}>
                    <Image source={{ uri: imageUri(item.card.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    <View style={styles.pickRating}><Text style={styles.pickRatingText}>{item.rating}</Text></View>
                  </View>
                  <Text numberOfLines={1} style={styles.pickName}>{item.card.name}</Text>
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

function Stat({ label, value, color, big }: { label: string; value?: number; color?: string; big?: boolean }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={[styles.statVal, big && { fontSize: 22 }, color ? { color } : null]}>{value !== undefined ? Math.round(value) : "–"}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  formRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  formDesc: { color: colors.text3, fontSize: 12, marginTop: 6, marginBottom: 10 },
  pitch: { backgroundColor: "#1e6b2e", borderRadius: 16, overflow: "hidden" },
  lineBox: { ...StyleSheet.absoluteFill, margin: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.22)", borderRadius: 4 },
  halfway: { position: "absolute", left: 10, right: 10, top: 10, height: 1, backgroundColor: "rgba(255,255,255,0.22)" },
  circle: { position: "absolute", width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: "rgba(255,255,255,0.22)", marginTop: 10 },
  box: { position: "absolute", bottom: 10, height: "16%", borderWidth: 1, borderBottomWidth: 0, borderColor: "rgba(255,255,255,0.2)" },
  slot: { position: "absolute", width: 60, alignItems: "center" },
  token: {
    width: 48, height: 48, borderRadius: 24, borderWidth: 3, overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center",
  },
  plus: { color: "#fff", fontSize: 24, fontWeight: "300" },
  posTag: { marginTop: -7, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  posText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  slotName: { color: "#fff", fontSize: 10, fontWeight: "700", marginTop: 1, textShadowColor: "#000", textShadowRadius: 3 },
  statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingHorizontal: 4 },
  statVal: { color: colors.text, fontSize: 17, fontWeight: "900" },
  statLbl: { color: colors.text3, fontSize: 10, fontWeight: "800" },
  filled: { color: colors.text2, fontSize: 15, fontWeight: "900" },
  sheet: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14, marginTop: 6 },
  sheetTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
  done: { color: colors.accentHi, fontSize: 16, fontWeight: "700" },
  remove: { padding: 12, borderRadius: 12, backgroundColor: colors.card, marginBottom: 14, alignItems: "center" },
  removeText: { color: colors.danger, fontWeight: "700" },
  pickCard: { borderRadius: 8, borderWidth: 2, overflow: "hidden", backgroundColor: colors.card },
  pickRating: { position: "absolute", top: 3, left: 3, backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 5, paddingHorizontal: 4 },
  pickRatingText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  pickName: { color: colors.text, fontSize: 11, fontWeight: "600", marginTop: 3, textAlign: "center" },
  empty: { color: colors.text2, textAlign: "center", marginTop: 40 },
});
