import type { ReactNode } from "react";
import type { Viewport } from "next";

/**
 * The app's tabs on the website (AppShell): bright like the iOS app while the rest of the site is
 * dark, so tint the phone's browser bar white, and reach under the home indicator for the tab bar.
 */
export const viewport: Viewport = { themeColor: "#ffffff", viewportFit: "cover" };

export default function AppTabsLayout({ children }: { children: ReactNode }) {
  return children;
}
