import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Intro" };

export default function TourLayout({ children }: { children: ReactNode }) {
  return children;
}
