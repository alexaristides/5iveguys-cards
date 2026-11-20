import Link from "next/link";
import { Logo } from "./Logo";
import { SELLER, SUPPORT_EMAIL } from "@/lib/print-shop";

const COLUMNS: { title: string; links: { href: string; label: string; plain?: boolean }[] }[] = [
  {
    title: "Shop",
    links: [
      { href: "/shop", label: "1st Edition packs" },
      { href: "/terms#shop", label: "Delivery and refunds" },
    ],
  },
  {
    title: "Play",
    links: [
      { href: "/street", label: "5IVE STREET", plain: true },
      { href: "/game", label: "All games" },
      { href: "/fantasy", label: "Fantasy" },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/support", label: "Support" },
      { href: `mailto:${SUPPORT_EMAIL}`, label: SUPPORT_EMAIL, plain: true },
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
];

/** The site's footer: sections, help, legal and who runs it. */
export default function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#0a0a0a]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo className="h-7" />
          <p className="text-zinc-500 text-sm leading-relaxed max-w-xs">
            The fan app for 5ive Guys: printed trading cards, the 5IVE STREET game and fantasy football.
          </p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <p className="text-zinc-300 text-xs font-semibold uppercase tracking-[0.14em] mb-3">{c.title}</p>
            <ul className="space-y-2 text-sm">
              {c.links.map((l) => (
                <li key={l.href}>
                  {l.plain ? (
                    <a href={l.href} className="text-zinc-500 hover:text-white transition-colors">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="text-zinc-500 hover:text-white transition-colors">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row gap-2 sm:justify-between text-xs text-zinc-600">
          <p>
            © {new Date().getFullYear()} {SELLER}.
          </p>
          <p>
            <Link href="/artist" className="hover:text-zinc-400">
              Card artwork by Merle
            </Link>{" "}
            · Not affiliated with YouTube or Google.
          </p>
        </div>
      </div>
    </footer>
  );
}
