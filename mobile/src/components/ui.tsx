import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, shadow } from "@/lib/theme";

export function Button({
  title, onPress, variant = "primary", disabled, loading, style, color,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  color?: string;
}) {
  const bg = variant === "secondary" ? colors.accentSoft : variant === "danger" ? "transparent" : color ?? colors.accent;
  const fg = variant === "secondary" ? colors.accent : variant === "danger" ? colors.danger : colors.white;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading) }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
        variant === "danger" && { borderWidth: 1, borderColor: colors.danger },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <Text style={styles.error}>{children}</Text>;
}

export function Chip({ label, active, onPress, color }: { label: string; active: boolean; onPress: () => void; color?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && { backgroundColor: color ?? colors.accent, borderColor: color ?? colors.accent }]}
    >
      <Text style={[styles.chipText, active && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 18,
  },
  buttonText: { fontSize: 17, fontWeight: "800" },
  panel: {
    backgroundColor: colors.card, borderRadius: 20, padding: 16, ...shadow,
  },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 2 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 },
  error: { color: colors.danger, fontSize: 14, textAlign: "center", marginTop: 8 },
  chip: {
    paddingHorizontal: 12, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.card, alignItems: "center", justifyContent: "center",
  },
  chipText: { color: colors.text2, fontSize: 14, fontWeight: "700" },
});
