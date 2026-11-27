import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "My Team" };

/** Fantasy is the My Team tab of the app-style site (AppShell): see app/(app)/layout.tsx. */
export const viewport: Viewport = { themeColor: "#ffffff", viewportFit: "cover" };

export default function FantasyLayout({ children }: { children: ReactNode }) {
  return children;
}
