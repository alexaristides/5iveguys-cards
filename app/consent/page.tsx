import type { Metadata } from "next";
import Link from "next/link";
import ConsentForm from "@/components/ConsentForm";
import { WORLDS } from "@/lib/worlds";

export const metadata: Metadata = {
  title: "Player consent",
  description: "Say yes to 5iveG cards with your face on, and tell us where to pay your share of every pack sold.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Your face on 5iveG cards",
    description: "Say yes to 5iveG cards with your face on, and tell us where to pay your share of every pack sold.",
  },
};

/**
 * The link sent to squad players: /consent, or /consent?team=OGFC&player=Ramin to open on one
 * player. The signed form is emailed to the club (see app/api/consent/route.ts).
 */
export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ team?: string; player?: string }> }) {
  const { team, player } = await searchParams;
  return (
    <main className="min-h-screen bg-[#0a0a0a] px-5 py-12 sm:py-16">
      <div className="max-w-xl mx-auto space-y-8 text-zinc-400 text-sm leading-relaxed">
        <header className="space-y-3">
          <p className="text-purple-400 text-xs font-semibold tracking-[0.2em] uppercase">5iveG · Player consent</p>
          <h1 className="text-white text-3xl font-bold leading-tight">Your face on 5iveG cards</h1>
          <p>
            We&rsquo;d like to sell 5iveG trading cards and packs with you on them, in the app and as printed cards, and
            pay you a share of every pack sold with your name on it.
          </p>
          <p>Fill this in to give your permission and tell us where to send your money. It takes about two minutes.</p>
        </header>
        <ConsentForm worlds={WORLDS.map((w) => ({ slug: w.slug, name: w.name }))} initialTeam={team ?? null} initialPlayer={player ?? null} />
        <p className="text-zinc-700 text-xs pt-4 border-t border-zinc-900">
          Your details go straight to the 5iveG team by email and are used only to pay you and keep a record of this
          agreement. Questions?{" "}
          <Link href="/support" className="underline hover:text-zinc-500">
            Contact us
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
