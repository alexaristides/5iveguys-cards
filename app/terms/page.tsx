import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { DELIVERY, PRINT_SHOP, REFUND_POLICY, SELLER, SUPPORT_EMAIL, formatPounds } from "@/lib/print-shop";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      <SiteHeader />
      <div className="px-6 py-12 sm:py-16">
      <div className="max-w-2xl mx-auto space-y-8 text-zinc-400 text-sm leading-relaxed">
        <div>
          <h1 className="text-white text-3xl font-bold">Terms of Service</h1>
          <p className="text-zinc-600 text-xs mt-1">Last updated: November 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">Acceptance</h2>
          <p>
            By accessing or using 5iveG (&ldquo;the App&rdquo;, on the web and on iPhone), you agree to these Terms.
            If you do not agree, do not use the App.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">The App</h2>
          <p>
            The App is the free fantasy football app for the 5ive Guys YouTube channel. In the iPhone app you pick a
            fantasy team from the 5ive Guys squad, rate the players, vote for Man of the Match and play in private
            leagues with your friends; fantasy football and player ratings are on the website too. The iPhone app has
            no in-app purchases.
          </p>
          <p>
            The website also has trading cards and points for the 5ive Guys and Other Guys YouTube channels, the
            5IVE STREET game, and printed card packs sold in the website shop (below).
          </p>
          <p>
            Fantasy football is free to play and has no prizes. Points, cards and fantasy scores have no real-world
            monetary value and cannot be exchanged for cash or prizes.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">Your account</h2>
          <ul className="space-y-2 list-disc list-inside">
            <li>You sign in with a Google account or, on iPhone, with Sign in with Apple.</li>
            <li>You are responsible for activity on your account.</li>
            <li>We reserve the right to suspend accounts found to be abusing the points system.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">Points and cards (website)</h2>
          <p>
            On the website you get points for being a fan. We reserve the right to adjust point values, add or remove
            card types, or change how points work at any time without notice.
          </p>
          <p>
            Cards are just for fun: they cannot be sold, transferred or exchanged for money. If you delete your
            account, your points and cards are deleted too and cannot be restored.
          </p>
        </section>

        <section id="shop" className="space-y-3 scroll-mt-6">
          <h2 className="text-white font-semibold text-base">Printed card packs (the website shop)</h2>
          <ul className="space-y-2 list-disc list-inside">
            <li>
              Printed packs are sold by {SELLER}. Questions about an order:{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-purple-400 underline hover:text-purple-300">{SUPPORT_EMAIL}</a>.
            </li>
            <li>
              Every pack has {PRINT_SHOP.cardCount} printed cards. A player pack has at least one card of that player and the rest
              drawn at random from the 5ive Guys squad; a squad pack is all random. Which cards you get is down to luck, and
              you may get duplicates.
            </li>
            <li>
              Packs are {formatPounds(PRINT_SHOP.packPence)} each, and any {PRINT_SHOP.bundle.size} are{" "}
              {formatPounds(PRINT_SHOP.bundle.pence)} (taken off at checkout). Prices are in pounds sterling. Payment is taken
              by Stripe when you order.
            </li>
            <li>
              Delivery is {formatPounds(DELIVERY.uk.pence)} to UK addresses (including the Isle of Man and the Channel Islands)
              and {formatPounds(DELIVERY.world.pence)} everywhere else. Parcels are posted from the UK; any import charges
              abroad are paid by the buyer.
            </li>
            <li>
              Orders placed before {PRINT_SHOP.printStarts} 2026 are 1st Edition. We start printing on {PRINT_SHOP.printStarts}{" "}
              and aim to post them by {PRINT_SHOP.postBy}. Later orders go into the next print run, and we&rsquo;ll email you
              when they&rsquo;re on their way.
            </li>
            <li>
              {REFUND_POLICY} If your order arrives damaged or something is missing, email us within 14 days of delivery,
              with a photo, and we&rsquo;ll put it right.
            </li>
            <li>Make sure your delivery address is right at checkout: we post to the address you give.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">Intellectual property</h2>
          <p>
            Card artwork and player likenesses are used for fan purposes only. All YouTube and Google
            trademarks belong to their respective owners. This App is not affiliated with or endorsed by
            YouTube, Google LLC, or any player featured in the cards.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">Disclaimer</h2>
          <p>
            The App is provided &ldquo;as is&rdquo; without warranties of any kind. We are not liable for
            any loss of points, cards, or account data. The App may be discontinued at any time.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">Changes</h2>
          <p>
            We may update these Terms at any time. Continued use of the App after changes constitutes
            acceptance of the revised Terms.
          </p>
        </section>

        <p className="text-zinc-700 text-xs pt-4 border-t border-zinc-900">
          5iveG is not affiliated with, endorsed by, or sponsored by YouTube, Google LLC, Apple Inc., or any
          related entities.
        </p>
      </div>
      </div>
      <SiteFooter />
    </main>
  );
}
