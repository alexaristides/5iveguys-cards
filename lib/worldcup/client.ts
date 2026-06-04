// Client-safe World Cup helpers (no prisma / server imports).
import seedrandom from "seedrandom";
import { WC_NATIONS } from "./teams.generated";
import { nationToLineup } from "./squad";
import type { WcNation } from "./types";
import { FORMATIONS, type AssignedPlayer, type Formation } from "@/lib/football";

const FORMATION_LIST: Formation[] = ["2-2-2", "3-2-1", "1-3-2", "2-3-1"];

export function nationById(id: string): WcNation | undefined {
  return WC_NATIONS.find((n) => n.id === id);
}

/** Deterministic formation for a national team in a given fixture. */
export function nationFormation(seed: string): Formation {
  const rng = seedrandom(`${seed}:formation`);
  return FORMATION_LIST[Math.floor(rng() * FORMATION_LIST.length)];
}

export function buildOpponentLineup(nationIdOrName: string, seed: string):
  { lineup: AssignedPlayer[]; formation: Formation } | null {
  const nation = nationById(nationIdOrName);
  if (!nation) return null;
  const formation = nationFormation(seed);
  return { lineup: nationToLineup(nation, formation), formation };
}

export { FORMATIONS };
