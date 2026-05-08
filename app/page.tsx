"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Image from "next/image";

const PREVIEW_CARDS = [
  { src: "/cards/gold/Barney-Goal-Gold.jpg", rotate: "-rotate-12", z: "z-10", x: "-translate-x-24" },
  { src: "/cards/home/Neymar_Home.jpg", rotate: "rotate-0", z: "z-30", x: "-translate-x-0" },
  { src: "/cards/gold/Joad-Trial-Gold.jpg", rotate: "rotate-12", z: "z-10", x: "translate-x-24" },
];

const FEATURES = [
  { icon: "🔔", label: "Subscribe", pts: "+500 pts" },
  { icon: "⚡", label: "Early like", pts: "+50 pts" },
  { icon: "👍", label: "Like videos", pts: "+10 pts each" },
];

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.push("/dashboard");
  }, [status, router]);

  return (
    <main className="min-h-screen bg-[#0a0a0a] overflow-hidden relative">
      {/* Ambient glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-purple-900/20 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-purple-800/10 blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto px-6 py-16 lg:py-24 flex flex-col lg:flex-row items-center gap-16 min-h-screen">

        {/* ── Left: text + CTA ── */}
        <div className="flex-1 flex flex-col items-center lg:items-start text-center lg:text-left">

          <div className="mb-6 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-900/40 border border-purple-700/40 text-purple-300 text-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            Official Digital Card Collection
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white tracking-tight leading-none mb-5">
            5iveguysfc
            <br />
            <span className="bg-gradient-to-r from-purple-400 to-purple-200 bg-clip-text text-transparent">
              Trading Cards
            </span>
          </h1>

          <p className="text-zinc-400 text-lg max-w-md mb-8 leading-relaxed">
            Support the channel. Earn points. Open packs. Collect all{" "}
            <span className="text-white font-medium">70+ official cards</span> — from
            common kits to legendary gold editions.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-3 justify-center lg:justify-start mb-10">
            {FEATURES.map((f) => (
              <div
                key={f.label}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-zinc-900/80 border border-zinc-800"
              >
                <span className="text-xl">{f.icon}</span>
                <div className="text-left">
                  <p className="text-white text-sm font-medium leading-none">{f.label}</p>
                  <p className="text-purple-400 text-xs font-semibold mt-0.5">{f.pts}</p>
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={() => signIn("google")}
            disabled={status === "loading"}
            className="flex items-center gap-3 px-8 py-4 rounded-2xl
              bg-white text-black font-semibold text-base
              hover:bg-zinc-100 active:scale-95
              transition-all duration-150 shadow-xl shadow-black/30"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Connect with YouTube
          </button>

          <p className="text-zinc-600 text-xs mt-3 max-w-xs lg:max-w-none">
            We only read your YouTube likes and subscription status for 5iveguysfc videos.
          </p>
        </div>

        {/* ── Right: card fan ── */}
        <div className="flex-1 flex items-center justify-center">
          <div className="relative w-72 h-96">
            {PREVIEW_CARDS.map((card, i) => (
              <div
                key={i}
                className={`absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2
                  ${card.x} ${card.rotate} ${card.z}
                  w-44 h-64 rounded-2xl overflow-hidden shadow-2xl border border-white/10
                  transition-transform duration-300`}
              >
                <Image src={card.src} alt="Preview card" fill className="object-cover" />
              </div>
            ))}
            {/* Glow under cards */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-8 bg-purple-500/20 blur-2xl rounded-full" />
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="relative pb-6 text-center">
        <p className="text-zinc-700 text-xs">
          By signing in you agree to our{" "}
          <a href="/terms" className="underline hover:text-zinc-500 transition-colors">Terms of Service</a>
          {" "}and{" "}
          <a href="/privacy" className="underline hover:text-zinc-500 transition-colors">Privacy Policy</a>.
          {" "}5iveguysfc Trading Cards is a fan project and is not affiliated with YouTube or Google.
        </p>
      </div>
    </main>
  );
}
