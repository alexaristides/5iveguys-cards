import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Man of the Match" };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
