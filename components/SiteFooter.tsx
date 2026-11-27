import Link from "next/link";
import { Logo } from "./Logo";
import { SELLER, SUPPORT_EMAIL } from "@/lib/print-shop";

const COLUMNS: { title: string; links: { href: string; label: string; plain?: boolean }[] }[] = [
  {
    title: "Play",
    links: [
      { href: "/fantasy", label: "Fantasy" },
      { href: "/extras", label: "Extras" },
      { href: "/street", label: "5IVE STREET", plain: true },
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

/** The site's footer on the public and Extras pages: sections, help, legal and who runs it. `light` for bright pages. */
export default function SiteFooter({ light }: { light?: boolean }) {
  const link = light ? "text-ink-3 hover:text-violet-700 transition-colors" : "text-zinc-500 hover:text-white transition-colors";
  return (
    <footer className={`border-t ${light ? "border-lilac-line bg-white" : "border-white/[0.06] bg-[#0a0a0a]"}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid gap-10 md:grid-cols-[2fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo className="h-7" ink={light} />
          <p className={`${light ? "text-ink-3" : "text-zinc-500"} text-sm leading-relaxed max-w-xs`}>
            The fantasy football app for the 5ive Guys YouTube channel, plus trading cards and the 5IVE STREET game.
          </p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <p className={`${light ? "text-ink-2" : "text-zinc-300"} text-xs font-semibold uppercase tracking-[0.14em] mb-3`}>{c.title}</p>
            <ul className="space-y-2 text-sm">
              {c.links.map((l) => (
                <li key={l.href}>
                  {l.plain ? (
                    <a href={l.href} className={link}>
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className={link}>
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className={`border-t ${light ? "border-lilac-line" : "border-white/[0.04]"}`}>
        <div className={`max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row gap-2 sm:justify-between text-xs ${light ? "text-ink-3" : "text-zinc-600"}`}>
          <p>
            © {new Date().getFullYear()} {SELLER}.
          </p>
          <p>
            <Link href="/artist" className={light ? "hover:text-ink-2" : "hover:text-zinc-400"}>
              Card artwork by Merle
            </Link>{" "}
            · Not affiliated with YouTube or Google.
          </p>
        </div>
      </div>
    </footer>
  );
}
