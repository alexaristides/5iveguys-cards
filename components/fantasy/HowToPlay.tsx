"use client";

import { card, panel, SectionTitle } from "@/components/AppShell";
import { HowItWorks } from "@/components/fantasy/HowItWorks";
import { fantasyGuide } from "@/lib/fantasy-guide";
import { STEPS } from "@/components/fantasy/steps";

export { STEPS };

/** The four steps with no heading (the app's `<HowItWorks title={null} />`). */
export function Steps() {
  return <HowItWorks title={null} />;
}

/**
 * The How to play tab, as in the app (mobile/src/app/(tabs)/rules.tsx): the four steps, then scoring,
 * the details and the chips. Every number comes from the shared rules.
 */
export function HowToPlay({ budget, secondHalfFrom }: { budget: number; secondHalfFrom: number | null }) {
  // The team picker lines the 7 up for you, as in the app.
  const guide = fantasyGuide({ budget, secondHalfFrom }, { autoLineup: true });
  const chips = guide.sections.find((s) => s.title === "Chips");

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-2 text-[16px] leading-[22px] font-medium">
        Fantasy football for the 5ive Guys&apos; real Division 1 season, with Fantasy Premier League&apos;s rules made for 7-a-side.
      </p>
      <HowItWorks title={null} />

      <SectionTitle>Scoring</SectionTitle>
      <p className={p}>Your players score from what they do in each real match.</p>
      <div className={`${card} px-4 py-1`}>
        {guide.scoring.map((s, i) => {
          const minus = s.points.startsWith("−") || s.points.startsWith("-");
          return (
            <div
              key={s.label}
              className={`flex items-center justify-between gap-3 py-[11px] leading-tight ${i === guide.scoring.length - 1 ? "" : "border-b-[0.5px] border-lilac-line"}`}
            >
              <span className="flex-1 text-ink text-[15px] font-semibold">{s.label}</span>
              <span className={`max-w-[50%] text-right text-[15px] font-black ${minus ? "text-red-600" : "text-green-600"}`}>{s.points}</span>
            </div>
          );
        })}
      </div>

      <SectionTitle>The details</SectionTitle>
      <div className="flex flex-col gap-2.5">
        {guide.sections.filter((s) => s !== chips).map((s) => (
          <div key={s.title} className={`${panel} flex flex-col gap-1`}>
            <h3 className={h}>{s.title}</h3>
            <p className={p}>{s.body}</p>
          </div>
        ))}
      </div>

      {chips && (
        <>
          <SectionTitle>Chips</SectionTitle>
          <p className={p}>Optional power-ups. {chips.body}</p>
          <div className="flex flex-col gap-2">
            {guide.chips.map((c) => (
              <div key={c.id} className={`${panel} flex items-center gap-3.5`}>
                <span className="text-[28px] leading-none" aria-hidden>{c.emoji}</span>
                <div className="flex-1 min-w-0">
                  <h3 className={h}>{c.name}</h3>
                  <p className={p}>{c.description}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const h = "text-ink text-[17px] leading-tight font-black";
const p = "text-ink-2 text-[15px] leading-[21px]";
