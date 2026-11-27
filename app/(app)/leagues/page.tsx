"use client";

import { AppShell } from "@/components/AppShell";
import { LeaguesScreen } from "@/components/fantasy/LeaguesScreen";

/** The Leagues tab, as in the app: the overall league, your private leagues, and starting or joining one. */
export default function LeaguesPage() {
  return (
    <AppShell title="Leagues">
      <LeaguesScreen />
    </AppShell>
  );
}
