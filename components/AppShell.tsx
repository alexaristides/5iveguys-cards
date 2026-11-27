"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { AppMenu } from "@/components/AppMenu";
import { Logo } from "@/components/Logo";
import { SignInScreen } from "@/components/SignInScreen";

/**
 * The website is the iOS app (mobile/): the same five tabs in the same order, the same screens and the
 * same bright look (white cards on soft lilac, 5iveG violet). Phones get the app's header and bottom
 * tab bar; wider screens get the tabs in a top bar over the same single column. Everything else the
 * website has (games, cards, points) is in Extras, in the burger menu.
 */
export const TABS = [
  { href: "/fantasy", label: "My Team", icon: ShirtIcon, match: (p: string) => p === "/fantasy" || /^\/fantasy\/(team|gameweek|history|player)\b/.test(p) },
  { href: "/players", label: "Players", icon: PeopleIcon, match: (p: string) => p.startsWith("/players") },
  { href: "/motm", label: "MOTM", icon: StarIcon, match: (p: string) => p.startsWith("/motm") },
  { href: "/leagues", label: "Leagues", icon: TrophyIcon, match: (p: string) => p.startsWith("/leagues") || /^\/fantasy\/(league|join)\b/.test(p) },
  { href: "/how-to-play", label: "How to play", icon: QuestionIcon, match: (p: string) => p.startsWith("/how-to-play") },
];

/**
 * A screen of the app. A tab (no `back`) has the app's header (badge, big title, menu) and the tab bar.
 * A screen pushed over the tabs (`back` = where Back goes) has the app's "‹ Back · title" bar instead,
 * no tab bar, and an optional `footer` pinned to the bottom (like the team picker's Save button).
 * Like the app, every screen needs you signed in (it shows the sign-in screen) unless `open`.
 */
export function AppShell({ title, back, right, footer, open, children }: {
  title: string;
  back?: string;
  right?: ReactNode;
  footer?: ReactNode;
  open?: boolean;
  children: ReactNode;
}) {
  const path = usePathname();
  const { status } = useSession();

  if (!open && status === "loading") {
    return (
      <div className="min-h-[100dvh] bg-lilac [color-scheme:light]">
        <Spinner />
      </div>
    );
  }
  if (!open && status === "unauthenticated") return <SignInScreen callbackUrl={path} />;

  const pushed = back !== undefined;
  return (
    <div className="min-h-[100dvh] flex flex-col bg-lilac text-ink [color-scheme:light]">
      <DesktopBar path={path} />
      {pushed ? <ScreenBar title={title} back={back} right={right} /> : <TabHeader title={title} />}
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 pt-1 pb-8 md:pb-16 space-y-3.5">{children}</main>
      {footer && (
        <div className="sticky bottom-0 z-30 border-t border-lilac-line bg-white">
          <div className="max-w-2xl mx-auto px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">{footer}</div>
        </div>
      )}
      {!pushed && <TabBar path={path} />}
    </div>
  );
}

/** Wider screens: the 5iveG logo, the tabs and the menu in a light top bar. */
function DesktopBar({ path }: { path: string }) {
  return (
    <header className="hidden md:block sticky top-0 z-40 border-b border-lilac-line bg-white/85 backdrop-blur-xl">
      <div className="max-w-5xl mx-auto h-16 px-6 flex items-center gap-6">
        <Link href="/fantasy" className="shrink-0" aria-label="5iveG home">
          <Logo className="h-7" ink />
        </Link>
        <nav className="flex items-center gap-1 text-sm" aria-label="Tabs">
          {TABS.map((t) => {
            const active = t.match(path);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`px-3 py-2 rounded-lg font-bold transition-colors ${active ? "text-violet-700 bg-violet-100" : "text-ink-2 hover:text-ink"}`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto">
          <AppMenu />
        </div>
      </div>
    </header>
  );
}

/** The top of each tab, as in the app: the 5iveG badge, the tab's title and the menu. */
function TabHeader({ title }: { title: string }) {
  return (
    <div className="sticky top-0 z-30 bg-lilac md:static">
      <div className="max-w-2xl mx-auto flex items-center justify-between px-4 pt-[calc(8px+env(safe-area-inset-top))] pb-2.5 md:pt-7 md:pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/5iveguys-badge.png" alt="" className="w-[34px] h-[34px] rounded-[9px] md:hidden" />
          <h1 className="text-ink text-[26px] md:text-[32px] leading-tight font-black truncate">{title}</h1>
        </div>
        <div className="md:hidden">
          <AppMenu />
        </div>
      </div>
    </div>
  );
}

/** A screen pushed over the tabs, as in the app: ‹ Back, the title in the middle, an optional button on the right. */
function ScreenBar({ title, back, right }: { title: string; back: string; right?: ReactNode }) {
  return (
    <div className="sticky top-0 md:top-16 z-30 bg-lilac pt-[env(safe-area-inset-top)] md:pt-0">
      <div className="max-w-2xl mx-auto h-12 md:h-14 px-3 grid grid-cols-[72px_1fr_72px] items-center">
        <Link href={back} className="text-violet-600 hover:text-violet-700 text-[17px] font-bold" aria-label="Back">
          ‹ Back
        </Link>
        <h1 className="text-center text-ink text-[17px] font-black truncate">{title}</h1>
        <div className="flex justify-end">{right}</div>
      </div>
    </div>
  );
}

/** The app's tab bar, pinned to the bottom on phones. */
function TabBar({ path }: { path: string }) {
  return (
    <>
      <div className="md:hidden h-[calc(4.25rem+env(safe-area-inset-bottom))]" aria-hidden />
      <nav
        aria-label="Tabs"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-lilac-line bg-white/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="grid grid-cols-5 h-[4.25rem]">
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
    </>
  );
}

// ── The app's look, for every screen (mobile/src/lib/theme.ts, mobile/src/components/ui.tsx) ──

export function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/** A white card on the lilac background; `card` has no padding, for tables and custom padding. */
export const card = "rounded-[20px] bg-white shadow-card";
export const panel = `${card} p-4`;
/** A card you can click: lifts a little on hover. */
export const cardLink = `${card} hover:shadow-[0_6px_18px_rgba(46,16,101,0.12)] active:opacity-80 transition`;
/** The app's Button: 52 tall, 16 round, bold 17. */
export const primaryButton = "h-[52px] px-[18px] rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-[17px] font-extrabold transition-colors";
export const secondaryButton = "h-[52px] px-[18px] rounded-2xl bg-violet-100 hover:bg-violet-200 disabled:opacity-40 text-violet-600 text-[17px] font-extrabold transition-colors";
export const dangerButton = "h-[52px] px-[18px] rounded-2xl border border-red-600 text-red-600 hover:bg-red-50 disabled:opacity-40 text-[17px] font-extrabold transition-colors";
/** A pill to pick one option (formation, sort order). */
export const chipClass = (active: boolean) =>
  `h-[34px] px-3 rounded-full border text-sm font-bold transition-colors ${
    active ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-lilac-line text-ink-2 hover:border-violet-300"
  }`;
export const inputClass =
  "min-w-0 px-4 rounded-2xl bg-white border-[1.5px] border-lilac-line text-ink font-bold placeholder:text-ink-3 placeholder:font-semibold outline-none focus:border-violet-500";

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-5 pb-0.5">
      <h2 className="text-ink text-xl font-black">{children}</h2>
      {right}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-red-600 text-sm text-center pt-2">{children}</p>;
}

/** The big purple-to-pink card: what's happening and the one thing to do, as in the app. */
export function Hero({ eyebrow, title, children, footer, action }: {
  eyebrow: string; title: string; children?: ReactNode; footer?: ReactNode; action?: ReactNode;
}) {
  return (
    <section className="rounded-3xl p-5 space-y-2 text-white bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-600 shadow-hero">
      <div className="text-white/85 text-xs font-black tracking-[0.1em]">{eyebrow}</div>
      <h2 className="text-[30px] leading-tight font-black">{title}</h2>
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
