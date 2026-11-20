import Link from "next/link";
import SupportForm from "@/components/SupportForm";
import { PRINT_SHOP, SUPPORT_EMAIL } from "@/lib/print-shop";

export const metadata = { title: "Support — 5iveG" };

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "When will my printed packs arrive?",
    a: (
      <>
        Orders placed before {PRINT_SHOP.printStarts} are 1st Edition: we start printing on {PRINT_SHOP.printStarts} and aim to
        post them by {PRINT_SHOP.postBy}. Later orders go into the next print run. Any problem with an order? Email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-purple-400 underline hover:text-purple-300">
          {SUPPORT_EMAIL}
        </a>{" "}
        with your order number.
      </>
    ),
  },
  {
    q: "How do I sign in?",
    a: "Use Sign in with Google on the website. In the iPhone app you can also use Sign in with Apple.",
  },
  {
    q: "How do I get points?",
    a: "You get points for being a fan. Sign in and connect your YouTube account, and they add up on their own.",
  },
  {
    q: "I signed in with Apple. How do I connect YouTube?",
    a: (
      <>
        Tap <span className="text-white">Connect YouTube</span> on the YouTube tab in the app. If that Google account
        already has its own 5iveG profile, sign out and use Sign in with Google instead.
      </>
    ),
  },
  {
    q: "How does Fantasy work?",
    a: (
      <>
        Pick any 7 players from the squad and put them in any position (there are no prices), choose a captain, and score points from their real matches.
        The full rules are on the{" "}
        <a href="/fantasy" className="text-purple-400 underline hover:text-purple-300">
          Fantasy page
        </a>
        .
      </>
    ),
  },
  {
    q: "How do I delete my account?",
    a: (
      <>
        In the iPhone app, open <span className="text-white">Settings → Delete account</span>. This permanently deletes
        your account, points, cards, fantasy team and match history. You can also ask us below, from the email address
        on your account, and we&rsquo;ll delete it for you.
      </>
    ),
  },
];

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-8 text-zinc-400 text-sm leading-relaxed">
        <div>
          <Link href="/" className="text-zinc-600 text-xs hover:text-zinc-400 transition-colors">
            ← Back
          </Link>
          <h1 className="text-white text-3xl font-bold mt-4">Support</h1>
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
          . 5iveG is an independent fan project and is not affiliated with, endorsed by, or sponsored by YouTube or
          Google LLC.
        </p>
      </div>
    </main>
  );
}
