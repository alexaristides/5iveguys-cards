"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Image from "next/image";

const PREVIEW_CARDS = [
  { src: "/cards/gold/Barney-Goal-Gold.jpg", rotate: "-rotate-6", z: "z-10", top: "top-4" },
  { src: "/cards/home/Neymar_Home.jpg", rotate: "rotate-0", z: "z-20", top: "top-0" },
  { src: "/cards/gold/Joad-Trial-Gold.jpg", rotate: "rotate-6", z: "z-10", top: "top-4" },
];

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.push("/dashboard");
  }, [status, router]);

  return (
    <main className="min-h-screen flex flex-col bg-[#0a0a0a] overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-purple-900/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] rounded-full bg-purple-800/10 blur-3xl" />
      </div>

      <div className="relative flex flex-col items-center justify-center flex-1 px-6 py-20 text-center">
        {/* Badge */}
        <div className="mb-8 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-900/40 border border-purple-700/40 text-purple-300 text-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
          Official Digital Card Collection
        </div>

        {/* Heading */}
        <h1 className="text-5xl sm:text-7xl font-bold text-white tracking-tight leading-none mb-4">
          5iveguysfc
          <br />
          <span className="bg-gradient-to-r from-purple-400 to-purple-200 bg-clip-text text-transparent">
            Trading Cards
          </span>
        </h1>

        <p className="text-zinc-400 text-lg sm:text-xl max-w-lg mt-4 mb-10 leading-relaxed">
          Support the channel. Earn points. Open packs.
          Collect all{" "}
          <span className="text-white font-medium">70+ official cards</span> — from
          common kits to legendary gold editions.
        </p>

        {/* Card preview */}
        <div className="relative h-52 w-64 mb-12">
          {PREVIEW_CARDS.map((card, i) => (
            <div
              key={i}
              className={`absolute left-1/2 -translate-x-1/2 ${card.top} ${card.rotate} ${card.z}
                w-32 h-44 rounded-xl overflow-hidden shadow-2xl
                border border-white/10`}
            >
              <Image src={card.src} alt="Preview card" fill className="object-cover" />
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={() => signIn("google")}
          disabled={status === "loading"}
          className="group flex items-center gap-3 px-8 py-4 rounded-2xl
            bg-white text-black font-semibold text-base
            hover:bg-zinc-100 active:scale-95
            transition-all duration-150 shadow-xl shadow-black/30"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Connect with YouTube
        </button>

        <p className="text-zinc-600 text-xs mt-4 max-w-xs">
          We only read your YouTube activity — likes, subscription, and comments on 5iveguysfc videos.
        </p>

        {/* Features */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-16 max-w-2xl w-full">
          {[
            { icon: "🔔", label: "Subscribe", pts: "+500 pts" },
            { icon: "👍", label: "Like videos", pts: "+10 pts each" },
            { icon: "💬", label: "Comment", pts: "+25 pts each" },
          ].map((f) => (
            <div
              key={f.label}
              className="flex flex-col items-center gap-1 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800"
            >
              <span className="text-2xl">{f.icon}</span>
              <span className="text-white text-sm font-medium">{f.label}</span>
              <span className="text-purple-400 text-xs font-semibold">{f.pts}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
