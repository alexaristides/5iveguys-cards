import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/lib/theme";

/** Full-screen chrome for game flows (pushed over the tabs). */
export function GameScreen({
  title, children, onBack, hideBack, footer,
}: { title: string; children: ReactNode; onBack?: () => void; hideBack?: boolean; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        {hideBack ? <View style={styles.side} /> : (
          <Pressable onPress={onBack ?? (() => router.back())} hitSlop={10} style={styles.side}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
        )}
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={styles.side} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + (footer ? 124 : 32) }]}>
        {children}
      </ScrollView>
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { height: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 },
  side: { width: 72 },
  back: { color: colors.accentHi, fontSize: 17, fontWeight: "600" },
  title: { flex: 1, textAlign: "center", color: colors.text, fontSize: 17, fontWeight: "800" },
  content: { paddingHorizontal: 16, paddingTop: 4 },
  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: "rgba(10,10,10,0.94)", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
});
