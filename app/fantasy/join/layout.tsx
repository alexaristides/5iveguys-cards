import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Join a league" };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
