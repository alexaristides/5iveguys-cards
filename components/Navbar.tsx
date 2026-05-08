"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";

interface NavbarProps {
  user: { name?: string | null; image?: string | null };
  points: number;
}

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: "⚡" },
  { href: "/packs", label: "Packs", icon: "📦" },
  { href: "/collection", label: "Collection", icon: "🃏" },
  { href: "/fans", label: "Fans", icon: "🏆" },
  { href: "/games", label: "Games", icon: "⚔️" },
];

export default function Navbar({ user, points }: NavbarProps) {
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <>
      {/* ── Top bar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">5</span>
            </div>
            <span className="text-white font-semibold text-sm tracking-tight hidden sm:block">
              5iveGuys Cards
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  path === link.href
                    ? "bg-white/10 text-white"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <a
              href="https://www.fantasy5ive.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-4 py-1.5 rounded-full text-sm font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
            >
              Fantasy
              <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>

          {/* Right: points + avatar */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Points pill */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-900/50 border border-purple-700/50">
              <svg className="w-3.5 h-3.5 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-purple-200 text-xs font-semibold">{points.toLocaleString()}</span>
            </div>

            {/* Avatar + dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="relative w-8 h-8 rounded-full overflow-hidden ring-2 ring-transparent hover:ring-purple-500 transition-all"
              >
                {user.image ? (
                  <Image src={user.image} alt={user.name ?? "User"} fill className="object-cover" />
                ) : (
                  <div className="w-full h-full bg-zinc-700 flex items-center justify-center text-white text-sm font-bold">
                    {user.name?.[0] ?? "?"}
                  </div>
                )}
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl overflow-hidden">
                  {/* User info */}
                  <div className="px-4 py-3 border-b border-zinc-800">
                    <p className="text-white text-sm font-semibold truncate">{user.name}</p>
                    <p className="text-purple-400 text-xs mt-0.5">{points.toLocaleString()} pts</p>
                  </div>
                  {/* Mobile nav links */}
                  <div className="md:hidden py-1">
                    {NAV_LINKS.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setMenuOpen(false)}
                        className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          path === link.href ? "text-white bg-white/5" : "text-zinc-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <span>{link.icon}</span>
                        {link.label}
                      </Link>
                    ))}
                    <a
                      href="https://www.fantasy5ive.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <span>⚽</span>
                      Fantasy ↗
                    </a>
                    <div className="border-t border-zinc-800 mt-1" />
                  </div>
                  {/* Sign out */}
                  <button
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-white/5 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* ── Mobile bottom tab bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#0f0f0f]/95 backdrop-blur-md border-t border-white/5">
        <div className="flex items-center justify-around px-2 py-2 pb-safe">
          {NAV_LINKS.map((link) => {
            const active = path === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all"
              >
                <span className={`text-xl transition-transform ${active ? "scale-110" : "opacity-50"}`}>
                  {link.icon}
                </span>
                <span className={`text-[10px] font-medium transition-colors ${active ? "text-purple-400" : "text-zinc-600"}`}>
                  {link.label}
                </span>
              </Link>
            );
          })}
          <a
            href="https://www.fantasy5ive.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl"
          >
            <span className="text-xl opacity-50">⚽</span>
            <span className="text-[10px] font-medium text-zinc-600">Fantasy</span>
          </a>
        </div>
      </div>
    </>
  );
}
