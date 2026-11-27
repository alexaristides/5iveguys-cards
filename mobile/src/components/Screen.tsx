import type { ReactNode, Ref } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/lib/theme";

/** Full-screen chrome for screens pushed over the tabs: back, title, scrolling content, optional footer pinned below it. */
export function Screen({
  title, children, onBack, hideBack, footer, right, scrollRef,
}: {
  title: string; children: ReactNode; onBack?: () => void; hideBack?: boolean; footer?: ReactNode; right?: ReactNode;
  /** For screens that scroll themselves (e.g. a search box to the top). */
  scrollRef?: Ref<ScrollView>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        {hideBack ? <View style={styles.side} /> : (
          <Pressable onPress={onBack ?? (() => router.back())} hitSlop={10} style={styles.side} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
        )}
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={[styles.side, styles.right]}>{right}</View>
      </View>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: footer ? 24 : insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
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
  right: { alignItems: "flex-end" },
  back: { color: colors.accent, fontSize: 17, fontWeight: "700" },
  title: { flex: 1, textAlign: "center", color: colors.text, fontSize: 17, fontWeight: "900" },
  content: { paddingHorizontal: 16, paddingTop: 4 },
  footer: {
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
});
