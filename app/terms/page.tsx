import Link from "next/link";

export const metadata = { title: "Terms of Service — 5iveG" };

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-8 text-zinc-400 text-sm leading-relaxed">
        <div>
          <Link href="/" className="text-zinc-600 text-xs hover:text-zinc-400 transition-colors">← Back</Link>
          <h1 className="text-white text-3xl font-bold mt-4">Terms of Service</h1>
          <p className="text-zinc-600 text-xs mt-1">Last updated: November 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">Acceptance</h2>
          <p>
            By accessing or using 5iveG (&ldquo;the App&rdquo;), you agree to these Terms.
            If you do not agree, do not use the App.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">The App</h2>
          <p>
            The App is a free, fan-made app for the 5ive Guys and Other Guys YouTube channels. Points, cards and
            fantasy scores have no real-world monetary value and cannot be exchanged for cash or prizes.
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
          <h2 className="text-white font-semibold text-base">Points and cards</h2>
          <p>
            You get points for being a fan. We reserve the right to adjust point values, add or remove card
            types, or change how points work at any time without notice.
          </p>
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
          5iveG is an independent fan project and is not affiliated with, endorsed by, or sponsored by
          YouTube, Google LLC, Apple Inc., or any related entities.
        </p>
      </div>
    </main>
  );
}
