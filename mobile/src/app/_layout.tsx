import { useEffect } from "react";
import { AppState } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Tour } from "@/components/Tour";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useTourSeen } from "@/lib/tour";
import { colors } from "@/lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

// Refetch stale data (deadlines, points) when the app returns to the foreground.
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener("change", (s) => handleFocus(s === "active"));
  return () => sub.remove();
});

const sheet = { presentation: "formSheet", sheetGrabberVisible: true, sheetCornerRadius: 24 } as const;

function RootStack() {
  const { ready, signedIn } = useAuth();
  const [tourSeen, markTourSeen] = useTourSeen();
  const loaded = ready && tourSeen !== null;

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  useEffect(() => {
    if (!signedIn) queryClient.clear();
  }, [signedIn]);

  if (!loaded) return null;
  // First launch: what the app is, before anything else.
  if (!tourSeen) return <Tour onDone={markTourSeen} />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="fantasy/edit" options={{ gestureEnabled: false }} />
        <Stack.Screen name="fantasy/gameweek/[number]" />
        <Stack.Screen name="fantasy/league/[id]" />
        <Stack.Screen name="fantasy/history" />
        <Stack.Screen name="motm/[videoId]" />
        <Stack.Screen name="player/[cardId]" />
        <Stack.Screen name="fantasy/player/[id]" options={{ ...sheet, sheetAllowedDetents: [0.7, 0.95] }} />
        <Stack.Screen name="fantasy/join" options={{ ...sheet, sheetAllowedDetents: [0.75] }} />
        <Stack.Screen name="tour" options={{ presentation: "fullScreenModal", animation: "fade" }} />
        <Stack.Screen name="settings" options={{ ...sheet, sheetAllowedDetents: [0.62] }} />
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
        <StatusBar style="dark" />
        <RootStack />
      </AuthProvider>
    </QueryClientProvider>
  );
}
