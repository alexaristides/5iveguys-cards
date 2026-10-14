import { useEffect } from "react";
import { AppState } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ChannelProvider } from "@/lib/channel";
import { FEATURES } from "@/lib/config";
import { colors } from "@/lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

// Refetch stale data (e.g. points) when the app returns to the foreground.
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener("change", (s) => handleFocus(s === "active"));
  return () => sub.remove();
});

function RootStack() {
  const { ready, signedIn } = useAuth();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  useEffect(() => {
    if (!signedIn) queryClient.clear();
  }, [signedIn]);

  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="card/[cardId]"
          options={{ presentation: "formSheet", sheetAllowedDetents: [0.92], sheetGrabberVisible: true, sheetCornerRadius: 24 }}
        />
        <Stack.Screen
          name="video/[videoId]"
          options={{ presentation: "formSheet", sheetAllowedDetents: [0.6, 0.92], sheetGrabberVisible: true, sheetCornerRadius: 24 }}
        />
        <Stack.Screen
          name="motm/[videoId]"
          options={{ presentation: "formSheet", sheetAllowedDetents: [0.92], sheetGrabberVisible: true, sheetCornerRadius: 24 }}
        />
        <Stack.Screen
          name="settings"
          options={{ presentation: "formSheet", sheetAllowedDetents: [0.55], sheetGrabberVisible: true, sheetCornerRadius: 24 }}
        />
      </Stack.Protected>
      {/* Held back for launch (FEATURES in lib/config.ts); guarded so deep links can't reach them either. */}
      <Stack.Protected guard={signedIn && FEATURES.packs}>
        <Stack.Screen name="pack/[packId]" options={{ presentation: "fullScreenModal", animation: "fade" }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && FEATURES.fantasy}>
        <Stack.Screen name="fantasy/edit" options={{ gestureEnabled: false }} />
        <Stack.Screen name="fantasy/gameweek/[number]" />
        <Stack.Screen name="fantasy/leaderboard" />
        <Stack.Screen
          name="fantasy/rules"
          options={{ presentation: "formSheet", sheetAllowedDetents: [0.92], sheetGrabberVisible: true, sheetCornerRadius: 24 }}
        />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && FEATURES.game}>
        <Stack.Screen name="play/cpu" options={{ gestureEnabled: false }} />
        <Stack.Screen name="play/exhibition" options={{ gestureEnabled: false }} />
        <Stack.Screen name="play/pvp" />
        <Stack.Screen name="play/lobby/[id]" options={{ gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && FEATURES.street}>
        <Stack.Screen
          name="play/street"
          options={{ gestureEnabled: false, animation: "fade", autoHideHomeIndicator: true }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ChannelProvider>
          <StatusBar style="light" />
          <RootStack />
        </ChannelProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
