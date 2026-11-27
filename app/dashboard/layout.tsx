import type { Metadata } from "next";

export const metadata: Metadata = { title: "Your collection" };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
