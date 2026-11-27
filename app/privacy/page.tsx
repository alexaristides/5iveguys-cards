import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      <SiteHeader />
      <div className="px-6 py-12 sm:py-16">
      <div className="max-w-2xl mx-auto space-y-8 text-zinc-400 text-sm leading-relaxed">
        <div>
          <h1 className="text-white text-3xl font-bold">Privacy Policy</h1>
          <p className="text-zinc-600 text-xs mt-1">Last updated: November 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">Overview</h2>
          <p>
            5iveG (&ldquo;the App&rdquo;, on the web and on iPhone) is the fantasy football app for the 5ive Guys
            YouTube channel. In the iPhone app and on the website you run a fantasy team, rate the players and vote for Man of the Match.
            The website also has trading cards, points for fans of the 5ive Guys and Other Guys YouTube channels, and
            games. We only use your data to run the App. We do not sell, share, or monetise it.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">Data we collect</h2>
          <ul className="space-y-2 list-disc list-inside">
            <li><span className="text-white font-medium">Account info</span> — your name, email address and profile picture from Google, or the name and email (which may be an Apple private relay address) from Sign in with Apple. Used to identify your account and show your name on leaderboards and in fantasy leagues.</li>
            <li><span className="text-white font-medium">YouTube channel activity</span> — website only. Connecting YouTube for points on the website (in Extras) asks for access to your YouTube account, so we can see whether you subscribe to the channels on the site and which of their videos you have rated. Used to show your fan activity and work out your fan points. Signing in with Google, in the iPhone app or on the website, asks only for your name, email and profile picture, not your YouTube account.</li>
            <li><span className="text-white font-medium">Activity in the App</span> — your fantasy team, transfers and leagues, player ratings and Man of the Match votes; on the website also your points, cards, game results, and time spent watching channel videos in the website&rsquo;s video player.</li>
            <li><span className="text-white font-medium">Shop orders</span> — when you buy printed card packs on the website: your name, email, delivery address, the packs you bought and what you paid. Stripe takes the payment; we never see your card details.</li>
            <li><span className="text-white font-medium">Support messages</span> — the name, email and message you send through the support form, so we can reply.</li>
          </ul>
          <p>We do not access your YouTube watch history, private videos, playlists, or any data unrelated to the channels in the App.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">How we use your data</h2>
          <ul className="space-y-2 list-disc list-inside">
            <li>Running your account: your fantasy team and leagues, ratings and Man of the Match votes, and on the website your points, cards and games.</li>
            <li>Posting the printed packs you buy from the website shop, and paying each player their share of their packs.</li>
            <li>Showing your name, avatar and points on fan leaderboards, and your name, avatar and team in fantasy league tables.</li>
            <li>Replying to support requests.</li>
          </ul>
          <p>
            Your data is never used for advertising or sold to third parties. It&rsquo;s only shared with the services that run
            the shop: Stripe, which takes the payment, and the postal service, which needs your address on the parcel.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">Google OAuth scopes used</h2>
          <ul className="space-y-2 list-disc list-inside">
            <li><code className="text-purple-400 text-xs">openid</code>, <code className="text-purple-400 text-xs">email</code>, <code className="text-purple-400 text-xs">profile</code> — basic Google identity. This is all the iPhone app asks for.</li>
            <li><code className="text-purple-400 text-xs">https://www.googleapis.com/auth/youtube.force-ssl</code> — asked for only when you connect YouTube for points on the website, and used only to read your subscription status and video ratings for the channels on the site. We never post, comment, rate or subscribe on your behalf.</li>
          </ul>
          <p>
            The App&rsquo;s use of information received from Google APIs adheres to the{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-purple-400 underline hover:text-purple-300">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">Data retention and deletion</h2>
          <p>
            Your data is kept for as long as you have an account. In the iPhone app (Settings) or on the website (the menu), Delete account
            permanently deletes your account and everything linked to it, and revokes the App&rsquo;s access to your
            Google and Apple accounts. Printed pack orders are kept for six years, as UK accounting
            rules require. You can also ask us to delete it through the{" "}
            <a href="/support" className="text-purple-400 underline hover:text-purple-300">support page</a>. You can
            remove the App&rsquo;s YouTube access at any time from your{" "}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-purple-400 underline hover:text-purple-300">
              Google account permissions
            </a>{" "}
            page.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">Security</h2>
          <p>
            Sign-in tokens are stored securely in our database and used only to run the App. We never see or store
            your Google or Apple password.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">Contact</h2>
          <p>
            Email{" "}
            <a href="mailto:support@5iveg.com" className="text-purple-400 underline hover:text-purple-300">support@5iveg.com</a>, or for
            questions or data deletion requests you can also use the{" "}
            <a href="/support" className="text-purple-400 underline hover:text-purple-300">support page</a>.
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
