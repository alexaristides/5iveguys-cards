"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";

interface ChannelInfo {
  slug: string;
  name: string;
  thumbnailUrl?: string | null;
}

interface NavbarProps {
  user: { name?: string | null; image?: string | null };
  points: number;
  channel?: ChannelInfo | null;
}

function buildNavLinks(channelSlug?: string | null) {
  if (!channelSlug) return [];
  const base = `/${channelSlug}`;
  return [
    { href: `${base}`, label: "Dashboard", icon: "⚡" },
    { href: `${base}/packs`, label: "Packs", icon: "📦" },
    { href: `${base}/collection`, label: "Collection", icon: "🃏" },
    { href: `${base}/fans`, label: "Fans", icon: "🏆" },
    { href: `${base}/forum`, label: "Chat", icon: "💬" },
    { href: `${base}/games`, label: "Games", icon: "⚔️" },
  ];
}

export default function Navbar({ user, points, channel }: NavbarProps) {
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const NAV_LINKS = buildNavLinks(channel?.slug);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [path]);

  return (
    <>
      {/* ── Top bar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

          {/* Left: hamburger (mobile) + logo */}
          <div className="flex items-center gap-3 shrink-0">
            {NAV_LINKS.length > 0 && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden flex flex-col gap-1.5 p-1 text-zinc-400 hover:text-white transition-colors"
                aria-label="Open menu"
              >
                <span className="block w-5 h-0.5 bg-current rounded-full" />
                <span className="block w-5 h-0.5 bg-current rounded-full" />
                <span className="block w-5 h-0.5 bg-current rounded-full" />
              </button>
            )}

            {channel ? (
              <>
                <Link href="/" className="text-zinc-500 hover:text-white text-xs transition-colors hidden sm:block">
                  ← Channels
                </Link>
                <Link href={`/${channel.slug}`} className="flex items-center gap-2">
                  {channel.thumbnailUrl ? (
                    <div className="w-8 h-8 rounded-full overflow-hidden relative">
                      <Image src={channel.thumbnailUrl} alt={channel.name} fill className="object-cover" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
                      <span className="text-white text-sm font-bold">{channel.name[0]}</span>
                    </div>
                  )}
                  <span className="text-white font-semibold text-sm tracking-tight hidden sm:block">
                    {channel.name}
                  </span>
                </Link>
              </>
            ) : (
              <Link href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
                  <span className="text-white text-sm font-bold">5</span>
                </div>
                <span className="text-white font-semibold text-sm tracking-tight hidden sm:block">
                  Fan Rewards
                </span>
              </Link>
            )}
          </div>

          {/* Desktop nav links */}
          {NAV_LINKS.length > 0 && (
            <div className="hidden md:flex items-center gap-1 flex-1 justify-center">
              {NAV_LINKS.map((link) => {
                const active = path === link.href || (link.href !== `/${channel?.slug}` && path.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                      active
                        ? "bg-white/10 text-white"
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Right: points + avatar */}
          <div className="flex items-center gap-3 shrink-0">
            {channel && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-900/50 border border-purple-700/50">
                <svg className="w-3.5 h-3.5 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-purple-200 text-xs font-semibold">{points.toLocaleString()}</span>
              </div>
            )}

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
                  <div className="px-4 py-3 border-b border-zinc-800">
                    <p className="text-white text-sm font-semibold truncate">{user.name}</p>
                    {channel && (
                      <p className="text-purple-400 text-xs mt-0.5">{points.toLocaleString()} pts</p>
                    )}
                  </div>

                  {channel && (
                    <Link
                      href="/"
                      onClick={() => setMenuOpen(false)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <span>🏠</span>
                      All Channels
                    </Link>
                  )}

                  <Link
                    href="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors border-t border-zinc-800"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Settings
                  </Link>
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

      {/* ── Mobile sidebar ── */}
      {NAV_LINKS.length > 0 && (
        <>
          {/* Backdrop */}
          <div
            className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden transition-opacity duration-300 ${
              sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}
            onClick={() => setSidebarOpen(false)}
          />

          {/* Drawer */}
          <div
            className={`fixed top-0 left-0 bottom-0 z-50 w-64 bg-[#0f0f0f] border-r border-white/5 md:hidden flex flex-col transition-transform duration-300 ease-in-out ${
              sidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-white/5 shrink-0">
              {channel ? (
                <div className="flex items-center gap-2">
                  {channel.thumbnailUrl ? (
                    <div className="w-7 h-7 rounded-full overflow-hidden relative">
                      <Image src={channel.thumbnailUrl} alt={channel.name} fill className="object-cover" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">{channel.name[0]}</span>
                    </div>
                  )}
                  <span className="text-white text-sm font-semibold truncate">{channel.name}</span>
                </div>
              ) : (
                <span className="text-white text-sm font-semibold">Menu</span>
              )}
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-zinc-500 hover:text-white transition-colors p-1"
                aria-label="Close menu"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto py-3">
              {NAV_LINKS.map((link) => {
                const active = path === link.href || (link.href !== `/${channel?.slug}` && path.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
                      active
                        ? "text-white bg-white/8"
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <span className="text-lg">{link.icon}</span>
                    {link.label}
                    {active && <span className="ml-auto w-1 h-4 rounded-full bg-purple-500" />}
                  </Link>
                );
              })}
            </nav>

            {/* Drawer footer */}
            <div className="border-t border-white/5 py-3 shrink-0">
              {channel && (
                <Link
                  href="/"
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <span className="text-lg">🏠</span>
                  All Channels
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
