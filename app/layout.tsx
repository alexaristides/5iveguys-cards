import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";

const description =
  "The fantasy football app for the 5ive Guys YouTube channel, plus trading cards of the real players and the 5IVE STREET game.";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.5iveg.com"),
  title: { default: "5iveG · 5ive Guys Fantasy Football", template: "%s · 5iveG" },
  description,
  applicationName: "5iveG",
  openGraph: { type: "website", siteName: "5iveG", locale: "en_GB", title: "5iveG · 5ive Guys Fantasy Football", description },
  twitter: { card: "summary_large_image" },
  appleWebApp: { title: "5iveG", statusBarStyle: "black-translucent" },
  verification: {
    google: "6-H9bzJiq9WozG1o5zUxpwiKRUOfK4ySXjXhoAUFa38",
  },
};

export const viewport: Viewport = { themeColor: "#0a0a0a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8007695182175927"
          crossOrigin="anonymous"
        />
      </head>
      <body className="bg-app min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
