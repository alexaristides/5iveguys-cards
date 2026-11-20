import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ShopClient from "@/components/ShopClient";
import { PRINT_SHOP, deliveryPromise, formatPounds, isFirstEdition } from "@/lib/print-shop";
import { shopOpen } from "@/lib/print-shop-db";

export const dynamic = "force-dynamic";

const description = `Printed 1st Edition 5ive Guys trading card packs. ${formatPounds(PRINT_SHOP.packPence)} a pack, any ${PRINT_SHOP.bundle.size} for ${formatPounds(PRINT_SHOP.bundle.pence)}, posted from the UK.`;

export const metadata: Metadata = {
  title: "Shop 1st Edition card packs",
  description,
  openGraph: { title: "5iveG 1st Edition trading card packs", description },
};

export default function ShopPage() {
  const now = new Date();
  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-purple-900/20 blur-3xl" />
      </div>

      <SiteHeader />

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

      </div>
      <SiteFooter />
    </main>
  );
}
