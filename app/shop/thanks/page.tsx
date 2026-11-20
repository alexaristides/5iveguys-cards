import type { Metadata } from "next";
import Link from "next/link";
import ClearCart from "@/components/ClearCart";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { PRINT_SHOP, SUPPORT_EMAIL, formatPounds, packById, packImage } from "@/lib/print-shop";
import { addressLines, recordCheckout } from "@/lib/print-shop-db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Thanks for your order", robots: { index: false } };

/** Where Stripe sends the buyer after paying. Records the order (if the webhook hasn't) and shows it. */
export default async function ThanksPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id } = await searchParams;
  const result = session_id?.startsWith("cs_") ? await recordCheckout(session_id).catch(() => null) : null;
  const order = result?.order;

  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      <SiteHeader />
      <div className="px-4 py-14">
      <div className="max-w-md mx-auto text-center space-y-6 text-zinc-400 text-sm leading-relaxed">
        {order ? (
          <>
            <ClearCart />
            <div className="flex justify-center -space-x-6">
              {order.items.slice(0, 4).map((i) => (
                <img key={i.packId} src={packImage(i.packId)} alt="" className="w-20 rounded-lg shadow-xl shadow-black/60 ring-1 ring-black" />
              ))}
            </div>
            <div className="space-y-2">
              <h1 className="text-white text-3xl font-bold">Thanks{order.customerName ? `, ${order.customerName.split(" ")[0]}` : ""}!</h1>
              <p>
                Order #{order.number} is in: {order.packCount} pack{order.packCount === 1 ? "" : "s"}, {formatPounds(order.totalPence)} paid.
              </p>
            </div>
            <ul className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 text-left space-y-1">
              {order.items.map((i) => (
                <li key={i.packId} className="flex justify-between text-zinc-300">
                  <span>{packById(i.packId)?.title ?? i.packId}</span>
                  <span className="tabular-nums">× {i.qty}</span>
                </li>
              ))}
              {order.address && (
                <li className="pt-2 mt-2 border-t border-zinc-800 text-zinc-500 text-xs">
                  Posting to {order.shippingName}, {addressLines(order.address).join(", ")}
                </li>
              )}
            </ul>
            <p className={order.firstEdition ? "text-amber-200" : ""}>
              {order.firstEdition
                ? `Your cards are 1st Edition. We start printing on ${PRINT_SHOP.printStarts} and will post your packs by ${PRINT_SHOP.postBy}.`
                : "Your packs are in our next print run. We'll email you when they're on their way."}
            </p>
            <p>A receipt is on its way to {order.email ?? "your email"}.</p>
          </>
        ) : (
          <>
            <h1 className="text-white text-2xl font-bold">Thanks for your order</h1>
            <p>
              We&rsquo;re just confirming your payment. If it went through you&rsquo;ll get a receipt by email shortly, and we&rsquo;ll be in
              touch when your packs are posted.
            </p>
          </>
        )}
        <p className="text-xs">
          Questions? Email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline hover:text-zinc-300">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
        <Link href="/shop" className="inline-block text-purple-400 hover:text-purple-300 text-sm">
          ← Back to the shop
        </Link>
      </div>
      </div>
      <SiteFooter />
    </main>
  );
}
