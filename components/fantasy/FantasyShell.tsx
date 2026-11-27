"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import type { overview } from "@/lib/fantasy-db";

/** GET /api/fantasy as the browser receives it. */
export type FantasyOverview = Awaited<ReturnType<typeof overview>>;
export type FantasyPlayerRow = FantasyOverview["players"][number];

/**
 * Page chrome for the fantasy pages. The rest of the site is dark; Fantasy has the iOS app's bright look
 * (white cards on soft lilac, 5iveG violet, a green pitch), with the site's header and footer in their light variant.
 */
export function FantasyShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="min-h-screen flex flex-col bg-lilac text-ink [color-scheme:light]">
      <SiteHeader variant="light" signInTo={path} />
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 pt-6 pb-20 space-y-4">{children}</main>
      <SiteFooter light />
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/** A white card on the lilac background; `card` has no padding, for tables and custom padding. */
export const card = "rounded-[20px] bg-white shadow-card";
export const panel = `${card} p-4 sm:p-5`;
export const primaryButton = "rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-extrabold transition-colors";
export const secondaryButton = "rounded-2xl bg-violet-100 hover:bg-violet-200 disabled:opacity-40 text-violet-700 font-extrabold transition-colors";
/** A pill to pick one option (formation, sort order). */
export const chipClass = (active: boolean) =>
  `h-[34px] px-3.5 rounded-full border text-sm font-bold transition-colors ${
    active ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-lilac-line text-ink-2 hover:border-violet-300"
  }`;
export const inputClass =
  "min-w-0 px-4 rounded-2xl bg-white border-[1.5px] border-lilac-line text-ink font-bold placeholder:text-ink-3 placeholder:font-semibold outline-none focus:border-violet-500";

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 pt-3">
      <h2 className="text-ink text-xl font-black">{children}</h2>
      {right}
    </div>
  );
}

export function BackLink() {
  return <Link href="/fantasy" className="inline-block text-violet-600 hover:text-violet-700 text-sm font-extrabold">‹ Fantasy</Link>;
}

/** The big purple-to-pink card: what's happening and the one thing to do, as in the app. */
export function Hero({ eyebrow, title, children, footer, action }: {
  eyebrow: string; title: string; children?: ReactNode; footer?: ReactNode; action?: ReactNode;
}) {
  return (
    <section className="rounded-3xl p-5 sm:p-6 space-y-2 text-white bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-600 shadow-hero">
      <div className="text-white/85 text-xs font-black tracking-[0.1em]">{eyebrow}</div>
      <h2 className="text-[28px] sm:text-3xl leading-tight font-black">{title}</h2>
      {children && <p className="text-white/95 text-base leading-snug font-medium">{children}</p>}
      {footer}
      {action}
    </section>
  );
}

/** The white button inside a Hero. */
export const heroButton =
  "mt-2 flex w-full h-[54px] items-center justify-center rounded-2xl bg-white hover:bg-violet-50 text-violet-600 text-lg font-black transition-colors";
