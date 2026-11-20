import type { Metadata } from "next";
import Link from "next/link";
import ShopClient from "@/components/ShopClient";
import { PRINT_SHOP, SELLER, SUPPORT_EMAIL, deliveryPromise, formatPounds, isFirstEdition } from "@/lib/print-shop";
import { shopOpen } from "@/lib/print-shop-db";

export const dynamic = "force-dynamic";

const description = `Printed 1st Edition 5ive Guys trading card packs. ${formatPounds(PRINT_SHOP.packPence)} a pack, any ${PRINT_SHOP.bundle.size} for ${formatPounds(PRINT_SHOP.bundle.pence)}, posted from the UK.`;

export const metadata: Metadata = {
  title: "Shop — 5iveG trading card packs",
  description,
  openGraph: { title: "5iveG 1st Edition trading card packs", description, images: ["/shop/packs/Squad.jpg"] },
};

export default function ShopPage() {
  const now = new Date();
  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-purple-900/20 blur-3xl" />
      </div>

      <header className="relative border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm font-bold">5</span>
            <span className="text-white font-semibold text-sm">5iveG</span>
          </Link>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-zinc-500 hover:text-zinc-300 text-xs">
            Help: {SUPPORT_EMAIL}
          </a>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-4 py-8 sm:py-12 space-y-6 sm:space-y-8">
        <div className="space-y-2">
          <p className="text-purple-400 text-xs font-semibold tracking-[0.2em] uppercase">Printed trading cards</p>
          <h1 className="text-white text-3xl sm:text-5xl font-bold tracking-tight">The 1st Edition packs</h1>
          <p className="text-zinc-400 max-w-2xl">
            Real cards of the 5ive Guys squad, printed and posted to your door. Rip a squad pack for a random pull, or
            pick a player&rsquo;s pack to guarantee their card.
          </p>
        </div>

        <ShopClient open={shopOpen()} firstEdition={isFirstEdition(now)} promise={deliveryPromise(now)} />

        <footer className="text-zinc-600 text-xs leading-relaxed border-t border-zinc-900 pt-6 space-y-1">
          <p>
            Sold by {SELLER}. Questions about an order? Email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline hover:text-zinc-400">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
          <p>
            <a href="/terms#shop" className="underline hover:text-zinc-400">
              Terms and delivery
            </a>{" "}
            ·{" "}
            <a href="/privacy" className="underline hover:text-zinc-400">
              Privacy
            </a>{" "}
            ·{" "}
            <a href="/support" className="underline hover:text-zinc-400">
              Support
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
