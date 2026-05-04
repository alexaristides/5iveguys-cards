"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import Image from "next/image";

interface NavbarProps {
  user: { name?: string | null; image?: string | null };
  points: number;
}

export default function Navbar({ user, points }: NavbarProps) {
  const path = usePathname();

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/packs", label: "Packs" },
    { href: "/collection", label: "Collection" },
    { href: "/fans", label: "Fans" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center group-hover:bg-purple-500 transition-colors">
            <span className="text-white text-sm font-bold">5</span>
          </div>
          <span className="text-white font-semibold text-sm tracking-tight hidden sm:block">
            5iveGuys Cards
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {links.map((link) => (
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

        {/* User + points */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-900/50 border border-purple-700/50">
            <svg className="w-3.5 h-3.5 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span className="text-purple-200 text-xs font-semibold">{points.toLocaleString()}</span>
          </div>

          {user.image && (
            <div className="relative w-7 h-7">
              <Image
                src={user.image}
                alt={user.name ?? "User"}
                fill
                className="rounded-full object-cover"
              />
            </div>
          )}

          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
