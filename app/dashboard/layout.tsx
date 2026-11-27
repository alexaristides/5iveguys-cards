import type { Metadata } from "next";

export const metadata: Metadata = { title: "My 5iveG" };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
