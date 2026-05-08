import Link from "next/link";

export const metadata = { title: "Privacy Policy — 5iveguysfc Trading Cards" };

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-8 text-zinc-400 text-sm leading-relaxed">
        <div>
          <Link href="/" className="text-zinc-600 text-xs hover:text-zinc-400 transition-colors">← Back</Link>
          <h1 className="text-white text-3xl font-bold mt-4">Privacy Policy</h1>
          <p className="text-zinc-600 text-xs mt-1">Last updated: May 2025</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">Overview</h2>
          <p>
            5iveguysfc Trading Cards (&ldquo;the App&rdquo;) is a fan-made digital card collection game.
            By signing in with Google you allow the App to read limited data from your Google and YouTube
            accounts solely to calculate points. We do not sell, share, or monetise your data.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">Data we collect</h2>
          <ul className="space-y-2 list-disc list-inside">
            <li><span className="text-white font-medium">Google account info</span> — your name, email address, and profile picture, used to identify your account and display your name on the leaderboard.</li>
            <li><span className="text-white font-medium">YouTube subscription status</span> — whether you are subscribed to the 5iveguysfc channel, to award subscription points.</li>
            <li><span className="text-white font-medium">YouTube video ratings</span> — which 5iveguysfc videos you have liked, to award like points.</li>
          </ul>
          <p>We do not access your YouTube watch history, private videos, playlists, or any data unrelated to the 5iveguysfc channel.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">How we use your data</h2>
          <ul className="space-y-2 list-disc list-inside">
            <li>Awarding points for subscribing to and liking videos on the 5iveguysfc channel.</li>
            <li>Displaying your name, avatar, and points on the fan leaderboard.</li>
            <li>Associating your card collection with your account.</li>
          </ul>
          <p>Your data is never used for advertising, sold to third parties, or shared outside the App.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">OAuth scopes used</h2>
          <ul className="space-y-2 list-disc list-inside">
            <li><code className="text-purple-400 text-xs">openid</code>, <code className="text-purple-400 text-xs">email</code>, <code className="text-purple-400 text-xs">profile</code> — basic Google identity.</li>
            <li><code className="text-purple-400 text-xs">https://www.googleapis.com/auth/youtube.force-ssl</code> — read-only access to your YouTube subscription status and video ratings for 5iveguysfc content.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">Data retention and deletion</h2>
          <p>
            Your account data is stored for as long as you use the App. You can request deletion of your
            account and all associated data at any time by contacting us at the address below. Revoking
            access via your{" "}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-purple-400 underline hover:text-purple-300">
              Google account permissions
            </a>{" "}
            page will prevent further syncing.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">Security</h2>
          <p>
            OAuth tokens are stored securely in our database and used only to sync your YouTube activity
            on your request. We do not store your Google password.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">Contact</h2>
          <p>
            For questions or data deletion requests, contact us via the 5iveguysfc YouTube channel.
          </p>
        </section>

        <p className="text-zinc-700 text-xs pt-4 border-t border-zinc-900">
          5iveguysfc Trading Cards is an independent fan project and is not affiliated with, endorsed by,
          or sponsored by YouTube, Google LLC, or any related entities.
        </p>
      </div>
    </main>
  );
}
