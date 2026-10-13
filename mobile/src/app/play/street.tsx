import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import * as ScreenOrientation from "expo-screen-orientation";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { API_URL } from "@/lib/config";
import { useStreetRatings } from "@/lib/queries";
import { recordStreetResult } from "@/lib/streetStore";
import { STREET_HTML } from "@/street/html.generated";

type GameMessage =
  | { type: "ready" }
  | { type: "haptic"; style: "light" | "medium" | "heavy" | "success" | "error" }
  | { type: "result"; home: number; away: number; won: boolean }
  | { type: "exit" };

const IMPACT = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
} as const;

/**
 * 5IVE STREET: the 3D 3v3 game (built from mobile/street) running full-screen
 * in landscape. Fan ratings are passed in so they shape each player's stats.
 */
export default function StreetScreen() {
  const [landscape, setLandscape] = useState(false);
  const ratings = useStreetRatings();
  // Start without ratings rather than keep the player waiting on a slow network.
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
      .catch(() => {})
      .finally(() => setLandscape(true));
    const t = setTimeout(() => setWaited(true), 2500);
    return () => {
      clearTimeout(t);
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  const ready = landscape && (ratings.isFetched || waited);
  // Freeze the config once the game has started so a late refetch doesn't reload it.
  const injected = useMemo(
    () => (ready ? `window.__STREET__ = ${JSON.stringify({ app: true, ratings: ratings.data ?? {} })}; true;` : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready],
  );

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: GameMessage;
    try {
      msg = JSON.parse(e.nativeEvent.data) as GameMessage;
    } catch {
      return;
    }
    switch (msg.type) {
      case "haptic":
        if (msg.style === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        else if (msg.style === "error") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        else Haptics.impactAsync(IMPACT[msg.style]);
        break;
      case "result":
        recordStreetResult(msg.home, msg.away);
        break;
      case "exit":
        // Opened from a link there may be nothing to go back to.
        if (router.canGoBack()) router.back();
        else router.replace("/");
        break;
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar hidden />
      {ready ? (
        <WebView
          source={{ html: STREET_HTML, baseUrl: API_URL }}
          originWhitelist={["*"]}
          injectedJavaScriptBeforeContentLoaded={injected}
          onMessage={onMessage}
          style={styles.web}
          scrollEnabled={false}
          bounces={false}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsBackForwardNavigationGestures={false}
          setSupportMultipleWindows={false}
          webviewDebuggingEnabled={__DEV__}
          // The game is a single page; never follow links out of it.
          onShouldStartLoadWithRequest={(req) => req.navigationType !== "click"}
        />
      ) : (
        <ActivityIndicator style={styles.web} color="#a855f7" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0b0614" },
  web: { flex: 1, backgroundColor: "#0b0614" },
});
