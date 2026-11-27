"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";

const LINKS = [
  { href: "/shop", label: "Shop" },
  { href: "/game", label: "Play" },
  { href: "/fantasy", label: "Fantasy" },
  { href: "/support", label: "Help" },
];

/**
 * The site's top bar on the public pages and the signed-in home: logo, the main sections, and
 * sign in or the account menu. (The team pages under /[channelSlug] have their own Navbar.)
 */
export default function SiteHeader() {
  const path = usePathname();
  const { data: session, status } = useSession();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0a0a0a]/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto h-16 px-4 sm:px-6 flex items-center gap-6">
        <Link href={user ? "/dashboard" : "/"} className="shrink-0" aria-label="5iveG home">
          <Logo className="h-7" />
        </Link>

        <nav className="hidden md:flex items-center gap-1 text-sm" aria-label="Main">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-2 rounded-lg font-medium transition-colors ${
                active(l.href) ? "text-white bg-white/[0.06]" : "text-zinc-400 hover:text-white"
              }`}
            >
              {l.label}
              {l.href === "/shop" && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 align-middle" aria-hidden />}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2" ref={menuRef}>
          <Link
            href="/shop"
            className="md:hidden px-3 py-1.5 rounded-full bg-amber-400/15 border border-amber-400/40 text-amber-200 text-xs font-bold"
          >
            Shop packs
          </Link>

          {status === "loading" ? (
            <div className="w-9 h-9" />
          ) : user ? (
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-white/10 hover:ring-purple-500/60 transition"
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
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
              className="hidden md:inline-flex px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition"
            >
              Sign in
            </button>
          )}

          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            className={`md:hidden w-9 h-9 flex flex-col items-center justify-center gap-1.5 text-zinc-300 ${user ? "hidden" : ""}`}
            aria-label="Menu"
            aria-expanded={menu}
          >
            <span className="block w-5 h-0.5 bg-current rounded-full" />
            <span className="block w-5 h-0.5 bg-current rounded-full" />
          </button>

          {menu && (
            <div className="absolute right-4 sm:right-6 top-14 w-60 rounded-2xl border border-white/10 bg-zinc-950/95 backdrop-blur-xl shadow-2xl shadow-black/60 p-2 text-sm">
              {user && (
                <div className="px-3 py-2.5 border-b border-white/5 mb-1">
                  <p className="text-white font-semibold truncate">{user.name ?? "Fan"}</p>
                  {user.email && <p className="text-zinc-500 text-xs truncate">{user.email}</p>}
                </div>
              )}
              <div className="md:hidden">
                {LINKS.map((l) => (
                  <Link key={l.href} href={l.href} className="block px-3 py-2 rounded-lg text-zinc-300 hover:bg-white/5 hover:text-white">
                    {l.label}
                  </Link>
                ))}
              </div>
              {user ? (
                <>
                  <Link href="/dashboard" className="block px-3 py-2 rounded-lg text-zinc-300 hover:bg-white/5 hover:text-white">
                    My 5iveG
                  </Link>
                  <Link href="/settings" className="block px-3 py-2 rounded-lg text-zinc-300 hover:bg-white/5 hover:text-white">
                    Settings
                  </Link>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="w-full text-left px-3 py-2 rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                  className="w-full mt-1 px-3 py-2.5 rounded-lg bg-white text-black font-semibold"
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
