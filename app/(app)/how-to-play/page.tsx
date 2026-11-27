"use client";

import { useEffect, useState } from "react";
import { AppShell, PageTitle } from "@/components/AppShell";
import { HowToPlay } from "@/components/fantasy/HowToPlay";
import type { FantasyOverview } from "@/components/fantasy/types";
import { FANTASY_RULES } from "@/lib/fantasy";

/** How to play, as in the app: the four steps, scoring, the details and the chips. */
export default function HowToPlayPage() {
  const [season, setSeason] = useState<FantasyOverview["season"]>(null);

  useEffect(() => {
    fetch("/api/fantasy").then((r) => r.json()).then((o: FantasyOverview) => setSeason(o.season)).catch(() => {});
  }, []);

  return (
    <AppShell>
      <PageTitle
        title="How to play"
        sub="Fantasy football for the 5ive Guys' real Division 1 season, with Fantasy Premier League's rules made for 7-a-side."
      />
      <HowToPlay budget={season?.budget ?? FANTASY_RULES.defaultBudget} secondHalfFrom={season?.secondHalfFrom ?? null} />
    </AppShell>
  );
}
