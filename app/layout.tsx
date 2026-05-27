import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "5iveG",
  description: "Collect official 5iveguysfc trading cards by supporting the channel",
  verification: {
    google: "6-H9bzJiq9WozG1o5zUxpwiKRUOfK4ySXjXhoAUFa38",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-app min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
