import Link from "next/link";
import { panel, SectionTitle } from "@/components/AppShell";
import { STEPS } from "@/components/fantasy/steps";

/**
 * The whole game in four steps, as in the app (mobile/src/components/fantasy/HowItWorks.tsx).
 * `title` adds a heading (with a link to the rules unless `hideLink`); null leaves it out.
 */
export function HowItWorks({ title = "How it works", hideLink }: { title?: string | null; hideLink?: boolean }) {
  return (
    <>
      {title !== null && (
        <SectionTitle
          right={hideLink ? null : (
            <Link href="/how-to-play" className="text-violet-600 hover:text-violet-700 text-[15px] font-extrabold">All the rules</Link>
          )}
        >
          {title}
        </SectionTitle>
      )}
      <div className={`${panel} flex flex-col gap-3.5`}>
        {STEPS.map((s, i) => (
          <div key={s.title} className="flex items-center gap-3.5">
            <span className="w-[46px] h-[46px] shrink-0 rounded-full bg-violet-100 flex items-center justify-center text-[22px]" aria-hidden>
              {s.emoji}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-ink text-base leading-tight font-black">{i + 1}. {s.title}</div>
              <div className="text-ink-2 text-sm leading-[19px] mt-px">{s.body}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
