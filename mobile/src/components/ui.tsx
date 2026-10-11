import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "@/lib/theme";

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
  const bg =
    variant === "secondary" ? colors.cardHi : variant === "danger" ? "transparent" : color ?? colors.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        variant === "danger" && { borderWidth: 1, borderColor: colors.danger },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={[styles.buttonText, variant === "danger" && { color: colors.danger }]}>{title}</Text>
      )}
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
      <ActivityIndicator color={colors.accentHi} />
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
      style={[styles.chip, active && { backgroundColor: color ?? colors.accent, borderColor: color ?? colors.accent }]}
    >
      <Text style={[styles.chipText, active && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 18,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  panel: {
    backgroundColor: colors.card, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border, padding: 16,
  },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 10 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 },
  error: { color: colors.danger, fontSize: 14, textAlign: "center", marginTop: 8 },
  chip: {
    paddingHorizontal: 12, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.card, alignItems: "center", justifyContent: "center",
  },
  chipText: { color: colors.text2, fontSize: 13, fontWeight: "600" },
});
