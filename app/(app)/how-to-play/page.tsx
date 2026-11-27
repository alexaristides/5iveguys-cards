"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { HowToPlay } from "@/components/fantasy/HowToPlay";
import type { FantasyOverview } from "@/components/fantasy/types";
import { FANTASY_RULES } from "@/lib/fantasy";

/** The How to play tab, as in the app: the four steps, scoring, the details and the chips. */
export default function HowToPlayPage() {
  return (
    <AppShell title="How to play">
      <Rules />
    </AppShell>
  );
}

/** The rules for this season (its budget and second half), from the shared defaults until it loads. */
function Rules() {
  const [season, setSeason] = useState<FantasyOverview["season"]>(null);

  useEffect(() => {
    fetch("/api/fantasy").then((r) => r.json()).then((o: FantasyOverview) => setSeason(o.season)).catch(() => {});
  }, []);

  return <HowToPlay budget={season?.budget ?? FANTASY_RULES.defaultBudget} secondHalfFrom={season?.secondHalfFrom ?? null} />;
}
