"use client";

import type { ReactNode } from "react";
import { card, panel, SectionTitle } from "@/components/AppShell";
import { FANTASY_RULES } from "@/lib/fantasy";
import { fantasyGuide } from "@/lib/fantasy-guide";

/** The whole game in four steps, as in the app. */
export const STEPS = [
  { emoji: "👕", title: `Pick ${FANTASY_RULES.squadSize} players`, body: FANTASY_RULES.prices ? "Any of the 5ive Guys, within your budget." : "Any of the 5ive Guys. No prices, no budget." },
  { emoji: "⭐", title: "Choose a captain", body: "Your captain scores double points." },
  { emoji: "⚽", title: "Score points", body: "Goals, assists, clean sheets and more, from their real matches." },
  { emoji: "🏆", title: "Beat your mates", body: "Start a league and share the code." },
];

export function Steps() {
  return (
    <div className={`${panel} grid sm:grid-cols-2 gap-4`}>
      {STEPS.map((s, i) => (
        <div key={s.title} className="flex items-center gap-3.5">
          <span className="w-[46px] h-[46px] shrink-0 rounded-full bg-violet-100 flex items-center justify-center text-[22px]" aria-hidden>{s.emoji}</span>
          <div>
            <div className="text-ink font-black">{i + 1}. {s.title}</div>
            <div className="text-ink-2 text-sm">{s.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** The How to play tab: the steps, the scoring table, the details and the chips. */
export function HowToPlay({ budget, secondHalfFrom }: { budget: number; secondHalfFrom: number | null }) {
  const guide = fantasyGuide({ budget, secondHalfFrom });
  const chips = guide.sections.find((s) => s.title === "Chips");
  return (
    <>
      <Steps />

      <SectionTitle>Scoring</SectionTitle>
      <p className="text-ink-2">Your players score from what they do in each real match.</p>
      <div className={`${card} px-4 sm:px-5 py-1`}>
        <table className="w-full">
          <tbody>
            {guide.scoring.map((s, i) => (
              <tr key={s.label} className={i ? "border-t border-lilac-line" : ""}>
                <td className="py-2.5 pr-3 text-ink font-semibold">{s.label}</td>
                <td className={`py-2.5 text-right font-black ${s.points.startsWith("−") || s.points.startsWith("-") ? "text-red-600" : "text-green-600"}`}>{s.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle>The details</SectionTitle>
      <div className="grid sm:grid-cols-2 gap-2.5">
        {guide.sections.filter((s) => s !== chips).map((s) => (
          <Detail key={s.title} title={s.title}>{s.body}</Detail>
        ))}
      </div>

      {chips && (
        <>
          <SectionTitle>Chips</SectionTitle>
          <p className="text-ink-2">Optional power-ups. {chips.body}</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {guide.chips.map((c) => (
              <div key={c.id} className={`${panel} flex items-center gap-3.5`}>
                <span className="text-[28px]" aria-hidden>{c.emoji}</span>
                <div>
                  <div className="text-ink font-black">{c.name}</div>
                  <div className="text-ink-2 text-sm">{c.description}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Detail({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={`${panel} space-y-1`}>
      <h3 className="text-ink font-black">{title}</h3>
      <p className="text-ink-2 text-sm leading-relaxed">{children}</p>
    </div>
  );
}
