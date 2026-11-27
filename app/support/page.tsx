import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SupportForm from "@/components/SupportForm";
import { SUPPORT_EMAIL } from "@/lib/print-shop";

export const metadata = { title: "Support" };

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "How do I sign in?",
    a: "Use Sign in with Google on the website. In the iPhone app you can also use Sign in with Apple.",
  },
  {
    q: "How do I get points?",
    a: "Points are on the website, not in the iPhone app. You get points for being a fan: sign in on the website, open Extras from the menu, connect your YouTube account, and they add up on their own.",
  },
  {
    q: "How do I vote for Man of the Match?",
    a: "In the iPhone app or on the website, open the MOTM tab, pick a 5ive Guys video and tap the player you think was best. You can change your vote whenever you like.",
  },
  {
    q: "How does Fantasy work?",
    a: (
      <>
        Pick any 7 players from the squad (there are no prices), choose a captain, and score points from our real matches.
        The full rules are on the{" "}
        <a href="/how-to-play" className="text-purple-400 underline hover:text-purple-300">
          How to play tab
        </a>
        .
      </>
    ),
  },
  {
    q: "How do I delete my account?",
    a: (
      <>
        In the iPhone app, open <span className="text-white">Settings → Delete account</span>; on the website, open the menu and tap <span className="text-white">Delete account</span>. This permanently deletes
        your account, points, cards, fantasy team and match history. You can also ask us below, from the email address
        on your account, and we&rsquo;ll delete it for you.
      </>
    ),
  },
];

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      <SiteHeader />
      <div className="px-6 py-12 sm:py-16">
      <div className="max-w-2xl mx-auto space-y-8 text-zinc-400 text-sm leading-relaxed">
        <div>
          <h1 className="text-white text-3xl font-bold">Support</h1>
          <p className="mt-2">Help with the 5iveG app and website. Can&rsquo;t find your answer? Send us a message.</p>
        </div>

        <section className="space-y-5">
          {FAQ.map(({ q, a }) => (
            <div key={q} className="space-y-1">
              <h2 className="text-white font-semibold text-base">{q}</h2>
              <p>{a}</p>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="text-white font-semibold text-base">Contact us</h2>
          <p>
            Email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-purple-400 underline hover:text-purple-300">
              {SUPPORT_EMAIL}
            </a>{" "}
            or send us a message here.
          </p>
          <SupportForm />
        </section>

        <p className="text-zinc-700 text-xs pt-4 border-t border-zinc-900">
          <a href="/privacy" className="underline hover:text-zinc-500">
            Privacy Policy
          </a>{" "}
          ·{" "}
          <a href="/terms" className="underline hover:text-zinc-500">
            Terms of Service
          </a>
          . 5iveG is not affiliated with, endorsed by, or sponsored by YouTube or Google LLC.
        </p>
      </div>
      </div>
      <SiteFooter />
    </main>
  );
}
