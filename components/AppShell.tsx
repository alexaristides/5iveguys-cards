"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";

/**
 * The website laid out like the iOS app: the app's five tabs in the same order (My Team, Players,
 * MOTM, Leagues, How to play), plus Extras for what only the website has (games, cards, points, shop).
 * Bright app look: white cards on soft lilac, 5iveG violet. Phones get the app's bottom tab bar;
 * wider screens get the tabs in the header.
 */
export const TABS = [
  { href: "/fantasy", label: "My Team", icon: ShirtIcon, match: (p: string) => p === "/fantasy" || /^\/fantasy\/(team|gameweek|history)\b/.test(p) },
  { href: "/players", label: "Players", icon: PeopleIcon, match: (p: string) => p.startsWith("/players") },
  { href: "/motm", label: "MOTM", icon: StarIcon, match: (p: string) => p.startsWith("/motm") },
  { href: "/leagues", label: "Leagues", icon: TrophyIcon, match: (p: string) => p.startsWith("/leagues") || /^\/fantasy\/(league|join)\b/.test(p) },
  { href: "/how-to-play", label: "How to play", icon: QuestionIcon, match: (p: string) => p.startsWith("/how-to-play") },
  { href: "/extras", label: "Extras", icon: GridIcon, match: (p: string) => p.startsWith("/extras") },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const tabs = TABS.map((t) => ({ href: t.href, label: t.label, active: t.match(path) }));
  return (
    <div className="min-h-screen flex flex-col bg-lilac text-ink [color-scheme:light] pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
      <SiteHeader variant="light" signInTo={path} tabs={tabs} />
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 pt-6 pb-16 space-y-4">{children}</main>
      <SiteFooter light />
      <TabBar path={path} />
    </div>
  );
}

/** The app's tab bar, pinned to the bottom on phones. */
function TabBar({ path }: { path: string }) {
  return (
    <nav
      aria-label="Tabs"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-lilac-line bg-white/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-6 h-[4.25rem]">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`h-full flex flex-col items-center justify-center gap-1 text-[10px] font-bold leading-none ${active ? "text-violet-600" : "text-ink-3 hover:text-ink-2"}`}
              >
                <Icon className="w-6 h-6" />
                <span className="truncate max-w-full tracking-tight">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ── The app's look, for every tab ─────────────────────────────────────────────

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
/** A card you can click: lifts a little on hover. */
export const cardLink = `${card} hover:shadow-[0_6px_18px_rgba(46,16,101,0.12)] transition-shadow`;
export const primaryButton = "rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-extrabold transition-colors";
export const secondaryButton = "rounded-2xl bg-violet-100 hover:bg-violet-200 disabled:opacity-40 text-violet-700 font-extrabold transition-colors";
/** A pill to pick one option (formation, sort order). */
export const chipClass = (active: boolean) =>
  `h-[34px] px-3.5 rounded-full border text-sm font-bold transition-colors ${
    active ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-lilac-line text-ink-2 hover:border-violet-300"
  }`;
export const inputClass =
  "min-w-0 px-4 rounded-2xl bg-white border-[1.5px] border-lilac-line text-ink font-bold placeholder:text-ink-3 placeholder:font-semibold outline-none focus:border-violet-500";

/** A tab's title, like the app's header: big and bold, with an optional line under it and a link on the right. */
export function PageTitle({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-ink text-3xl sm:text-4xl font-black">{title}</h1>
        {sub && <p className="text-ink-2 font-medium mt-1">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 pt-3">
      <h2 className="text-ink text-xl font-black">{children}</h2>
      {right}
    </div>
  );
}

export function BackLink({ href = "/fantasy", label = "My Team" }: { href?: string; label?: string }) {
  return <Link href={href} className="inline-block text-violet-600 hover:text-violet-700 text-sm font-extrabold">‹ {label}</Link>;
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

/** A list row like the app's: round emoji icon, title and detail, chevron. */
export function LinkRow({ href, emoji, title, detail, right, plain }: {
  href: string; emoji: string; title: string; detail?: ReactNode; right?: ReactNode;
  /** A plain <a> (pages outside the Next app, like /street). */
  plain?: boolean;
}) {
  const body = (
    <>
      <span className="w-[42px] h-[42px] shrink-0 rounded-full bg-violet-100 flex items-center justify-center text-xl" aria-hidden>{emoji}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-ink font-black truncate">{title}</span>
        {detail && <span className="block text-ink-3 text-sm">{detail}</span>}
      </span>
      {right}
      <span className="text-ink-3 text-2xl leading-none font-semibold" aria-hidden>›</span>
    </>
  );
  const cls = `${cardLink} flex items-center gap-3 px-4 py-3`;
  return plain ? <a href={href} className={cls}>{body}</a> : <Link href={href} className={cls}>{body}</Link>;
}

// ── Tab icons (after the app's SF Symbols) ────────────────────────────────────

type IconProps = { className?: string };

function ShirtIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M8.6 3.2a1 1 0 0 1 .9-.2c.6.2 1.4.6 2.5.6s1.9-.4 2.5-.6a1 1 0 0 1 .9.2l5 3.6a1 1 0 0 1 .3 1.2l-1.6 3.4a1 1 0 0 1-1.3.5l-1.3-.6V20a1 1 0 0 1-1 1H8.5a1 1 0 0 1-1-1v-8.7l-1.3.6a1 1 0 0 1-1.3-.5L3.3 8a1 1 0 0 1 .3-1.2l5-3.6Z" />
    </svg>
  );
}

function PeopleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <circle cx="9" cy="7.5" r="3.5" />
      <path d="M2 18.5C2 15.5 5 13.5 9 13.5s7 2 7 5V20a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-1.5Z" />
      <circle cx="17" cy="8.5" r="2.8" />
      <path d="M17.5 13.6c2.7.3 4.5 2 4.5 4.4V20a1 1 0 0 1-1 1h-3.3c.2-.3.3-.6.3-1v-1.5c0-1.9-.8-3.6-2.3-4.8.6-.1 1.2-.1 1.8-.1Z" />
    </svg>
  );
}

function StarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M11.1 2.6a1 1 0 0 1 1.8 0l2.4 4.9 5.4.8a1 1 0 0 1 .6 1.7l-3.9 3.8.9 5.4a1 1 0 0 1-1.5 1L12 17.7l-4.8 2.5a1 1 0 0 1-1.5-1l.9-5.4-3.9-3.8a1 1 0 0 1 .6-1.7l5.4-.8 2.4-4.9Z" />
    </svg>
  );
}

function TrophyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M7 3h10a1 1 0 0 1 1 1v1h2.5a1 1 0 0 1 1 1v1.5a4.5 4.5 0 0 1-4.1 4.5A6 6 0 0 1 13 15.9V18h3a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h3v-2.1A6 6 0 0 1 6.6 12 4.5 4.5 0 0 1 2.5 7.5V6a1 1 0 0 1 1-1H6V4a1 1 0 0 1 1-1ZM6 7H4.5v.5A2.5 2.5 0 0 0 6.1 9.8 6 6 0 0 1 6 9V7Zm12 0v2c0 .3 0 .5-.1.8a2.5 2.5 0 0 0 1.6-2.3V7H18Z" />
    </svg>
  );
}

function QuestionIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path fillRule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-.1 4.8c-1.6 0-2.8.8-3.2 2.1a1 1 0 0 0 1.9.6c.1-.4.6-.7 1.3-.7.9 0 1.4.5 1.4 1.1 0 .5-.3.8-1 1.3-.8.5-1.4 1.1-1.4 2.2v.3a1 1 0 0 0 2 0v-.2c0-.3.2-.5.7-.8.9-.6 1.7-1.3 1.7-2.8 0-1.8-1.5-3.1-3.4-3.1ZM12 15.6a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z" clipRule="evenodd" />
    </svg>
  );
}

function GridIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <rect x="3" y="3" width="8" height="8" rx="2.2" />
      <rect x="13" y="3" width="8" height="8" rx="2.2" />
      <rect x="3" y="13" width="8" height="8" rx="2.2" />
      <path d="M17 13a1 1 0 0 1 1 1v2h2a1 1 0 1 1 0 2h-2v2a1 1 0 1 1-2 0v-2h-2a1 1 0 1 1 0-2h2v-2a1 1 0 0 1 1-1Z" />
    </svg>
  );
}
