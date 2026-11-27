import type { Viewport } from "next";
import { HomeScreen } from "@/components/HomeScreen";

/** Bright like the app (see app/(app)/layout.tsx), so tint the phone's browser bar to match. */
export const viewport: Viewport = { themeColor: "#ffffff", viewportFit: "cover" };

export default function HomePage() {
  return <HomeScreen />;
}
