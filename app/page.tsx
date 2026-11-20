"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WORLDS } from "@/lib/worlds";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ShopBanner from "@/components/ShopBanner";

const HERO_CARDS = [
  { src: "/cards/home/Ryan_Home.jpg", cls: "left-0 top-10 -rotate-[11deg]" },
  { src: "/cards/home/Theo_Home.jpg", cls: "right-0 top-10 rotate-[11deg]" },
  { src: "/cards/home/Milo_Home.jpg", cls: "left-1/2 -translate-x-1/2 top-0 z-10" },
];

function GoogleG() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

const FEATURES = [
  {
    title: "Collect",
    text: "Get points for watching, liking and subscribing. Spend them on digital packs and build the full squad.",
    icon: "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm5 5.5 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4L12 8.5Z",
  },
  {
    title: "Play",
    text: "5IVE STREET 3v3 with a story mode, the 7v7 match sim, and live 1v1 against other fans.",
    icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13.5 3.6 2.6-1.4 4.2H9.8L8.4 10.1 12 7.5Z",
  },
  {
    title: "Fantasy",
    text: "Pick the real 5ive Guys, choose your captain before each deadline and score from their matches.",
    icon: "M8 21h8m-4-4v4m-5-17h10v5a5 5 0 0 1-10 0V4Zm10 2h2.5a1.5 1.5 0 0 1 0 3H17M7 6H4.5a1.5 1.5 0 0 0 0 3H7",
  },
];

export default function HomePage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.push("/dashboard");
  }, [status, router]);

  if (status === "loading" || status === "authenticated") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] overflow-x-hidden">
      <SiteHeader />

      {/* Hero */}
      <section className="relative">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_70%_at_75%_10%,rgba(147,51,234,0.30),transparent_70%)]" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-16 sm:pt-20 sm:pb-24 grid gap-12 md:grid-cols-[1.1fr_1fr] items-center">
          <div>
            <p className="text-purple-300 text-xs font-semibold uppercase tracking-[0.2em]">The 5ive Guys fan app</p>
            <h1 className="mt-4 text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.02]">
              Collect the squad.
              <br />
              Play the game.
              <br />
              <span className="text-purple-300">Pick your team.</span>
            </h1>
            <p className="mt-5 text-zinc-400 text-base sm:text-lg max-w-lg">
              Trading cards of the real players, the 5IVE STREET game and fantasy football, all in one place.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                className="inline-flex items-center gap-2.5 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-zinc-200 transition"
              >
                <GoogleG />
                Sign in with Google
              </button>
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white hover:bg-white/5 transition"
              >
                Shop printed packs →
              </Link>
            </div>
            <p className="mt-4 text-zinc-600 text-xs">
              Free to join. By signing in you agree to our{" "}
              <a href="/terms" className="underline hover:text-zinc-400">
                Terms
              </a>{" "}
              and{" "}
              <a href="/privacy" className="underline hover:text-zinc-400">
                Privacy Policy
              </a>
              .
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-[460px] h-[300px] sm:h-[380px]" aria-hidden>
            {HERO_CARDS.map((c) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={c.src}
                src={c.src}
                alt=""
                className={`absolute w-[46%] rounded-xl shadow-2xl shadow-black/70 ring-1 ring-white/10 ${c.cls}`}
              />
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-6 sm:space-y-8">
        <ShopBanner />

        {/* 5IVE STREET: a static page (public/street), so plain links rather than <Link>. */}
        <section className="group relative overflow-hidden rounded-3xl border border-white/[0.07] bg-zinc-950">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/street-squad.jpg"
            alt="The 5ive Guys squad lined up in 5IVE STREET"
            className="absolute inset-0 w-full h-full object-cover opacity-70 transition-transform duration-700 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/80 to-zinc-950/10" />
          <div className="relative p-6 sm:p-10 max-w-xl">
            <span className="inline-flex rounded-full bg-emerald-400/15 border border-emerald-300/30 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-200">
              Free to play · no account needed
            </span>
            <h2 className="mt-4 text-3xl sm:text-5xl font-extrabold italic tracking-tight text-white">
              5IVE STREET <span className="text-purple-300">3v3</span>
            </h2>
            <p className="mt-3 text-zinc-300 text-sm sm:text-base">
              Street football in a cage with the 5ive Guys squad. In story mode you&apos;re Oscar, player-manager, taking
              Five Guys FC from the Division 4 car park to the Golden Cage.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a href="/street" className="rounded-xl bg-purple-600 px-5 py-3 text-sm font-bold text-white hover:bg-purple-500 transition">
                Play now →
              </a>
              <a
                href="/street?story"
                className="rounded-xl border border-white/20 bg-black/30 px-5 py-3 text-sm font-bold text-white hover:bg-white/10 transition"
              >
                Story mode
              </a>
            </div>
            <p className="mt-3 text-zinc-500 text-xs">Best on a phone held sideways, or with a keyboard.</p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-3xl border border-white/[0.07] bg-zinc-900/50 p-6">
              <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-400/20 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-purple-300" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={f.icon} />
                </svg>
              </div>
              <h3 className="mt-4 text-white text-lg font-bold">{f.title}</h3>
              <p className="mt-1.5 text-zinc-400 text-sm leading-relaxed">{f.text}</p>
            </div>
          ))}
        </section>

        {/* The two teams' worlds */}
        <section className="rounded-3xl border border-white/[0.07] bg-[radial-gradient(80%_120%_at_0%_0%,rgba(147,51,234,0.22),transparent_60%)] bg-zinc-950 p-6 sm:p-10">
          <div className="sm:flex sm:items-end sm:justify-between gap-6">
            <div>
              <p className="text-purple-300 text-xs font-semibold uppercase tracking-[0.2em]">The 5ive Verse</p>
              <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">Pick your team&apos;s world</h2>
              <p className="mt-2 text-zinc-400 text-sm">See the squad, the fans and the cards for each channel.</p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {WORLDS.map((w) => (
              <Link
                key={w.slug}
                href={`/${w.slug}`}
                className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-4 transition hover:border-purple-400/50 hover:bg-purple-500/10"
              >
                <span className="text-lg font-bold text-white">{w.name}</span>
                <span className="text-purple-300 text-sm transition-transform group-hover:translate-x-1">Enter →</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-20">
        <SiteFooter />
      </div>
    </main>
  );
}
