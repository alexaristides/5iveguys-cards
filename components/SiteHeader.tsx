"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";
import { goToSignIn } from "./SignInScreen";

const LINKS = [
  { href: "/fantasy", label: "Fantasy" },
  { href: "/extras", label: "Extras" },
  { href: "/support", label: "Help" },
];

/** The site is dark; the Fantasy pages use the iOS app's bright look and get a light bar to match. */
const TONES = {
  dark: {
    bar: "border-white/[0.06] bg-[#0a0a0a]/80",
    link: "text-zinc-400 hover:text-white",
    linkOn: "text-white bg-white/[0.06]",
    avatar: "ring-white/10 hover:ring-purple-500/60",
    signIn: "bg-white text-black hover:bg-zinc-200",
    burger: "text-zinc-300",
    menu: "border-white/10 bg-zinc-950/95 shadow-black/60",
    menuHead: "border-white/5",
    name: "text-white",
    email: "text-zinc-500",
    item: "text-zinc-300 hover:bg-white/5 hover:text-white",
    quiet: "text-zinc-400 hover:bg-white/5 hover:text-white",
    menuSignIn: "bg-white text-black",
  },
  light: {
    bar: "border-lilac-line bg-white/85",
    link: "text-ink-2 hover:text-ink",
    linkOn: "text-violet-700 bg-violet-100",
    avatar: "ring-lilac-line hover:ring-violet-400",
    signIn: "bg-violet-600 text-white hover:bg-violet-500",
    burger: "text-ink-2",
    menu: "border-lilac-line bg-white/95 shadow-violet-950/15",
    menuHead: "border-lilac-line",
    name: "text-ink",
    email: "text-ink-3",
    item: "text-ink-2 hover:bg-lilac hover:text-ink",
    quiet: "text-ink-3 hover:bg-lilac hover:text-ink",
    menuSignIn: "bg-violet-600 text-white",
  },
};

/**
 * The top bar on the pages outside the app screens (terms, privacy, help, the games, your collection):
 * logo, the main sections, and sign in or the account menu. (The team pages under /[channelSlug] have
 * their own Navbar; the app screens have AppShell.) `signInTo` is where signing in lands.
 */
export default function SiteHeader({ variant = "dark", signInTo = "/fantasy" }: {
  variant?: keyof typeof TONES; signInTo?: string;
}) {
  const path = usePathname();
  const { data: session, status } = useSession();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const t = TONES[variant];

  useEffect(() => setMenu(false), [path]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const user = session?.user;
  const active = (href: string) => path === href || path.startsWith(`${href}/`);
  const nav = LINKS.map((l) => ({ ...l, active: active(l.href) }));

  return (
    <header className={`sticky top-0 z-40 border-b backdrop-blur-xl ${t.bar}`}>
      <div className="max-w-6xl mx-auto h-16 px-4 sm:px-6 flex items-center gap-6">
        <Link href={user ? "/fantasy" : "/"} className="shrink-0" aria-label="5iveG home">
          <Logo className="h-7" ink={variant === "light"} />
        </Link>

        <nav className="hidden md:flex items-center gap-1 text-sm" aria-label="Main">
          {nav.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={l.active ? "page" : undefined}
              className={`px-3 py-2 rounded-lg transition-colors font-medium ${l.active ? t.linkOn : t.link}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2" ref={menuRef}>
          {status === "loading" ? (
            <div className="w-9 h-9" />
          ) : user ? (
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              className={`w-9 h-9 rounded-full overflow-hidden ring-2 transition ${t.avatar}`}
              aria-label="Account menu"
              aria-expanded={menu}
            >
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="w-full h-full flex items-center justify-center bg-purple-700 text-white text-sm font-bold">
                  {user.name?.[0] ?? "?"}
                </span>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goToSignIn(signInTo)}
              className={`hidden md:inline-flex px-4 py-2 rounded-xl text-sm font-semibold transition ${t.signIn}`}
            >
              Sign in
            </button>
          )}

          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            className={`md:hidden w-9 h-9 flex flex-col items-center justify-center gap-1.5 ${t.burger} ${user ? "hidden" : ""}`}
            aria-label="Menu"
            aria-expanded={menu}
          >
            <span className="block w-5 h-0.5 bg-current rounded-full" />
            <span className="block w-5 h-0.5 bg-current rounded-full" />
          </button>

          {menu && (
            <div className={`absolute right-4 sm:right-6 top-14 w-60 rounded-2xl border backdrop-blur-xl shadow-2xl p-2 text-sm ${t.menu}`}>
              {user && (
                <div className={`px-3 py-2.5 border-b mb-1 ${t.menuHead}`}>
                  <p className={`font-semibold truncate ${t.name}`}>{user.name ?? "Fan"}</p>
                  {user.email && <p className={`text-xs truncate ${t.email}`}>{user.email}</p>}
                </div>
              )}
              <div className="md:hidden">
                {LINKS.map((l) => (
                  <Link key={l.href} href={l.href} className={`block px-3 py-2 rounded-lg ${t.item}`}>
                    {l.label}
                  </Link>
                ))}
              </div>
              {user ? (
                <>
                  <Link href="/fantasy" className={`block px-3 py-2 rounded-lg ${t.item}`}>
                    My Team
                  </Link>
                  <Link href="/extras" className={`block px-3 py-2 rounded-lg ${t.item}`}>
                    Extras
                  </Link>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className={`w-full text-left px-3 py-2 rounded-lg ${t.quiet}`}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => goToSignIn(signInTo)}
                  className={`w-full mt-1 px-3 py-2.5 rounded-lg font-semibold ${t.menuSignIn}`}
                >
                  Sign in
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
