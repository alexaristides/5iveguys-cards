"use client";

import Link from "next/link";

interface GameMode {
  href: string;
  emoji: string;
  title: string;
  subtitle: string;
  gradient: string;
  shadow: string;
}

const GAME_MODES: GameMode[] = [
  {
    href: "/street",
    emoji: "🏙️",
    title: "5IVE STREET · 3v3",
    subtitle: "Street football in 3D with the squad — play it off the walls and nutmeg the CPU",
    gradient: "from-[#a326d6] to-purple-900 hover:from-[#b43ae6] hover:to-purple-800",
    shadow: "shadow-purple-900/40",
  },
  {
    href: "/game/exhibition",
    emoji: "🎮",
    title: "Exhibition Match",
    subtitle: "Pick BOTH teams from any players, then run the sim — fan ratings decide who wins",
    gradient: "from-green-700 to-emerald-700 hover:from-green-600 hover:to-emerald-600",
    shadow: "shadow-green-900/30",
  },
  {
    href: "/game/single",
    emoji: "⚽",
    title: "Single Player vs CPU",
    subtitle: "Build your best squad from your collection and take on the CPU",
    gradient: "from-blue-700 to-sky-700 hover:from-blue-600 hover:to-sky-600",
    shadow: "shadow-blue-900/30",
  },
];

export default function GameModeMenu() {
  return (
    <div className="space-y-3">
      {GAME_MODES.map((mode) => {
        const className = `group flex items-center gap-3 rounded-2xl bg-gradient-to-r ${mode.gradient} p-4 shadow-lg ${mode.shadow} transition-all active:scale-[0.99]`;
        const body = (
          <>
            <span className="text-3xl shrink-0">{mode.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-white font-bold leading-tight">{mode.title}</div>
              <div className="text-white/70 text-xs mt-0.5">{mode.subtitle}</div>
            </div>
            <span className="text-white/80 text-xl shrink-0 group-hover:translate-x-0.5 transition-transform">›</span>
          </>
        );
        // 5IVE STREET is a static page (public/street), so it needs a full page load.
        return mode.href === "/street"
          ? <a key={mode.href} href={mode.href} className={className}>{body}</a>
          : <Link key={mode.href} href={mode.href} className={className}>{body}</Link>;
      })}
    </div>
  );
}
