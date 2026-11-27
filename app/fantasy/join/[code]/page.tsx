"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LeaguesScreen } from "@/components/fantasy/LeaguesScreen";

/**
 * Where invite links land (/fantasy/join/CODE, shared from a league): the Leagues tab with the join
 * sheet open and the code filled in, as the app opens it. Joining goes to that league.
 */
export default function FantasyJoinPage() {
  const { code } = useParams<{ code: string }>();
  return (
    <AppShell title="Leagues">
      <LeaguesScreen joinCode={code ?? ""} />
    </AppShell>
  );
}
