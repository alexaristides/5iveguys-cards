import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Fantasy admin — 5iveG",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "5iveG admin", statusBarStyle: "black-translucent" },
};

// viewport-fit=cover lets the bottom bar sit above the iPhone home indicator (safe-area insets).
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0a0a0a" };

export default function FantasyAdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
