import type { ReactNode } from "react";
import type { Viewport } from "next";

/** Fantasy has the app's bright look (the rest of the site is dark), so tint the phone's browser bar to match its light header. */
export const viewport: Viewport = { themeColor: "#ffffff" };

export default function FantasyLayout({ children }: { children: ReactNode }) {
  return children;
}
