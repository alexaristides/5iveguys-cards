import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stats",
  description: "Fantasy Div 1 stats: the most picked 5ive Guys, transfers in and out, top scorers and the season's points.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
